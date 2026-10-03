import { CreditCard, Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { PageHeader, Tabs } from '@/components/ui/misc';
import { codeFor } from '@/features/layout/nav';
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
    <div className="animate-fadein">
      <PageHeader
        title="Финансы"
        code={codeFor('/finance')}
        subtitle="Операции, повторяющиеся платежи, календарь, прогноз остатка и месячный план/факт."
        actions={
          <>
            <Button onClick={() => quick.open('income')}>
              <Plus size={15} /> Доход
            </Button>
            <Button variant="primary" onClick={() => quick.open('expense')}>
              <Plus size={15} /> Расход
            </Button>
          </>
        }
      />

      <Tabs
        ariaLabel="Разделы финансов"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'ops', label: 'Операции' },
          { value: 'recurring', label: 'Повторяющиеся' },
          { value: 'calendar', label: 'Календарь' },
          { value: 'forecast', label: 'Прогноз' },
          { value: 'budgets', label: 'План / лимиты' },
        ]}
      />

      {tab === 'ops' && <OperationsTab />}
      {tab === 'recurring' && <RecurringTab />}
      {tab === 'calendar' && <CalendarTab />}
      {tab === 'forecast' && <ForecastTab />}
      {tab === 'budgets' && <BudgetsTab />}

      <p className="mt-6 flex items-center gap-2 text-[11px] leading-relaxed text-mute">
        <CreditCard size={13} className="shrink-0" />
        Данные приходят из Supabase и обновляются автоматически, в том числе из Telegram-бота.
      </p>
    </div>
  );
}
