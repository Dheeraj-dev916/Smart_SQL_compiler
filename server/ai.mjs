/**
 * AI assistant API (optional).
 *
 * Design rules:
 *  - The API key lives ONLY on the server (environment variable). It is never sent to the browser.
 *  - The browser cannot send its own system prompt. It sends a `task` plus small structured inputs and
 *    the server builds the prompt. This keeps the endpoint from being an open LLM proxy.
 *  - The AI only suggests or explains. The front-end re-checks every SQL answer with the real compiler.
 *  - If no key is configured, /api/ai/status says so and /api/ai answers 503. Nothing is ever faked.
 *
 * Configure with environment variables (or a .env file in the project root):
 *   GEMINI_API_KEY=...           (Google; or ANTHROPIC_API_KEY=... / OPENAI_API_KEY=...)
 *   AI_PROVIDER=gemini|anthropic|openai (optional, auto-detected from the key)
 *   AI_MODEL=...                 (optional; default gemini-2.5-flash / claude-sonnet-5-5 / gpt-4o-mini)
 *   OPENAI_BASE_URL=...          (optional, any OpenAI-compatible endpoint)
 *   AI_API_KEY + AI_BASE_URL + AI_MODEL   (any other OpenAI-compatible service; used first when all three are set)
 */

import { fileURLToPath } from 'node:url';

// Load the project's .env (next to package.json) no matter which folder the server is started from.
// Node 20.12+ / 21.7+. Silently ignored when there is no .env file. Real environment variables win.
for (const file of [fileURLToPath(new URL('../.env', import.meta.url)), undefined]) {
  try {
    process.loadEnvFile?.(file);
  } catch {
    /* no .env file */
  }
}

export const AI_BUILD = 'ai.mjs v6 (any OpenAI-compatible key + connection test)';

export const AI_TASKS = ['nl2sql', 'fix', 'explain-error', 'explain-query', 'why-not', 'rewrite', 'practice', 'tutor', 'quiz'];

const LIMITS = { sql: 4000, schema: 3000, question: 600, text: 6000, items: 20, messages: 8, message: 1500 };

const SUBSET = `Supported SQL subset (the project's compiler, PostgreSQL dialect, one statement at a time):
SELECT (DISTINCT, aliases, *), FROM, INNER JOIN, LEFT JOIN, WHERE, GROUP BY, HAVING, ORDER BY, LIMIT,
aggregates COUNT SUM AVG MIN MAX, AND/OR/NOT, comparisons, arithmetic, IN (list), BETWEEN, LIKE, IS [NOT] NULL.
NOT supported: subqueries, CTEs (WITH), window functions, UNION/INTERSECT/EXCEPT, DDL, multiple statements.
Compiler phases: Lexical analysis (tokens) -> Syntax analysis (parse tree) -> Semantic analysis (tables/columns/types)
-> Intermediate representation (logical plan, relational algebra) -> Query optimization (rule-based) -> Code generation.`;

const BASE_SYSTEM = (schema) => `You are the AI assistant inside "Smart SQL Query Compiler", an educational compiler-design project.
Be accurate, friendly and brief. Use simple words a university student understands.

Database schema (the only tables and columns that exist):
${schema}

${SUBSET}

Rules:
- Only use tables and columns from the schema above. Never invent any.
- Only write SQL that stays inside the supported subset.
- Do not claim speed-ups or timings; the compiler only does logical rewrites.`;

const JSON_ONLY = 'Reply with ONLY one JSON object, no markdown fences, no text before or after it.';

// ───────────────────────── input helpers ─────────────────────────
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const strList = (v, max = LIMITS.items, each = 400) => (Array.isArray(v) ? v.slice(0, max).map((x) => str(String(x ?? ''), each)) : []);

function feedbackBlock(fb) {
  if (!fb || typeof fb !== 'object') return '';
  const prev = str(fb.previousSql, LIMITS.sql);
  const errors = strList(fb.errors);
  if (!prev) return '';
  return `\n\nYour previous answer was checked by the real compiler and REJECTED.\nPrevious SQL:\n${prev}\nCompiler errors:\n${errors.map((e) => `- ${e}`).join('\n') || '- (none given)'}\nFix these problems and answer again.`;
}

