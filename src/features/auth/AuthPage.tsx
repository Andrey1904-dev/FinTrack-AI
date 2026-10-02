import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input, Segmented } from '@/components/ui/form';
import { authErrorMessage } from '@/lib/errors';
import { authRedirectUrl, supabase } from '@/lib/supabase';

type Mode = 'signin' | 'signup' | 'magic';

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
        const { data, error: err } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: authRedirectUrl() } });
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
    <div className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl bg-accent text-lg font-bold text-[hsl(225_30%_8%)]">OS</div>
          <h1 className="text-2xl font-semibold tracking-tight">Personal OS</h1>
          <p className="mt-1 text-sm text-muted">Деньги, долги, авто, цели и задачи — в одном месте.</p>
        </div>
        <form onSubmit={submit} className="card space-y-4 p-5" noValidate>
          <Segmented value={mode} onChange={m => { setMode(m); setError(''); setInfo(''); }} className="w-full"
            options={[{ value: 'signin', label: 'Вход' }, { value: 'signup', label: 'Регистрация' }, { value: 'magic', label: 'Ссылка' }]} />
          <Field label="E-mail">{id => <Input id={id} type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} autoFocus />}</Field>
          {mode !== 'magic' && (
            <Field label="Пароль">{id => <Input id={id} type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={e => setPassword(e.target.value)} />}</Field>
          )}
          {mode === 'magic' && <p className="text-xs text-muted">Пароль не нужен: пришлём одноразовую ссылку для входа.</p>}
          {error && <p role="alert" className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
          {info && <p role="status" className="rounded-lg border border-good/30 bg-good/10 px-3 py-2 text-sm text-good">{info}</p>}
          <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>
            {busy ? 'Подождите…' : mode === 'signin' ? 'Войти' : mode === 'signup' ? 'Создать аккаунт' : 'Отправить ссылку'}
          </Button>
          {mode === 'signin' && <button type="button" onClick={reset} className="block w-full text-center text-xs text-muted hover:text-fg">Забыли пароль?</button>}
        </form>
        <p className="mt-6 text-center text-xs text-muted">Каждый пользователь видит только свои данные.</p>
      </div>
    </div>
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
    <div className="grid min-h-dvh place-items-center px-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4 p-5">
        <h1 className="text-lg font-semibold">Новый пароль</h1>
        <Field label="Пароль">{id => <Input id={id} type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} autoFocus />}</Field>
        {error && <p role="alert" className="text-sm text-bad">{error}</p>}
        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>Сохранить пароль</Button>
      </form>
    </div>
  );
}
