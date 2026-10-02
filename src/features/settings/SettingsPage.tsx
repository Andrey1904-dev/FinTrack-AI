import { Bell, Bot, LogOut, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { Card, CardHeader, PageHeader } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/data/auth';
import { useProfile } from '@/data/hooks';
import { BROWSER_NOTIFY_KEY, browserNotificationsEnabled } from '@/features/notifications/useNotifications';
import { friendlyError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { ExportCard } from './ExportCard';
import { wipeAllData } from './exportAll';
import { TelegramCard } from './TelegramCard';

function ProfileCard() {
  const { user, signOut } = useAuth();
  const { profile, save } = useProfile();
  const toast = useToast();
  const [draftName, setName] = useState<string | null>(null);
  const name = draftName ?? profile?.display_name ?? '';
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const saveName = async () => {
    try { await save.mutateAsync({ display_name: name.trim() }); toast.success('Имя сохранено'); } catch (e) { toast.error(friendlyError(e, 'Не удалось сохранить имя')); }
  };
  const changePassword = async () => {
    if (password.length < 6) return toast.error('Пароль — минимум 6 символов');
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) toast.error(friendlyError(error, 'Не удалось сменить пароль'));
    else { setPassword(''); toast.success('Пароль изменён'); }
  };
  return (
    <Card>
      <CardHeader title="Профиль" />
      <div className="space-y-4 p-4">
        <p className="text-sm text-muted">Вы вошли как <span className="text-fg">{user?.email}</span></p>
        <div className="flex items-end gap-2">
          <Field label="Как к вам обращаться" className="flex-1">{id => <Input id={id} value={name} onChange={e => setName(e.target.value)} placeholder="Имя" maxLength={60} />}</Field>
          <Button onClick={() => void saveName()} disabled={save.isPending}>Сохранить</Button>
        </div>
        <div className="flex items-end gap-2">
          <Field label="Новый пароль" className="flex-1">{id => <Input id={id} type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} />}</Field>
          <Button onClick={() => void changePassword()} disabled={busy || !password}>Сменить</Button>
        </div>
        <Button variant="ghost" onClick={() => void signOut()}><LogOut size={16} /> Выйти</Button>
      </div>
    </Card>
  );
}

function BrowserNotifyCard() {
  const toast = useToast();
  const supported = typeof Notification !== 'undefined';
  const [on, setOn] = useState(browserNotificationsEnabled());
  const toggle = async (v: boolean) => {
    if (!supported) return;
    if (v) {
      const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
      if (perm !== 'granted') return toast.error('Разрешите уведомления в настройках браузера');
    }
    try { localStorage.setItem(BROWSER_NOTIFY_KEY, v ? '1' : '0'); } catch { /* ignore */ }
    setOn(v);
    toast.success(v ? 'Уведомления браузера включены' : 'Уведомления браузера выключены');
  };
  return (
    <Card>
      <CardHeader title="Уведомления" />
      <div className="p-4">
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[hsl(var(--accent))]" checked={on} disabled={!supported} onChange={e => void toggle(e.target.checked)} />
          <span><span className="flex items-center gap-1.5 font-medium"><Bell size={14} /> Показывать уведомления браузера</span>
            <span className="mt-0.5 block text-xs text-muted">{supported ? 'Платежи, напоминания по авто и задачи на сегодня. Работает, пока приложение открыто.' : 'Ваш браузер не поддерживает уведомления.'}</span></span>
        </label>
      </div>
    </Card>
  );
}

function AiCard() {
  return (
    <Card>
      <CardHeader title="AI-помощник" action={<span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-muted">скоро</span>} />
      <div className="flex gap-3 p-4 text-sm text-muted"><Bot size={18} className="mt-0.5 shrink-0" />
        <p>Здесь появится помощник, который объяснит траты, предложит план погашения и ответит на вопросы по вашим данным. Он ничего не изменит без вашего подтверждения. Уже сейчас работает умный ввод: напишите «+1200 бензин» в окне добавления расхода.</p></div>
    </Card>
  );
}

function DangerZone() {
  const toast = useToast();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const wipe = async () => {
    setBusy(true);
    try { await wipeAllData(); await qc.invalidateQueries(); setText(''); toast.success('Все данные удалены'); } catch (e) { toast.error(friendlyError(e, 'Не удалось удалить данные')); } finally { setBusy(false); }
  };
  return (
    <Card className="border-bad/30">
      <CardHeader title={<span className="flex items-center gap-2 text-bad"><ShieldAlert size={15} /> Опасная зона</span>} />
      <div className="space-y-3 p-4">
        <p className="text-sm text-muted">Удалит все доходы, расходы, долги, автомобили, задачи, заметки и остальные данные приложения без возможности восстановления. Сначала скачайте копию в разделе «Экспорт». Учётная запись и привязка Telegram останутся.</p>
        <div className="flex items-end gap-2">
          <Field label="Для подтверждения введите УДАЛИТЬ" className="flex-1">{id => <Input id={id} value={text} onChange={e => setText(e.target.value)} autoComplete="off" />}</Field>
          <Button variant="danger" disabled={text.trim().toUpperCase() !== 'УДАЛИТЬ' || busy} onClick={() => void wipe()}>{busy ? 'Удаляем…' : 'Удалить всё'}</Button>
        </div>
      </div>
    </Card>
  );
}

export default function SettingsPage() {
  return (
    <div className="animate-fade-in">
      <PageHeader title="Настройки" />
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className="space-y-4"><ProfileCard /><BrowserNotifyCard /><AiCard /></div>
        <div className="space-y-4"><TelegramCard /><ExportCard /><DangerZone /></div>
      </div>
    </div>
  );
}
