import * as React from 'react';
import { Plug } from 'lucide-react';
import { testAiConnection, type AiTestResult } from '../aiClient';
import { BusyButton, Notice } from './shared';

/** "Test AI connection": one real request, with a plain verdict and what the AI provider answered at each step. */
export function ConnectionTest({ onResult }: { onResult?: () => void }) {
  const [busy, setBusy] = React.useState(false);
  const [res, setRes] = React.useState<AiTestResult | null>(null);

  const run = async () => {
    setBusy(true);
    setRes(null);
    setRes(await testAiConnection());
    setBusy(false);
    onResult?.();
  };

  return (
    <div className="space-y-2">
      <BusyButton type="button" size="sm" variant="outline" busy={busy} icon={<Plug />} onClick={run}>Test AI connection</BusyButton>
      {res && (
        <Notice kind={res.works ? 'success' : 'error'}>
          {res.works ? (
            <p className="font-medium">The AI works. Answered by {res.model} ({res.provider}).</p>
          ) : (
            <>
              <p className="font-medium">The AI test failed.</p>
              <p className="mt-0.5">{res.error}</p>
            </>
          )}
          {res.attempts.length > 0 && (
            <details className="mt-1.5">
              <summary className="cursor-pointer text-xs">What happened, step by step</summary>
              <ul className="mt-1 space-y-0.5 font-mono text-[11px] leading-snug">
                {res.attempts.map((a, i) => (
                  <li key={i}>{a.status === 200 ? 'OK ' : 'ERR'} {a.status} · {a.endpoint} · {a.model}{a.reason ? ` · ${a.reason}` : ''}</li>
                ))}
              </ul>
            </details>
          )}
        </Notice>
      )}
    </div>
  );
}
