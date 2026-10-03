import { useMemo, useState } from 'react';
import { ShieldCheck, ShieldAlert } from 'lucide-react';
import { LineChart } from '@/components/charts/charts';
import { Button } from '@/components/ui/button';
import { Field, MoneyInput, Segmented } from '@/components/ui/form';
import { EmptyState, ErrorState, Panel, PanelLink, Skeleton, Stat } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { useCashFlowForecast } from '@/features/overview/useCashFlowForecast';
import { CASH_FLOW_HORIZONS, type CashFlowStatus } from '@/lib/calc';
import { fmtDate, fmtDateShort, money, plural } from '@/lib/format';
import { friendlyError } from '@/lib/errors';
import type { ProfileSettings } from '@/types';

const HORIZON_OPTIONS = [
  { value: 7, label: '7 дней' },
  { value: 30, label: '30 дней' },
  { value: 90, label: '3 месяца' },
  { value: 180, label: '6 месяцев' },
  { value: 365, label: '1 год' },
  { value: 730, label: '2 года' },
] as const;

const STATUS: Record<CashFlowStatus, { label: string; className: string }> = {
  safe: { label: 'Запас выше минимума', className: 'text-cyan' },
  attention: { label: 'Ниже безопасного минимума', className: 'text-amber' },
  risk: { label: 'Прогнозируется дефицит', className: 'text-red' },
  unset: { label: 'Безопасный минимум не задан', className: 'text-mute' },
};

function parseMoneyInput(value: string): number | null {
  const normalized = value.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^[+-]?\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && Math.abs(parsed) < 1_000_000_000_000 ? parsed : null;
}

