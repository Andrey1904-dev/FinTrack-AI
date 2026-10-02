import { BellOff, CheckCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, EmptyState, PageHeader, Skeleton } from '@/components/ui/misc';
import { cn } from '@/lib/utils';
import { useNotifications } from './useNotifications';

export default function NotificationsPage() {
  const { items, unread, loading, markRead } = useNotifications();
  return (
    <div className="animate-fade-in">
      <PageHeader title="Уведомления" subtitle="Платежи, напоминания по авто и цели — без лишнего шума"
        actions={unread > 0 ? <Button onClick={() => markRead.mutate(items.filter(i => !i.read))}><CheckCheck size={16} /> Отметить всё прочитанным</Button> : undefined} />
      <Card>
        {loading ? <div className="space-y-3 p-4"><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
          : items.length === 0 ? <EmptyState icon={<BellOff size={20} />} title="Всё спокойно" text="Срочных платежей и напоминаний нет. Когда что-то появится, вы увидите это здесь." />
          : <ul className="divide-y divide-line">
              {items.map(n => (
                <li key={n.key} className={cn('flex items-start gap-3 px-4 py-3', n.read && 'opacity-55')}>
                  <span className="mt-0.5 text-lg" aria-hidden>{n.icon}</span>
                  <Link to={n.link} className="min-w-0 flex-1" onClick={() => !n.read && markRead.mutate([n])}>
                    <p className="text-sm font-medium">{n.title}</p>
                    {n.body && <p className="mt-0.5 text-xs text-muted">{n.body}</p>}
                  </Link>
                  {!n.read && <button type="button" onClick={() => markRead.mutate([n])} className="shrink-0 text-xs text-muted hover:text-fg">Прочитано</button>}
                </li>
              ))}
            </ul>}
      </Card>
    </div>
  );
}
