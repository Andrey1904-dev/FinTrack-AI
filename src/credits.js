/* ============================================================================
   credits.js — кредиты (с настоящим графиком платежей) и кредитные карты
   Было: остаток долга считался «на глазок» по формуле, платежи нигде не
   фиксировались и не попадали в расходы.
   Стало: график платежей генерируется при создании кредита, каждый платёж
   можно отметить (создаётся операция-расход), остаток и переплата считаются
   по графику, поддержано досрочное погашение.
   ========================================================================== */

function annuity(principal, annualRatePct, months){
  const p = num(principal), r = num(annualRatePct) / 100 / 12, n = Math.max(1, Math.round(num(months)));
  if (!p) return 0;
  if (!r) return round2(p / n);
  return round2(p * r / (1 - Math.pow(1 + r, -n)));
}
function buildSchedule(credit){
  const p = num(credit.principal), r = num(credit.rate) / 100 / 12;
  const months = Math.max(1, Math.round(num(credit.termMonths)));
  const start = isValidISO(credit.issueDate) ? String(credit.issueDate).slice(0, 10) : today();
  const pay = annuity(p, credit.rate, months);
  const out = [];
  let rest = p;
  for (let i = 1; i <= months; i++){
    const interest = round2(rest * r);
    let principalPart = round2(pay - interest);
    if (i === months || principalPart > rest) principalPart = round2(rest);
    rest = round2(rest - principalPart);
    out.push({ n: i, date: addMonthsISO(start, i), amount: round2(principalPart + interest), interest, principal: principalPart, rest: Math.max(0, rest), paid: false, paidAt: null, operationId: null });
  }
  return out;
}
function creditPaidPayments(c){ return (c.schedule || []).filter(p => p.paid); }
function nextUnpaidPayment(c){
  if (!c || !Array.isArray(c.schedule)) return null;
  return c.schedule.find(p => !p.paid) || null;
}
function creditRemaining(c){ const n = nextUnpaidPayment(c); return n ? round2(n.rest + n.principal) : 0; }
function creditTotalPaid(c){ return sumMoney(creditPaidPayments(c), p => p.amount); }
function creditOverpay(c){ const total = sumMoney(c.schedule || [], p => p.amount); return round2(total - num(c.principal)); }
function creditProgress(c){ const total = (c.schedule || []).length; return total ? creditPaidPayments(c).length / total : 0; }
function creditPaidAmount(c){ return sumMoney(creditPaidPayments(c), p => p.principal); }

/* Отметить очередной платёж: создаём операцию-расход и двигаем график */
function payNextCreditPayment(id){
  const c = S.credits.find(x => String(x.id) === String(id));
  if (!c) return null;
  const p = nextUnpaidPayment(c);
  if (!p) return { nothing: true };
  p.paid = true; p.paidAt = new Date().toISOString();
  const op = upsertOp({
    id: uid('op'), type: 'expense', amount: p.amount,
    category: S.categorySets.expense.includes('Кредиты') ? 'Кредиты' : 'Другое',
    note: 'Платёж по кредиту · ' + c.bank + (c.purpose ? ' (' + c.purpose + ')' : ''),
    date: additionDate(p.date), source: 'credit'
  });
  p.operationId = op.id;
  const nxt = nextUnpaidPayment(c);
  c.paymentDate = nxt ? nxt.date : p.date;
  c.monthlyPayment = (nxt || p).amount;
  c.paid = !nxt;
  saveProfileToCloud();
  return { credit: c, payment: p, operation: op, done: !nxt };
}
function additionDate(iso){ return isValidISO(iso) && iso > today() ? today() : (isValidISO(iso) ? iso : today()); }

