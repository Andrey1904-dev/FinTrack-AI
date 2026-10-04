import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal, useConfirm } from '@/components/ui/dialog';
import { Field, Input, Segmented } from '@/components/ui/form';
import { EmptyState, Panel, Row, Share, Stat } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { salaryToday, useSalaryEntries } from '@/data/useSalary';
import { entriesOfMonth, manualMonthGroups, manualStats } from '@/lib/calc/salary';
import { monthKey, shiftMonthKey } from '@/lib/dates';
import { fmtDateLong, fmtMonth, fmtMonthShort, money, plural } from '@/lib/format';
import type { SalaryEntry, SalaryProfile } from '@/types/salary';

interface Props {
  profiles: SalaryProfile[];
}

/** Context label: whose shifts are being recorded. */
export function zaychikContextLabel(p: SalaryProfile): string {
  const n = p.name.toLowerCase();
  if (n.includes('девушк')) return 'Смены девушки';
  if (n.includes('моя') || p.mode === 'automatic') return 'Мои смены';
  return p.name;
}

/** 🐰 Зайчик — the user types in the amount a shift earned. Nothing else is required. */
export function ZaychikTab({ profiles }: Props) {
  const toast = useToast();
  const confirm = useConfirm();
  const today = salaryToday();
  const { entries, saveEntry, deleteEntry, isLoading } = useSalaryEntries();

  // One shared salary_entries table; the profile is just the owner/context.
  const [profileId, setProfileId] = useState<string>('');
  const activeProfile = profiles.find(p => p.id === profileId) ?? profiles.find(p => p.mode === 'manual') ?? profiles[0] ?? null;

  const [month, setMonth] = useState(() => monthKey(today));
  const [edit, setEdit] = useState<SalaryEntry | 'new' | null>(null);

  const monthEntries = useMemo(
    () => (activeProfile ? entriesOfMonth(entries, month, activeProfile.id) : []),
    [entries, month, activeProfile],
  );
  const stats = useMemo(() => manualStats(monthEntries), [monthEntries]);
  const byMonth = useMemo(
    () => (activeProfile ? manualMonthGroups(entries, activeProfile.id).slice(-6) : []),
    [entries, activeProfile],
  );
  const maxMonthTotal = Math.max(1, ...byMonth.map(g => g.total));

  if (!activeProfile) {
    return <EmptyState title="Нет профилей" text="Профили зарплаты создаются автоматически при первом входе." />;
  }

  const remove = async (entry: SalaryEntry) => {
    const ok = await confirm({
      title: 'Удалить смену?',
      text: `${fmtDateLong(entry.date)} · ${money(entry.amount)}`,
      confirmText: 'Удалить',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteEntry.mutateAsync(entry.id);
      toast.success('Смена удалена');
      setEdit(null);
    } catch (e) {
      console.error(e);
      toast.error('Не удалось удалить смену');
    }
  };

  return (
    <div className="space-y-4">
      {/* Whose shifts: one entries entity, many profiles */}
      {profiles.length > 1 && (
        <Segmented
          ariaLabel="Чьи смены"
          value={activeProfile.id}
          onChange={setProfileId}
          options={profiles.map(p => ({ value: p.id, label: zaychikContextLabel(p) }))}
        />
      )}

      {/* The one big action */}
      <Button variant="primary" block size="lg" onClick={() => setEdit('new')}>
        <Plus size={16} /> Добавить смену
      </Button>

      {/* Month switcher */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 rounded-[2px] border border-line bg-panel px-1 py-1">
          <button
            type="button"
            className="grid h-9 w-9 place-items-center text-mute hover:text-txt"
            onClick={() => setMonth(m => shiftMonthKey(m, -1))}
            aria-label="Предыдущий месяц"
          >
            <ChevronLeft size={17} />
          </button>
          <span className="tnum min-w-[128px] text-center text-[13px] font-semibold text-txt">{fmtMonth(month)}</span>
          <button
            type="button"
            className="grid h-9 w-9 place-items-center text-mute hover:text-txt"
            onClick={() => setMonth(m => shiftMonthKey(m, 1))}
            aria-label="Следующий месяц"
          >
            <ChevronRight size={17} />
          </button>
        </div>
        <span className="silk text-mute">{zaychikContextLabel(activeProfile)}</span>
      </div>

      {/* Shift list */}
      <Panel label={`Смены · ${fmtMonth(month)}`} screw>
        {monthEntries.length === 0 ? (
          <EmptyState
            title={isLoading ? 'Загрузка…' : 'Пока нет смен'}
            text="Нажмите «Добавить смену»: дата и сумма — всё, что нужно."
          />
        ) : (
          <>
            <ul className="divide-y divide-line/60">
              {monthEntries.map(e => (
                <Row as="li" key={e.id} onClick={() => setEdit(e)} className="cursor-pointer">
                  <div className="flex w-full items-center justify-between gap-3 py-0.5">
                    <div className="min-w-0">
                      <p className="text-[13px] text-txt">{fmtDateLong(e.date)}</p>
                      {e.note && <p className="truncate text-[11px] text-mute">{e.note}</p>}
                    </div>
                    <span className="tnum shrink-0 text-[13.5px] font-semibold text-cyan">{money(e.amount)}</span>
                  </div>
                </Row>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 border-t border-line pt-3 text-[12px]">
              <span className="text-mute">
                Смен: <span className="tnum font-semibold text-txt">{stats.count}</span>
              </span>
              <span className="text-mute">
                Заработано: <span className="tnum font-semibold text-cyan">{money(stats.total)}</span>
              </span>
              <span className="text-mute">
                Средняя смена: <span className="tnum font-semibold text-txt">{money(stats.avg)}</span>
              </span>
            </div>
          </>
        )}
      </Panel>

      {/* Simple statistics */}
      {stats.count > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Заработано за месяц" value={money(stats.total)} tone="good" />
          <Stat label="Смен" value={stats.count} />
          <Stat label="Мин. смена" value={money(stats.min)} />
          <Stat label="Макс. смена" value={money(stats.max)} />
        </div>
      )}

      {byMonth.length > 0 && (
        <Panel label="По месяцам" screw>
          <ul className="space-y-2.5">
            {byMonth.map(g => (
              <li key={g.month} className="flex items-center gap-3">
                <span className="silk w-14 shrink-0 text-mute">{fmtMonthShort(g.month)}</span>
                <Share value={g.total} max={maxMonthTotal} tone="#58B7AA" className="flex-1" />
                <span className="tnum w-24 shrink-0 text-right text-[12px] font-medium text-txt">{money(g.total)}</span>
                <span className="silk w-14 shrink-0 text-right text-mute">
                  {g.count} {plural(g.count, ['смена', 'смены', 'смен'])}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {edit && (
        <EntryModal
          key={edit === 'new' ? 'new' : edit.id}
          entry={edit === 'new' ? null : edit}
          profile={activeProfile}
          today={today}
          onClose={() => setEdit(null)}
          onSave={async data => {
            await saveEntry.mutateAsync(data);
            setMonth(monthKey(data.date ?? today));
          }}
          onDelete={remove}
        />
      )}
    </div>
  );
}

/** Date + amount (+ optional note). Saving takes a couple of seconds, as it should. */
function EntryModal({
  entry,
  profile,
  today,
  onClose,
  onSave,
  onDelete,
}: {
  entry: SalaryEntry | null;
  profile: SalaryProfile;
  today: string;
  onClose: () => void;
  onSave: (data: Partial<SalaryEntry> & { id?: string }) => Promise<unknown>;
  onDelete: (entry: SalaryEntry) => Promise<void>;
}) {
  const toast = useToast();
  const [date, setDate] = useState(entry?.date ?? today);
  const [amount, setAmount] = useState(entry ? String(entry.amount) : '');
  const [note, setNote] = useState(entry?.note ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const value = Number(amount.replace(/\s/g, '').replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) return toast.error('Укажите сумму заработка');
    if (!date) return toast.error('Укажите дату смены');
    setSaving(true);
    try {
      await onSave({
        ...(entry ? { id: entry.id } : {}),
        salary_profile_id: profile.id,
        date,
        amount: Math.round(value * 100) / 100,
        note: note.trim(),
      });
      toast.success(`Смена сохранена: ${fmtDateLong(date)} · ${money(value)}`);
      onClose();
    } catch (e) {
      console.error(e);
      toast.error('Не удалось сохранить смену');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onOpenChange={o => !o && onClose()}
      title={entry ? 'Смена' : 'Добавить смену'}
      description={zaychikContextLabel(profile)}
      footer={
        <div className="flex gap-2">
          <Button variant="primary" className="flex-1" disabled={saving} onClick={() => void save()}>
            Сохранить
          </Button>
          {entry && (
            <Button variant="danger" disabled={saving} onClick={() => void onDelete(entry)}>
              Удалить
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Дата">
          {id => <Input id={id} type="date" value={date} onChange={e => setDate(e.target.value)} />}
        </Field>
        <Field label="Заработал, ₽">
          {id => (
            <Input
              id={id}
              inputMode="decimal"
              placeholder="4 000"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              autoFocus={!entry}
            />
          )}
        </Field>
        <Field label="Заметка (необязательно)">
          {id => <Input id={id} value={note} onChange={e => setNote(e.target.value)} placeholder="Например: подработка" />}
        </Field>
      </div>
    </Modal>
  );
}
