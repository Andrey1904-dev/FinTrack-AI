import { Bell, MoreHorizontal, Plus, Search, WifiOff } from 'lucide-react';
import { Suspense, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/dialog';
import { PageSkeleton } from '@/components/ui/misc';
import { useRealtimeSync } from '@/data/hooks';
import { QUICK_ACTIONS, useQuick } from '@/features/forms/QuickProvider';
import { useNotifications } from '@/features/notifications/useNotifications';
import { SearchDialog } from '@/features/search/SearchDialog';
import { cn } from '@/lib/utils';
import { NAV, titleFor } from './nav';

function useOnline() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

function Logo() {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <div className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-sm font-bold text-[hsl(225_30%_8%)]">OS</div>
      <span className="text-[15px] font-semibold tracking-tight">Personal OS</span>
    </div>
  );
}

export function AppShell() {
  const online = useOnline();
  const location = useLocation();
  const navigate = useNavigate();
  const quick = useQuick();
  const { unread } = useNotifications();
  const [more, setMore] = useState(false);
  const [add, setAdd] = useState(false);
  const [search, setSearch] = useState(false);
  useRealtimeSync();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearch(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => { window.scrollTo(0, 0); }, [location.pathname]);

  const primary = NAV.filter(n => n.primary);
  const secondary = NAV.filter(n => !n.primary);
  const groups: Array<[string, typeof NAV]> = [
    ['', NAV.filter(n => n.group === 'main')],
    ['Планирование', NAV.filter(n => n.group === 'plan')],
    ['Жизнь', NAV.filter(n => n.group === 'life')],
  ];

  return (
    <div className="min-h-full lg:grid lg:grid-cols-[232px_1fr]">
      {/* desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col gap-1 border-r border-line bg-surface/60 px-3 py-4 lg:flex">
        <Logo />
        <nav className="mt-5 flex-1 space-y-4 overflow-y-auto" aria-label="Основная навигация">
          {groups.map(([name, items]) => (
            <div key={name || 'main'} className="space-y-0.5">
              {name && <p className="px-3 pb-1 pt-1 text-[11px] font-medium uppercase tracking-wider text-muted/70">{name}</p>}
              {items.map(n => (
                <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) =>
                  cn('flex h-9 items-center gap-3 rounded-lg px-3 text-sm transition-colors', isActive ? 'bg-raised font-medium text-fg' : 'text-muted hover:bg-raised/60 hover:text-fg')}>
                  <n.icon size={17} /> {n.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <NavLink to="/settings" className={({ isActive }) => cn('flex h-9 items-center gap-3 rounded-lg px-3 text-sm transition-colors', isActive ? 'bg-raised font-medium text-fg' : 'text-muted hover:bg-raised/60 hover:text-fg')}>
          {(() => { const S = NAV.find(n => n.to === '/settings')!.icon; return <S size={17} />; })()} Настройки
        </NavLink>
      </aside>

      <div className="flex min-h-dvh min-w-0 flex-col">
        {!online && (
          <div role="status" className="flex items-center justify-center gap-2 bg-warn/15 px-4 py-2 text-center text-sm text-warn">
            <WifiOff size={15} /> Нет подключения к интернету. Данные в открытых формах не потеряются — сохраните, когда сеть вернётся.
          </div>
        )}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-bg/85 px-4 backdrop-blur lg:px-8" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <h2 className="text-base font-semibold lg:hidden">{titleFor(location.pathname)}</h2>
          <button type="button" onClick={() => setSearch(true)}
            className="ml-auto hidden h-9 w-full max-w-sm items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm text-muted transition-colors hover:border-muted/40 lg:ml-0 lg:flex">
            <Search size={15} /> <span>Поиск по всему приложению</span>
            <kbd className="ml-auto rounded border border-line px-1.5 text-[11px]">⌘K</kbd>
          </button>
          <div className="ml-auto flex items-center gap-1.5">
            <Button variant="ghost" size="icon" aria-label="Поиск" className="lg:hidden" onClick={() => setSearch(true)}><Search size={18} /></Button>
            <Button variant="ghost" size="icon" aria-label={`Уведомления${unread ? `: ${unread}` : ''}`} className="relative" onClick={() => navigate('/notifications')}>
              <Bell size={18} />
              {unread > 0 && <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-bad px-1 text-[10px] font-semibold text-white">{unread > 9 ? '9+' : unread}</span>}
            </Button>
            <Button variant="primary" className="hidden lg:inline-flex" onClick={() => setAdd(true)}><Plus size={16} /> Добавить</Button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1180px] flex-1 px-4 pb-28 pt-5 lg:px-8 lg:pb-12 lg:pt-7">
          <Suspense fallback={<PageSkeleton />}><Outlet /></Suspense>
        </main>
      </div>

      {/* mobile: add button + bottom navigation */}
      <button type="button" aria-label="Быстро добавить" onClick={() => setAdd(true)}
        className="fixed bottom-[76px] right-4 z-40 grid h-12 w-12 place-items-center rounded-full bg-accent text-[hsl(225_30%_8%)] shadow-lg shadow-black/40 transition-transform active:scale-95 lg:hidden"
        style={{ marginBottom: 'env(safe-area-inset-bottom)' }}>
        <Plus size={24} />
      </button>
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-surface/95 backdrop-blur lg:hidden" aria-label="Нижняя навигация">
        {primary.map(n => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => cn('flex h-16 flex-col items-center justify-center gap-1 text-[11px]', isActive ? 'text-accent' : 'text-muted')}>
            <n.icon size={21} /> {n.label}
          </NavLink>
        ))}
        <button type="button" onClick={() => setMore(true)} className={cn('flex h-16 flex-col items-center justify-center gap-1 text-[11px]', more ? 'text-accent' : 'text-muted')}>
          <MoreHorizontal size={21} /> Ещё
        </button>
      </nav>

      <Modal open={more} onOpenChange={setMore} title="Разделы">
        <div className="grid grid-cols-3 gap-2">
          {secondary.map(n => (
            <button key={n.to} type="button" onClick={() => { setMore(false); navigate(n.to); }}
              className="flex flex-col items-center gap-2 rounded-xl border border-line bg-bg px-2 py-4 text-xs text-muted transition-colors hover:text-fg">
              <n.icon size={22} /> {n.label}
            </button>
          ))}
        </div>
      </Modal>

      <Modal open={add} onOpenChange={setAdd} title="Что добавить?">
        <div className="grid gap-2 sm:grid-cols-2">
          {QUICK_ACTIONS.map(a => (
            <Button key={a.kind} className="h-12 justify-start" onClick={() => { setAdd(false); quick.open(a.kind); }}><Plus size={16} /> {a.label}</Button>
          ))}
        </div>
      </Modal>
      <SearchDialog open={search} onOpenChange={setSearch} />
    </div>
  );
}
