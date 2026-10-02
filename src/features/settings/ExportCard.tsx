import { Download } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { friendlyError } from '@/lib/errors';
import { downloadCSV, downloadJSON, type Column } from '@/lib/export';
import { todayISO } from '@/lib/dates';
import { exportEverything, fetchTable } from './exportAll';

type Row = Record<string, unknown>;
const col = (header: string, key: string): Column<Row> => ({ header, value: r => { const v = r[key]; return v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); } });

const SETS: Array<{ label: string; table: string; file: string; columns: Array<Column<Row>> }> = [
  { label: 'Доходы и расходы', table: 'finance_operations', file: 'operations', columns: [col('Дата', 'date'), col('Тип', 'type'), col('Сумма', 'amount'), col('Категория', 'category'), col('Комментарий', 'note')] },
  { label: 'Долги', table: 'debts', file: 'debts', columns: [col('Название', 'name'), col('Организация', 'organization'), col('Остаток', 'balance'), col('Ставка', 'interest_rate'), col('Платёж', 'min_payment'), col('Следующий платёж', 'next_payment_date'), col('Статус', 'status')] },
  { label: 'История платежей по долгам', table: 'debt_payments', file: 'debt-payments', columns: [col('Дата', 'paid_at'), col('Сумма', 'amount'), col('Основной долг', 'principal'), col('Комментарий', 'comment')] },
  { label: 'Заправки', table: 'car_refuels', file: 'refuels', columns: [col('Дата', 'date'), col('Пробег', 'mileage'), col('Литры', 'liters'), col('Цена за литр', 'price_per_liter'), col('Сумма', 'total'), col('Топливо', 'fuel_type'), col('АЗС', 'station')] },
  { label: 'Ремонты и обслуживание', table: 'car_service', file: 'service', columns: [col('Дата', 'date'), col('Пробег', 'mileage'), col('Что сделано', 'title'), col('Итого', 'total'), col('Комментарий', 'comment')] },
  { label: 'Задачи', table: 'tasks', file: 'tasks', columns: [col('Задача', 'title'), col('Категория', 'category'), col('Срок', 'due_date'), col('Статус', 'status'), col('Приоритет', 'priority')] },
  { label: 'Заметки', table: 'notes', file: 'notes', columns: [col('Заголовок', 'title'), col('Текст', 'body'), col('Теги', 'tags')] },
  { label: 'IT-команды', table: 'commands', file: 'commands', columns: [col('Команда', 'command'), col('Описание', 'description'), col('Категория', 'category')] },
];

export function ExportCard() {
  const toast = useToast();
  const [busy, setBusy] = useState('');
  const stamp = todayISO();
  const csv = async (s: (typeof SETS)[number]) => {
    setBusy(s.table);
    try { const rows = await fetchTable(s.table); downloadCSV(`${s.file}-${stamp}`, rows, s.columns); toast.success(`Выгружено строк: ${rows.length}`); } catch (e) { toast.error(friendlyError(e, 'Не удалось выгрузить данные')); } finally { setBusy(''); }
  };
  const all = async () => {
    setBusy('all');
    try { downloadJSON(`personal-os-${stamp}`, await exportEverything()); toast.success('Все данные выгружены'); } catch (e) { toast.error(friendlyError(e, 'Не удалось выгрузить данные')); } finally { setBusy(''); }
  };
  return (
    <Card>
      <CardHeader title="Экспорт данных" />
      <div className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line p-3">
          <div><p className="text-sm font-medium">Export all data</p><p className="text-xs text-muted">Полная копия всех ваших данных одним JSON-файлом.</p></div>
          <Button variant="primary" onClick={() => void all()} disabled={!!busy}><Download size={16} /> {busy === 'all' ? 'Готовим…' : 'Скачать JSON'}</Button>
        </div>
        <div>
          <p className="mb-2 text-xs text-muted">Таблицы в CSV (открываются в Excel):</p>
          <div className="flex flex-wrap gap-2">{SETS.map(s => <Button key={s.table} size="sm" onClick={() => void csv(s)} disabled={!!busy}>{busy === s.table ? '…' : s.label}</Button>)}</div>
        </div>
      </div>
    </Card>
  );
}
