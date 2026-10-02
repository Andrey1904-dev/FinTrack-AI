import { Calculator, Plus, Save, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/dialog';
import { Field, Input, Segmented } from '@/components/ui/form';
import { Card, CardHeader, EmptyState, ErrorState, PageHeader, Skeleton, Stat } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { useDeleteRow, useRows, useSaveRow } from '@/data/hooks';
import { useCurrentCar } from '@/features/cars/useCars';
import { calcOwnership, emptyScenario, fuelStats } from '@/lib/calc';
import { friendlyError } from '@/lib/errors';
import { fmtDate, money, num } from '@/lib/format';
import type { CarScenarioParams, Scenario } from '@/types';
import { asText, NumField } from './NumField';

type Draft = Record<keyof CarScenarioParams, string>;
const FIELDS: Array<{ key: keyof CarScenarioParams; label: string; suffix?: string; hint?: string }> = [
  { key: 'price', label: 'Цена автомобиля', suffix: '₽' },
  { key: 'downPayment', label: 'Первоначальный взнос', suffix: '₽' },
  { key: 'termMonths', label: 'Срок кредита', suffix: 'мес.', hint: '0 — без кредита' },
  { key: 'ratePct', label: 'Ставка', suffix: '% годовых' },
  { key: 'consumption', label: 'Расход топлива', suffix: 'л/100 км' },
  { key: 'monthlyKm', label: 'Пробег в месяц', suffix: 'км' },
  { key: 'fuelPrice', label: 'Цена топлива', suffix: '₽/л' },
  { key: 'maintenanceMonthly', label: 'Обслуживание в месяц', suffix: '₽' },
  { key: 'insuranceYearly', label: 'Страховка в год', suffix: '₽' },
  { key: 'taxYearly', label: 'Налог в год', suffix: '₽' },
  { key: 'repairReserveMonthly', label: 'Резерв на ремонт в месяц', suffix: '₽' },
];

const toDraft = (p: Partial<CarScenarioParams>): Draft =>
  Object.fromEntries(FIELDS.map(f => [f.key, asText(p[f.key])])) as Draft;
const toParams = (d: Draft): CarScenarioParams => ({
  ...emptyScenario,
  ...(Object.fromEntries(FIELDS.map(f => [f.key, Math.max(0, num(d[f.key]))])) as unknown as CarScenarioParams),
});

const ROWS: Array<{ label: string; value: (p: CarScenarioParams, o: ReturnType<typeof calcOwnership>) => string }> = [
  { label: 'Цена', value: p => money(p.price) },
  { label: 'Первоначальный взнос', value: p => money(p.downPayment) },
  { label: 'Платёж по кредиту', value: (_, o) => (o.loanPayment ? money(o.loanPayment) : '—') },
  { label: 'Переплата по кредиту', value: (_, o) => (o.overpayment ? money(o.overpayment) : '—') },
  { label: 'Топливо в месяц', value: (_, o) => money(o.fuelMonthly) },
  { label: 'Страховка в месяц', value: (_, o) => money(o.insuranceMonthly) },
  { label: 'Налог в месяц', value: (_, o) => money(o.taxMonthly) },
  { label: 'Обслуживание в месяц', value: (_, o) => money(o.maintenanceMonthly) },
  { label: 'Резерв на ремонт', value: (_, o) => money(o.repairMonthly) },
  { label: 'Расходы на содержание в месяц', value: (_, o) => money(o.runningMonthly) },
  { label: 'Всего в месяц', value: (_, o) => money(o.totalMonthly) },
  { label: 'Полная стоимость за срок', value: (_, o) => money(o.totalCost) },
];

export default function CarCalcPage() {
  const scenarios = useRows('car_scenarios');
  const refuels = useRows('car_refuels');
  const { current } = useCurrentCar();
  const save = useSaveRow('car_scenarios');
  const del = useDeleteRow('car_scenarios');
  const confirm = useConfirm();
  const toast = useToast();

  const [mode, setMode] = useState<'calc' | 'compare'>('calc');
  const [name, setName] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(() => toDraft({ termMonths: 60 }));
  const [picked, setPicked] = useState<string[]>([]);
  const [filled, setFilled] = useState(false);

  const mine = useMemo(() => scenarios.rows.filter(s => s.kind === 'car') as Scenario<CarScenarioParams>[], [scenarios.rows]);
  const params = useMemo(() => toParams(draft), [draft]);
  const result = useMemo(() => calcOwnership(params), [params]);
  const stats = useMemo(() => fuelStats(refuels.rows.filter(r => r.car_id === current?.id)), [refuels.rows, current?.id]);

  const set = (k: keyof CarScenarioParams) => (v: string) => setDraft(d => ({ ...d, [k]: v }));
  const fillFromMyCar = () => {
    const last = refuels.rows.filter(r => r.car_id === current?.id)[0];
    setDraft(d => ({ ...d, consumption: stats.consumption ? String(stats.consumption) : d.consumption, fuelPrice: last ? String(last.price_per_liter) : d.fuelPrice }));
    setFilled(true);
    toast.success(stats.consumption || last ? 'Подставлены данные вашего автомобиля' : 'Пока нет заправок — заполните вручную');
  };
  const reset = () => { setDraft(toDraft({ termMonths: 60 })); setName(''); setEditId(null); setFilled(false); };

  const saveScenario = async () => {
    if (!name.trim()) return toast.error('Введите название варианта, например «Toyota Corolla 2018»');
    try {
      await save.mutateAsync({ id: editId ?? undefined, name: name.trim(), kind: 'car', params });
      toast.success('Вариант сохранён');
      if (!editId) reset();
    } catch (e) { toast.error(friendlyError(e, 'Не удалось сохранить вариант')); }
  };
  const load = (s: Scenario<CarScenarioParams>) => { setDraft(toDraft(s.params)); setName(s.name); setEditId(s.id); setMode('calc'); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const remove = async (s: Scenario) => {
    if (!(await confirm({ title: `Удалить вариант «${s.name}»?`, confirmText: 'Удалить', danger: true }))) return;
    try { await del.mutateAsync(s.id); setPicked(p => p.filter(x => x !== s.id)); if (editId === s.id) reset(); toast.success('Вариант удалён'); } catch (e) { toast.error(friendlyError(e, 'Не удалось удалить вариант')); }
  };
  const toggle = (id: string) => setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : p.length >= 4 ? p : [...p, id]));
  const chosen = picked.map(id => mine.find(s => s.id === id)).filter((s): s is Scenario<CarScenarioParams> => !!s);

  return (
    <div className="animate-fade-in">
      <PageHeader title="Автокалькулятор" subtitle="Сколько на самом деле стоит владеть автомобилем" actions={<Segmented value={mode} onChange={setMode} options={[{ value: 'calc', label: 'Расчёт' }, { value: 'compare', label: 'Сравнение' }]} />} />
      {scenarios.error ? <ErrorState onRetry={() => void scenarios.refetch()} /> : scenarios.isLoading ? <Skeleton className="h-64" /> : mode === 'calc' ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
          <Card className="p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">{editId ? 'Изменение варианта' : 'Параметры'}</h2>
              <div className="flex gap-2">
                {current && <Button size="sm" onClick={fillFromMyCar}>Взять расход и цену топлива из «{current.name}»</Button>}
                <Button size="sm" variant="ghost" onClick={reset}>Очистить</Button>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {FIELDS.map(f => <NumField key={f.key} label={f.label} suffix={f.suffix} hint={f.hint} value={draft[f.key]} onChange={set(f.key)} />)}
            </div>
            {filled && <p className="mt-3 text-xs text-muted">Расход {stats.consumption ? `${stats.consumption} л/100 км` : '—'} рассчитан по вашим заправкам. Его можно поправить.</p>}
          </Card>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Всего в месяц" value={money(result.totalMonthly)} className="col-span-2" />
              <Stat label="Платёж по кредиту" value={result.loanPayment ? money(result.loanPayment) : '—'} />
              <Stat label="Содержание" value={money(result.runningMonthly)} sub="в месяц" />
              <Stat label="Переплата" value={result.overpayment ? money(result.overpayment) : '—'} />
              <Stat label="Стоимость за срок" value={money(result.totalCost)} sub={`${result.horizonMonths} мес.`} />
            </div>
            <Card className="p-4">
              <Field label="Название варианта">{id => <Input id={id} value={name} onChange={e => setName(e.target.value)} placeholder="Toyota Corolla 2018" maxLength={80} />}</Field>
              <div className="mt-3 flex gap-2">
                <Button variant="primary" className="flex-1" onClick={() => void saveScenario()} disabled={save.isPending}><Save size={16} /> {editId ? 'Обновить' : 'Сохранить вариант'}</Button>
                {editId && <Button onClick={reset}><Plus size={16} /> Новый</Button>}
              </div>
            </Card>
          </div>
          <Card className="lg:col-span-2">
            <CardHeader title="Сохранённые варианты" />
            {mine.length === 0 ? <EmptyState icon={<Calculator size={20} />} title="Вариантов пока нет" text="Посчитайте и сохраните несколько автомобилей, чтобы сравнить их рядом." /> : (
              <ul className="mt-1 divide-y divide-line">
                {mine.map(s => (
                  <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                    <button className="min-w-0 flex-1 text-left" onClick={() => load(s)}><p className="truncate text-sm font-medium">{s.name}</p>
                      <p className="text-xs text-muted">{money(s.params.price)} · {money(calcOwnership({ ...emptyScenario, ...s.params }).totalMonthly)}/мес · {fmtDate(s.created_at.slice(0, 10))}</p></button>
                    <Button variant="ghost" size="icon" aria-label={`Удалить вариант ${s.name}`} onClick={() => void remove(s)}><Trash2 size={14} /></Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      ) : (
        <div className="space-y-4">
          <Card className="p-4">
            <p className="mb-3 text-sm text-muted">Выберите от 2 до 4 вариантов. Мы покажем цифры рядом — решение остаётся за вами.</p>
            {mine.length === 0 ? <EmptyState title="Нет сохранённых вариантов" text="Сначала рассчитайте и сохраните хотя бы два автомобиля." action="К расчёту" onAction={() => setMode('calc')} /> : (
              <div className="flex flex-wrap gap-2">
                {mine.map(s => (
                  <label key={s.id} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${picked.includes(s.id) ? 'border-accent/70 bg-accent/10' : 'border-line'}`}>
                    <input type="checkbox" className="accent-[hsl(var(--accent))]" checked={picked.includes(s.id)} onChange={() => toggle(s.id)} disabled={!picked.includes(s.id) && picked.length >= 4} /> {s.name}
                  </label>
                ))}
              </div>
            )}
          </Card>
          {chosen.length >= 2 && (
            <Card className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead><tr className="border-b border-line text-left"><th className="px-4 py-3 font-medium text-muted"></th>{chosen.map(s => <th key={s.id} className="px-4 py-3 font-semibold">{s.name}</th>)}</tr></thead>
                <tbody>
                  {ROWS.map(r => (
                    <tr key={r.label} className="border-b border-line/60 last:border-0">
                      <th scope="row" className="px-4 py-2.5 text-left font-normal text-muted">{r.label}</th>
                      {chosen.map(s => { const p = { ...emptyScenario, ...s.params }; return <td key={s.id} className="tabular px-4 py-2.5">{r.value(p, calcOwnership(p))}</td>; })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
          {chosen.length === 1 && <p className="text-sm text-muted">Выберите ещё хотя бы один вариант.</p>}
        </div>
      )}
    </div>
  );
}