// ───────────────────────── prompt builders ─────────────────────────
/**
 * Builds { system, messages, maxTokens, json } for a task.
 * Throws an Error with .status = 400 on invalid input.
 */
export function buildPrompt(task, input = {}) {
  const bad = (m) => Object.assign(new Error(m), { status: 400 });
  const schema = str(input.schema, LIMITS.schema);
  if (!schema.trim()) throw bad('schema is required');
  const system = BASE_SYSTEM(schema);
  const sql = str(input.sql, LIMITS.sql);
  const user = (content) => [{ role: 'user', content }];

  switch (task) {
    case 'nl2sql': {
      const q = str(input.question, LIMITS.question).trim();
      if (!q) throw bad('question is required');
      return {
        system: `${system}\n\nTask: turn the user's request into ONE SQL query.\n${JSON_ONLY}\nFormat: {"sql": "<query ending with ;>", "explanation": "<one or two simple sentences>"}\nIf the request cannot be answered with the schema or the supported subset, set "sql" to "" and explain why in "explanation".`,
        messages: user(`Request: ${q}${feedbackBlock(input.feedback)}`),
        maxTokens: 700,
        json: true,
      };
    }
    case 'fix': {
      if (!sql.trim()) throw bad('sql is required');
      return {
        system: `${system}\n\nTask: fix the broken SQL query with the smallest possible change, keeping its intent.\n${JSON_ONLY}\nFormat: {"sql": "<fixed query ending with ;>", "explanation": "<what you changed and why, simple words>"}`,
        messages: user(`Broken query:\n${sql}\n\nCompiler diagnostics:\n${strList(input.diagnostics).map((d) => `- ${d}`).join('\n') || '- (none)'}${feedbackBlock(input.feedback)}`),
        maxTokens: 700,
        json: true,
      };
    }
    case 'explain-error': {
      if (!sql.trim()) throw bad('sql is required');
      return {
        system: `${system}\n\nTask: explain compiler errors to a beginner. Say which compiler phase found each problem and why that phase is the one that catches it.\n${JSON_ONLY}\nFormat: {"summary": "<one sentence>", "items": [{"problem": "<short>", "phase": "<Lexical|Syntax|Semantic>", "why": "<simple explanation>", "fix": "<what to change>"}]}`,
        messages: user(`Query:\n${sql}\n\nCompiler diagnostics (real output):\n${strList(input.diagnostics).map((d) => `- ${d}`).join('\n') || '- (none)'}`),
        maxTokens: 900,
        json: true,
      };
    }
    case 'explain-query': {
      if (!sql.trim()) throw bad('sql is required');
      return {
        system: `${system}\n\nTask: explain what the query does in plain English, step by step, in the order the database would logically process it. If a relational algebra expression or logical plan is given, relate the steps to it (π projection, σ selection, ⋈ join, γ grouping, τ sort, λ limit, δ distinct).\n${JSON_ONLY}\nFormat: {"summary": "<one sentence>", "steps": ["<step 1>", "<step 2>"], "algebraNote": "<optional one sentence about the algebra, or empty string>"}`,
        messages: user(`Query:\n${sql}\n\nRelational algebra: ${str(input.algebra, 600) || '(not available)'}\nLogical plan:\n${str(input.plan, LIMITS.text) || '(not available)'}`),
        maxTokens: 900,
        json: true,
      };
    }
    case 'why-not': {
      if (!sql.trim()) throw bad('sql is required');
      const rules = Array.isArray(input.rules) ? input.rules.slice(0, LIMITS.items) : [];
      const lines = rules.map((r) => `- ${str(r?.name, 80)} | ${r?.applied ? 'APPLIED' : 'SKIPPED'} | ${str(r?.explanation, 300)}${r?.skipReason ? ` | reason: ${str(r.skipReason, 300)}` : ''}`);
      return {
        system: `${system}\n\nTask: explain, for each optimizer rule below, in simple words why it was applied or skipped for THIS query. Use the compiler's own report; do not contradict it. Give a tiny concrete example when it helps.\n${JSON_ONLY}\nFormat: {"summary": "<one sentence>", "items": [{"rule": "<exact rule name>", "applied": true|false, "text": "<simple explanation>"}]}`,
        messages: user(`Query:\n${sql}\n\nOptimizer report (real output):\n${lines.join('\n') || '- (none)'}`),
        maxTokens: 1400,
        json: true,
      };
    }
    case 'rewrite': {
      if (!sql.trim()) throw bad('sql is required');
      return {
        system: `${system}\n\nTask: rewrite the query so it returns the same rows but uses ONLY the supported subset (for example turn an IN-subquery into a JOIN, remove a CTE). Keep it as simple as possible. Use DISTINCT when a join could create duplicates that the original did not have.\n${JSON_ONLY}\nFormat: {"sql": "<rewritten query ending with ;>", "explanation": "<what changed and why it returns the same rows>"}\nIf it cannot be expressed in the subset, set "sql" to "" and explain why.`,
        messages: user(`Original query:\n${sql}${feedbackBlock(input.feedback)}`),
        maxTokens: 800,
        json: true,
      };
    }
    case 'practice': {
      const phase = ['lexical', 'syntax', 'semantic'].includes(input.phase) ? input.phase : null;
      if (!phase) throw bad('phase must be lexical, syntax or semantic');
      const level = ['easy', 'medium'].includes(input.level) ? input.level : 'easy';
      const how = {
        lexical: 'The bug must be found by the LEXER: an unterminated string literal, an invalid character such as # or @ or $, or an unterminated comment.',
        syntax: 'The bug must be found by the PARSER: the characters are all valid tokens, but the grammar is wrong (a missing keyword, a missing FROM, a dangling comma, an incomplete GROUP BY, a misplaced clause).',
        semantic: 'The query must be grammatically perfect but WRONG for the schema: an unknown table or column, a column that exists in two joined tables used without a qualifier, or a bad qualifier.',
      }[phase];
      return {
        system: `${system}\n\nTask: create a short broken SQL query for a student to debug. ${how}\nDifficulty: ${level}. Exactly one bug. 1 to 5 lines.\n${JSON_ONLY}\nFormat: {"sql": "<broken query>", "hint": "<a gentle hint that does not give the answer away>"}`,
        messages: user(`Create a ${level} ${phase} bug.${input.avoid ? ` It must be different from: ${str(input.avoid, 500)}` : ''}`),
        maxTokens: 400,
        json: true,
      };
    }
    case 'tutor': {
      const raw = Array.isArray(input.messages) ? input.messages.slice(-LIMITS.messages) : [];
      const messages = raw
        .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
        .map((m) => ({ role: m.role, content: str(m.content, LIMITS.message) }));
      while (messages.length && messages[0].role !== 'user') messages.shift();
      if (!messages.length || messages[messages.length - 1].role !== 'user') throw bad('messages must end with a user message');
      const ctx = str(input.context, LIMITS.text);
      const outMessages = ctx
        ? [{ role: 'user', content: `My current query and compiler output:\n${ctx}` }, { role: 'assistant', content: 'Got it, I will use your query and compiler output as context.' }, ...messages]
        : messages;
      return {
        system: `${system}\n\nTask: you are a friendly compiler-design tutor. Answer the student's question in simple words, 2 to 6 short sentences, with a tiny example when useful. Prefer the student's own query and compiler output (provided in the conversation) as the example. If the question is not about SQL or compilers, politely steer back. Plain text only, you may use short bullet lines starting with "- ".`,
        messages: outMessages,
        maxTokens: 700,
        json: false,
      };
    }
    case 'quiz': {
      const topic = str(input.topic, 80).replace(/[\r\n]+/g, ' ').trim() || 'compiler phases';
      const count = Math.min(Math.max(Number.parseInt(input.count, 10) || 5, 1), 8);
      return {
        system: `${system}\n\nTask: write a multiple-choice quiz in the context of this SQL compiler. Exactly ${count} questions, 4 options each, exactly one correct answer, plausible wrong answers, and a short explanation. Questions must be factually correct.\n${JSON_ONLY}\nFormat: {"questions": [{"question": "...", "options": ["A","B","C","D"], "answer": <index 0-3>, "explanation": "..."}]}`,
        messages: user(`Write ${count} questions about: ${topic}.${input.avoid ? ` Do not repeat these: ${str(input.avoid, 800)}` : ''}`),
        maxTokens: 2200,
        json: true,
      };
    }
    default:
      throw bad(`Unknown task '${String(task).slice(0, 40)}'`);
  }
}

