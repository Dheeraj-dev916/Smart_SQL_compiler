import { ArrowRight, ChevronRight, Play } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Lesson } from '@/data/lessons';
import { Button } from '@/components/ui/button';
import { CodeBlock } from '@/components/ui/code-block';
import { useApp } from '@/hooks/useApp';
import { cn } from '@/lib/utils';

/** Input → phase → output diagram. */
export function PhaseDiagram({ input, phase, output }: { input: string; phase: string; output: string }) {
  const box = 'min-w-0 flex-1 rounded-md border px-3 py-2 text-center text-xs sm:text-sm';
  return (
    <div className="flex flex-col items-stretch gap-1.5 sm:flex-row sm:items-center" role="img" aria-label={`${input} goes into ${phase} and produces ${output}`}>
      <div className={cn(box, 'bg-muted/40')}><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Input</p>{input}</div>
      <ArrowRight className="mx-auto size-4 shrink-0 rotate-90 text-muted-foreground sm:rotate-0" aria-hidden="true" />
      <div className={cn(box, 'border-cyan-brand/50 bg-cyan-brand/10 font-semibold')}><p className="text-[10px] font-normal uppercase tracking-wider text-muted-foreground">Phase</p>{phase}</div>
      <ArrowRight className="mx-auto size-4 shrink-0 rotate-90 text-muted-foreground sm:rotate-0" aria-hidden="true" />
      <div className={cn(box, 'bg-muted/40')}><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Output</p>{output}</div>
    </div>
  );
}

export function LessonCard({ lesson, index, open, onToggle }: { lesson: Lesson; index: number; open: boolean; onToggle: () => void }) {
  const { setSql, compileNow, setTab } = useApp();
  const navigate = useNavigate();
  const panelId = `lesson-${lesson.id}`;
  return (
    <article id={`topic-${lesson.id}`} className="scroll-mt-20 rounded-lg border bg-card shadow-sm">
      <h3>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-secondary font-mono text-xs font-semibold text-secondary-foreground">{index + 1}</span>
          <span className="flex-1 text-sm font-semibold sm:text-base">{lesson.title}</span>
          <ChevronRight className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')} aria-hidden="true" />
        </button>
      </h3>
      {open && (
        <div id={panelId} className="space-y-4 border-t px-4 py-4">
          <div>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Definition</h4>
            <p className="text-sm leading-relaxed">{lesson.definition}</p>
          </div>
          <div>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">SQL example</h4>
            <CodeBlock code={lesson.sql} label={`${lesson.title} example`} />
          </div>
          <div>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Step by step</h4>
            <ol className="list-decimal space-y-1.5 pl-5 text-sm leading-relaxed marker:text-muted-foreground">
              {lesson.steps.map((s, i) => <li key={i}>{s}</li>)}
            </ol>
          </div>
          <div>
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Input and output</h4>
            <PhaseDiagram input={lesson.input} phase={lesson.phase} output={lesson.output} />
            <p className="mt-2 rounded-md border bg-muted/30 p-2.5 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words">{lesson.outputExample}</p>
          </div>
          <div>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Why it matters</h4>
            <p className="text-sm leading-relaxed">{lesson.why}</p>
          </div>
          <Button
            size="sm"
            onClick={() => {
              setSql(lesson.sql);
              setTab(lesson.tab);
              navigate('/compiler');
              void compileNow(lesson.sql, { tab: lesson.tab });
            }}
          >
            <Play /> Try it in the compiler
          </Button>
        </div>
      )}
    </article>
  );
}
