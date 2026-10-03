import { useState } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/dialog';
import { Field, Input, Select, Switch } from '@/components/ui/form';
import { Panel } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import type { SalaryPaymentType, SalaryProfile, SalaryScheduleType } from '@/types/salary';

interface Props {
  profiles: SalaryProfile[];
  onSaveProfile: (profile: Partial<SalaryProfile>) => Promise<unknown>;
  onDeleteProfile: (id: string) => Promise<unknown>;
}

export function SalarySettingsTab({ profiles, onSaveProfile, onDeleteProfile }: Props) {
  const toast = useToast();
  const confirm = useConfirm();

  const [selectedId, setSelectedId] = useState<string>(profiles[0]?.id || '');
  const active = profiles.find(p => p.id === selectedId) || profiles[0];

  const [name, setName] = useState(active?.name || '');
  const [scheduleType, setScheduleType] = useState<SalaryScheduleType>(active?.schedule_type || '5/2');
  const [paymentType, setPaymentType] = useState<SalaryPaymentType>(active?.payment_type || 'hourly');
  const [hoursPerDay, setHoursPerDay] = useState(String(active?.hours_per_day || 8));
  const [startDate, setStartDate] = useState(active?.start_date || '2026-09-01');
  const [probationEndDate, setProbationEndDate] = useState(active?.probation_end_date || '');
  const [isActive, setIsActive] = useState(active?.active !== false);

  // Settings json fields
  const [hourlyRate, setHourlyRate] = useState(String(active?.settings?.hourly_rate || 497));
  const [probationRate, setProbationRate] = useState(String(active?.settings?.probation_rate || 442));
  const [holidayMultiplier, setHolidayMultiplier] = useState(String(active?.settings?.holiday_rate_multiplier || 1.0));
  const [overtimeMultiplier, setOvertimeMultiplier] = useState(String(active?.settings?.overtime_rate_multiplier || 1.0));

  // Girl 2/2 piecework settings
  const [basePay, setBasePay] = useState(String(active?.settings?.base_pay || 2415));
  const [holidayPay, setHolidayPay] = useState(String(active?.settings?.holiday_pay || 4600));
  const [casePrice, setCasePrice] = useState(String(active?.settings?.case_price || 7));
  const [piecePercent, setPiecePercent] = useState(String(active?.settings?.piece_percent || 25));
  const [scheduleStart, setScheduleStart] = useState(active?.settings?.schedule_start || active?.start_date || '2026-01-01');
  const [monthlyGoal, setMonthlyGoal] = useState(String(active?.settings?.monthly_goal || 60000));

  const [advanceDay, setAdvanceDay] = useState(String(active?.settings?.advance_day || 25));
  const [salaryDay, setSalaryDay] = useState(String(active?.settings?.salary_day || 10));

  const [saving, setSaving] = useState(false);

  const selectProfile = (p: SalaryProfile) => {
    setSelectedId(p.id);
    setName(p.name);
    setScheduleType(p.schedule_type);
    setPaymentType(p.payment_type);
    setHoursPerDay(String(p.hours_per_day || 8));
    setStartDate(p.start_date || '2026-09-01');
    setProbationEndDate(p.probation_end_date || '');
    setIsActive(p.active !== false);

    setHourlyRate(String(p.settings?.hourly_rate || 497));
    setProbationRate(String(p.settings?.probation_rate || 442));
    setHolidayMultiplier(String(p.settings?.holiday_rate_multiplier || 1.0));
    setOvertimeMultiplier(String(p.settings?.overtime_rate_multiplier || 1.0));

    setBasePay(String(p.settings?.base_pay || 2415));
    setHolidayPay(String(p.settings?.holiday_pay || 4600));
    setCasePrice(String(p.settings?.case_price || 7));
    setPiecePercent(String(p.settings?.piece_percent || 25));
    setScheduleStart(p.settings?.schedule_start || p.start_date || '2026-01-01');
    setMonthlyGoal(String(p.settings?.monthly_goal || 60000));

    setAdvanceDay(String(p.settings?.advance_day || 25));
    setSalaryDay(String(p.settings?.salary_day || 10));
  };

  const handleAddNew = () => {
    setSelectedId('');
    setName('Новый источник дохода');
    setScheduleType('5/2');
    setPaymentType('hourly');
    setHoursPerDay('8');
    setStartDate('2026-10-01');
    setProbationEndDate('');
    setIsActive(true);
    setHourlyRate('500');
    setProbationRate('450');
    setHolidayMultiplier('1.0');
    setOvertimeMultiplier('1.0');
    setAdvanceDay('25');
    setSalaryDay('10');
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Введите название профиля');
      return;
    }
    setSaving(true);
    try {
      const payload: Partial<SalaryProfile> = {
        id: selectedId || undefined,
        name: name.trim(),
        schedule_type: scheduleType,
        payment_type: paymentType,
        hours_per_day: parseFloat(hoursPerDay) || 8,
        start_date: startDate,
        probation_end_date: probationEndDate ? probationEndDate : null,
        active: isActive,
        settings: {
          ...active?.settings,
          hourly_rate: parseFloat(hourlyRate) || 0,
          probation_rate: parseFloat(probationRate) || 0,
          holiday_rate_multiplier: parseFloat(holidayMultiplier) || 1.0,
          overtime_rate_multiplier: parseFloat(overtimeMultiplier) || 1.0,
          base_pay: parseFloat(basePay) || 2415,
          holiday_pay: parseFloat(holidayPay) || 4600,
          case_price: parseFloat(casePrice) || 7,
          piece_percent: parseFloat(piecePercent) || 25,
          schedule_start: scheduleStart,
          monthly_goal: parseFloat(monthlyGoal) || 60000,
          advance_day: parseInt(advanceDay, 10) || 25,
          salary_day: parseInt(salaryDay, 10) || 10,
        },
      };

      await onSaveProfile(payload);
      toast.success('Настройки профиля сохранены');
    } catch (err) {
      console.error(err);
      toast.error('Не удалось сохранить настройки профиля');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    if (!(await confirm({ title: `Удалить профиль «${name}»?`, confirmText: 'Удалить', danger: true }))) return;
    try {
      await onDeleteProfile(selectedId);
      toast.success('Профиль удалён');
      if (profiles.length > 1) {
        selectProfile(profiles.find(p => p.id !== selectedId) || profiles[0]);
      }
    } catch (err) {
      console.error(err);
      toast.error('Не удалось удалить профиль');
    }
  };

  const isPiecework = paymentType === 'piecework';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {profiles.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => selectProfile(p)}
              className={`rounded-[2px] border px-3 py-1.5 text-[12.5px] transition-colors ${
                p.id === selectedId
                  ? 'border-amber bg-amber/15 text-amber'
                  : 'border-line bg-panel text-dim hover:border-engrave hover:text-txt'
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>

        <Button variant="outline" size="sm" onClick={handleAddNew}>
          <Plus size={14} /> Добавить источник дохода
        </Button>
      </div>

      <Panel label={`Настройки · ${name || 'Новый профиль'}`} screw>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Название">
            {id => <Input id={id} value={name} onChange={e => setName(e.target.value)} />}
          </Field>

          <Field label="График работы">
            {id => (
              <Select id={id} value={scheduleType} onChange={e => setScheduleType(e.target.value as SalaryScheduleType)}>
                <option value="5/2">5/2 (5 рабочих, 2 выходных)</option>
                <option value="2/2">2/2 (2 рабочих смены, 2 выходных)</option>
                <option value="custom">Пользовательский график</option>
              </Select>
            )}
          </Field>

          <Field label="Тип оплаты">
            {id => (
              <Select id={id} value={paymentType} onChange={e => setPaymentType(e.target.value as SalaryPaymentType)}>
                <option value="hourly">Почасовая (час × ставка)</option>
                <option value="piecework">Сдельная (выход + чехлы)</option>
                <option value="fixed">Фиксированный оклад</option>
                <option value="mixed">Смешанная</option>
              </Select>
            )}
          </Field>

          <Field label="Продолжительность смены, часов">
            {id => <Input id={id} type="number" step="0.5" value={hoursPerDay} onChange={e => setHoursPerDay(e.target.value)} />}
          </Field>

          <Field label="Дата начала работы">
            {id => <Input id={id} type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />}
          </Field>

          <Field label="Дата окончания испытательного срока" hint="Оставьте пустым, если нет">
            {id => <Input id={id} type="date" value={probationEndDate} onChange={e => setProbationEndDate(e.target.value)} />}
          </Field>
        </div>

        {/* ---------------- Rates section ---------------- */}
        <div className="mt-6 border-t border-line pt-4">
          <h4 className="silk mb-3 text-txt">Ставки и коэффициенты</h4>

          {!isPiecework ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Основная ставка, ₽/час" hint="После испытательного (497 ₽)">
                {id => <Input id={id} type="number" value={hourlyRate} onChange={e => setHourlyRate(e.target.value)} />}
              </Field>

              <Field label="Ставка испытательного срока, ₽/час" hint="На испытательном (442 ₽)">
                {id => <Input id={id} type="number" value={probationRate} onChange={e => setProbationRate(e.target.value)} />}
              </Field>

              <Field label="Коэффициент сверхурочных" hint="По умолчанию 1.0">
                {id => <Input id={id} type="number" step="0.1" value={overtimeMultiplier} onChange={e => setOvertimeMultiplier(e.target.value)} />}
              </Field>

              <Field label="Праздничный коэффициент" hint="По умолчанию 1.0">
                {id => <Input id={id} type="number" step="0.1" value={holidayMultiplier} onChange={e => setHolidayMultiplier(e.target.value)} />}
              </Field>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Оплата выхода за смену, ₽" hint="По умолчанию 2415 ₽">
                {id => <Input id={id} type="number" value={basePay} onChange={e => setBasePay(e.target.value)} />}
              </Field>

              <Field label="Праздничный выход, ₽" hint="По умолчанию 4600 ₽">
                {id => <Input id={id} type="number" value={holidayPay} onChange={e => setHolidayPay(e.target.value)} />}
              </Field>

              <Field label="Ставка за чехол, ₽" hint="По умолчанию 7 ₽">
                {id => <Input id={id} type="number" step="0.1" value={casePrice} onChange={e => setCasePrice(e.target.value)} />}
              </Field>

              <Field label="Процент от ставки чехла, %" hint="По умолчанию 25%">
                {id => <Input id={id} type="number" value={piecePercent} onChange={e => setPiecePercent(e.target.value)} />}
              </Field>

              <Field label="Опорная дата 2/2" hint="Первый рабочий день цикла">
                {id => <Input id={id} type="date" value={scheduleStart} onChange={e => setScheduleStart(e.target.value)} />}
              </Field>

              <Field label="Цель на месяц, ₽" hint="Например 60 000 ₽">
                {id => <Input id={id} type="number" value={monthlyGoal} onChange={e => setMonthlyGoal(e.target.value)} />}
              </Field>
            </div>
          )}
        </div>

        {/* ---------------- Payout calendar days ---------------- */}
        <div className="mt-6 border-t border-line pt-4">
          <h4 className="silk mb-3 text-txt">Дни выплаты (для Cash Flow и календаря)</h4>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="День аванса (текущего месяца)" hint="Обычно 23-25 число">
              {id => <Input id={id} type="number" min="1" max="31" value={advanceDay} onChange={e => setAdvanceDay(e.target.value)} />}
            </Field>

            <Field label="День окончательного расчёта" hint="Обычно 8-10 число следующего месяца">
              {id => <Input id={id} type="number" min="1" max="31" value={salaryDay} onChange={e => setSalaryDay(e.target.value)} />}
            </Field>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <div className="flex items-center gap-3">
            <Switch checked={isActive} onChange={setIsActive} label="Профиль активен" />
            <span className="text-[12.5px] text-dim">{isActive ? 'Профиль учитывается в расчётах' : 'Отключён'}</span>
          </div>

          <div className="flex items-center gap-2">
            {selectedId && profiles.length > 1 && (
              <Button variant="danger" onClick={() => void handleDelete()}>
                <Trash2 size={15} /> Удалить профиль
              </Button>
            )}
            <Button variant="primary" onClick={() => void handleSave()} disabled={saving}>
              <Save size={15} /> Сохранить профиль
            </Button>
          </div>
        </div>
      </Panel>
    </div>
  );
}
