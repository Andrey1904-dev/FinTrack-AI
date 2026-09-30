#!/usr/bin/env node

const required = ['SUPABASE_URL', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_WEBHOOK_SECRET'];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing ${key}. Set it in the shell environment; do not commit secrets.`);
    process.exit(1);
  }
}
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
if (!/^[A-Za-z0-9_-]{1,256}$/.test(secret)) {
  console.error('TELEGRAM_WEBHOOK_SECRET must contain 1–256 characters: A-Z, a-z, 0-9, _ or -.');
  process.exit(1);
}
const base = process.env.SUPABASE_URL.replace(/\/$/, '');
const webhookUrl = `${base}/functions/v1/telegram-webhook`;
const token = process.env.TELEGRAM_BOT_TOKEN;

const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    url: webhookUrl,
    secret_token: secret,
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: false
  })
});
const result = await response.json().catch(() => ({}));
if (!response.ok || result.ok !== true) {
  console.error('Telegram rejected the webhook configuration:', result.description || response.status);
  process.exit(1);
}
const commands = [
  ['start', 'Открыть меню'], ['today', 'Итоги за сегодня'], ['month', 'Отчёт за месяц'],
  ['balance', 'Баланс за всё время'], ['credits', 'Кредиты и кредитки'], ['upcoming', 'Ближайшие платежи'],
  ['budget', 'Бюджеты и лимиты'], ['goals', 'Финансовые цели'], ['notifications', 'Настройки уведомлений'],
  ['timezone', 'Часовой пояс напоминаний'], ['undo', 'Отменить операцию из Telegram'], ['help', 'Помощь']
].map(([command, description]) => ({ command, description }));
const commandsResponse = await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ commands })
});
const commandsResult = await commandsResponse.json().catch(() => ({}));
console.log(`Webhook configured: ${webhookUrl}`);
if (!commandsResponse.ok || commandsResult.ok !== true) {
  console.error('Webhook is active, but Telegram commands could not be registered:', commandsResult.description || commandsResponse.status);
  process.exit(1);
}
console.log('Telegram command menu configured. Secret values were not printed.');