// ───────────────────────── output parsing ─────────────────────────
function extractJson(text) {
  const t = String(text ?? '').trim();
  const blocks = [...t.matchAll(/```(json)?\s*([\s\S]*?)```/gi)];
  const preferred = blocks.filter((m) => m[1]).pop() ?? blocks.filter((m) => m[2].includes('{')).pop();
  const candidate = preferred ? preferred[2] : t;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('The AI did not return JSON');
  return JSON.parse(candidate.slice(start, end + 1));
}

const s = (v, max = 2000) => (typeof v === 'string' ? v.slice(0, max) : '');

/** Validates and normalizes the model output for a task. Throws on a malformed answer. */
export function parseModelOutput(task, text) {
  if (task === 'tutor') {
    const reply = String(text ?? '').trim();
    if (!reply) throw new Error('The AI returned an empty answer');
    return { reply: reply.slice(0, 4000) };
  }
  const j = extractJson(text);
  switch (task) {
    case 'nl2sql':
    case 'fix':
    case 'rewrite':
      if (typeof j.sql !== 'string') throw new Error('The AI did not return a sql field');
      return { sql: s(j.sql, LIMITS.sql).trim(), explanation: s(j.explanation) };
    case 'practice':
      if (!s(j.sql).trim()) throw new Error('The AI returned no query');
      return { sql: s(j.sql, LIMITS.sql).trim(), hint: s(j.hint, 400) };
    case 'explain-query':
      return { summary: s(j.summary), steps: Array.isArray(j.steps) ? j.steps.slice(0, 15).map((x) => s(String(x), 500)) : [], algebraNote: s(j.algebraNote, 500) };
    case 'explain-error':
      return {
        summary: s(j.summary),
        items: (Array.isArray(j.items) ? j.items : []).slice(0, 10).map((i) => ({ problem: s(i?.problem, 300), phase: s(i?.phase, 40), why: s(i?.why, 700), fix: s(i?.fix, 500) })),
      };
    case 'why-not':
      return {
        summary: s(j.summary),
        items: (Array.isArray(j.items) ? j.items : []).slice(0, LIMITS.items).map((i) => ({
          rule: s(i?.rule, 100),
          applied: typeof i?.applied === 'boolean' ? i.applied : String(i?.applied).toLowerCase() === 'true',
          text: s(i?.text, 700),
        })),
      };
    case 'quiz': {
      const qs = (Array.isArray(j.questions) ? j.questions : [])
        .map((q) => ({
          question: s(q?.question, 400),
          options: Array.isArray(q?.options) ? q.options.slice(0, 6).map((o) => s(String(o), 200)) : [],
          answer: Number.isInteger(q?.answer) ? q.answer : -1,
          explanation: s(q?.explanation, 600),
        }))
        .filter((q) => q.question && q.options.length >= 2 && q.answer >= 0 && q.answer < q.options.length);
      if (!qs.length) throw new Error('The AI returned no valid questions');
      return { questions: qs };
    }
    default:
      throw new Error('Unknown task');
  }
}

