import { Calculator, Plus, Save, Trash2, Wand2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button, IconButton } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/dialog';
import { Field, Input, Segmented } from '@/components/ui/form';
import { DataTable, EmptyState, ErrorState, PageHeader, Panel, PanelLink, Readout, Skeleton, Stat } from '@/components/ui/misc';
import { codeFor } from '@/features/layout/nav';
import { useToast } from '@/components/ui/toast';
import { useDeleteRow, useRows, useSaveRow } from '@/data/hooks';
import { useCurrentCar } from '@/features/cars/useCars';
import { calcOwnership, emptyScenario, fuelStats } from '@/lib/calc';
import { friendlyError } from '@/lib/errors';
import { fmtDate, money, num } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { CarScenarioParams, Scenario } from '@/types';
import { asText, NumField } from './NumField';

type Draft = Record<keyof CarScenarioParams, string>;
interface CompareRow {
  label: string;
  strong: boolean;
  value: (s: Scenario<CarScenarioParams>) => string;
}
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

const toDraft = (p: Partial<CarScenarioParams>): Draft => Object.fromEntries(FIELDS.map(f => [f.key, asText(p[f.key])])) as Draft;
const toParams = (d: Draft): CarScenarioParams => ({
  ...emptyScenario,
  ...(Object.fromEntries(FIELDS.map(f => [f.key, Math.max(0, num(d[f.key]))])) as unknown as CarScenarioParams),
});

