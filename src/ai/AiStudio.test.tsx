import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '@/App';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Fake server: status + a scripted list of AI answers. */
function mockServer(opts: { configured: boolean; answers?: unknown[] }) {
  const answers = [...(opts.answers ?? [])];
  const calls: { task: string; input: Record<string, unknown> }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/ai/status') return json({ ok: true, configured: opts.configured, provider: 'anthropic', model: 'test-model' });
    if (url === '/api/ai') {
      const body = JSON.parse(String(init?.body));
      calls.push(body);
      return json({ ok: true, data: answers.shift() });
    }
    if (url === '/api/execute') return json({ ok: false, error: 'sandbox off' }, 503);
    return json({ ok: false }, 404);
  }));
  return calls;
}

beforeEach(() => {
  window.localStorage.clear();
  window.history.pushState({}, '', '/ai');
});
afterEach(() => vi.unstubAllGlobals());

describe('AI Studio', () => {
  it('is reachable from the navigation and shows a clear setup message when AI is off', async () => {
    mockServer({ configured: false });
    render(<App />);
    expect((await screen.findAllByRole('heading', { name: 'AI Studio' })).length).toBeGreaterThan(0);
    expect(await screen.findByText(/AI is not set up yet/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /generate sql/i })).toBeDisabled();
  });

  it('English to SQL: shows a green badge only after the compiler passes the answer', async () => {
    const calls = mockServer({ configured: true, answers: [{ sql: 'SELECT name FROM students WHERE gpa > 3.5;', explanation: 'Lists students with high GPA.' }] });
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/AI ready/i);
    await user.type(screen.getByLabelText(/your question in english/i), 'students with GPA above 3.5');
    await user.click(screen.getByRole('button', { name: /generate sql/i }));
    expect(await screen.findByText(/checked by the compiler: all stages passed/i)).toBeInTheDocument();
    expect(screen.getAllByText(/SELECT name FROM students WHERE gpa > 3.5;/).length).toBeGreaterThan(0);
    expect(calls[0].task).toBe('nl2sql');
    // The schema sent to the server comes from the project's real catalog.
    expect(String(calls[0].input.schema)).toContain('enrollments(');
  });

  it('retries automatically when the AI answer fails the compiler', async () => {
    const calls = mockServer({ configured: true, answers: [
      { sql: 'SELECT fullname FROM students;', explanation: 'wrong column' },
      { sql: 'SELECT name FROM students;', explanation: 'fixed' },
    ] });
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/AI ready/i);
    await user.type(screen.getByLabelText(/your question in english/i), 'all names');
    await user.click(screen.getByRole('button', { name: /generate sql/i }));
    expect(await screen.findByText(/corrected automatically after 2 tries/i)).toBeInTheDocument();
    expect(calls).toHaveLength(2);
    expect(calls[1].input.feedback).toBeTruthy();
  });

  it('Fix errors: shows the real compiler errors without any AI call', async () => {
    const calls = mockServer({ configured: true });
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/AI ready/i);
    await user.click(screen.getByRole('tab', { name: /fix errors/i }));
    await user.click(screen.getByRole('button', { name: /check with compiler/i }));
    expect(await screen.findByText(/the compiler found/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /fix with ai/i })).toBeEnabled();
    expect(calls).toHaveLength(0);
  });

  it('Explain: shows the compiler optimizer report and AI text next to each rule', async () => {
    const calls = mockServer({ configured: true, answers: [{ summary: 'Mostly skipped.', items: [{ rule: 'Predicate pushdown', applied: false, text: 'AI-SAID-THIS' }] }] });
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/AI ready/i);
    await user.click(screen.getByRole('tab', { name: /explain/i }));
    await user.click(screen.getByRole('tab', { name: /why wasn't it optimized/i }));
    await user.click(screen.getByRole('button', { name: /analyse with compiler/i }));
    expect(await screen.findByRole('heading', { name: /optimizer report/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /explain each rule/i }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].task).toBe('why-not');
    expect((calls[0].input.rules as unknown[]).length).toBeGreaterThan(3);
    expect(await screen.findByText('AI-SAID-THIS')).toBeInTheDocument();
  });

  it('Practice: grades by what the compiler really reports, not by what the AI claims', async () => {
    mockServer({ configured: true, answers: [{ sql: 'SELECT name FROM students WHERE gpa > 3.5 GROUP BY;', hint: 'Look at the end.' }] });
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/AI ready/i);
    await user.click(screen.getByRole('tab', { name: /practice/i }));
    await user.click(screen.getByRole('button', { name: /start challenge/i }));
    await screen.findByText(/which phase finds the bug/i);
    await user.click(screen.getByRole('button', { name: 'Guess Semantic' }));
    expect(await screen.findByText(/not quite/i)).toBeInTheDocument();
    expect(screen.getByText(/the compiler stops at syntax analysis/i)).toBeInTheDocument();
  });

  it('Quiz maker: runs a generated quiz with instant feedback and remembers missed topics', async () => {
    mockServer({ configured: true, answers: [{ questions: [{ question: 'What does the lexer produce?', options: ['Tokens', 'A plan', 'Rows', 'SQL'], answer: 0, explanation: 'Tokens.' }] }] });
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/AI ready/i);
    await user.click(screen.getByRole('tab', { name: /tutor & quiz/i }));
    await user.click(screen.getByRole('tab', { name: /make me a quiz/i }));
    await user.click(screen.getByRole('button', { name: /generate quiz/i }));
    await screen.findByText(/what does the lexer produce/i);
    await user.click(screen.getByRole('button', { name: /a plan/i }));
    expect(await screen.findByText(/not quite/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /see score/i }));
    expect(await screen.findByText(/quiz complete/i)).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem('ssc.ai.weak') ?? '{}')['Lexical analysis']).toBe(1);
  });
});

