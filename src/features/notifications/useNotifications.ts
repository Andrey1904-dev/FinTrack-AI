import { useEffect, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRows } from '@/data/hooks';
import { useAuth } from '@/data/auth';
import { supabase } from '@/lib/supabase';
import { buildCandidates, type Candidate } from '@/lib/calc';
import { useOverview } from '@/features/overview/useOverview';

const NOTIFIED = 'pos.notified';
export const BROWSER_NOTIFY_KEY = 'pos.browserNotifications';

export function browserNotificationsEnabled(): boolean {
  try {
    return localStorage.getItem(BROWSER_NOTIFY_KEY) === '1' && typeof Notification !== 'undefined' && Notification.permission === 'granted';
  } catch {
    return false;
  }
}

export function useNotifications() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const o = useOverview();
  const stored = useRows('notifications');

  const candidates = useMemo<Candidate[]>(
    () => buildCandidates({
      events: o.events,
      reminders: o.reminders,
      cars: o.cars,
      goals: o.goals,
      tasks: o.tasks,
      salaryProfiles: o.salaryProfiles,
      today: o.today,
    }),
    [o.events, o.reminders, o.cars, o.goals, o.tasks, o.salaryProfiles, o.today],
  );
  const readKeys = useMemo(() => new Set(stored.rows.filter(r => r.read).map(r => r.dedupe_key)), [stored.rows]);
  const items = useMemo(() => candidates.map(c => ({ ...c, read: readKeys.has(c.key) })), [candidates, readKeys]);
  const unread = items.filter(i => !i.read).length;

  const markRead = useMutation({
    mutationFn: async (list: Candidate[]) => {
      if (!user || !list.length) return;
      const { error } = await supabase.from('notifications').upsert(
        list.map(c => ({ user_id: user.id, dedupe_key: c.key, kind: c.key.split(':')[0], severity: c.severity, title: c.title, body: c.body, link: c.link, read: true })),
        { onConflict: 'user_id,dedupe_key' },
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rows', 'notifications'] }),
  });

  // Browser notifications: optional, shown once per item, and never required for the app to work.
  useEffect(() => {
    if (o.loading || stored.isLoading || !browserNotificationsEnabled()) return;
    try {
      const seen = new Set<string>(JSON.parse(localStorage.getItem(NOTIFIED) ?? '[]') as string[]);
      const fresh = items.filter(i => !i.read && !seen.has(i.key) && i.severity !== 'info').slice(0, 3);
      for (const n of fresh) {
        new Notification(`${n.icon} Personal OS`, { body: n.title, tag: n.key });
        seen.add(n.key);
      }
      if (fresh.length) localStorage.setItem(NOTIFIED, JSON.stringify([...seen].slice(-200)));
    } catch {
      /* notifications unsupported or blocked: ignore */
    }
  }, [items, o.loading, stored.isLoading]);

  return { items, unread, loading: o.loading || stored.isLoading, markRead, history: stored.rows.filter(r => r.read).slice(0, 15) };
}
