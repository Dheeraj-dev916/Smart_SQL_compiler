import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { executeSelect, MAX_ROWS, TIMEOUT_MS } from './execute.mjs';
import { registerAiRoutes } from './ai.mjs';

export function createApp(distDir) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '10mb' }));

  // Tiny in-memory rate limiter: 40 executions per minute per client.
  const hits = new Map();
  const limiter = (req, res, next) => {
    const key = req.ip ?? 'unknown';
    const now = Date.now();
    if (hits.size > 1000) {
      for (const [k, ts] of hits) {
        if (ts.every((t) => now - t >= 60_000)) hits.delete(k);
      }
    }
    const recent = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= 40) return res.status(429).json({ ok: false, error: 'Too many requests. Try again in a minute.' });
    recent.push(now);
    hits.set(key, recent);
    next();
  };

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, sandbox: 'sqlite-in-memory', maxRows: MAX_ROWS, timeoutMs: TIMEOUT_MS });
  });

  app.post('/api/execute', limiter, async (req, res) => {
    const out = await executeSelect(req.body?.sql, { dataset: req.body?.dataset });
    const { status, ...body } = out;
    res.status(status).json(body);
  });

  // Optional AI assistant routes (see server/ai.mjs). Without an API key they answer "not configured".
  registerAiRoutes(app);

  // Serve the built front-end when it exists (single-process production mode).
  // Express 5 no longer accepts the '*' route pattern, so the SPA fallback is a plain middleware.
  const dist = distDir ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(dist, 'index.html'));
    });
  }

  // Return JSON errors for malformed or oversized request bodies instead of Express's HTML error page.
  app.use((err, _req, res, next) => {
    if (res.headersSent) return next(err);
    if (err?.type === 'entity.parse.failed' || err instanceof SyntaxError) {
      return res.status(400).json({ ok: false, error: 'Invalid JSON request body' });
    }
    if (err?.type === 'entity.too.large' || err?.status === 413) {
      return res.status(413).json({ ok: false, error: 'Request body is too large' });
    }
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  });
  return app;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const port = Number(process.env.PORT ?? 8787);
  createApp().listen(port, '127.0.0.1', () => console.log(`Sandbox API listening on http://127.0.0.1:${port}`));
}
