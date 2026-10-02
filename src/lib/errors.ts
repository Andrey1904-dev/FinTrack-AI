interface MaybeError {
  message?: string;
  code?: string;
  status?: number;
  details?: string;
}

/** Turns technical errors into something a person can act on. `action` is e.g. "Не удалось сохранить расход". */
export function friendlyError(error: unknown, action = 'Не удалось выполнить действие'): string {
  const e = (error ?? {}) as MaybeError;
  const msg = String(e.message ?? error ?? '').toLowerCase();
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return `${action}. Нет подключения к интернету — данные в форме сохранены, повторите, когда сеть появится.`;
  }
  if (msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('load failed') || msg.includes('network request failed')) {
    return `${action}. Проверьте соединение и попробуйте ещё раз.`;
  }
  if (e.code === '23505') return `${action}. Такая запись уже существует.`;
  if (e.code === '23503') return `${action}. Связанная запись не найдена — обновите страницу.`;
  if (e.code === '23514' || e.code === '22003' || e.code === '22P02') return `${action}. Проверьте введённые значения.`;
  if (e.code === '42501' || msg.includes('row-level security') || msg.includes('permission denied')) {
    return `${action}. Нет доступа — войдите в аккаунт заново.`;
  }
  if (msg.includes('jwt') || msg.includes('not authenticated') || e.status === 401) {
    return `${action}. Сессия истекла — войдите снова.`;
  }
  if (msg.includes('relation') && msg.includes('does not exist')) {
    return `${action}. В базе данных не хватает таблиц — примените миграции Supabase (см. README).`;
  }
  if (msg.includes('больше нуля') || msg.includes('не найден')) return `${action}. ${String((error as Error).message)}.`;
  return `${action}. Проверьте соединение и попробуйте ещё раз.`;
}

export function authErrorMessage(error: unknown): string {
  const msg = String((error as MaybeError)?.message ?? error ?? '').toLowerCase();
  if (msg.includes('invalid login credentials')) return 'Неверный e-mail или пароль.';
  if (msg.includes('email not confirmed')) return 'E-mail ещё не подтверждён. Откройте письмо со ссылкой подтверждения.';
  if (msg.includes('already registered') || msg.includes('already been registered')) return 'Этот e-mail уже зарегистрирован — войдите.';
  if (msg.includes('password') && msg.includes('at least')) return 'Пароль слишком короткий — минимум 6 символов.';
  if (msg.includes('rate limit') || msg.includes('too many')) return 'Слишком много попыток. Подождите минуту и повторите.';
  if (msg.includes('invalid') && msg.includes('email')) return 'Проверьте адрес e-mail.';
  if (msg.includes('fetch') || msg.includes('network')) return 'Нет соединения с сервером. Проверьте интернет и попробуйте ещё раз.';
  return 'Не удалось выполнить вход. Попробуйте ещё раз.';
}
