# Demo / viva guide (about 8 minutes)

1. **Dashboard** – show the pipeline overview. Point out that statistics are empty for a new user (nothing is invented).
2. **SQL Compiler → Compile Query** on the default query. Narrate the seven stages turning green; click *Lexical Analysis* and
   show tokens with line/column/offsets; search for `department`.
3. **AST tab** – expand `Select → Where → BinaryExpr`. Say: the parser is node-sql-parser; the AST is adapted from its output.
4. **Semantic tab** – scope and resolved columns. Now change `name` to `student_name` and compile:
   *Semantic Error: Column 'student_name' does not exist in table 'students'. Did you mean 'name'?* Pipeline shows IR/Optimization/Codegen **Skipped**.
5. **Intermediate Representation** – `SELECT name FROM students WHERE age > 20;` gives `π_{name}(σ_{age > 20}(students))`; show the plan tree.
6. **Optimization** – load *Constant expression simplification* and *Predicate pushdown through joins*; show before/after and the
   explanation. Then load *LEFT JOIN (unsafe pushdown skipped)* and show the **skip reason** (NULL-extended rows make the rewrite unsafe).
   State clearly: logical rewrites, no performance measurement is claimed.
7. **Errors** – load *Invalid syntax* (syntax error with the parser's position) and *Unterminated string* (lexical error); show the editor highlight.
8. **Execution tab** (start `npm run server` first) – run a SELECT in the sandbox; try `DELETE FROM students` and show it is blocked.
9. **History** – reopen, recompile, delete, and clear (with confirmation). **Learn** – open a lesson and answer a quiz question.

Likely viva questions: *Why is a regex not enough for a lexer/parser? What is the difference between syntax and semantic errors?
Why is predicate pushdown unsafe over a LEFT JOIN? What does an AST contain versus a logical plan?* (answers are in the Learn page.)
