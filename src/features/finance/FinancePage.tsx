import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { PageHeader, Tabs } from '@/components/ui/misc';
import { useQuick } from '@/features/forms/QuickProvider';
import { BudgetsTab } from './BudgetsTab';
import { CalendarTab } from './CalendarTab';
import { ForecastTab } from './ForecastTab';
import { OperationsTab } from './OperationsTab';
import { RecurringTab } from './RecurringTab';

type Tab = 'ops' | 'recurring' | 'calendar' | 'forecast' | 'budgets';

export default function FinancePage() {
  const [tab, setTab] = useState<Tab>('ops');
  const quick = useQuick();
  return (
    <div className="animate-fade-in">
      <PageHeader title="Финансы" subtitle="Куда уходят деньги?" actions={<>
        <Button onClick={() => quick.open('income')}><Plus size={16} /> Доход</Button>
        <Button variant="primary" onClick={() => quick.open('expense')}><Plus size={16} /> Расход</Button>
      </>} />
      <Tabs value={tab} onChange={setTab} tabs={[
        { value: 'ops', label: 'Операции' }, { value: 'recurring', label: 'Повторяющиеся' }, { value: 'calendar', label: 'Календарь' },
        { value: 'forecast', label: 'Прогноз' }, { value: 'budgets', label: 'Лимиты' },
      ]} />
      {tab === 'ops' && <OperationsTab />}
      {tab === 'recurring' && <RecurringTab />}
      {tab === 'calendar' && <CalendarTab />}
      {tab === 'forecast' && <ForecastTab />}
      {tab === 'budgets' && <BudgetsTab />}
    </div>
  );
}
