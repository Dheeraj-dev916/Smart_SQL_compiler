import * as React from 'react';
import { Save, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { Badge } from '@/components/ui/badge';
import { useApp } from '@/hooks/useApp';
import { EMPTY_PROFILE, type Profile } from '@/services/settings';

const FIELDS: { key: keyof Profile; label: string; placeholder: string; autoComplete?: string }[] = [
  { key: 'studentName', label: 'Student name', placeholder: 'Your name', autoComplete: 'name' },
  { key: 'university', label: 'University', placeholder: 'Your university' },
  { key: 'department', label: 'Department', placeholder: 'Your department' },
  { key: 'supervisor', label: 'Supervisor', placeholder: 'Supervisor name' },
  { key: 'academicYear', label: 'Academic year', placeholder: 'e.g. 2026–2027' },
];

const SUPPORTED = [
  'SELECT, DISTINCT, column and table aliases, SELECT *',
  'FROM with INNER JOIN and LEFT JOIN … ON',
  'WHERE and HAVING with AND, OR, NOT',
  'Comparison, arithmetic, BETWEEN, IN (list), LIKE, IS [NOT] NULL',
  'Aggregates: COUNT, SUM, AVG, MIN, MAX (including COUNT(*) and DISTINCT)',
  'GROUP BY, ORDER BY (ASC/DESC, aliases, positions), LIMIT and OFFSET',
  'INSERT … VALUES, UPDATE … SET … WHERE, DELETE … WHERE (parsed and semantically checked)',
];

const LIMITATIONS = [
  'Logical planning, optimization and execution work for SELECT only. INSERT, UPDATE and DELETE are parsed and validated but not planned or executed.',
  'Not supported (reported as “Unsupported syntax”): subqueries, UNION/INTERSECT/EXCEPT, WITH (CTEs), window functions, CASE, CAST, RIGHT/FULL/CROSS JOIN, JOIN … USING, comma-separated tables, DDL and multiple statements.',
  'The parser is a third-party library (node-sql-parser, PostgreSQL dialect). It scans the text itself, so the project’s lexer runs alongside it to expose tokens and lexical errors; the parser does not consume that token list.',
  'Syntax-error positions come from the parser library when it supplies them. Semantic-error positions are found by matching identifier tokens, so for a repeated name they may point at another occurrence.',
  'The optimizer is rule-based and heuristic. There is no cost model or statistics, and execution time is never measured or estimated.',
  'One built-in demo schema (students, courses, enrollments). There is no schema editor or switching yet.',
  'Sandbox execution uses in-memory SQLite, not PostgreSQL, so some functions and type behavior differ. It needs the Node server to be running.',
  'Supabase history needs a configured project and the included migration; without it, history lives in this browser’s localStorage.',
];

const FUTURE = [
  'More SQL: subqueries, set operations, CTEs, RIGHT/FULL joins and CASE expressions.',
  'User-defined schemas, imported from CREATE TABLE statements.',
  'A cost model with table statistics, join-order search and an EXPLAIN-style plan view.',
  'Step-through animation of lexer and parser state.',
  'Executing against PostgreSQL in an isolated, read-only sandbox.',
];

const TECH = ['React', 'TypeScript', 'Vite', 'Tailwind CSS', 'Radix UI (shadcn/ui style)', 'CodeMirror 6', 'node-sql-parser', 'sql-formatter', 'Express', 'SQLite (sandbox)', 'Supabase (optional)', 'Vitest'];

function List({ items }: { items: string[] }) {
  return <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed">{items.map((t) => <li key={t}>{t}</li>)}</ul>;
}

function Block({ title, children, id }: { title: string; children: React.ReactNode; id: string }) {
  return (
    <section aria-labelledby={id}>
      <Card>
        <CardHeader><CardTitle id={id} className="text-base">{title}</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm leading-relaxed">{children}</CardContent>
      </Card>
    </section>
  );
}

export default function AboutPage() {
  const { profile, updateProfile } = useApp();
  const { toast } = useToast();
  const [draft, setDraft] = React.useState<Profile>(profile);
  const dirty = JSON.stringify(draft) !== JSON.stringify(profile);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, v.trim()])) as unknown as Profile;
    updateProfile(clean);
    setDraft(clean);
    toast({ kind: 'success', title: 'Project details saved', description: 'Stored in this browser only.' });
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Compiler Design project</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight">Smart SQL Query Compiler</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">An educational compiler for a subset of SQL that shows every phase of compilation on real input.</p>
      </div>

      <section aria-labelledby="who-h">
        <Card>
          <CardHeader>
            <CardTitle id="who-h" className="flex items-center gap-2 text-base"><UserRound className="size-4" aria-hidden="true" /> Submission details</CardTitle>
            <CardDescription>These fields start empty and are yours to fill in. They are saved only in this browser.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
              {FIELDS.map((f) => (
                <div key={f.key} className="space-y-1">
                  <Label htmlFor={`profile-${f.key}`}>{f.label}</Label>
                  <Input id={`profile-${f.key}`} value={draft[f.key]} placeholder={f.placeholder} autoComplete={f.autoComplete} maxLength={120} onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))} />
                </div>
              ))}
              <div className="flex flex-wrap items-end gap-2 sm:col-span-2">
                <Button type="submit" disabled={!dirty}><Save /> Save details</Button>
                <Button type="button" variant="ghost" disabled={JSON.stringify(draft) === JSON.stringify(EMPTY_PROFILE)} onClick={() => setDraft(EMPTY_PROFILE)}>Clear fields</Button>
              </div>
            </form>
            {Object.values(profile).some(Boolean) && (
              <dl className="mt-4 grid gap-x-6 gap-y-1 border-t pt-3 text-sm sm:grid-cols-2" aria-label="Saved details">
                {FIELDS.filter((f) => profile[f.key]).map((f) => (
                  <div key={f.key} className="flex gap-2"><dt className="text-muted-foreground">{f.label}:</dt><dd className="font-medium">{profile[f.key]}</dd></div>
                ))}
              </dl>
            )}
          </CardContent>
        </Card>
      </section>

      <Block id="problem-h" title="Problem statement">
        <p>
          SQL is usually treated as a black box: a query goes in and rows come out. Students of compiler design rarely see a language they use every day pass through lexing, parsing, semantic checking, intermediate representation, optimization and code generation. Errors from a database are often terse and give no explanation of which phase found them.
        </p>
      </Block>

      <Block id="obj-h" title="Objectives">
        <List items={[
          'Demonstrate every phase of a compiler on a language students already know.',
          'Report lexical, syntax and semantic errors separately, with positions and suggested fixes where they are available.',
          'Build a logical plan and relational algebra from the real query, not from a fixed template.',
          'Apply only optimizations that are provably safe, and explain every rule that applied or was skipped.',
          'Make the whole pipeline inspectable, testable and suitable for a viva.',
        ]} />
      </Block>

      <Block id="scope-h" title="Scope">
        <p>
          A small, reliable SQL subset over one demo academic schema, rather than a large but unreliable grammar. The compiler engine is independent of the user interface and works without login or any paid API. The optional sandbox runs SELECT statements on a throwaway database.
        </p>
      </Block>

      <Block id="sql-h" title="Supported SQL features"><List items={SUPPORTED} /></Block>

      <Block id="phases-h" title="Compiler phases">
        <ol className="list-decimal space-y-1.5 pl-5">
          <li><strong>Lexical analysis</strong>: tokens with line, column and offsets.</li>
          <li><strong>Syntax analysis</strong>: a real SQL parser builds the AST; unsupported syntax is rejected.</li>
          <li><strong>Semantic analysis</strong>: names, aliases, types and grouping are checked against the schema.</li>
          <li><strong>Intermediate representation</strong>: logical plan, relational algebra and JSON.</li>
          <li><strong>Query optimization</strong>: seven rules, each reported as applied or skipped with a reason.</li>
          <li><strong>Code generation</strong>: formatted and optimized SQL.</li>
        </ol>
      </Block>

      <Block id="tech-h" title="Technologies used">
        <ul className="flex flex-wrap gap-1.5">{TECH.map((t) => <li key={t}><Badge variant="outline">{t}</Badge></li>)}</ul>
      </Block>

      <Block id="limits-h" title="Known limitations"><List items={LIMITATIONS} /></Block>
      <Block id="future-h" title="Future improvements"><List items={FUTURE} /></Block>
    </div>
  );
}
