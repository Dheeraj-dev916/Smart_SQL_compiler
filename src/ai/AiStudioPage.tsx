import * as React from 'react';
import { Bot, Bug, GraduationCap, Lightbulb, Repeat, ShieldCheck, Sparkles, Wrench } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { getAiStatus, type AiStatus } from './aiClient';
import { AiOffline } from './components/shared';
import { ConnectionTest } from './components/ConnectionTest';
import { WriteSqlPanel } from './components/WriteSqlPanel';
import { FixErrorsPanel } from './components/FixErrorsPanel';
import { ExplainPanel } from './components/ExplainPanel';
import { RewritePanel } from './components/RewritePanel';
import { PracticePanel } from './components/PracticePanel';
import { TutorPanel } from './components/TutorPanel';
import './ai.css';

const TABS = [
  { id: 'write', label: 'Write SQL', icon: Sparkles, blurb: 'Describe what you want in English and get SQL.' },
  { id: 'fix', label: 'Fix errors', icon: Wrench, blurb: 'See the compiler’s errors, understand them, and get a checked fix.' },
  { id: 'explain', label: 'Explain', icon: Lightbulb, blurb: 'Understand a query, or why the optimizer skipped a rule.' },
  { id: 'rewrite', label: 'Rewrite', icon: Repeat, blurb: 'Turn unsupported SQL into SQL the compiler accepts.' },
  { id: 'practice', label: 'Practice', icon: Bug, blurb: 'Find the bug in a query. The compiler grades you.' },
  { id: 'tutor', label: 'Tutor & quiz', icon: GraduationCap, blurb: 'Chat with a tutor or generate a quiz on any phase.' },
] as const;

export default function AiStudioPage() {
  const [status, setStatus] = React.useState<AiStatus | null>(null);
  const [tab, setTab] = React.useState<(typeof TABS)[number]['id']>('write');
  React.useEffect(() => { void getAiStatus().then(setStatus); }, []);
  const current = TABS.find((t) => t.id === tab)!;

  return (
    <div className="ai-light mx-auto max-w-4xl space-y-5 rounded-2xl border p-4 sm:p-6">
      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-secondary text-primary"><Bot className="size-5" /></span>
            <div>
              <h2 className="text-xl font-semibold tracking-tight">AI Studio</h2>
              <p className="text-sm text-muted-foreground">AI helpers for writing, fixing, explaining and learning SQL.</p>
            </div>
          </div>
          {status && (status.configured ? <Badge variant="success">AI ready · {status.model}</Badge> : <Badge variant="warning">AI not set up</Badge>)}
        </div>
        <div className="flex items-start gap-2 rounded-lg border border-success/25 bg-success/5 px-3 py-2 text-[13px] text-foreground/80">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" />
          <p><b>The compiler is the referee.</b> The AI only suggests. Every SQL answer is compiled again by this project, and you see a green badge only when it truly passes.</p>
        </div>
        <AiOffline status={status} />
        <ConnectionTest onResult={() => void getAiStatus().then(setStatus)} />
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList aria-label="AI features" className="rounded-t-xl border bg-card">
          {TABS.map(({ id, label, icon: Icon }) => (
            <TabsTrigger key={id} value={id}><Icon className="size-4" />{label}</TabsTrigger>
          ))}
        </TabsList>
        <p className="px-1 pb-3 pt-3 text-sm text-muted-foreground">{current.blurb}</p>
        <TabsContent value="write"><WriteSqlPanel ai={status} /></TabsContent>
        <TabsContent value="fix"><FixErrorsPanel ai={status} /></TabsContent>
        <TabsContent value="explain"><ExplainPanel ai={status} /></TabsContent>
        <TabsContent value="rewrite"><RewritePanel ai={status} /></TabsContent>
        <TabsContent value="practice"><PracticePanel ai={status} /></TabsContent>
        <TabsContent value="tutor"><TutorPanel ai={status} /></TabsContent>
      </Tabs>
    </div>
  );
}