const ROWS: Array<{ label: string; value: (p: CarScenarioParams, o: ReturnType<typeof calcOwnership>) => string; strong?: boolean }> = [
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
  { label: 'Всего в месяц', value: (_, o) => money(o.totalMonthly), strong: true },
  { label: 'Полная стоимость за срок', value: (_, o) => money(o.totalCost), strong: true },
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
    setDraft(d => ({
      ...d,
      consumption: stats.consumption ? String(stats.consumption) : d.consumption,
      fuelPrice: last ? String(last.price_per_liter) : d.fuelPrice,
    }));
    setFilled(true);
    toast.success(stats.consumption || last ? 'Подставлены данные вашего автомобиля' : 'Пока нет заправок — заполните вручную');
  };
  const reset = () => {
    setDraft(toDraft({ termMonths: 60 }));
    setName('');
    setEditId(null);
    setFilled(false);
  };

  const saveScenario = async () => {
    if (!name.trim()) return toast.error('Введите название варианта, например «Toyota Corolla 2018»');
    try {
      await save.mutateAsync({ id: editId ?? undefined, name: name.trim(), kind: 'car', params });
      toast.success('Вариант сохранён');
      if (!editId) reset();
    } catch (e) {
      toast.error(friendlyError(e, 'Не удалось сохранить вариант'));
    }
  };
  const load = (s: Scenario<CarScenarioParams>) => {
    setDraft(toDraft(s.params));
    setName(s.name);
    setEditId(s.id);
    setMode('calc');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const remove = async (s: Scenario) => {
    if (!(await confirm({ title: `Удалить вариант «${s.name}»?`, confirmText: 'Удалить', danger: true }))) return;
    try {
      await del.mutateAsync(s.id);
      setPicked(p => p.filter(x => x !== s.id));
      if (editId === s.id) reset();
      toast.success('Вариант удалён');
    } catch (e) {
      toast.error(friendlyError(e, 'Не удалось удалить вариант'));
    }
  };
  const toggle = (id: string) => setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : p.length >= 4 ? p : [...p, id]));
  const chosen = picked.map(id => mine.find(s => s.id === id)).filter((s): s is Scenario<CarScenarioParams> => !!s);

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Автокалькулятор"
        code={codeFor('/calc')}
        subtitle="Сколько на самом деле стоит владеть автомобилем — кредит, топливо, страховка и ремонт"
        actions={
          <Segmented
            ariaLabel="Режим калькулятора"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'calc', label: 'Расчёт' },
              { value: 'compare', label: 'Сравнение' },
            ]}
          />
        }
      />

      {scenarios.error ? (
        <ErrorState onRetry={() => void scenarios.refetch()} />
      ) : scenarios.isLoading ? (
        <Skeleton className="h-72" />
      ) : mode === 'calc' ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Panel
            label={editId ? 'Изменение варианта' : 'Параметры'}
            right={
              <div className="flex flex-wrap items-center gap-1.5">
                {current && (
                  <Button size="sm" variant="outline" onClick={fillFromMyCar}>
                    <Wand2 size={14} /> Из «{current.name}»
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={reset}>
                  Очистить
                </Button>
              </div>
            }
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {FIELDS.map(f => (
                <NumField key={f.key} label={f.label} suffix={f.suffix} hint={f.hint} value={draft[f.key]} onChange={set(f.key)} />
              ))}
            </div>
            {filled && (
              <p className="mt-3 text-[11.5px] text-mute">
                Расход {stats.consumption ? `${stats.consumption} л/100 км` : '—'} рассчитан по вашим заправкам. Его можно поправить.
              </p>
            )}
          </Panel>

          <div className="space-y-4">
            <div className="panel px-4 py-3.5">
              <p className="silk">Всего в месяц</p>
              <Readout value={result.totalMonthly} size="xl" tone="amber" className="mt-2" />
              <p className="mt-1 text-[11px] text-mute">за {result.horizonMonths} мес. — {money(result.totalCost)}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Stat label="Платёж по кредиту" value={result.loanPayment ? money(result.loanPayment) : '—'} sub="в месяц" />
              <Stat label="Содержание" value={money(result.runningMonthly)} sub="в месяц" />
              <Stat label="Переплата" value={result.overpayment ? money(result.overpayment) : '—'} tone={result.overpayment ? 'bad' : undefined} sub="по процентам" />
              <Stat label="Топливо" value={money(result.fuelMonthly)} tone="accent" sub={`${params.monthlyKm} км/мес`} />
            </div>

            <Panel label="Сохранить вариант">
              <Field label="Название">
                {id => <Input id={id} value={name} onChange={e => setName(e.target.value)} placeholder="Toyota Corolla 2018" maxLength={80} />}
              </Field>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="primary" className="flex-1" onClick={() => void saveScenario()} disabled={save.isPending}>
                  <Save size={16} /> {editId ? 'Обновить' : 'Сохранить'}
                </Button>
                {editId && (
                  <Button variant="outline" onClick={reset}>
                    <Plus size={16} /> Новый
                  </Button>
                )}
              </div>
            </Panel>
          </div>

          <Panel label={`Сохранённые варианты · ${mine.length}`} className="lg:col-span-2 p-0 pb-0">
            {mine.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  icon={<Calculator size={18} />}
                  title="Вариантов пока нет"
                  text="Посчитайте и сохраните несколько автомобилей, чтобы сравнить их рядом."
                />
              </div>
            ) : (
              <ul>
                {mine.map(s => (
                  <li key={s.id} className="group flex items-center gap-3 border-b border-line/70 px-4 py-3 last:border-b-0">
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => load(s)}>
                      <p className="truncate text-[13px] font-medium text-txt">{s.name}</p>
                      <p className="tnum mt-0.5 text-[11px] text-mute">
                        {money(s.params.price)} · {money(calcOwnership({ ...emptyScenario, ...s.params }).totalMonthly)}/мес · {fmtDate(s.created_at.slice(0, 10))}
                      </p>
                    </button>
                    <Button size="sm" variant="outline" className="shrink-0" onClick={() => load(s)}>
                      Загрузить
                    </Button>
                    <IconButton label={`Удалить вариант ${s.name}`} size="icon-sm" className="shrink-0" onClick={() => void remove(s)}>
                      <Trash2 size={14} />
                    </IconButton>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      ) : (
        <div className="space-y-4">
          <Panel label="Что сравниваем">
            <p className="text-[12px] text-dim">Выберите от 2 до 4 вариантов. Мы покажем цифры рядом — решение остаётся за вами.</p>
            {mine.length === 0 ? (
              <div className="mt-3">
                <EmptyState
                  title="Нет сохранённых вариантов"
                  text="Сначала рассчитайте и сохраните хотя бы два автомобиля."
                  action="К расчёту"
                  onAction={() => setMode('calc')}
                />
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {mine.map(s => (
                  <label
                    key={s.id}
                    className={cn(
                      'flex min-h-[44px] cursor-pointer items-center gap-2 border px-3 py-2 text-[12.5px] transition-colors',
                      picked.includes(s.id) ? 'border-amber/60 bg-amber/[0.07] text-txt' : 'border-line text-dim hover:text-txt',
                    )}
                  >
                    <input
                      type="checkbox"
                      className="h-[16px] w-[16px] rounded-[2px] accent-[#F0A828]"
                      checked={picked.includes(s.id)}
                      onChange={() => toggle(s.id)}
                      disabled={!picked.includes(s.id) && picked.length >= 4}
                    />
                    {s.name}
                  </label>
                ))}
              </div>
            )}
            {chosen.length === 1 && <p className="mt-3 text-[11.5px] text-mute">Выберите ещё хотя бы один вариант.</p>}
          </Panel>

          {chosen.length >= 2 && (
            <Panel label="Сравнение">
              <DataTable<CompareRow>
                label="Сравнение автомобилей"
                minWidth={520}
                rows={ROWS.map(r => ({ label: r.label, strong: !!r.strong, value: (s: Scenario<CarScenarioParams>) => {
                  const p = { ...emptyScenario, ...s.params };
                  return r.value(p, calcOwnership(p));
                } }))}
                rowKey={r => r.label}
                isRowStrong={r => r.strong}
                columns={[
                  { key: 'metric', header: 'Показатель', rowHeader: true, value: r => r.label },
                  ...chosen.map(s => ({ key: s.id, header: s.name, value: (r: CompareRow) => r.value(s) })),
                ]}
              />
            </Panel>
          )}

          <p className="text-[11.5px] text-mute">
            Нужен сценарий «что если» — доход, долги и покупка вместе? Откройте <PanelLink to="/whatif">What-if →</PanelLink>
          </p>
        </div>
      )}
    </div>
  );
}
