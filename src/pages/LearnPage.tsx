import * as React from 'react';
import { ArrowRight, ChevronsDownUp, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LESSONS } from '@/data/lessons';
import { LessonCard } from '@/components/learning/LessonCard';
import { Quiz } from '@/components/learning/Quiz';

const FLOW = [
  ['SQL text', 'fundamentals'],
  ['Tokens', 'lexical'],
  ['Syntax tree', 'syntax'],
  ['Checked tree', 'semantic'],
  ['Logical plan', 'ir'],
  ['Optimized plan', 'optimization'],
  ['SQL output', 'codegen'],
] as const;

export default function LearnPage() {
  const [open, setOpen] = React.useState<Set<string>>(() => new Set([LESSONS[0].id]));
  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const jump = (id: string) => {
    setOpen((s) => new Set(s).add(id));
    window.setTimeout(() => document.getElementById(`topic-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Learn compiler design with SQL</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Ten short lessons, one for each idea behind this project. Every lesson has a definition, a runnable example, the steps, the input and output, and why it matters. Finish with the quiz.
        </p>
      </div>

      <section aria-labelledby="flow-h" className="rounded-lg border bg-card p-4">
        <h3 id="flow-h" className="mb-3 text-sm font-semibold">The pipeline at a glance</h3>
        <ol className="flex flex-wrap items-center gap-x-1 gap-y-2">
          {FLOW.map(([label, id], i) => (
            <li key={label} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => jump(id === 'codegen' ? 'codegen' : id)}
                className="rounded-md border bg-muted/40 px-2.5 py-1.5 text-xs font-medium hover:border-foreground/40 sm:text-sm"
              >
                {label}
              </button>
              {i < FLOW.length - 1 && <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden="true" />}
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-muted-foreground">Between each pair of boxes sits one phase of the compiler. Select a box to jump to its lesson.</p>
      </section>

      <section aria-labelledby="lessons-h" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="lessons-h" className="text-sm font-semibold">Lessons</h3>
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" onClick={() => setOpen(new Set(LESSONS.map((l) => l.id)))}><ChevronsUpDown /> Expand all</Button>
            <Button variant="outline" size="sm" onClick={() => setOpen(new Set())}><ChevronsDownUp /> Collapse all</Button>
          </div>
        </div>
        {LESSONS.map((l, i) => <LessonCard key={l.id} lesson={l} index={i} open={open.has(l.id)} onToggle={() => toggle(l.id)} />)}
      </section>

      <section aria-labelledby="quiz-h" className="space-y-3">
        <h3 id="quiz-h" className="text-sm font-semibold">Check your understanding</h3>
        <Quiz />
      </section>
    </div>
  );
}
