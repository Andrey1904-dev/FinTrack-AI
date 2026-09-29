export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/gu, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

export async function telegramRequest(method, payload) {
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not configured');
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(12_000)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok !== true) {
    const error = new Error(`Telegram API ${method} failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return result.result;
}

export function sendMessage(chatId, text, extra = {}) {
  return telegramRequest('sendMessage', {
    chat_id: String(chatId), text, parse_mode: 'HTML',
    disable_web_page_preview: true, ...extra
  });
}

export async function editMessage(chatId, messageId, text, replyMarkup) {
  try {
    return await telegramRequest('editMessageText', {
      chat_id: String(chatId), message_id: messageId, text, parse_mode: 'HTML',
      disable_web_page_preview: true, ...(replyMarkup ? { reply_markup: replyMarkup } : {})
    });
  } catch (error) {
    if (/message is not modified/i.test(error.message)) return null;
    throw error;
  }
}

export function inlineKeyboard(rows) {
  return { inline_keyboard: rows };
}

export function constantTimeEqual(left, right) {
  const a = new TextEncoder().encode(String(left || ''));
  const b = new TextEncoder().encode(String(right || ''));
  let diff = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) diff |= (a[i] || 0) ^ (b[i] || 0);
  return diff === 0;
}
