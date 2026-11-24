export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  /** Index into options. */
  answer: number;
  explanation: string;
}

export const QUIZ: QuizQuestion[] = [
  {
    id: 'q1',
    question: 'Which phase turns the characters of a query into tokens?',
    options: ['Syntax analysis', 'Lexical analysis', 'Semantic analysis', 'Code generation'],
    answer: 1,
    explanation: 'The lexer (scanner) groups characters into tokens such as keywords, identifiers, literals and operators.',
  },
  {
    id: 'q2',
    question: 'In SELECT name FROM students WHERE age >= 20, how many tokens does the lexer produce (not counting whitespace)?',
    options: ['7', '8', '9', '12'],
    answer: 1,
    explanation: 'SELECT, name, FROM, students, WHERE, age, >=, 20 are 8 tokens. Because >= is matched as one operator, it counts once.',
  },
  {
    id: 'q3',
    question: 'An unterminated string literal such as \'CS is detected in which phase?',
    options: ['Lexical analysis', 'Syntax analysis', 'Semantic analysis', 'Optimization'],
    answer: 0,
    explanation: 'The lexer cannot find the closing quote, so it cannot form a STRING token. This is a lexical error and the pipeline stops there.',
  },
  {
    id: 'q4',
    question: 'What does syntax analysis produce for a valid query?',
    options: ['A list of tokens', 'A tree describing the query structure', 'Optimized SQL text', 'Result rows'],
    answer: 1,
    explanation: 'The parser checks the tokens against the grammar and builds a parse tree / AST. Result rows only exist after a database executes the query.',
  },
  {
    id: 'q5',
    question: 'SELECT student_name FROM students is grammatically valid. Why does it still fail?',
    options: ['A lexical error', 'A syntax error', 'A semantic error: the column does not exist in the schema', 'An optimization warning'],
    answer: 2,
    explanation: 'The grammar does not know which columns exist. Semantic analysis checks names against the schema catalog and can suggest “name”.',
  },
  {
    id: 'q6',
    question: 'Why is it called an ABSTRACT syntax tree?',
    options: ['It is stored in abstract classes', 'It leaves out punctuation and keeps only the structure that matters', 'It cannot be printed', 'It is produced before tokenizing'],
    answer: 1,
    explanation: 'Commas, parentheses and semicolons are needed to parse but carry no meaning of their own, so the AST drops them.',
  },
  {
    id: 'q7',
    question: 'What is σ_{age > 20}(students) in relational algebra?',
    options: ['A projection onto the age column', 'A selection of the rows where age > 20', 'A join of students with itself', 'A sort by age'],
    answer: 1,
    explanation: 'σ (sigma) is selection: it filters rows. π (pi) would be projection, which filters columns.',
  },
  {
    id: 'q8',
    question: 'In the logical plan of SELECT name FROM students WHERE age > 20, which operator is at the root?',
    options: ['TableScan', 'Selection', 'Projection', 'Limit'],
    answer: 2,
    explanation: 'The plan is read bottom-up: TableScan → Selection (WHERE) → Projection (SELECT list). The projection is the last operator applied, so it is the root.',
  },
  {
    id: 'q9',
    question: 'WHERE 1 + 1 = 2 AND age > 20 simplifies to WHERE age > 20. Which rules do that?',
    options: ['Predicate pushdown', 'Constant folding and boolean simplification', 'Projection pushdown', 'Join reordering'],
    answer: 1,
    explanation: 'Constant folding evaluates 1 + 1 = 2 to TRUE, and the boolean identity TRUE AND x = x removes it.',
  },
  {
    id: 'q10',
    question: 'Why does the optimizer NOT push a filter on the right table of a LEFT JOIN below the join?',
    options: ['It would be slower', 'It could change the result: unmatched rows keep NULLs on the right side', 'LEFT JOINs cannot have WHERE clauses', 'The parser rejects it'],
    answer: 1,
    explanation: 'Filtering the right table early removes rows before the join, so left rows would appear with NULLs that the original WHERE would have filtered out. Different result, so the rule is skipped.',
  },
  {
    id: 'q11',
    question: 'The optimizer applies a logical rewrite. What may this project claim about speed?',
    options: ['The query is now faster', 'The query is exactly twice as fast', 'Nothing, because execution time is not measured', 'It is faster on every database'],
    answer: 2,
    explanation: 'A logical rewrite can reduce work, but real performance depends on the engine, indexes and data. The tool reports what changed, not how fast it runs.',
  },
  {
    id: 'q12',
    question: 'Semantic analysis fails. What happens to the later phases?',
    options: ['They run anyway and report success', 'They are skipped', 'They run on an empty query', 'The compiler restarts'],
    answer: 1,
    explanation: 'Each phase consumes the output of the previous one. If a required phase fails, the later phases are marked skipped instead of falsely succeeding.',
  },
];
