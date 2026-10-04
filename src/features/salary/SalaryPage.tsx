import { useEffect, useState } from 'react';
import { PageHeader, PageSkeleton } from '@/components/ui/misc';
import { useSalaryProfiles } from '@/data/useSalary';
import { codeFor } from '@/features/layout/nav';
import { ZayatsTab } from './ZayatsTab';
import { ZaychikTab } from './ZaychikTab';

type SalaryTab = 'zayats' | 'zaychik';
const TAB_KEY = 'salary.tab';

/**
 * Salary has exactly two independent modes:
 *   🐰 Заяц   — automatic payroll from the 5/2 production calendar;
 *   🐰 Зайчик — manual per-shift amounts.
 */
export default function SalaryPage() {
  const { profiles, autoProfiles, isLoading, saveProfile } = useSalaryProfiles();
  const [tab, setTab] = useState<SalaryTab>(() => {
    try {
      return localStorage.getItem(TAB_KEY) === 'zaychik' ? 'zaychik' : 'zayats';
    } catch {
      return 'zayats';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(TAB_KEY, tab);
    } catch {
      /* private mode — not critical */
    }
  }, [tab]);

  if (isLoading && profiles.length === 0) return <PageSkeleton />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Зарплата"
        code={codeFor('/salary')}
        subtitle="🐰 Заяц считает сам · 🐰 Зайчик записывает то, что вы ввели"
      />

      {/* Mode switch: two big thumb-friendly buttons */}
      <div role="tablist" aria-label="Режим зарплаты" className="grid grid-cols-2 gap-2">
        <ModeButton
          active={tab === 'zayats'}
          title="🐰 Заяц"
          sub="Автоматический расчёт зарплаты"
          onClick={() => setTab('zayats')}
        />
        <ModeButton
          active={tab === 'zaychik'}
          title="🐰 Зайчик"
          sub="Ручной ввод заработка по сменам"
          onClick={() => setTab('zaychik')}
        />
      </div>

      {tab === 'zayats' ? (
        <ZayatsTab profile={autoProfiles[0] ?? null} onSaveProfile={p => saveProfile.mutateAsync(p)} />
      ) : (
        <ZaychikTab profiles={profiles.filter(p => p.active)} />
      )}
    </div>
  );
}

function ModeButton({ active, title, sub, onClick }: { active: boolean; title: string; sub: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`min-h-[64px] rounded-[2px] border px-3 py-2.5 text-left transition-colors ${
        active ? 'border-amber bg-amber/10' : 'border-line bg-panel hover:border-engrave'
      }`}
    >
      <span className={`block text-[14px] font-semibold ${active ? 'text-amber' : 'text-txt'}`}>{title}</span>
      <span className="mt-0.5 block text-[10.5px] leading-snug text-mute">{sub}</span>
    </button>
  );
}