// ───────────────────────── provider ─────────────────────────
export function aiConfig(env = process.env) {
  const googleKey = env.GEMINI_API_KEY || env.GOOGLE_API_KEY;
  // Any service that speaks the OpenAI "chat/completions" format: fill AI_API_KEY, AI_BASE_URL and AI_MODEL.
  // When all three are set it is used first, so adding a new key never needs other lines to be removed.
  if ((!env.AI_PROVIDER || env.AI_PROVIDER === 'compatible') && env.AI_API_KEY && env.AI_BASE_URL && env.AI_MODEL) {
    return { provider: 'compatible', key: env.AI_API_KEY, model: env.AI_MODEL, baseUrl: env.AI_BASE_URL.replace(/\/$/, ''), modelFixed: true };
  }
  const provider = env.AI_PROVIDER || (googleKey ? 'gemini' : env.ANTHROPIC_API_KEY ? 'anthropic' : env.OPENAI_API_KEY ? 'openai' : '');
  if (provider === 'gemini' && googleKey) {
    return { provider, key: googleKey, model: env.AI_MODEL || 'gemini-2.5-flash', modelFixed: Boolean(env.AI_MODEL) };
  }
  if (provider === 'anthropic' && env.ANTHROPIC_API_KEY) {
    return { provider, key: env.ANTHROPIC_API_KEY, model: env.AI_MODEL || 'claude-sonnet-5-5' };
  }
  if (provider === 'openai' && env.OPENAI_API_KEY) {
    return { provider, key: env.OPENAI_API_KEY, model: env.AI_MODEL || 'gpt-4o-mini', baseUrl: (env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '') };
  }
  return null;
}

