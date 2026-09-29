/* ============================================================================
   credit-reminders — напоминания о платежах (cron)
   Запускается по расписанию. Для каждого привязанного Telegram-аккаунта
   смотрит ближайшие платежи по кредитам и кредиткам: напоминает за 3 дня
   и в день платежа. Пометки о доставке хранит в profile.settings.reminderMarks,
   поэтому одно напоминание не уходит дважды.
   Секрет: CRON_SECRET (заголовок x-cron-secret).
   ========================================================================== */
import { preflight, json, fail } from '../_shared/cors.ts';
import { adminClient } from '../_shared/supabase.ts';
import { sendMessage, money, esc, fmtDate } from '../_shared/telegram.ts';

const REMIND_IN_DAYS = [3, 0];   // за 3 дня и в день платежа

function todayISO(): string { return new Date().toISOString().slice(0, 10); }

function daysUntil(iso: string, today: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return null;
  const a = new Date(today + 'T12:00:00Z').getTime();
  const b = new Date(String(iso).slice(0, 10) + 'T12:00:00Z').getTime();
  return Math.round((b - a) / 86400000);
}

async function profileOf(admin: ReturnType<typeof adminClient>, userId: string) {
  const { data } = await admin.from('finance_profiles').select('*').eq('user_id', userId).maybeSingle();
  return data || { budgets: {}, credits: [], credit_cards: [], settings: {} };
}

async function saveMarks(admin: ReturnType<typeof adminClient>, userId: string, profile: any, marks: Record<string, string>) {
  const settings = Object.assign({}, profile.settings || {}, { reminderMarks: marks });
  await admin.from('finance_profiles').upsert({ user_id: userId, settings });
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST' && req.method !== 'GET') return fail('Только POST/GET', 405);

  const cron = Deno.env.get('CRON_SECRET') || '';
  const got = req.headers.get('x-cron-secret') || '';
  if (!cron || got !== cron) return fail('Forbidden', 403);

  const token = Deno.env.get('TELEGRAM_BOT_TOKEN') || '';
  if (!token) return fail('TELEGRAM_BOT_TOKEN не задан', 500);

  const admin = adminClient();
  const today = todayISO();
  const { data: links } = await admin.from('telegram_accounts').select('user_id,telegram_chat_id');
  let sent = 0;

  for (const link of links || []) {
    try {
      const profile = await profileOf(admin, link.user_id);
      const marks: Record<string, string> = (profile.settings && profile.settings.reminderMarks) || {};
      const jobs: { key: string; text: string }[] = [];

      for (const c of profile.credits || []) {
        const next = (c.schedule || []).find((p: any) => !p.paid);
        if (!next) continue;
        const d = daysUntil(next.date, today);
        if (d === null || !REMIND_IN_DAYS.includes(d)) continue;
        const key = 'credit:' + c.id + ':' + next.date;
        if (marks[key]) continue;
        jobs.push({ key, text: `🔔 Платёж по кредиту «${esc(c.bank)}${c.purpose ? ' · ' + esc(c.purpose) : ''}» — <b>${money(Number(next.amount))}</b>, ${d === 0 ? 'сегодня' : 'через ' + d + ' дн.'} (${fmtDate(next.date)}).` });
      }

      for (const c of profile.credit_cards || []) {
        if (!Number(c.used)) continue;
        const d = daysUntil(c.paymentDate, today);
        if (d === null || !REMIND_IN_DAYS.includes(d)) continue;
        const key = 'card:' + c.id + ':' + c.paymentDate;
        if (marks[key]) continue;
        jobs.push({ key, text: `🔔 Платёж по кредитке «${esc(c.bank)}${c.name ? ' · ' + esc(c.name) : ''}» — минимум <b>${money(Number(c.minPaymentPercent) ? Number(c.used) * Number(c.minPaymentPercent) / 100 : Number(c.used))}</b>, ${d === 0 ? 'сегодня' : 'через ' + d + ' дн.'} (${fmtDate(c.paymentDate)}).` });
      }

      if (!jobs.length) continue;
      for (const job of jobs) {
        await sendMessage(token, link.telegram_chat_id, job.text);
        marks[job.key] = today;
        sent++;
      }
      await saveMarks(admin, link.user_id, profile, marks);
    } catch (e) {
      console.error('reminder failed for', link.user_id, e);
    }
  }

  return json({ ok: true, sent, today });
});