function BalanceSettings({
  settings,
  configured,
  saving,
  onSave,
}: {
  settings: ProfileSettings;
  configured: boolean;
  saving: boolean;
  onSave: (current: string, safe: string) => Promise<void>;
}) {
  const [current, setCurrent] = useState<string | null>(null);
  const [safe, setSafe] = useState<string | null>(null);
  const currentValue = current ?? (configured ? String(settings.current_balance) : '');
  const safeValue = safe ?? (typeof settings.minimum_safe_balance === 'number' ? String(settings.minimum_safe_balance) : '');

  return (
    <form
      className="space-y-3"
      onSubmit={event => {
        event.preventDefault();
        void onSave(currentValue, safeValue);
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Текущий доступный остаток, ₽"
          hint="Введите сумму по всем счетам и наличным. Это не рассчитывается из операций."
        >
          {id => <MoneyInput id={id} value={currentValue} onChange={event => setCurrent(event.target.value)} aria-label="Текущий доступный остаток" />}
        </Field>
        <Field label="Безопасный минимум, ₽" hint="Необязательно. Оставьте пустым, чтобы не задавать порог.">
          {id => <MoneyInput id={id} value={safeValue} onChange={event => setSafe(event.target.value)} aria-label="Безопасный минимум" />}
        </Field>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[58ch] text-[11px] leading-relaxed text-mute">
          Остаток и минимум хранятся в настройках вашего профиля Supabase и доступны только этому аккаунту.
        </p>
        <Button type="submit" variant="outline" size="sm" disabled={saving || !currentValue.trim()}>
          {saving ? 'Сохраняем…' : 'Сохранить баланс'}
        </Button>
      </div>
    </form>
  );
}

export function CashFlowForecastPanel() {
  const [horizon, setHorizon] = useState<(typeof CASH_FLOW_HORIZONS)[number]>(90);
  const data = useCashFlowForecast(horizon);
  const toast = useToast();
  const { forecast } = data;
  const profileSettings = data.settings as ProfileSettings;
  const status = STATUS[forecast.status];

  const saveBalance = async (currentInput: string, safeInput: string) => {
    const currentBalance = parseMoneyInput(currentInput);
    if (currentBalance === null) return toast.error('Введите корректный текущий остаток (до двух знаков после запятой).');
    const safeBalance = safeInput.trim() ? parseMoneyInput(safeInput) : null;
    if (safeInput.trim() && safeBalance === null) return toast.error('Введите корректный безопасный минимум.');
    if (safeBalance !== null && safeBalance < 0) return toast.error('Безопасный минимум не может быть отрицательным.');

    const nextSettings: ProfileSettings = { ...(data.profile?.settings ?? {}), current_balance: currentBalance };
    if (safeBalance === null) delete nextSettings.minimum_safe_balance;
    else nextSettings.minimum_safe_balance = safeBalance;

    try {
      await data.saveProfile.mutateAsync({ settings: nextSettings });
      toast.success('Баланс и безопасный минимум сохранены');
    } catch (error) {
      toast.error(friendlyError(error, 'Не удалось сохранить баланс'));
    }
  };

  const chartPoints = useMemo(() => {
    const lastIndex = forecast.points.length - 1;
    const stride = Math.max(1, Math.ceil(lastIndex / 100));
    const selected = forecast.points.filter((_, index) => index % stride === 0 || index === lastIndex);
    return selected.map(point => ({
      x: forecast.points.indexOf(point),
      label: fmtDateShort(point.date),
      y: point.balance,
    }));
  }, [forecast.points]);

  if (data.loading) return <Skeleton className="h-80" />;
  if (data.error) return <ErrorState onRetry={() => void data.refetch()} />;

  return (
    <div className="space-y-4">
      <Panel label="Текущий остаток и безопасный минимум">
        <BalanceSettings
          settings={profileSettings}
          configured={data.configured}
          saving={data.saveProfile.isPending}
          onSave={saveBalance}
        />
      </Panel>

      {!data.configured ? (
        <Panel>
          <EmptyState
            icon={<ShieldAlert size={17} />}
            title="Сначала задайте текущий остаток"
            text="Свободный поток за месяц не равен деньгам на счетах. Прогноз начнётся с вручную указанной суммы и не будет подменять её историческими операциями."
          />
        </Panel>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-[62ch] text-[11.5px] leading-relaxed text-mute">
              Детерминированный прогноз по запланированным платежам, долгам, целям и средней стоимости текущего автомобиля. Это сценарий, а не гарантия будущего остатка.
            </p>
            <Segmented
              ariaLabel="Горизонт прогноза денежного потока"
              value={String(horizon)}
              onChange={value => setHorizon(Number(value) as (typeof CASH_FLOW_HORIZONS)[number])}
              options={HORIZON_OPTIONS.map(option => ({ value: String(option.value), label: option.label }))}
              className="w-full sm:w-auto sm:max-w-full"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat label="Текущий остаток" value={money(forecast.currentBalance)} />
            <Stat
              label={`Минимум за ${horizon <= 30 ? `${horizon} ${plural(horizon, ['день', 'дня', 'дней'])}` : `${Math.round(horizon / 30)} мес.`}`}
              value={money(forecast.lowestBalance)}
              sub={fmtDate(forecast.lowestBalanceDate)}
              tone={forecast.lowestBalance < 0 ? 'bad' : forecast.minimumSafeBalance !== null && forecast.lowestBalance < forecast.minimumSafeBalance ? 'warn' : 'good'}
            />
            <Stat label="Остаток в конце" value={money(forecast.endingBalance)} tone={forecast.endingBalance < 0 ? 'bad' : undefined} />
          </div>

          <Panel
            label="Баланс по дням"
            right={
              <span className={`silk-b flex items-center gap-1.5 ${status.className}`}>
                {forecast.status === 'safe' ? <ShieldCheck size={13} /> : <ShieldAlert size={13} />}
                {status.label}
              </span>
            }
          >
            <LineChart
              points={chartPoints}
              ariaLabel="Прогноз доступного денежного остатка"
              tone={forecast.lowestBalance < 0 ? 'accent' : 'good'}
              height={200}
            />
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[10.5px] text-mute">
              {forecast.minimumSafeBalance !== null && <span>Минимум: {money(forecast.minimumSafeBalance)}</span>}
              {forecast.firstUnsafeDate && <span>Первое пересечение порога: {fmtDate(forecast.firstUnsafeDate)}</span>}
              {forecast.minimumSafeBalance === null && <span>Задайте безопасный минимум для предупреждений.</span>}
            </div>
          </Panel>

          <Panel label="События прогноза">
            {forecast.events.length ? (
              <ul className="divide-y divide-line/70">
                {forecast.events.slice(0, 8).map(event => (
                  <li key={event.id} className="flex min-h-11 items-center gap-3 py-2">
                    <span className="tnum w-[76px] shrink-0 text-[10.5px] text-mute">{fmtDate(event.date)}</span>
                    <span className="min-w-0 flex-1 truncate text-[12px] text-txt">{event.title}</span>
                    <span className={`tnum shrink-0 text-[12px] ${event.amount < 0 ? 'text-red' : 'text-cyan'}`}>
                      {money(event.amount, { sign: true })}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[12px] text-mute">На выбранный период запланированных денежных событий нет.</p>
            )}
            {forecast.events.length > 8 && <p className="mt-2 text-[10.5px] text-mute">Показаны первые 8 из {forecast.events.length} событий.</p>}
            {(forecast.assumptions.debtsWithoutSchedule > 0 || forecast.assumptions.goalsWithoutDeadline > 0) && (
              <p className="mt-3 border-t border-line pt-3 text-[10.5px] leading-relaxed text-amber">
                {forecast.assumptions.debtsWithoutSchedule > 0 && `${forecast.assumptions.debtsWithoutSchedule} долгов без даты платежа не включены в календарь. `}
                {forecast.assumptions.goalsWithoutDeadline > 0 && `${forecast.assumptions.goalsWithoutDeadline} целей без будущего срока не распределены по датам.`}
              </p>
            )}
            {forecast.assumptions.estimatedCarMonthly > 0 && (
              <p className="mt-3 border-t border-line pt-3 text-[10.5px] leading-relaxed text-mute">
                Автомобиль учтён по средним подтверждённым расходам за {forecast.assumptions.carObservationDays} {plural(forecast.assumptions.carObservationDays, ['день', 'дня', 'дней'])}: {money(forecast.assumptions.estimatedCarMonthly)} в месяц. Это оценка, не запланированный платёж.
              </p>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}

export function CashFlowTodayBanner() {
  const { forecast, configured, loading } = useCashFlowForecast(7);
  if (loading || !configured) return null;
  const status = STATUS[forecast.status];

  return (
    <section className="rise panel mb-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3" aria-label="Прогноз безопасного остатка на неделю">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {forecast.status === 'safe' ? <ShieldCheck size={16} className="shrink-0 text-cyan" /> : <ShieldAlert size={16} className={`shrink-0 ${status.className}`} />}
        <div className="min-w-0">
          <p className="text-[12px] font-medium text-txt">Доступно сейчас: {money(forecast.currentBalance)}</p>
          <p className="silk mt-1 truncate">
            Минимум за 7 дней: {money(forecast.lowestBalance)} · {fmtDate(forecast.lowestBalanceDate)}
            {forecast.firstUnsafeDate ? ` · ниже порога с ${fmtDate(forecast.firstUnsafeDate)}` : ''}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className={`text-[10.5px] ${status.className}`}>{status.label}</span>
        <PanelLink to="/finance">Прогноз →</PanelLink>
      </div>
    </section>
  );
}

export function CashFlowDashboardCard() {
  const { forecast, configured, loading, error, refetch } = useCashFlowForecast(90);
  if (loading) return <Panel label="Денежный прогноз"><Skeleton className="h-20" /></Panel>;
  if (error) return <Panel label="Денежный прогноз"><ErrorState onRetry={() => void refetch()} /></Panel>;

  const status = STATUS[forecast.status];
  return (
    <Panel label="Денежный прогноз" right={<PanelLink to="/finance">Подробнее →</PanelLink>}>
      {!configured ? (
        <p className="text-[12px] leading-relaxed text-mute">Укажите текущий доступный остаток во вкладке «Финансы → Прогноз», чтобы видеть даты возможного снижения ниже безопасного минимума.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="silk">Сейчас доступно</p>
              <p className="disp mt-1 text-[24px] leading-none text-txt">{money(forecast.currentBalance)}</p>
            </div>
            <p className={`flex items-center gap-1.5 text-[11px] ${status.className}`}>
              {forecast.status === 'safe' ? <ShieldCheck size={14} /> : <ShieldAlert size={14} />}
              {status.label}
            </p>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-3">
            <div>
              <p className="silk">Минимум за 3 месяца</p>
              <p className={`tnum mt-1 text-[13px] ${forecast.lowestBalance < 0 ? 'text-red' : 'text-txt'}`}>{money(forecast.lowestBalance)}</p>
              <p className="silk mt-1">{fmtDate(forecast.lowestBalanceDate)}</p>
            </div>
            <div>
              <p className="silk">Остаток через 3 месяца</p>
              <p className={`tnum mt-1 text-[13px] ${forecast.endingBalance < 0 ? 'text-red' : 'text-txt'}`}>{money(forecast.endingBalance)}</p>
            </div>
          </div>
        </>
      )}
    </Panel>
  );
}
