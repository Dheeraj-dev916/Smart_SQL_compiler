# Smart SQL Query Compiler

An educational, university-level **Compiler Design** project. It takes a SQL query through a real
seven-stage compiler pipeline and lets you inspect the output of every phase.

```
SQL Source → Lexical Analysis → Syntax Analysis → Semantic Analysis
           → Intermediate Representation → Query Optimization → Code Generation
```

Each phase consumes the real output of the previous one. If a required phase fails, downstream phases are
marked **Skipped**; they never report false success. Nothing in the UI is canned: tokens, trees, plans, rewrites and
diagnostics are all produced from the query you typed.

## Quick start

Requires Node.js 20+ (developed on Node 22).

```bash
npm install
npm run dev          # compiler UI at http://localhost:5173
npm run server       # optional: sandbox API for running SELECTs (port 8787, proxied by `npm run dev`)
npm test             # 170+ automated tests (Vitest)
npm run build        # type-check + production build into dist/
npm run server       # after a build, also serves dist/ on http://localhost:8787
```

The compiler works fully offline with no API keys. The sandbox server and Supabase are both optional.

## What each phase does

| Phase | Module | Notes |
|---|---|---|
| Lexical analysis | `src/compiler/lexer` | Hand-written scanner. Keywords, identifiers, quoted identifiers, strings (with `''` escapes), numbers, TRUE/FALSE/NULL, `<= >= <> !=`, arithmetic, punctuation, `--` and `/* */` comments. Every token records index, lexeme, type, line, column, start/end offset. Reports unterminated strings/comments and invalid characters. |
| Syntax analysis | `src/compiler/parser` | Uses the real parser library **node-sql-parser** (PostgreSQL dialect). An adapter converts its output to a typed AST and rejects anything outside the documented subset as *Unsupported syntax*. Error positions come from the parser when it provides them and are never invented. |
| Semantic analysis | `src/compiler/semantic` | Resolves tables, aliases and qualified columns against the schema catalog; detects unknown tables/columns, ambiguous columns, invalid qualifiers, bad JOIN/GROUP BY references, with "Did you mean …?" suggestions from real schema metadata. |
| Intermediate representation | `src/compiler/intermediate` | Builds a logical plan (TableScan, Selection, Projection, Join, Aggregation, Sort, Limit, Distinct) and relational algebra from the analysed AST. |
| Optimization | `src/compiler/optimizer` | Seven rule-based, semantics-preserving rules (see below). Every rule returns name, original, optimized, applied?, explanation and skip reason. |
| Code generation | `src/compiler/codegen` | Prints formatted and optimized SQL from the (optimized) AST. Formatting, logical optimization and SQL rewriting are reported separately; "optimized" is never claimed when nothing changed. |

### Relational-algebra notation

| Symbol | Meaning |
|---|---|
| `π_{a,b}(R)` | projection onto columns a, b |
| `σ_{p}(R)` | selection by predicate p (WHERE / HAVING) |
| `R ⋈_{p} S` | inner join; `R ⟕_{p} S` left outer join |
| `γ_g; f(x)(R)` | grouping by g, computing aggregates f |
| `τ_{a ↑/↓}(R)` | sort ascending / descending |
| `λ_n(R)` | limit to n rows |
| `δ(R)` | duplicate elimination (DISTINCT) |

Example: `SELECT name FROM students WHERE age > 20;` → `π_{name}(σ_{age > 20}(students))`.

### Optimization rules

Constant folding · Boolean simplification (valid under three-valued logic) · Expression simplification ·
Predicate reordering · Redundant DISTINCT elimination · Predicate pushdown · Projection pushdown.

Rules are **skipped** (with the reason shown) whenever equivalence cannot be established: across LEFT joins, aggregation
boundaries, LIMIT/ORDER BY, NULL-sensitive expressions, or non-deterministic functions. These are *logical* rewrites;
the app does not measure or claim any execution-time improvement.

### Supported SQL subset

`SELECT` (with `DISTINCT`, aliases, `*`), `FROM`, `INNER JOIN`, `LEFT JOIN`, `WHERE`, `GROUP BY`, `HAVING`, `ORDER BY`,
`LIMIT`, aggregates (`COUNT SUM AVG MIN MAX`), `AND/OR/NOT`, comparison and arithmetic expressions, `IN`, `BETWEEN`,
`LIKE`, `IS [NOT] NULL`, and basic `INSERT` / `UPDATE` / `DELETE` (parsed and analysed; never executed).
One statement at a time. Anything else (subqueries, CTEs, window functions, set operations, DDL, …) is reported as
unsupported rather than silently accepted.

## Application pages

Dashboard · **SQL Compiler** (CodeMirror editor, schema explorer, 7-stage pipeline, tabbed results: Tokens, AST,
Semantic, IR, Optimization, Generated SQL, Errors & Warnings, Execution) · Query History · SQL Examples (15 verified
queries) · Learn Compiler Design (lessons + quiz with instant explanations) · Project Information (editable student /
university / supervisor / year; nothing is pre-filled) · Settings.

Dashboard statistics are computed from your own stored history. A new user sees empty states, not invented activity.

## Demo database (shared by explorer and analyzer)

`students(id PK, name, department, age, gpa)`, `courses(id PK, course_name, department, credits)`,
`enrollments(id PK, student_id FK→students.id, course_id FK→courses.id, grade)`. Defined once in
`src/compiler/semantic/schema.ts` and used by both the schema explorer and the semantic analyzer.

