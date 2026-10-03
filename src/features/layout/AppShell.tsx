import { Bell, Layers, MoreHorizontal, Plus, Search, WifiOff } from 'lucide-react';
import { Suspense, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Button, IconButton } from '@/components/ui/button';
import { Dropdown, Tooltip } from '@/components/ui/menu';
import { Modal, Sheet } from '@/components/ui/dialog';
import { PageSkeleton } from '@/components/ui/misc';
import { useAuth } from '@/data/auth';
import { useProfile, useRealtimeSync } from '@/data/hooks';
import { QUICK_ACTIONS, useQuick } from '@/features/forms/QuickProvider';
import { useNotifications } from '@/features/notifications/useNotifications';
import { SearchDialog } from '@/features/search/SearchDialog';
import { cn } from '@/lib/utils';
import { NAV, NAV_GROUPS, navItemFor, titleFor } from './nav';

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

function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <div
      className="grid shrink-0 place-items-center rounded-[2px] border border-amber/50 bg-amber/10 text-amber"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <Layers size={Math.round(size * 0.55)} />
    </div>
  );
}

function navLinkClass(active: boolean, extra?: string) {
  return cn(
    'group relative flex min-h-[48px] w-full items-center gap-3 px-3 text-left transition-colors lg:min-h-[46px]',
    active ? 'bg-amber/[0.08]' : 'hover:bg-white/[0.03]',
    extra,
  );
}

/* ============================== SHELL ============================== */

