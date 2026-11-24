import * as React from 'react';
import { History, Sparkles, X } from 'lucide-react';
import type { AiStatus } from '../aiClient';
import { generateVerified, type VerifiedAnswer } from '../verify';
import { useQuestionLog } from '../questionLog';
import { BusyButton, Notice, SqlResult, StepCard, VerifyBadge } from './shared';

const EXAMPLE_GROUPS: { title: string; questions: string[] }[] = [
  { title: 'Simple', questions: ['Show all students', 'List the names and GPA of all students', 'Show courses with more than 3 credits'] },
  { title: 'Filtering', questions: ['Students from the CS department older than 20', 'Students whose name starts with A', 'Students with a GPA between 3.0 and 3.5'] },
  { title: 'Sorting', questions: ['Top 5 students by GPA', 'Courses ordered by credits, highest first'] },
  { title: 'Counting', questions: ['How many students are in each department?', 'Average GPA of each department', 'Departments with more than 5 students'] },
  { title: 'Joins', questions: ['Names of students and the courses they are enrolled in', 'Students who got grade A', 'Number of students enrolled in each course'] },
];

type Answer = VerifiedAnswer<{ sql: string; explanation: string }>;

/** Feature 1: English -> SQL. The answer is re-checked by the real compiler before it is shown as good. */
export function WriteSqlPanel({ ai }: { ai: AiStatus | null }) {
  const [question, setQuestion] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [answer, setAnswer] = React.useState<Answer | null>(null);
  const { log, add, remove, clear } = useQuestionLog();

  const go = async () => {
    const q = question.trim();
    if (!q) return;
    setBusy(true);
    setError('');
    setAnswer(null);
    try {
      const out = await generateVerified<{ sql: string; explanation: string }>('nl2sql', { question: q });
      setAnswer(out);
      add(q, out.verification?.ok ? out.data.sql : '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <StepCard step={1} title="Ask in plain English" description="Describe the data you want. The AI writes the SQL for the demo database (students, courses, enrollments).">
        <div className="space-y-3">
          <textarea
            aria-label="Your question in English"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={busy}
            rows={3}
            maxLength={600}
            placeholder="Example: Show names of students with GPA above 3.5"
            className="block w-full resize-y rounded-lg border border-input px-3 py-2 text-sm placeholder:text-muted-foreground/70"
          />
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Example questions (click one to use it)</p>
            {EXAMPLE_GROUPS.map((g) => (
              <div key={g.title} className="flex flex-wrap items-center gap-1.5">
                <span className="w-16 shrink-0 text-xs font-medium text-secondary-foreground">{g.title}</span>
                {g.questions.map((q) => (
                  <button key={q} type="button" onClick={() => setQuestion(q)} className="rounded-full border bg-muted/50 px-2.5 py-0.5 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground">{q}</button>
                ))}
              </div>
            ))}
          </div>
          <BusyButton busy={busy} icon={<Sparkles />} disabled={!ai?.configured || !question.trim()} onClick={go}>Generate SQL</BusyButton>
        </div>
      </StepCard>

      {log.length > 0 && (
        <StepCard title="Your question log" description="Your latest questions, saved in this browser. Click one to ask it again.">
          <ul className="space-y-1.5">
            {log.map((e) => (
              <li key={e.question} className="flex items-start gap-2 rounded-lg border bg-muted/30 px-3 py-2">
                <History className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <button type="button" onClick={() => setQuestion(e.question)} className="min-w-0 flex-1 text-left" aria-label={`Use question: ${e.question}`}>
                  <span className="block text-sm">{e.question}</span>
                  <span className="block truncate font-mono text-xs text-muted-foreground">{e.sql || 'No valid query was produced'}</span>
                </button>
                <button type="button" onClick={() => remove(e.question)} aria-label={`Remove question: ${e.question}`} className="rounded p-0.5 text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={clear} className="mt-2 text-xs text-muted-foreground hover:text-foreground">Clear log</button>
        </StepCard>
      )}

      {error && <Notice kind="error">{error}</Notice>}

      {answer && (
        <StepCard step={2} title="The AI's query" description="Each answer is compiled by this project's own compiler. Only a green badge means it really passed.">
          {answer.data.sql ? (
            <div className="space-y-3">
              <VerifyBadge v={answer.verification} attempts={answer.attempts} />
              <SqlResult sql={answer.data.sql} label="generated SQL" canRun={answer.verification?.ok} />
              {answer.data.explanation && <p className="text-sm leading-relaxed text-muted-foreground">{answer.data.explanation}</p>}
            </div>
          ) : (
            <Notice kind="warning">{answer.data.explanation || 'The AI could not write a query for that request.'}</Notice>
          )}
        </StepCard>
      )}
    </div>
  );
}