## Persistence and environment variables

| Mode | When | Details |
|---|---|---|
| Local (default) | no env vars | History, settings, draft query and profile live in `localStorage`. |
| Supabase | both vars set | History is stored in `query_history` with Row Level Security. |

```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon / publishable key>     # NEVER a service-role key
```

Supabase setup: (1) create a project; (2) Authentication → Providers → enable **Anonymous sign-ins** (the app signs in
anonymously so every row has an owner, so no login screen is needed); (3) apply `supabase/migrations/20261021000000_init.sql`
(`supabase db push` or the SQL editor); (4) copy `.env.example` to `.env` and fill the two values. The migration creates
`query_history` and `user_preferences`, indexes, foreign keys to `auth.users`, and RLS policies so a user can only read,
insert or delete their own rows. If Supabase is configured but unreachable, the app says so and falls back to local storage.
Only the compiler *result summary* (SQL text, status, counts, duration) is stored, never credentials.

## Safe query execution (optional)

`npm run server` starts an Express API (`POST /api/execute`) backed by an **in-memory SQLite** database seeded with the
demo data. Boundaries:

- Executes **one read-only SELECT** only. The check in `server/validate.mjs` scans the raw text and deliberately does **not**
  trust the front-end's parser. Writes, DDL, PRAGMA, ATTACH, CTEs and multiple statements are rejected with HTTP 400.
- Each request runs in a fresh worker with a hard **2 s timeout** and a **200-row limit**; nothing persists between requests.
- Rate limited (40 requests/min/client), 16 kB request bodies, no credentials in the front-end.
- If the server is not running, the Execution tab says so; no result rows are ever simulated.

## Project layout

```
src/compiler/{lexer,parser,semantic,intermediate,optimizer,codegen,diagnostics}   engine (no React)
src/components/{layout,editor,compiler,schema,history,learning,ui}                UI
src/pages  src/hooks  src/services  src/data  src/types  src/utils  src/tests
server/    sandbox API + tests          supabase/migrations/   database schema + RLS
```

## Testing

`npm test` runs Vitest: lexer, parser, semantic analyzer, IR, optimizer (positive, negative and
semantic-equivalence checks executed against a real SQLite engine), end-to-end compilation and pipeline statuses,
history store, report export, sandbox validation/limits/HTTP API, and React Testing Library tests for navigation, the
mobile drawer, theme toggle, compile flow, history clearing and the quiz.
Layouts were also checked in headless Chromium at 375, 768 and 1440 px with no page-level horizontal overflow.
Not covered by automation: Supabase (needs a live project) and screen-reader testing.

## Known limitations

- A subset of SQL, one statement at a time (see above). Dialect is PostgreSQL; SQLite runs the sandbox, so rare dialect
  differences are possible for executed results.
- node-sql-parser does not always give exact error columns; when it does not, the message says "near …" instead of guessing.
- Semantic type checking is limited to reliably detectable cases (e.g. comparing a number column to a string literal).
- The optimizer is rule-based and heuristic: no cost model, statistics or join reordering.
- Supabase history is per anonymous browser session; clearing site data loses access to that identity's rows.
- The production bundle is large (~1.6 MB, mostly the parser library); it is not code-split.

## Future improvements

Subqueries and CTEs, cost-based optimization with table statistics, more dialects, user-defined schemas, shareable
query links, a step-through animation of the parser.

## AI Studio (optional)

A separate page (**AI Studio**, `/ai`) adds AI helpers. Nothing else in the app changed, and everything above still works with no key.

| Tab | What it does |
|---|---|
| Write SQL | English → SQL for the demo schema |
| Fix errors | Real compiler errors first, then "Explain" and "Fix with AI" |
| Explain | Plain-English walk-through of a query; why each optimizer rule was applied or skipped |
| Rewrite | Rewrites subqueries/CTEs into the supported subset and compares the rows on the SQLite sandbox |
| Practice | AI invents a bug; the compiler decides the real failing phase and grades your fix |
| Tutor & quiz | Chat tutor that sees your current query and compiler output; AI quiz maker that remembers missed topics |

**The compiler is the referee.** The AI only suggests. Every SQL answer is compiled again by this project (a failed answer is sent back with the real errors, up to 3 tries), and a green "Checked by the compiler" badge appears only if it passed. Compiler facts (errors, optimizer report, algebra) are always shown from the real pipeline, never from the AI.

Setup: copy `.env.example` to `.env`, set `GEMINI_API_KEY` (or `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`), run `npm run server` and `npm run dev`. Without a key the app still works; only the AI answers are off. The key stays on the server (never put it in a `VITE_` variable or in front-end code); the browser cannot send its own prompts (the server builds them per task), and `/api/ai` is rate limited to 20 requests/min. Code: `server/ai.mjs`, `src/ai/`.

**Test AI connection.** The AI Studio page has a "Test AI connection" button. It sends one tiny real request and shows what the AI provider answered at each step, so a problem (busy, quota, wrong key or model) is explained instead of guessed. The server also prints `[ai]` lines in its terminal.

**Question log.** Write SQL offers grouped example questions and keeps your own latest questions (with the SQL that passed the compiler) in this browser. Nothing is pre-filled.

**Optimize Query.** The Optimization tab now starts with the optimized query next to yours, how many characters it saves, and an **Apply to editor** button (with **Undo**). It only uses what the optimizer already produced; the compiler pipeline itself is unchanged.
