import { useState } from 'react';
import { CheckRow, Field, Input, MoneyInput, Select } from '@/components/ui/form';
import { useInvalidate, useRows } from '@/data/hooks';
import { supabase } from '@/lib/supabase';
import { todayISO } from '@/lib/dates';
import { money, num } from '@/lib/format';
import { FormShell, useSubmit } from './shared';

export function DebtPaymentForm({ debtId, onDone }: { debtId?: string; onDone: () => void }) {
  const { rows: debts } = useRows('debts');
  const active = debts.filter(d => d.status === 'active');
  const [id, setId] = useState(debtId ?? active[0]?.id ?? '');
  const debt = active.find(d => d.id === id);
  const [amount, setAmount] = useState(debt?.min_payment ? String(debt.min_payment) : '');
  const [principal, setPrincipal] = useState('');
  const [date, setDate] = useState(todayISO());
  const [comment, setComment] = useState('');
  const [asExpense, setAsExpense] = useState(true);
  const [advance, setAdvance] = useState(true);
  const [fieldError, setFieldError] = useState('');
  const invalidate = useInvalidate();
  const { saving, error, run } = useSubmit('Не удалось записать платёж', 'Платёж записан, остаток обновлён', onDone);

  const pick = (next: string) => {
    setId(next);
    const d = active.find(x => x.id === next);
    if (d?.min_payment) setAmount(String(d.min_payment));
  };

  const submit = () => {
    const value = num(amount);
    if (!debt) return setFieldError('Выберите долг');
    if (value <= 0) return setFieldError('Введите сумму платежа');
    setFieldError('');
    void run(async () => {
      const { error: err } = await supabase.rpc('record_debt_payment', {
        p_debt_id: debt.id,
        p_amount: value,
        p_date: date,
        p_comment: comment.trim(),
        p_principal: principal.trim() ? num(principal) : null,
        p_create_expense: asExpense,
        p_advance: advance,
      });
      if (err) throw err;
      await invalidate('debts', 'debt_payments', 'finance_operations');
    });
  };

  if (!active.length) return <p className="py-6 text-center text-[12.5px] text-mute">Сначала добавьте долг в разделе «Долги».</p>;

  return (
    <FormShell onSubmit={submit} saving={saving} error={error || fieldError}>
      <Field label="Долг">
        {fid => (
          <Select id={fid} value={id} onChange={e => pick(e.target.value)}>
            {active.map(d => <option key={d.id} value={d.id}>{d.name}{d.organization ? ` · ${d.organization}` : ''} — {money(d.balance)}</option>)}
          </Select>
        )}
      </Field>
      <Field label="Сумма платежа, ₽">{fid => <MoneyInput id={fid} value={amount} onChange={e => setAmount(e.target.value)} autoFocus />}</Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Дата">{fid => <Input id={fid} type="date" value={date} onChange={e => setDate(e.target.value)} />}</Field>
        <Field label="В основной долг, ₽" hint="Пусто — вся сумма">{fid => <MoneyInput id={fid} value={principal} onChange={e => setPrincipal(e.target.value)} placeholder="вся сумма" />}</Field>
      </div>
      <Field label="Комментарий">{fid => <Input id={fid} value={comment} onChange={e => setComment(e.target.value)} maxLength={200} />}</Field>
      <CheckRow checked={asExpense} onChange={setAsExpense} label="Учесть в расходах (категория «Кредиты»)" />
      {debt?.next_payment_date && <CheckRow checked={advance} onChange={setAdvance} label="Сдвинуть дату следующего платежа на месяц" />}
    </FormShell>
  );
}
