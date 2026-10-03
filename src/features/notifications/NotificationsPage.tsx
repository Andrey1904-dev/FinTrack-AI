import { BellOff, CheckCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { EmptyState, PageHeader, Panel, Skeleton, Stat } from '@/components/ui/misc';
import { codeFor } from '@/features/layout/nav';
import { cn } from '@/lib/utils';
import { useNotifications } from './useNotifications';

export default function NotificationsPage() {
  const { items, unread, loading, markRead } = useNotifications();
  const read = items.length - unread;

  return (
    <div className="animate-fadein">
      <PageHeader
        title="Уведомления"
        code={codeFor('/notifications')}
        subtitle="Платежи, напоминания по авто и цели — без лишнего шума"
        actions={
          unread > 0 ? (
            <Button variant="outline" onClick={() => markRead.mutate(items.filter(i => !i.read))}>
              <CheckCheck size={16} /> Отметить прочитанными
            </Button>
          ) : undefined
        }
      />

      {!loading && items.length > 0 && (
        <div className="mb-4 grid grid-cols-3 gap-3">
          <Stat label="Непрочитано" value={unread} tone={unread ? 'warn' : undefined} sub={unread ? 'требует внимания' : 'всё прочитано'} />
          <Stat label="Прочитано" value={read} tone="good" sub="за всё время" />
          <Stat label="Всего" value={items.length} sub="сигналов" />
        </div>
      )}

      <Panel flat className="overflow-hidden p-0">
        {loading ? (
          <div className="space-y-3 p-4">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : items.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<BellOff size={18} />}
              title="Всё спокойно"
              text="Срочных платежей и напоминаний нет. Когда что-то появится, вы увидите это здесь."
            />
          </div>
        ) : (
          <ul>
            {items.map(n => (
              <li key={n.key} className={cn('flex items-start gap-3 border-b border-line/70 px-4 py-3 last:border-b-0', n.read && 'opacity-55')}>
                <span className="mt-0.5 w-6 shrink-0 text-center text-[15px]" aria-hidden>
                  {n.icon}
                </span>
                <Link
                  to={n.link}
                  className="min-w-0 flex-1 py-1 focus-visible:outline-none"
                  onClick={() => !n.read && markRead.mutate([n])}
                >
                  <p className="text-[13px] font-medium leading-snug text-txt">
                    {n.title}
                    {!n.read && <span className="ml-2 inline-block h-1.5 w-1.5 rounded-full bg-amber align-middle" aria-label="не прочитано" />}
                  </p>
                  {n.body && <p className="mt-0.5 text-[11.5px] leading-relaxed text-dim">{n.body}</p>}
                </Link>
                {!n.read && (
                  <button
                    type="button"
                    onClick={() => markRead.mutate([n])}
                    className="silk-b -mr-1 flex min-h-[44px] shrink-0 items-center px-2 text-amber transition-colors hover:text-amber-lt"
                  >
                    Прочитано
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
