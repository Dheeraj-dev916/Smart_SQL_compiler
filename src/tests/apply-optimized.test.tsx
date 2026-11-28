import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '@/App';
import { DRAFT_KEY } from '@/services/settings';

beforeEach(() => {
  window.localStorage.clear();
});

describe('Optimize Query: one-click apply and undo', () => {
  it('shows the optimized query, applies it to the editor and can restore the original', async () => {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify('SELECT name FROM students WHERE 1 = 1 AND age > 18 + 2;'));
    window.history.pushState({}, '', '/compiler');
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /optimize query/i }));
    expect(await screen.findByRole('heading', { name: /optimized query is ready/i }, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText(/\d+ characters? shorter/i)).toBeInTheDocument();

    // Clicking Optimize Query already put the optimized SQL into the editor.
    expect(await screen.findByRole('button', { name: /undo \(restore original\)/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /apply to editor/i })).not.toBeInTheDocument();
    // The editor draft now holds the optimized SQL (no "1 = 1", constant folded).
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem(DRAFT_KEY) ?? '""')).toMatch(/age > 20/)); // draft is saved after a short delay

    await user.click(screen.getByRole('button', { name: /undo \(restore original\)/i }));
    expect(await screen.findByRole('button', { name: /apply to editor/i })).toBeInTheDocument();
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem(DRAFT_KEY) ?? '""')).toBe('SELECT name FROM students WHERE 1 = 1 AND age > 18 + 2;'));
  });

  it('shows nothing extra when there is nothing to optimize', async () => {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify('SELECT name FROM students;'));
    window.history.pushState({}, '', '/compiler');
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /optimize query/i }));
    expect(await screen.findByText(/no optimization was applied/i, {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /optimized query is ready/i })).not.toBeInTheDocument();
  });
});

describe('default query and optimizer demos', () => {
  it('the default query is long and un-optimized, and Optimize Query visibly optimizes it', async () => {
    window.history.pushState({}, '', '/compiler');
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /optimize query/i }));
    expect(await screen.findByRole('heading', { name: /optimized query is ready/i }, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText(/6 of 7 rules applied/i)).toBeInTheDocument();
  });

  it('upgrades a saved draft that is still the old 4-line default', async () => {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify("SELECT name, department\nFROM students\nWHERE department = 'Computer Science'\nORDER BY name;"));
    window.history.pushState({}, '', '/compiler');
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /optimize query/i }));
    expect(await screen.findByRole('heading', { name: /optimized query is ready/i }, { timeout: 3000 })).toBeInTheDocument();
  });

  it('offers demo queries when the query is already simple', async () => {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify('SELECT name FROM students;'));
    window.history.pushState({}, '', '/compiler');
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /optimize query/i }));
    await screen.findByText(/no optimization was applied/i);
    await user.click(screen.getByRole('button', { name: /grouping and having/i }));
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem(DRAFT_KEY) ?? '""')).toMatch(/HAVING COUNT\(\*\) > 1 \+ 1/));
  });
});

describe('queries that only improve in the plan', () => {
  it('explains that the plan was optimized even though the SQL text is already simple', async () => {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify("SELECT s.name, c.course_name\nFROM students s\nINNER JOIN enrollments e ON s.id = e.student_id\nINNER JOIN courses c ON c.id = e.course_id\nWHERE s.department = 'Computer Science' AND c.credits > 2;"));
    window.history.pushState({}, '', '/compiler');
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /optimize query/i }));
    expect(await screen.findByRole('heading', { name: /the query plan improved/i })).toBeInTheDocument();
    expect(screen.getAllByText(/predicate pushdown/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /apply to editor/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /grouping and having/i })).toBeInTheDocument();
  });
});
