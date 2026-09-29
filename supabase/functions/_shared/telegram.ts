/* ============================================================================
   _shared/telegram.ts — вызовы Telegram Bot API и форматирование ответов
   ========================================================================== */
export const TG_API = 'https://api.telegram.org';

export async function tg(token: string, method: string, payload: unknown): Promise<any> {
  const res = await fetch(`${TG_API}/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function sendMessage(token: string, chatId: string | number, text: string, extra: Record<string, unknown> = {}) {
  return tg(token, 'sendMessage', Object.assign({ chat_id: chatId, text, parse_mode: 'HTML' }, extra));
}

export async function answerCallback(token: string, id: string, text = '') {
  return tg(token, 'answerCallbackQuery', { callback_query_id: id, text });
}

/* Кнопки подтверждения операции — как в карточке бота.
   Telegram Bot API ждёт клавиатуру в поле reply_markup. */
export function confirmKeyboard(): Record<string, unknown> {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ Сохранить', callback_data: 'save' },
          { text: '🏷 Другая категория', callback_data: 'cat' },
          { text: '🗑 Отмена', callback_data: 'cancel' },
        ],
      ],
    },
  };
}

export function categoryKeyboard(categories: string[]): Record<string, unknown> {
  const rows: { text: string; callback_data: string }[][] = [];
  for (let i = 0; i < categories.length; i += 3) {
    rows.push(categories.slice(i, i + 3).map(c => ({ text: c, callback_data: 'set:' + c })));
  }
  rows.push([{ text: '⬅️ Назад', callback_data: 'back' }]);
  return { reply_markup: { inline_keyboard: rows } };
}

export function money(v: number): string {
  const n = Math.round(Number(v) * 100) / 100;
  const body = Math.abs(n).toLocaleString('ru-RU', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
  return (n < 0 ? '−' : '') + body + ' ₽';
}

export function esc(v: unknown): string {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function fmtDate(iso: string): string {
  const [y, m, d] = String(iso).split('-');
  return `${d}.${m}.${y}`;
}

export function todayISO(): string {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
