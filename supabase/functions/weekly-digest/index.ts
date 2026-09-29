/* ============================================================================
   weekly-digest — воскресный дайджест «куда ушли деньги» (cron)
   Для каждого привязанного Telegram-аккаунта: итоги прошедшей недели
   (пн–вс), топ категорий, лимиты в зоне риска и ближайшие списания.
   Молчит, если за неделю операций не было, и не отправляется дважды
   за одну неделю (settings.lastDigestISO).
   Секрет: CRON_SECRET (заголовок x-cron-secret).
   ========================================================================== */
import { preflight, json, fail } from '../_shared/cors.ts';
import { adminClient } from '../_shared/supabase.ts';
import { sendMessage, money, esc, fmtDate } from '../_shared/telegram.ts';

function isoDate(d: Date): string { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function todayISO(): string { return isoDate(new Date()); }
function addDays(iso: string, n: number): string { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoDate(d); }

/* прошедшая неделя: понедельник–воскресенье, к которой относится «сегодня» */
function lastWeekRange(today: string): { from: string; to: string } {
  const d = new Date(today + 'T12:00:00');
  const dow = (d.getDay() + 6) % 7;                     // 0 = понедельник
  const from = addDays(today, -dow - 7);
  return { from, to: addDays(from, 6) };
}

async function profileOf(admin: ReturnType<typeof adminClient>, userId: string) {
  const { data } = await admin.from('finance_profiles').select('*').eq('user_id', userId).maybeSingle();
  return data || { budgets: {}, recurring: [], credits: [], credit_cards: [], settings: {} };
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
  const week = lastWeekRange(today);
  const { data: links } = await admin.from('telegram_accounts').select('user_id,telegram_chat_id');
  let sent = 0;

  for (const link of links || []) {
    try {
      const profile = await profileOf(admin, link.user_id);
      if (profile.settings && profile.settings.lastDigestISO === week.from) continue;   // уже отправлен

      const { data: ops } = await admin.from('finance_operations')
        .select('type,amount,category,date').eq('user_id', link.user_id)
        .gte('date', week.from).lte('date', week.to);
      const list = ops || [];
      if (!list.length) continue;                                                       // молчим без операций

      let inc = 0, exp = 0;
      const byCat = new Map<string, number>();
      list.forEach(o => {
        const v = Number(o.amount);
        if (o.type === 'income') inc += v;
        else { exp += v; byCat.set(o.category, (byCat.get(o.category) || 0) + v); }
      });

      const top = [...byCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
        .map(([c, v]) => `• ${esc(c)} — ${money(v)}`);

      // лимиты в зоне риска (месячные): потрачено >80% в текущем месяце
      const monthFrom = today.slice(0, 8) + '01';
      const { data: monthOps } = await admin.from('finance_operations')
        .select('type,amount,category').eq('user_id', link.user_id).gte('date', monthFrom).lte('date', today);
      const spentMonth = new Map<string, number>();
      (monthOps || []).forEach(o => { if (o.type === 'expense') spentMonth.set(o.category, (spentMonth.get(o.category) || 0) + Number(o.amount)); });
      const risky = Object.entries(profile.budgets || {})
        .filter(([, limit]) => Number(limit) > 0)
        .map(([cat, limit]) => ({ cat, limit: Number(limit), spent: spentMonth.get(cat) || 0 }))
        .filter(x => x.spent / x.limit > 0.8)
        .sort((a, b) => b.spent / b.limit - a.spent / a.limit)
        .slice(0, 3)
        .map(x => `⚠️ ${esc(x.cat)}: ${money(x.spent)} из ${money(x.limit)}`);

      // что спишется на следующей неделе
      const soonFrom = addDays(today, 1), soonTo = addDays(today, 7);
      const upcoming: string[] = [];
      for (const r of profile.recurring || []) {
        const n = Number(r.amount);
        if (r.next && r.next >= soonFrom && r.next <= soonTo && r.type !== 'income') upcoming.push(`• ${esc(r.name)} — ${money(n)}, ${fmtDate(r.next)}`);
      }
      for (const c of profile.credits || []) {
        const next = (c.schedule || []).find((p: any) => !p.paid);
        if (next && next.date >= soonFrom && next.date <= soonTo) upcoming.push(`• Кредит ${esc(c.bank)} — ${money(Number(next.amount))}, ${fmtDate(next.date)}`);
      }
      for (const c of profile.credit_cards || []) {
        if (Number(c.used) > 0 && c.paymentDate >= soonFrom && c.paymentDate <= soonTo) upcoming.push(`• Кредитка ${esc(c.bank)} — ${money(Number(c.used))}, ${fmtDate(c.paymentDate)}`);
      }

      const parts = [
        `<b>Неделя ${fmtDate(week.from)}–${fmtDate(week.to)}</b>`,
        `Доходы: <b>${money(inc)}</b>`,
        `Расходы: <b>${money(exp)}</b>`,
      ];
      if (top.length) parts.push('', 'Куда ушли деньги:', ...top);
      if (risky.length) parts.push('', 'Лимиты под давлением:', ...risky);
      if (upcoming.length) parts.push('', 'Скоро списания:', ...upcoming);
      await sendMessage(token, link.telegram_chat_id, parts.join('\n'));
      sent++;

      const settings = Object.assign({}, profile.settings || {}, { lastDigestISO: week.from });
      await admin.from('finance_profiles').upsert({ user_id: link.user_id, settings });
    } catch (e) {
      console.error('digest failed for', link.user_id, e);
    }
  }

  return json({ ok: true, sent, week });
});
