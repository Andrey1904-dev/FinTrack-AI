import { Copy, ExternalLink, Send, Unlink } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/dialog';
import { Badge, Card, CardHeader, Skeleton } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/data/auth';
import { friendlyError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const makeCode = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), b => ALPHABET[b % ALPHABET.length]).join('');

interface Prefs { notifications_enabled: boolean; credit_reminders: boolean; recurring_reminders: boolean; budget_alerts: boolean; weekly_digest: boolean; timezone: string }
const PREF_LABELS: Array<[keyof Omit<Prefs, 'timezone'>, string]> = [
  ['notifications_enabled', 'Присылать уведомления'], ['credit_reminders', 'Напоминания о кредитах'], ['recurring_reminders', 'Повторяющиеся платежи'],
  ['budget_alerts', 'Предупреждения о лимитах'], ['weekly_digest', 'Недельная сводка'],
];

export function TelegramCard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [code, setCode] = useState<{ value: string; until: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);

  const account = useQuery({
    queryKey: ['tg-account', user?.id], enabled: !!user, refetchInterval: code ? 4000 : false,
    queryFn: async () => {
      const { data, error } = await supabase.from('telegram_accounts').select('username,first_name,created_at').maybeSingle();
      if (error) throw error;
      return data as { username: string | null; first_name: string | null; created_at: string } | null;
    },
  });
  const prefs = useQuery({
    queryKey: ['tg-prefs', user?.id], enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('telegram_preferences').select('*').maybeSingle();
      if (error) throw error;
      return data as Prefs | null;
    },
  });
  const bot = useQuery({
    queryKey: ['tg-bot'], staleTime: 5 * 60_000, retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('telegram-info');
      if (error) throw error;
      return (data as { username?: string }).username ?? null;
    },
  });

  useEffect(() => {
    if (!code) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [code]);

  const generate = async () => {
    if (!user) return;
    setBusy(true);
    try {
      const value = makeCode();
      const until = Date.now() + 15 * 60_000;
      await supabase.from('telegram_link_codes').delete().eq('user_id', user.id);
      const { error } = await supabase.from('telegram_link_codes').insert({ user_id: user.id, code: value, expires_at: new Date(until).toISOString() });
      if (error) throw error;
      setCode({ value, until });
      setNow(Date.now());
    } catch (e) { toast.error(friendlyError(e, 'Не удалось создать код')); } finally { setBusy(false); }
  };
  const unlink = async () => {
    if (!(await confirm({ title: 'Отвязать Telegram?', text: 'Бот перестанет присылать уведомления и принимать записи. Данные в приложении останутся.', confirmText: 'Отвязать', danger: true }))) return;
    try {
      const { error } = await supabase.from('telegram_accounts').delete().eq('user_id', user?.id ?? '');
      if (error) throw error;
      setCode(null);
      await qc.invalidateQueries({ queryKey: ['tg-account'] });
      toast.success('Telegram отвязан');
    } catch (e) { toast.error(friendlyError(e, 'Не удалось отвязать Telegram')); }
  };
  const setPref = async (key: keyof Omit<Prefs, 'timezone'>, v: boolean) => {
    if (!user) return;
    try {
      const timezone = prefs.data?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
      const { error } = await supabase.from('telegram_preferences').upsert({ user_id: user.id, timezone, [key]: v }, { onConflict: 'user_id' });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ['tg-prefs'] });
    } catch (e) { toast.error(friendlyError(e, 'Не удалось сохранить настройку')); }
  };

  const left = code && !account.data ? Math.max(0, Math.round((code.until - now) / 1000)) : 0;
  const botName = bot.data;
  const linked = !!account.data;

  return (
    <Card>
      <CardHeader title="Telegram-бот" action={account.isLoading ? undefined : <Badge tone={linked ? 'good' : 'neutral'}>{linked ? 'подключён' : 'не подключён'}</Badge>} />
      <div className="space-y-4 p-4">
        {account.isLoading ? <Skeleton className="h-16" /> : linked ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm">Аккаунт: <span className="font-medium">{account.data?.username ? `@${account.data.username}` : account.data?.first_name || 'Telegram'}</span></p>
              <Button size="sm" variant="danger" onClick={() => void unlink()}><Unlink size={14} /> Отвязать</Button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {PREF_LABELS.map(([k, label]) => (
                <label key={k} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="h-4 w-4 accent-[hsl(var(--accent))]" checked={prefs.data ? prefs.data[k] : true} onChange={e => void setPref(k, e.target.checked)} /> {label}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted">Пришлите боту «+1200 бензин» — расход появится здесь после подтверждения.</p>
          </>
        ) : (
          <>
            <p className="text-sm text-muted">Бот присылает напоминания о платежах и принимает расходы текстом. Ваши прежние данные и привязки сохраняются.</p>
            {code && left > 0 ? (
              <div className="rounded-lg border border-accent/40 bg-accent/5 p-4">
                <p className="text-xs text-muted">Отправьте боту команду:</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <code className="rounded-md bg-bg px-3 py-1.5 text-base font-semibold tracking-wider">/link {code.value}</code>
                  <Button size="sm" onClick={() => { void navigator.clipboard?.writeText(`/link ${code.value}`).then(() => toast.success('Скопировано')); }}><Copy size={14} /> Копировать</Button>
                  {botName && <a href={`https://t.me/${botName}`} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1 rounded-lg border border-line px-3 text-sm hover:bg-raised"><ExternalLink size={14} /> @{botName}</a>}
                </div>
                <p className="mt-2 text-xs text-muted">Код действует {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}. Страница обновится сама после привязки.</p>
              </div>
            ) : (
              <Button variant="primary" onClick={() => void generate()} disabled={busy}><Send size={16} /> {code ? 'Код истёк — создать новый' : 'Получить код привязки'}</Button>
            )}
          </>
        )}
        {(account.error || prefs.error) && <p className="text-xs text-bad">Не удалось загрузить статус Telegram. Проверьте соединение.</p>}
      </div>
    </Card>
  );
}
