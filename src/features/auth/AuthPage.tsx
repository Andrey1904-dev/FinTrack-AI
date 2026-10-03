import { Layers, LogIn } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input, Segmented } from '@/components/ui/form';
import { authErrorMessage } from '@/lib/errors';
import { authRedirectUrl, supabase } from '@/lib/supabase';

type Mode = 'signin' | 'signup' | 'magic';

function Shell({ children, footer }: { children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center px-4 py-10"
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 40px)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 40px)' }}
    >
      <div className="w-full max-w-[400px] animate-rise">
        <div className="mb-7 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-[2px] border border-amber/50 bg-amber/10 text-amber" aria-hidden>
            <Layers size={20} />
          </div>
          <div>
            <h1 className="text-[17px] font-semibold tracking-[0.02em] text-txt">PERSONAL OS</h1>
            <p className="silk mt-1">личная панель управления</p>
          </div>
        </div>
        {children}
        {footer}
      </div>
    </div>
  );
}

export function AuthPage() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Введите корректный адрес e-mail.');
    if (mode !== 'magic' && password.length < 6) return setError('Пароль — минимум 6 символов.');
    setBusy(true);
    try {
      if (mode === 'signin') {
        const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (err) throw err;
      } else if (mode === 'signup') {
        const { data, error: err } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: authRedirectUrl() },
        });
        if (err) throw err;
        if (!data.session) setInfo('Мы отправили письмо со ссылкой подтверждения. Откройте её, затем войдите.');
      } else {
        const { error: err } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: authRedirectUrl() } });
        if (err) throw err;
        setInfo('Ссылка для входа отправлена на почту. Откройте её на этом устройстве.');
      }
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setError('');
    setInfo('');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Введите e-mail, на который отправить ссылку для сброса пароля.');
    setBusy(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: authRedirectUrl() });
    setBusy(false);
    if (err) setError(authErrorMessage(err));
    else setInfo('Если такой аккаунт есть, мы отправили письмо со ссылкой для сброса пароля.');
  };

  return (
    <Shell
      footer={
        <p className="mt-6 text-center text-[11px] leading-relaxed text-mute">
          Каждый пользователь видит только свои данные. Доступ ограничен политиками Row Level Security.
        </p>
      }
    >
      <form onSubmit={submit} className="panel panel-screw space-y-4 px-5 pb-5 pt-7" noValidate>
        <div className="flex items-center gap-3">
          <span className="silk whitespace-nowrap">вход в систему</span>
          <span className="h-px flex-1 bg-engrave/70" />
        </div>

        <Segmented
          ariaLabel="Способ входа"
          value={mode}
          onChange={m => {
            setMode(m);
            setError('');
            setInfo('');
          }}
          className="w-full"
          options={[
            { value: 'signin', label: 'Вход' },
            { value: 'signup', label: 'Регистрация' },
            { value: 'magic', label: 'Ссылка' },
          ]}
        />

        <Field label="E-mail">
          {id => <Input id={id} type="email" autoComplete="email" inputMode="email" value={email} onChange={e => setEmail(e.target.value)} autoFocus />}
        </Field>

        {mode !== 'magic' && (
          <Field label="Пароль">
            {id => (
              <Input
                id={id}
                type="password"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            )}
          </Field>
        )}

        {mode === 'magic' && <p className="text-[11.5px] leading-relaxed text-mute">Пароль не нужен: пришлём одноразовую ссылку для входа.</p>}

        {error && (
          <p role="alert" className="border border-red/40 bg-red/[0.08] px-3 py-2 text-[12px] leading-snug text-red">
            {error}
          </p>
        )}
        {info && (
          <p role="status" className="border border-cyan/40 bg-cyan/[0.08] px-3 py-2 text-[12px] leading-snug text-cyan">
            {info}
          </p>
        )}

        <Button type="submit" variant="primary" size="lg" block disabled={busy}>
          <LogIn size={15} />
          {busy ? 'Подождите…' : mode === 'signin' ? 'Войти' : mode === 'signup' ? 'Создать аккаунт' : 'Отправить ссылку'}
        </Button>

        {mode === 'signin' && (
          <button type="button" onClick={reset} className="block min-h-[44px] w-full text-center text-[11.5px] text-mute transition-colors hover:text-txt">
            Забыли пароль?
          </button>
        )}
      </form>
    </Shell>
  );
}

export function RecoveryPage({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 6) return setError('Пароль — минимум 6 символов.');
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) setError(authErrorMessage(err));
    else onDone();
  };

  return (
    <Shell>
      <form onSubmit={submit} className="panel panel-screw space-y-4 px-5 pb-5 pt-7" noValidate>
        <div className="flex items-center gap-3">
          <span className="silk whitespace-nowrap">новый пароль</span>
          <span className="h-px flex-1 bg-engrave/70" />
        </div>
        <Field label="Пароль">
          {id => <Input id={id} type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} autoFocus />}
        </Field>
        {error && <p role="alert" className="text-[12px] text-red">{error}</p>}
        <Button type="submit" variant="primary" size="lg" block disabled={busy}>
          {busy ? 'Сохраняем…' : 'Сохранить пароль'}
        </Button>
      </form>
    </Shell>
  );
}
