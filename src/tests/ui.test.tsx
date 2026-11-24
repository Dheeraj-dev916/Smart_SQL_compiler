import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '@/App';

function go(path: string) {
  window.history.pushState({}, '', path);
}

beforeEach(() => {
  window.localStorage.clear();
  go('/');
});

describe('navigation', () => {
  it('renders the dashboard with an Open Compiler action and an empty history state', async () => {
    render(<App />);
    expect(await screen.findAllByRole('link', { name: /open compiler/i })).not.toHaveLength(0);
    expect(screen.getAllByText(/no queries|nothing|empty|compile a query/i).length).toBeGreaterThan(0);
  });

  it('every main nav link navigates to a real page', async () => {
    const user = userEvent.setup();
    render(<App />);
    const nav = (await screen.findAllByRole('navigation', { name: 'Main' }))[0];
    for (const [label, heading] of [
      ['Query History', /history/i], ['SQL Examples', /example/i], ['Learn Compiler Design', /learn|compiler design/i], ['Project Information', /project|about/i], ['Settings', /settings/i],
    ] as const) {
      const link = within(nav).getAllByRole('link').find((a) => new RegExp(label, 'i').test(a.textContent ?? ''));
      expect(link, label).toBeTruthy();
      await user.click(link!);
      expect((await screen.findAllByRole('heading', { name: heading })).length).toBeGreaterThan(0);
    }
  });

  it('shows a 404 page for unknown routes', async () => {
    go('/nope');
    render(<App />);
    expect(await screen.findByText(/does not exist/i)).toBeInTheDocument();
  });

  it('mobile drawer opens from the menu button', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /open navigation menu/i }));
    const drawer = await screen.findByRole('dialog');
    expect(within(drawer).getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    await user.click(within(drawer).getByRole('link', { name: /settings/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('theme toggle switches the document theme', async () => {
    const user = userEvent.setup();
    render(<App />);
    const before = document.documentElement.classList.contains('dark');
    await user.click(await screen.findByRole('button', { name: /switch to (light|dark) theme/i }));
    expect(document.documentElement.classList.contains('dark')).toBe(!before);
  });
});

describe('compiler page', () => {
  it('shows empty results before compiling, then real pipeline results after', async () => {
    const user = userEvent.setup();
    go('/compiler');
    render(<App />);
    const compileBtn = await screen.findByRole('button', { name: /compile query/i });
    expect(screen.getByRole('toolbar', { name: /editor actions/i })).toBeInTheDocument();
    await user.click(compileBtn);
    await waitFor(() => expect(screen.getAllByRole('button', { name: /lexical analysis: success/i }).length).toBeGreaterThan(0), { timeout: 5000 });
    await waitFor(() => expect(screen.getAllByRole('button', { name: /code generation: success/i }).length).toBeGreaterThan(0), { timeout: 5000 });
    // history was recorded from the actual result
    const stored = JSON.parse(window.localStorage.getItem('ssc.history') ?? '[]');
    expect(stored).toHaveLength(1);
    expect(stored[0].status).toBe('success');
  });

  it('Export Report is disabled until a compilation exists', async () => {
    go('/compiler');
    render(<App />);
    const exp = await screen.findByRole('button', { name: /export/i });
    expect(exp).toBeDisabled();
  });

  it('Clear editor empties the draft and Reset restores the default query', async () => {
    const user = userEvent.setup();
    go('/compiler');
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /clear editor/i }));
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem('ssc.draft') ?? '""')).toBe(''));
    await user.click(screen.getByRole('button', { name: /reset to default/i }));
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem('ssc.draft') ?? '""')).toContain('FROM students'));
  });
});

describe('history page', () => {
  it('lists stored entries and clears them only after confirmation', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem('ssc.history', JSON.stringify([{ id: '1', sql: 'SELECT name FROM students;', status: 'success', errorCount: 0, optimizationCount: 0, createdAt: new Date().toISOString() }]));
    go('/history');
    render(<App />);
    expect(await screen.findByText(/SELECT name FROM students;/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /clear history/i }));
    const dialog = await screen.findByRole('alertdialog').catch(() => screen.findByRole('dialog'));
    expect(window.localStorage.getItem('ssc.history')).not.toBeNull();
    await user.click(within(dialog).getByRole('button', { name: /clear history/i }));
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem('ssc.history') ?? '[]')).toEqual([]));
  });
});

describe('learning quiz', () => {
  it('shows the correct answer and explanation immediately after a selection', async () => {
    const user = userEvent.setup();
    go('/learn');
    render(<App />);
    const group = (await screen.findAllByRole('radiogroup', { name: /answer options/i }))[0];
    await user.click(within(group).getAllByRole('radio')[0]);
    expect(await screen.findByText(/correct|not quite|incorrect|right answer/i)).toBeInTheDocument();
  });
});
