import { Search } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '@/components/ui/dialog';
import { Input } from '@/components/ui/form';
import { useRows } from '@/data/hooks';
import { fmtDate, money } from '@/lib/format';

interface Hit {
  id: string;
  group: string;
  title: string;
  sub: string;
  link: string;
}

const GROUPS = ['Расходы', 'Доходы', 'Долги', 'Автомобили', 'Обслуживание авто', 'Заметки', 'Задачи', 'Цели', 'Команды'];

function useSearchHits(query: string): Hit[] {
  const ops = useRows('finance_operations').rows;
  const debts = useRows('debts').rows;
  const cars = useRows('cars').rows;
  const service = useRows('car_service').rows;
  const expenses = useRows('car_expenses').rows;
  const notes = useRows('notes').rows;
  const tasks = useRows('tasks').rows;
  const goals = useRows('financial_goals').rows;
  const commands = useRows('commands').rows;
  const deferred = useDeferredValue(query);

  return useMemo(() => {
    const q = deferred.trim().toLowerCase();
    if (!q) return [];
    const has = (...v: Array<string | number | null | undefined>) => v.some(x => x !== null && x !== undefined && String(x).toLowerCase().includes(q));
    const hits: Hit[] = [];
    for (const o of ops) if (has(o.category, o.note, o.amount, fmtDate(o.date))) hits.push({ id: o.id, group: o.type === 'income' ? 'Доходы' : 'Расходы', title: `${o.category}${o.note ? ' · ' + o.note : ''}`, sub: `${money(o.amount)} · ${fmtDate(o.date)}`, link: '/finance' });
    for (const d of debts) if (has(d.name, d.organization, d.comment)) hits.push({ id: d.id, group: 'Долги', title: d.name, sub: `${d.organization ? d.organization + ' · ' : ''}остаток ${money(d.balance)}`, link: '/debts' });
    for (const c of cars) if (has(c.name, c.engine, c.year, c.comment)) hits.push({ id: c.id, group: 'Автомобили', title: c.name, sub: `${c.year ?? ''} · ${c.mileage} км`, link: '/cars' });
    for (const s of service) if (has(s.title, s.comment, ...s.items.map(i => i.name))) hits.push({ id: s.id, group: 'Обслуживание авто', title: s.title, sub: `${money(s.total)} · ${fmtDate(s.date)}`, link: '/cars' });
    for (const e of expenses) if (has(e.title, e.category, e.comment)) hits.push({ id: e.id, group: 'Обслуживание авто', title: `${e.category}${e.title ? ' · ' + e.title : ''}`, sub: `${money(e.amount)} · ${fmtDate(e.date)}`, link: '/cars' });
    for (const n of notes) if (has(n.title, n.body, ...n.tags)) hits.push({ id: n.id, group: 'Заметки', title: n.title || 'Без названия', sub: n.body.slice(0, 80), link: '/notes' });
    for (const t of tasks) if (has(t.title, t.note)) hits.push({ id: t.id, group: 'Задачи', title: t.title, sub: t.status === 'done' ? 'выполнена' : t.due_date ? `до ${fmtDate(t.due_date)}` : '', link: '/tasks' });
    for (const g of goals) if (has(g.title, g.comment, g.category)) hits.push({ id: g.id, group: 'Цели', title: g.title, sub: `${money(g.current_amount)} из ${money(g.target_amount)}`, link: '/goals' });
    for (const c of commands) if (has(c.command, c.description, c.category)) hits.push({ id: c.id, group: 'Команды', title: c.command, sub: c.description, link: '/commands' });
    return hits;
  }, [deferred, ops, debts, cars, service, expenses, notes, tasks, goals, commands]);
}

export function SearchPanel({ onNavigate, autoFocus }: { onNavigate: (link: string) => void; autoFocus?: boolean }) {
  const [query, setQuery] = useState('');
  const hits = useSearchHits(query);
  const grouped = GROUPS.map(g => [g, hits.filter(h => h.group === g)] as const).filter(([, list]) => list.length);
  return (
    <div>
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3 top-3 text-muted" />
        <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Расходы, долги, заметки, задачи, команды…" className="pl-9" autoFocus={autoFocus} aria-label="Поиск" />
      </div>
      <div className="mt-3 max-h-[55dvh] overflow-y-auto">
        {!query.trim() ? <p className="py-8 text-center text-sm text-muted">Начните вводить: поиск идёт по всем разделам сразу.</p>
          : grouped.length === 0 ? <p className="py-8 text-center text-sm text-muted">Ничего не найдено по запросу «{query}».</p>
          : grouped.map(([group, list]) => (
            <section key={group} className="mb-3">
              <h4 className="px-1 pb-1 text-xs font-medium uppercase tracking-wide text-muted/80">{group} · {list.length}</h4>
              <ul>
                {list.slice(0, 8).map(h => (
                  <li key={h.id}>
                    <button type="button" onClick={() => onNavigate(h.link)} className="flex w-full flex-col rounded-lg px-2 py-2 text-left transition-colors hover:bg-raised">
                      <span className="truncate text-sm">{h.title}</span>
                      {h.sub && <span className="truncate text-xs text-muted">{h.sub}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
      </div>
    </div>
  );
}

export function SearchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Поиск" wide>
      <SearchPanel autoFocus onNavigate={link => { onOpenChange(false); navigate(link); }} />
    </Modal>
  );
}

export default function SearchPage() {
  const navigate = useNavigate();
  return (
    <div className="animate-fade-in">
      <h1 className="mb-4 text-xl font-semibold">Поиск</h1>
      <SearchPanel autoFocus onNavigate={navigate} />
    </div>
  );
}
