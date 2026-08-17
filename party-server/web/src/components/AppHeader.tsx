import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Download } from 'lucide-react';
import { GetAppDialog } from '@/components/GetAppDialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import logo from '@/assets/logo.png';

const links = [
  { to: '/', label: 'Home', end: true },
  { to: '/search', label: 'Search', end: false },
  { to: '/join', label: 'Join', end: false },
];

export const AppHeader = () => {
  const [appOpen, setAppOpen] = useState(false);
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch('/health')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { version?: string } | null) => {
        const next = data?.version?.trim();
        if (!cancelled && next) setVersion(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:gap-6">
          <NavLink to="/" className="flex shrink-0 items-center gap-2">
            <img src={logo} alt="Flick" className="h-8 w-auto" />
            {version ? (
              <span className="text-xs text-muted-foreground">v{version}</span>
            ) : null}
          </NavLink>
          <nav className="flex min-w-0 items-center gap-1">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  cn(
                    'rounded-md px-3 py-1.5 text-sm font-semibold',
                    isActive
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
          <Button
            size="sm"
            className="ml-auto shrink-0"
            onClick={() => setAppOpen(true)}
          >
            <Download className="size-3.5" />
            <span className="hidden sm:inline">Get the app</span>
            <span className="sm:hidden">App</span>
          </Button>
        </div>
      </header>
      <GetAppDialog open={appOpen} onClose={() => setAppOpen(false)} />
    </>
  );
};
