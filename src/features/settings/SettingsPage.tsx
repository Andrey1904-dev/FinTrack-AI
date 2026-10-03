import { Bell, Bot, LogOut, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input, Switch } from '@/components/ui/form';
import { PageHeader, Panel } from '@/components/ui/misc';
import { codeFor } from '@/features/layout/nav';
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
    try {
      await save.mutateAsync({ display_name: name.trim() });
      toast.success('Имя сохранено');
    } catch (e) {
      toast.error(friendlyError(e, 'Не удалось сохранить имя'));
    }
  };
  const changePassword = async () => {
    if (password.length < 6) return toast.error('Пароль — минимум 6 символов');
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) toast.error(friendlyError(error, 'Не удалось сменить пароль'));
    else {
      setPassword('');
      toast.success('Пароль изменён');
    }
  };

  return (
    <Panel label="Профиль">
      <p className="text-[12.5px] text-dim">
        Вы вошли как <span className="text-txt">{user?.email}</span>
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
        <Field label="Как к вам обращаться" className="flex-1">
          {id => <Input id={id} value={name} onChange={e => setName(e.target.value)} placeholder="Имя" maxLength={60} />}
        </Field>
        <Button variant="outline" className="shrink-0" onClick={() => void saveName()} disabled={save.isPending}>
          Сохранить
        </Button>
      </div>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
        <Field label="Новый пароль" className="flex-1">
          {id => (
            <Input id={id} type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} />
          )}
        </Field>
        <Button variant="outline" className="shrink-0" onClick={() => void changePassword()} disabled={busy || !password}>
          Сменить
        </Button>
      </div>
      <div className="mt-4 border-t border-line pt-4">
        <Button variant="ghost" onClick={() => void signOut()}>
          <LogOut size={16} /> Выйти из аккаунта
        </Button>
      </div>
    </Panel>
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
    try {
      localStorage.setItem(BROWSER_NOTIFY_KEY, v ? '1' : '0');
    } catch {
      /* ignore */
    }
    setOn(v);
    toast.success(v ? 'Уведомления браузера включены' : 'Уведомления браузера выключены');
  };

  return (
    <Panel label="Уведомления">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[13px] font-medium text-txt">
            <Bell size={14} className="text-mute" /> Уведомления браузера
          </p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-mute">
            {supported
              ? 'Платежи, напоминания по авто и задачи на сегодня. Работает, пока приложение открыто.'
              : 'Ваш браузер не поддерживает уведомления.'}
          </p>
        </div>
        <Switch checked={on} onChange={v => void toggle(v)} label="Показывать уведомления браузера" disabled={!supported} />
      </div>
    </Panel>
  );
}

function AiCard() {
  return (
    <Panel label="AI-помощник" right={<span className="silk-b text-mute">скоро</span>}>
      <div className="flex gap-3">
        <Bot size={18} className="mt-0.5 shrink-0 text-mute" />
        <p className="text-[12px] leading-relaxed text-dim">
          Здесь появится помощник, который объяснит траты, предложит план погашения и ответит на вопросы по вашим данным. Он ничего не изменит
          без вашего подтверждения. Уже сейчас работает умный ввод: напишите «+1200 бензин» в окне добавления расхода.
        </p>
      </div>
    </Panel>
  );
}

function DangerZone() {
  const toast = useToast();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const wipe = async () => {
    setBusy(true);
    try {
      await wipeAllData();
      await qc.invalidateQueries();
      setText('');
      toast.success('Все данные удалены');
    } catch (e) {
      toast.error(friendlyError(e, 'Не удалось удалить данные'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel label={<span className="flex items-center gap-2 text-red"><ShieldAlert size={14} /> Опасная зона</span>} className="border-red/30">
      <p className="text-[12px] leading-relaxed text-dim">
        Удалит все доходы, расходы, долги, автомобили, задачи, заметки и остальные данные приложения без возможности восстановления. Сначала
        скачайте копию в разделе «Экспорт». Учётная запись и привязка Telegram останутся.
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
        <Field label="Для подтверждения введите УДАЛИТЬ" className="flex-1">
          {id => <Input id={id} value={text} onChange={e => setText(e.target.value)} autoComplete="off" />}
        </Field>
        <Button variant="danger" className="shrink-0" disabled={text.trim().toUpperCase() !== 'УДАЛИТЬ' || busy} onClick={() => void wipe()}>
          {busy ? 'Удаляем…' : 'Удалить всё'}
        </Button>
      </div>
    </Panel>
  );
}

export default function SettingsPage() {
  return (
    <div className="animate-fade-in">
      <PageHeader title="Настройки" code={codeFor('/settings')} subtitle="Профиль, уведомления, Telegram, экспорт данных и опасная зона" />
      <div className="grid items-start gap-4 xl:grid-cols-2">
        <div className="space-y-4">
          <ProfileCard />
          <BrowserNotifyCard />
          <AiCard />
          <DangerZone />
        </div>
        <div className="space-y-4">
          <TelegramCard />
          <ExportCard />
        </div>
      </div>
    </div>
  );
}
