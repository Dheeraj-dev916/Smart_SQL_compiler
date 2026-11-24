import * as React from 'react';
import { BrowserRouter, Route, Routes, Link } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ToastProvider } from '@/components/ui/toast';
import { AppProvider } from '@/hooks/useApp';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/button';
import Dashboard from '@/pages/Dashboard';
import CompilerPage from '@/pages/CompilerPage';
import HistoryPage from '@/pages/HistoryPage';
import ExamplesPage from '@/pages/ExamplesPage';
import LearnPage from '@/pages/LearnPage';
import AboutPage from '@/pages/AboutPage';
import SettingsPage from '@/pages/SettingsPage';
import AiStudioPage from '@/ai/AiStudioPage';

function NotFound() {
  return (
    <div className="flex flex-col items-center gap-3 py-24 text-center">
      <p className="font-mono text-5xl font-semibold text-muted-foreground">404</p>
      <p className="text-sm text-muted-foreground">That page does not exist.</p>
      <Button asChild><Link to="/">Back to the dashboard</Link></Button>
    </div>
  );
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-lg font-semibold">Something went wrong</p>
          <p className="max-w-md text-sm text-muted-foreground">{this.state.error.message}</p>
          <Button type="button" onClick={() => this.setState({ error: null })}>Try again</Button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <TooltipProvider>
          <AppProvider>
            <BrowserRouter>
              <Routes>
                <Route element={<AppShell />}>
                  <Route index element={<Dashboard />} />
                  <Route path="compiler" element={<CompilerPage />} />
                  <Route path="history" element={<HistoryPage />} />
                  <Route path="examples" element={<ExamplesPage />} />
                  <Route path="learn" element={<LearnPage />} />
                  <Route path="ai" element={<AiStudioPage />} />
                  <Route path="about" element={<AboutPage />} />
                  <Route path="settings" element={<SettingsPage />} />
                  <Route path="*" element={<NotFound />} />
                </Route>
              </Routes>
            </BrowserRouter>
          </AppProvider>
        </TooltipProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
