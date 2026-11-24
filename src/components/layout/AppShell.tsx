import * as React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { BookOpen, GraduationCap, History, Info, LayoutDashboard, Menu, Moon, PanelLeftClose, PanelLeftOpen, Settings, Sparkles, Sun, TerminalSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Tip } from '@/components/ui/tooltip';
import { useApp } from '@/hooks/useApp';
import { readJson, writeJson } from '@/services/storage';
import { Logo } from './Logo';

export const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/compiler', label: 'SQL Compiler', icon: TerminalSquare },
  { to: '/history', label: 'Query History', icon: History },
  { to: '/examples', label: 'SQL Examples', icon: BookOpen },
  { to: '/learn', label: 'Learn Compiler Design', icon: GraduationCap },
  { to: '/ai', label: 'AI Studio', icon: Sparkles },
  { to: '/about', label: 'Project Information', icon: Info },
  { to: '/settings', label: 'Settings', icon: Settings },
] as const;

function NavItems({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5 p-2">
      {NAV.map(({ to, label, icon: Icon, ...rest }) => {
        const link = (
          <NavLink
            key={to}
            to={to}
            end={'end' in rest ? rest.end : false}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'group flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                collapsed && 'justify-center px-0',
                isActive && 'bg-muted text-foreground shadow-[inset_2px_0_0_0_hsl(var(--cyan))]',
              )
            }
            aria-label={collapsed ? label : undefined}
          >
            <Icon className="size-[18px] shrink-0" />
            {!collapsed && <span className="truncate">{label}</span>}
          </NavLink>
        );
        return collapsed ? <Tip key={to} label={label} side="right">{link}</Tip> : link;
      })}
    </nav>
  );
}

export function ThemeToggle() {
  const { settings, updateSettings } = useApp();
  const dark = settings.theme === 'dark';
  return (
    <Tip label={dark ? 'Switch to light theme' : 'Switch to dark theme'}>
      <Button variant="ghost" size="icon" onClick={() => updateSettings({ theme: dark ? 'light' : 'dark' })} aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}>
        {dark ? <Sun /> : <Moon />}
      </Button>
    </Tip>
  );
}

export function AppShell() {
  const [collapsed, setCollapsed] = React.useState<boolean>(() => readJson('ssc.sidebar', false));
  const [drawer, setDrawer] = React.useState(false);
  const loc = useLocation();
  const current = NAV.find((n) => (n.to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(n.to)));

  React.useEffect(() => { writeJson('ssc.sidebar', collapsed); }, [collapsed]);
  React.useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);
  React.useEffect(() => { document.title = `${current?.label ?? 'Not found'} · Smart SQL Query Compiler`; }, [current]);

  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[80] focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground">
        Skip to content
      </a>

      <aside className={cn('fixed inset-y-0 left-0 z-40 hidden flex-col border-r bg-panel transition-[width] duration-200 md:flex', collapsed ? 'w-16' : 'w-60')}>
        <div className={cn('flex h-14 items-center border-b px-4', collapsed && 'justify-center px-0')}>
          <Logo collapsed={collapsed} />
        </div>
        <div className="flex-1 overflow-y-auto scroll-thin">
          <NavItems collapsed={collapsed} />
        </div>
        <div className={cn('flex border-t p-2', collapsed ? 'justify-center' : 'justify-end')}>
          <Tip label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} side="right">
            <Button variant="ghost" size="icon" onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!collapsed}>
              {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            </Button>
          </Tip>
        </div>
      </aside>

      <Dialog open={drawer} onOpenChange={setDrawer}>
        <DialogContent side="left" className="gap-0">
          <DialogTitle className="sr-only">Navigation</DialogTitle>
          <DialogDescription className="sr-only">Main navigation menu</DialogDescription>
          <div className="flex h-14 items-center border-b px-4"><Logo /></div>
          <NavItems collapsed={false} onNavigate={() => setDrawer(false)} />
        </DialogContent>
      </Dialog>

      <div className={cn('transition-[padding] duration-200', collapsed ? 'md:pl-16' : 'md:pl-60')}>
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur md:px-6">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setDrawer(true)} aria-label="Open navigation menu">
            <Menu />
          </Button>
          <div className="md:hidden"><Logo collapsed /></div>
          <h1 className="min-w-0 truncate text-sm font-semibold md:text-base">{current?.label ?? 'Page not found'}</h1>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-[1600px] p-3 sm:p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