// Google keys come in two families: AI Studio keys ("AIza...") use the Gemini API, and newer Google Cloud
// "express mode" keys ("AQ....") use Vertex AI. Both take the same request body, so we try the likely
// endpoint first and fall back to the other one when Google says the key does not belong there.
// If the default model name is not found (HTTP 404) we also try a few current model names.
const GOOGLE_MODEL_FALLBACKS = ['gemini-flash-latest', 'gemini-2.0-flash', 'gemini-2.5-flash-lite'];

function googleEndpoints(cfg) {
  const geminiBase = (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
  const vertexBase = (process.env.VERTEX_BASE_URL || 'https://aiplatform.googleapis.com/v1').replace(/\/$/, '');
  const gemini = { name: 'gemini-api', url: (m) => `${geminiBase}/models/${m}:generateContent` };
  const vertex = { name: 'vertex-express', url: (m) => `${vertexBase}/publishers/google/models/${m}:generateContent` };
  return cfg.key.startsWith('AQ.') ? [vertex, gemini] : [gemini, vertex];
}
let googleWorking = null; // { key, ep, model } that last succeeded (ignored if the key changes)

/** Gemini request body (shared by both Google endpoints). */
export function geminiBody({ system, messages, maxTokens, json }, model = '') {
  return {
    systemInstruction: { parts: [{ text: system }] },
    contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
    // Gemini 2.5 models spend part of this budget on hidden "thinking", so leave generous room for the JSON.
    generationConfig: {
      maxOutputTokens: Math.max(maxTokens * 3, 2048),
      temperature: 0.4,
      ...(json ? { responseMimeType: 'application/json' } : {}),
      // Flash models may switch hidden thinking off: faster answers and no JSON cut off by the thinking budget.
      ...(/^gemini-2\.5-flash/.test(model) ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
    },
  };
}

export function geminiText(body) {
  const parts = body?.candidates?.[0]?.content?.parts;
  return Array.isArray(parts) ? parts.map((p) => (typeof p?.text === 'string' ? p.text : '')).join('') : '';
}

/** Short, key-free reason taken from a Google error body (for the student and the server log). */
async function googleReason(res, key) {
  try {
    const j = JSON.parse(await res.text());
    const msg = String(j?.error?.message ?? j?.error?.status ?? '').split(key).join('***');
    return msg.replace(/\s+/g, ' ').slice(0, 220);
  } catch {
    return '';
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BUSY = new Set([500, 503]); // temporary overload: worth one retry after a short pause
const SKIP_MODEL = new Set([404, 429, 500, 503]); // this model is missing / over quota / overloaded: try the next one

async function callGoogle(prompt, cfg, signal, trace = []) {
  const endpoints = googleEndpoints(cfg);
  const models = cfg.modelFixed ? [cfg.model] : [...new Set([cfg.model, ...GOOGLE_MODEL_FALLBACKS])];
  const full = endpoints.map((e) => [e, models]);
  let last = { status: 0, reason: '', ep: '', model: '' };

  let sawQuota = false;
  /** Tries every (endpoint, model) pair of a plan. Returns the answer text, or null when none worked. */
  const run = async (plan) => {
    for (const [ep, modelList] of plan) {
      if (!ep) continue;
      if (sawQuota) return null; // out of quota: asking the other endpoint too would only waste more of it
      for (const model of modelList) {
        const res = await fetch(ep.url(model), { method: 'POST', signal, headers: { 'content-type': 'application/json', 'x-goog-api-key': cfg.key }, body: JSON.stringify(geminiBody(prompt, model)) });
        if (res.ok) {
          const text = geminiText(await res.json());
          if (!text) throw Object.assign(new Error('The AI returned an empty answer (it may have been blocked or cut off). Try again.'), { status: 502 });
          googleWorking = { key: cfg.key, ep: ep.name, model };
          trace.push({ endpoint: ep.name, model, status: 200, reason: '' });
          return text;
        }
        const reason = await googleReason(res, cfg.key);
        const isWrongKeyEndpoint = [400, 401, 403].includes(res.status);
        if (last.status === 0 || !BUSY.has(last.status) || !isWrongKeyEndpoint) {
          last = { status: res.status, reason, ep: ep.name, model };
        }
        trace.push({ endpoint: ep.name, model, status: res.status, reason });
        console.error(`[ai] google ${ep.name} model=${model} -> HTTP ${res.status}${reason ? `: ${reason}` : ''}`);
        if (res.status === 429) sawQuota = true;
        if (SKIP_MODEL.has(res.status)) continue; // model missing, over quota or overloaded: try the next model name
        if (isWrongKeyEndpoint) break; // maybe the wrong endpoint for this key: try the other one
        throw providerError(last);
      }
    }
    return null;
  };

  // 1) the model/endpoint that worked last time, 2) everything, 3) after a short pause, everything again
  // (Google's "high demand" 503 is usually over within a second or two).
  const known = googleWorking?.key === cfg.key && (!cfg.modelFixed || googleWorking.model === cfg.model) ? googleWorking : null;
  const rounds = [...(known ? [[[endpoints.find((e) => e.name === known.ep), [known.model]]]] : []), full];
  for (const plan of rounds) {
    const text = await run(plan);
    if (text !== null) return text;
  }
  if (BUSY.has(last.status)) {
    await sleep(Number(process.env.AI_RETRY_MS ?? 1500));
    const text = await run(full);
    if (text !== null) return text;
  }
  googleWorking = null;
  throw providerError(last);
}

function providerError(info) {
  // Never forward provider error bodies verbatim: they can echo request details. Only a short,
  // key-free reason is shown.
  const s = info?.status;
  const why = info?.reason ? ` (${info.ep ? `${info.ep}, ` : ''}${info.reason})` : '';
  const text =
    s === 400 || s === 401 || s === 403 ? 'The AI provider rejected the API key or the model name'
    : s === 404 ? 'The AI model was not found for this key'
    : s === 503 || s === 500 ? 'Google\'s AI is busy right now (high demand). Please click the button again in a few seconds.'
    : s === 429 ? 'The AI quota or rate limit was reached. Wait about a minute and try again.'
    : `The AI provider returned an error (HTTP ${s})`;
  return Object.assign(new Error(`${text}${` [HTTP ${s}]`}${why}`), { status: 502 });
}

function safeHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

/** Calls the configured provider. Returns the raw text of the answer. */
export async function callModel(prompt, cfg = aiConfig()) {
  const { system, messages, maxTokens } = prompt;
  if (!cfg) throw Object.assign(new Error('AI is not configured on the server'), { status: 503 });
  if (cfg.provider === 'gemini') return callGoogle(prompt, cfg, AbortSignal.timeout(60_000), prompt.trace);
  const signal = AbortSignal.timeout(30_000);
  let res;
  if (cfg.provider === 'anthropic') {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal,
      headers: { 'content-type': 'application/json', 'x-api-key': cfg.key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: cfg.model, max_tokens: maxTokens, system, messages }),
    });
  } else {
    res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.key}` },
      body: JSON.stringify({ model: cfg.model, max_tokens: maxTokens, messages: [{ role: 'system', content: system }, ...messages] }),
    });
  }
  prompt.trace?.push({ endpoint: cfg.baseUrl ? safeHost(cfg.baseUrl) || cfg.provider : cfg.provider, model: cfg.model, status: res.status, reason: '' });
  if (!res.ok) throw providerError({ status: res.status });
  let body;
  try {
    body = await res.json();
  } catch {
    throw Object.assign(new Error('The AI provider returned an invalid JSON response'), { status: 502 });
  }
  const text = cfg.provider === 'anthropic' ? body?.content?.find?.((c) => c.type === 'text')?.text : body?.choices?.[0]?.message?.content;
  if (!text) throw Object.assign(new Error('The AI returned an empty answer'), { status: 502 });
  return text;
}

// ───────────────────────── routes ─────────────────────────
/**
 * Adds /api/ai/status and /api/ai to an Express app.
 * @param app Express app
 * @param opts { model?: (prompt) => Promise<string>, configured?: () => boolean, perMinute?: number }
 */
export function registerAiRoutes(app, opts = {}) {
  const complete =
    opts.model ??
    (async (p) => {
      try {
        return await callModel(p);
      } catch (e) {
        if (Number.isInteger(e?.status)) throw e;
        // fetch itself failed: offline, blocked by a firewall, or timed out.
        throw Object.assign(new Error(e?.name === 'TimeoutError' ? 'The AI took too long to answer. Try again.' : 'Could not reach the AI provider. Check the internet connection.'), { status: 502 });
      }
    });
  const isConfigured = opts.configured ?? (() => aiConfig() !== null);
  const perMinute = opts.perMinute ?? 20;
  const hits = new Map();

  // One line at start-up so it is obvious WHICH ai.mjs is running and what it will use (never prints the key).
  if (!opts.model) {
    const c = aiConfig();
    const host = c?.baseUrl ? safeHost(c.baseUrl) : '';
    console.log(`[ai] ${AI_BUILD} loaded from ${fileURLToPath(import.meta.url)} | ${c ? `provider=${c.provider} model=${c.model}${host ? ` host=${host}` : ''} key=set` : 'NOT configured (no API key found)'}`);
  }

  const limiter = (req, res, next) => {
    const key = req.ip ?? 'unknown';
    const now = Date.now();
    if (hits.size > 1000) {
      for (const [k, ts] of hits) {
        if (ts.every((t) => now - t >= 60_000)) hits.delete(k);
      }
    }
    const recent = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= perMinute) return res.status(429).json({ ok: false, error: 'Too many AI requests. Try again in a minute.' });
    recent.push(now);
    hits.set(key, recent);
    next();
  };

  app.get('/api/ai/status', (_req, res) => {
    const configured = isConfigured();
    const cfg = configured ? aiConfig() : null;
    res.json({ ok: true, configured, provider: cfg?.provider ?? null, model: cfg?.model ?? null, build: AI_BUILD });
  });

  // Tiny real request that reports every attempt (endpoint, model, HTTP status, short reason). No key is shown.
  app.post('/api/ai/test', limiter, async (_req, res) => {
    if (!isConfigured()) return res.status(503).json({ ok: false, unconfigured: true, error: 'No API key found. Add GEMINI_API_KEY to the .env file and restart the server.' });
    const cfg = aiConfig();
    const trace = [];
    const prompt = { system: 'You are a connection test. Reply with exactly: {"ok":true}', messages: [{ role: 'user', content: 'ping' }], maxTokens: 30, json: true, trace };
    try {
      const text = await (opts.model ? opts.model(prompt) : callModel(prompt));
      const used = trace.find((t) => t.status === 200);
      res.json({ ok: true, works: true, provider: cfg?.provider ?? null, model: used?.model ?? cfg?.model ?? null, endpoint: used?.endpoint ?? null, answer: String(text).slice(0, 60), attempts: trace });
    } catch (e) {
      res.json({ ok: true, works: false, provider: cfg?.provider ?? null, model: cfg?.model ?? null, error: e?.message ?? 'The test failed', attempts: trace });
    }
  });

  app.post('/api/ai', limiter, async (req, res) => {
    if (!isConfigured()) {
      return res.status(503).json({ ok: false, unconfigured: true, error: 'AI is not configured. Add GEMINI_API_KEY (or ANTHROPIC_API_KEY / OPENAI_API_KEY) to the .env file and restart the server.' });
    }
    try {
      const task = req.body?.task;
      const prompt = buildPrompt(task, req.body?.input ?? {});
      const text = await complete(prompt);
      let data;
      try {
        data = parseModelOutput(task, text);
      } catch (e) {
        return res.status(502).json({ ok: false, error: `The AI answer could not be used: ${e.message}. Please try again.` });
      }
      res.json({ ok: true, data });
    } catch (e) {
      const status = Number.isInteger(e?.status) ? e.status : 500;
      res.status(status).json({ ok: false, error: status === 500 ? 'The AI request failed' : e.message });
    }
  });
}