/* Досрочное погашение: сумма уходит в тело долга, график пересобирается */
function repayCreditEarly(id, amount){
  const c = S.credits.find(x => String(x.id) === String(id));
  if (!c) return null;
  const value = round2(num(amount));
  if (value <= 0) return null;
  const remaining = creditRemaining(c);
  const payNow = Math.min(value, remaining);
  const restAfter = round2(remaining - payNow);
  const nxt = nextUnpaidPayment(c);
  const termLeft = Math.max(0, (c.schedule || []).filter(p => !p.paid).length - (restAfter > 0 ? 1 : 0));
  const startDate = nxt ? addMonthsISO(nxt.date, -1) : today();
  const op = upsertOp({
    id: uid('op'), type: 'expense', amount: payNow,
    category: S.categorySets.expense.includes('Кредиты') ? 'Кредиты' : 'Другое',
    note: 'Досрочное погашение · ' + c.bank, date: today(), source: 'credit-early'
  });
  const paidPart = (c.schedule || []).filter(p => p.paid);
  if (restAfter <= 0.01){
    c.schedule = paidPart.concat([{ n: paidPart.length + 1, date: today(), amount: payNow, interest: 0, principal: payNow, rest: 0, paid: true, paidAt: new Date().toISOString(), operationId: op.id }]);
    c.principal = round2(num(c.principal));
    c.paymentDate = today(); c.paid = true; c.monthlyPayment = 0;
  } else {
    const regen = buildSchedule({ principal: restAfter, rate: c.rate, termMonths: Math.max(1, termLeft || 1), issueDate: startDate });
    c.schedule = paidPart.concat(regen.map((p, i) => Object.assign({}, p, { n: paidPart.length + 1 + i })));
    c.principal = restAfter;
    c.monthlyPayment = regen[0] ? regen[0].amount : 0;
    c.paymentDate = regen[0] ? regen[0].date : c.paymentDate;
    c.paid = false;
  }
  saveProfileToCloud();
  return { credit: c, payNow, restAfter, operation: op };
}

/* ---------- кредитные карты ---------- */
function cardAvailable(c){ return round2(Math.max(0, num(c.limit) - num(c.used))); }
function cardUtilization(c){ const l = num(c.limit); return l ? clamp(num(c.used) / l * 100, 0, 100) : 0; }
function cardMinPayment(c){
  const byPct = round2(num(c.used) * num(c.minPaymentPercent) / 100);
  return round2(Math.min(num(c.used), Math.max(byPct, num(c.used) > 0 && byPct < 1 ? Math.min(num(c.used), 1) : byPct)));
}
function cardGraceLeft(c){ const d = daysUntil(c.statementDate); return d === null ? null : Math.max(0, num(c.graceDays) + d); }
function cardStatus(c){
  const u = cardUtilization(c);
  const d = daysUntil(c.paymentDate);
  if (!num(c.used)) return { level: 'ok', text: 'Нет задолженности' };
  if (u >= 80) return { level: 'bad', text: 'Загрузка лимита ' + u.toFixed(0) + '% — рискованно' };
  if (d !== null && d <= 3) return { level: 'warn', text: d <= 0 ? 'Платёж сегодня/просрочен' : 'Платёж через ' + d + ' дн.' };
  return { level: 'ok', text: 'Платёж ' + fmtDateShort(c.paymentDate) };
}
function payCard(id, amount){
  const c = S.cards.find(x => String(x.id) === String(id));
  if (!c) return null;
  const pay = Math.min(round2(num(amount)), num(c.used));
  if (pay <= 0) return null;
  const op = upsertOp({
    id: uid('op'), type: 'expense', amount: pay,
    category: S.categorySets.expense.includes('Кредиты') ? 'Кредиты' : 'Другое',
    note: 'Погашение кредитки · ' + c.bank + (c.name ? ' (' + c.name + ')' : ''), date: today(), source: 'card'
  });
  c.used = round2(num(c.used) - pay);
  c.lastPaymentAmount = pay; c.lastPaymentAt = new Date().toISOString();
  if (c.used <= 0) c.paymentDate = addMonthsISO(c.paymentDate, 1);
  saveProfileToCloud();
  return { card: c, operation: op, pay };
}
function cardStatementAmount(c){ return num(c.used); }
