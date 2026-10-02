import { useState } from 'react';
import { Field, Input, MoneyInput, Segmented, Textarea } from '@/components/ui/form';
import { useSaveRow } from '@/data/hooks';
import { FormShell, useSubmit } from '@/features/forms/shared';
import { num } from '@/lib/format';
import type { Debt } from '@/types';

export function DebtForm({ initial, onDone }: { initial?: Debt; onDone: () => void }) {
  const [kind, setKind] = useState<Debt['kind']>(initial?.kind ?? 'loan');
  const [name, setName] = useState(initial?.name ?? '');
  const [org, setOrg] = useState(initial?.organization ?? '');
  const [original, setOriginal] = useState(initial ? String(initial.original_amount) : '');
  const [balance, setBalance] = useState(initial ? String(initial.balance) : '');
  const [rate, setRate] = useState(initial ? String(initial.interest_rate) : '');
  const [minPay, setMinPay] = useState(initial ? String(initial.min_payment) : '');
  const [next, setNext] = useState(initial?.next_payment_date ?? '');
  const [limit, setLimit] = useState(initial ? String(initial.credit_limit) : '');
  const [status, setStatus] = useState<Debt['status']>(initial?.status ?? 'active');
  const [comment, setComment] = useState(initial?.comment ?? '');
  const [err, setErr] = useState('');
  const save = useSaveRow('debts');
  const { saving, error, run } = useSubmit('Не удалось сохранить долг', 'Долг сохранён', onDone);

  return (
    <FormShell saving={saving} error={error || err} onSubmit={() => {
      if (!name.trim()) return setErr('Введите название долга');
      const bal = balance.trim() === '' ? num(original) : num(balance);
      const orig = original.trim() === '' ? bal : num(original);
      if (bal < 0 || orig < 0) return setErr('Суммы не могут быть отрицательными');
      if (bal <= 0 && status === 'active' && !initial) return setErr('Укажите текущий остаток');
      setErr('');
      void run(() => save.mutateAsync({
        id: initial?.id, kind, name: name.trim(), organization: org.trim(), original_amount: Math.max(orig, bal), balance: bal,
        interest_rate: num(rate), min_payment: num(minPay), next_payment_date: next || null, credit_limit: kind === 'card' ? num(limit) : 0,
        status: bal <= 0 ? 'closed' : status, comment: comment.trim(),
      }));
    }}>
      <Segmented value={kind} onChange={setKind} className="w-full" options={[{ value: 'loan', label: 'Кредит' }, { value: 'card', label: 'Кредитка' }, { value: 'other', label: 'Другое' }]} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Название">{id => <Input id={id} value={name} onChange={e => setName(e.target.value)} placeholder="Автокредит" autoFocus maxLength={120} />}</Field>
        <Field label="Организация">{id => <Input id={id} value={org} onChange={e => setOrg(e.target.value)} placeholder="Банк" maxLength={120} />}</Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Первоначальная сумма, ₽">{id => <MoneyInput id={id} value={original} onChange={e => setOriginal(e.target.value)} />}</Field>
        <Field label="Текущий остаток, ₽">{id => <MoneyInput id={id} value={balance} onChange={e => setBalance(e.target.value)} />}</Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Процент годовых">{id => <MoneyInput id={id} value={rate} onChange={e => setRate(e.target.value)} />}</Field>
        <Field label="Минимальный платёж, ₽">{id => <MoneyInput id={id} value={minPay} onChange={e => setMinPay(e.target.value)} />}</Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Дата ближайшего платежа">{id => <Input id={id} type="date" value={next} onChange={e => setNext(e.target.value)} />}</Field>
        {kind === 'card' && <Field label="Кредитный лимит, ₽">{id => <MoneyInput id={id} value={limit} onChange={e => setLimit(e.target.value)} />}</Field>}
      </div>
      {initial && <Field label="Статус">{() => <Segmented value={status} onChange={setStatus} className="w-full" options={[{ value: 'active', label: 'Действует' }, { value: 'closed', label: 'Закрыт' }]} />}</Field>}
      <Field label="Комментарий">{id => <Textarea id={id} value={comment} onChange={e => setComment(e.target.value)} className="min-h-[56px]" />}</Field>
    </FormShell>
  );
}