export function AppShell() {
  const online = useOnline();
  const location = useLocation();
  const navigate = useNavigate();
  const quick = useQuick();
  const { user } = useAuth();
  const { profile } = useProfile();
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

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  const primary = NAV.filter(n => n.primary);
  const title = titleFor(location.pathname);
  const current = navItemFor(location.pathname);
  const initials = (profile?.display_name?.trim() || user?.email || 'OS').slice(0, 1).toUpperCase();

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[236px_minmax(0,1fr)] xl:grid-cols-[252px_minmax(0,1fr)]">
      {/* ------------------------- desktop rail ------------------------- */}
      <aside
        className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-ink/80 backdrop-blur-md lg:flex"
        aria-label="Боковая навигация"
      >
        <div className="flex items-center gap-2.5 border-b border-line px-4 py-5">
          <BrandMark />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold tracking-[0.02em] text-txt">PERSONAL OS</p>
            <p className="silk mt-1 truncate">личная панель</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-3">
          {NAV_GROUPS.map(group => {
            const items = NAV.filter(n => n.group === group.id);
            if (!items.length) return null;
            return (
              <div key={group.id} className="mb-1.5">
                <p className="silk px-4 py-2 text-mute/70">{group.label}</p>
                {items.map(item => (
                  <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => navLinkClass(isActive)}>
                    {({ isActive }) => (
                      <>
                        <span className={cn('absolute inset-y-0 left-0 w-[2px] transition-colors', isActive ? 'bg-amber' : 'bg-transparent')} />
                        <span className={cn('tnum w-5 shrink-0 text-[9.5px]', isActive ? 'text-amber' : 'text-engrave')}>{item.code}</span>
                        <item.icon size={16} className={cn('shrink-0', isActive ? 'text-amber' : 'text-mute group-hover:text-dim')} />
                        <span className="min-w-0 flex-1">
                          <span className={cn('block truncate text-[12.5px]', isActive ? 'text-amber' : 'text-dim group-hover:text-txt')}>
                            {item.label}
                          </span>
                          <span className="silk mt-0.5 block truncate">{item.hint}</span>
                        </span>
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>

        <div className="border-t border-line p-3">
          <button
            type="button"
            onClick={() => setSearch(true)}
            className="flex min-h-[40px] w-full items-center gap-2.5 rounded-[2px] border border-line px-3 text-left text-[12px] text-mute transition-colors hover:border-engrave hover:text-txt"
          >
            <Search size={14} /> <span className="flex-1 truncate">Поиск по приложению</span>
            <kbd className="tnum rounded-[2px] border border-line px-1 text-[9px] text-mute">⌘K</kbd>
          </button>
          <button
            type="button"
            onClick={() => navigate('/settings')}
            className="mt-2 flex w-full items-center gap-3 px-1 py-2 text-left transition-colors hover:text-txt"
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[2px] bg-cyan/15 text-[11px] font-semibold text-cyan">{initials}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[11.5px] text-dim">{profile?.display_name?.trim() || user?.email || 'Профиль'}</span>
              <span className="silk mt-0.5 block truncate">настройки и данные</span>
            </span>
          </button>
        </div>
      </aside>

      {/* ---------------------------- content --------------------------- */}
      <div className="flex min-h-dvh min-w-0 flex-col">
        {!online && (
          <div
            role="status"
            className="flex items-center justify-center gap-2 border-b border-warn/30 bg-warn/10 px-4 py-2 text-center text-[11.5px] text-warn"
            style={{ paddingTop: 'calc(env(safe-area-inset-top) + 8px)' }}
          >
            <WifiOff size={14} className="shrink-0" />
            <span>Нет подключения. Данные в открытых формах не потеряются — сохраните, когда сеть вернётся.</span>
          </div>
        )}

        {/* desktop header */}
        <header
          className="sticky top-0 z-30 hidden h-14 items-center gap-4 border-b border-line bg-ink/85 px-6 backdrop-blur-md lg:flex xl:px-8"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
        >
          <div className="min-w-0">
            <p className="silk truncate">
              Personal OS <span className="mx-1 text-engrave">/</span> {current?.code ?? '01'}
            </p>
            <p className="truncate text-[12.5px] font-medium text-txt">{title}</p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSearch(true)}
              className="flex h-9 w-full max-w-[300px] items-center gap-2 rounded-[2px] border border-line bg-panel/60 px-3 text-[12px] text-mute transition-colors hover:border-engrave hover:text-txt"
            >
              <Search size={14} /> <span className="truncate">Поиск по всему приложению</span>
              <kbd className="tnum ml-auto rounded-[2px] border border-line px-1 text-[9px]">⌘K</kbd>
            </button>
            <Tooltip label={unread ? `Уведомления — ${unread} непрочитанных` : 'Уведомления'}>
              <IconButton
                label={unread ? `Уведомления: ${unread} непрочитанных` : 'Уведомления'}
                className="relative"
                onClick={() => navigate('/notifications')}
              >
                <Bell size={17} />
                {unread > 0 && (
                  <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-red px-1 text-[9px] font-semibold text-ink">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </IconButton>
            </Tooltip>
            <Dropdown
              label="Что добавить"
              trigger={
                <Button variant="primary">
                  <Plus size={15} /> Добавить
                </Button>
              }
              items={QUICK_ACTIONS.map(a => ({ key: a.kind, label: a.label, icon: <Plus size={14} />, onSelect: () => quick.open(a.kind) }))}
            />
          </div>
        </header>

        {/* mobile header */}
        <header
          className="sticky top-0 z-30 border-b border-line bg-ink/90 backdrop-blur-md lg:hidden"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
        >
          <div className="flex h-14 items-center gap-3 px-4">
            <BrandMark size={26} />
            <div className="min-w-0 flex-1">
              <p className="silk">{current?.code ?? '01'}</p>
              <h2 className="truncate text-[13px] font-semibold text-txt">{title}</h2>
            </div>
            <IconButton label="Поиск" onClick={() => setSearch(true)}>
              <Search size={18} />
            </IconButton>
            <IconButton label={unread ? `Уведомления: ${unread}` : 'Уведомления'} className="relative" onClick={() => navigate('/notifications')}>
              <Bell size={18} />
              {unread > 0 && (
                <span className="absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-red px-1 text-[9px] font-semibold text-ink">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </IconButton>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1180px] flex-1 px-4 pb-32 pt-5 sm:px-6 lg:px-8 lg:pb-14 lg:pt-8 xl:max-w-[1360px]">
          <Suspense fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>

          <footer className="mt-12 border-t border-line pt-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="silk-b text-dim">PERSONAL OS</p>
                <p className="mt-2 max-w-[64ch] text-[11px] leading-relaxed text-mute">
                  React · TypeScript · Vite · Tailwind CSS · Supabase (PostgreSQL, Auth, RLS) · Telegram-бот.
                  Данные хранятся в Supabase, доступ — только по политикам Row Level Security.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSearch(true)}
                  className="silk-b flex min-h-[36px] items-center gap-2 border border-line px-3 text-mute transition-colors hover:border-amber/50 hover:text-amber"
                >
                  <Search size={13} /> Поиск <span className="tnum ml-1 text-[9px] opacity-70">⌘K</span>
                </button>
                <NavLink
                  to="/settings"
                  className="silk-b flex min-h-[36px] items-center gap-2 border border-line px-3 text-mute transition-colors hover:border-amber/50 hover:text-amber"
                >
                  Экспорт данных
                </NavLink>
              </div>
            </div>
          </footer>
        </main>
      </div>

      {/* --------------------- mobile: FAB + tab bar -------------------- */}
      <button
        type="button"
        aria-label="Быстро добавить запись"
        onClick={() => setAdd(true)}
        className="fixed right-4 z-40 grid h-14 w-14 place-items-center rounded-[3px] border border-amber-lt/60 bg-amber text-ink shadow-dialog transition-transform active:scale-95 lg:hidden"
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 76px)' }}
      >
        <Plus size={24} />
      </button>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-ink/95 backdrop-blur-md lg:hidden"
        aria-label="Основная навигация"
      >
        <div className="grid grid-cols-5" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          {primary.map(n => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) =>
                cn('relative flex min-h-[56px] flex-col items-center justify-center gap-1 py-2 transition-colors', isActive ? 'text-amber' : 'text-mute')
              }
            >
              {({ isActive }) => (
                <>
                  <span className={cn('absolute inset-x-3 top-0 h-[2px] rounded-b-[1px]', isActive ? 'bg-amber' : 'bg-transparent')} />
                  <n.icon size={19} />
                  <span className="silk-b text-[8px]">{n.label}</span>
                </>
              )}
            </NavLink>
          ))}
          <button
            type="button"
            onClick={() => setMore(true)}
            className={cn(
              'relative flex min-h-[56px] flex-col items-center justify-center gap-1 py-2 transition-colors',
              more ? 'text-amber' : 'text-mute',
            )}
          >
            <MoreHorizontal size={19} />
            <span className="silk-b text-[8px]">Ещё</span>
          </button>
        </div>
      </nav>

      {/* --------------------------- dialogs --------------------------- */}
      <Sheet open={more} onOpenChange={setMore} title="Все разделы">
        <div className="grid grid-cols-2 gap-2">
          {NAV.map(item => {
            const active = navItemFor(location.pathname)?.to === item.to;
            return (
              <button
                key={item.to}
                type="button"
                onClick={() => {
                  setMore(false);
                  navigate(item.to);
                }}
                className={cn(
                  'flex min-h-[56px] items-center gap-3 border px-3 py-3 text-left transition-colors',
                  active ? 'border-amber/50 bg-amber/[0.08] text-amber' : 'border-line text-dim hover:border-engrave hover:text-txt',
                )}
              >
                <item.icon size={17} className="shrink-0" />
                <span className="min-w-0">
                  <span className="block truncate text-[12px]">{item.label}</span>
                  <span className="silk mt-1 block truncate">{item.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      </Sheet>

      <Modal open={add} onOpenChange={setAdd} title="Что добавить?" description="Быстрый ввод в 3 поля · до 8 секунд">
        <div className="grid gap-2 sm:grid-cols-2">
          {QUICK_ACTIONS.map(a => (
            <button
              key={a.kind}
              type="button"
              onClick={() => {
                setAdd(false);
                quick.open(a.kind);
              }}
              className="flex min-h-[52px] items-center gap-2.5 border border-line px-3.5 text-left text-[12.5px] text-dim transition-colors hover:border-amber/50 hover:text-amber"
            >
              <Plus size={15} className="shrink-0 text-mute" /> {a.label}
            </button>
          ))}
        </div>
      </Modal>

      <SearchDialog open={search} onOpenChange={setSearch} />
    </div>
  );
}