describe('AI Studio: examples, question log and connection test', () => {
  it('offers grouped example questions and fills the box when one is clicked', async () => {
    mockServer({ configured: true });
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/AI ready/i);
    await user.click(screen.getByRole('button', { name: 'Top 5 students by GPA' }));
    expect(screen.getByLabelText(/your question in english/i)).toHaveValue('Top 5 students by GPA');
    expect(screen.getByText('Joins')).toBeInTheDocument();
  });

  it('saves only the questions you really asked, and lets you reuse, remove and clear them', async () => {
    mockServer({ configured: true, answers: [{ sql: 'SELECT name FROM students;', explanation: 'x' }] });
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/AI ready/i);
    expect(screen.queryByText(/your question log/i)).not.toBeInTheDocument(); // nothing is pre-filled
    await user.type(screen.getByLabelText(/your question in english/i), 'all names');
    await user.click(screen.getByRole('button', { name: /generate sql/i }));
    await screen.findByText(/your question log/i);
    expect(screen.getByText('SELECT name FROM students;', { selector: 'span' })).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem('ssc.ai.questions') ?? '[]')[0].question).toBe('all names');
    await user.clear(screen.getByLabelText(/your question in english/i));
    await user.click(screen.getByRole('button', { name: /use question: all names/i }));
    expect(screen.getByLabelText(/your question in english/i)).toHaveValue('all names');
    await user.click(screen.getByRole('button', { name: /clear log/i }));
    expect(screen.queryByText(/your question log/i)).not.toBeInTheDocument();
  });

  it('Test AI connection shows the verdict and each attempt', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === '/api/ai/status') return json({ ok: true, configured: true, provider: 'gemini', model: 'gemini-2.5-flash' });
      if (url === '/api/ai/test') return json({ ok: true, works: false, provider: 'gemini', model: 'gemini-2.5-flash', error: 'Google AI is busy right now.', attempts: [{ endpoint: 'gemini-api', model: 'gemini-2.5-flash', status: 503, reason: 'High demand' }] });
      return json({ ok: false }, 404);
    }));
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/AI ready/i);
    await user.click(screen.getByRole('button', { name: /test ai connection/i }));
    expect(await screen.findByText(/the ai test failed/i)).toBeInTheDocument();
    expect(screen.getByText(/google ai is busy/i)).toBeInTheDocument();
    expect(screen.getByText(/503 · gemini-api · gemini-2\.5-flash/)).toBeInTheDocument();
  });

  it('Test AI connection says so when the server is an old version', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === '/api/ai/status') return json({ ok: true, configured: true, provider: 'gemini', model: 'm' });
      return new Response('Cannot POST /api/ai/test', { status: 404, headers: { 'content-type': 'text/html' } });
    }));
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/AI ready/i);
    await user.click(screen.getByRole('button', { name: /test ai connection/i }));
    expect(await screen.findByText(/old version/i)).toBeInTheDocument();
  });
});
