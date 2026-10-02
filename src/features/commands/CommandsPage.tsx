import { Check, Copy, Pencil, Plus, Terminal, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Modal, useConfirm } from '@/components/ui/dialog';
import { Chips, Field, Input, Textarea } from '@/components/ui/form';
import { Card, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { useDeleteRow, useRows, useSaveRow } from '@/data/hooks';
import { FormShell, useSubmit } from '@/features/forms/shared';
import { COMMAND_CATEGORIES, DEFAULT_COMMANDS } from '@/lib/constants';
import { friendlyError } from '@/lib/errors';
import type { CommandRow } from '@/types';

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export function CommandCopy({ command, description }: { command: string; description?: string }) {
  const [done, setDone] = useState(false);
  const toast = useToast();
  const copy = async () => {
    if (await copyText(command)) {
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } else toast.error('Не удалось скопировать — выделите команду вручную.');
  };
  return (
    <div className="flex items-center gap-2 rounded-lg border border-line bg-bg px-3 py-2">
      <div className="min-w-0 flex-1">
        <code className="block truncate font-mono text-[13px]">{command}</code>
        {description && <p className="truncate text-xs text-muted">{description}</p>}
      </div>
      <Button size="sm" variant="secondary" onClick={copy} aria-label={`Скопировать: ${command}`}>{done ? <><Check size={14} /> Готово</> : <><Copy size={14} /> Скопировать</>}</Button>
    </div>
  );
}

function CommandForm({ initial, category, onDone }: { initial?: CommandRow; category?: string; onDone: () => void }) {
  const [command, setCommand] = useState(initial?.command ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [cat, setCat] = useState(initial?.category ?? category ?? 'Linux');
  const [err, setErr] = useState('');
  const save = useSaveRow('commands');
  const { saving, error, run } = useSubmit('Не удалось сохранить команду', 'Команда сохранена', onDone);
  return (
    <FormShell saving={saving} error={error || err} onSubmit={() => {
      if (!command.trim()) return setErr('Введите команду');
      setErr('');
      void run(() => save.mutateAsync({ id: initial?.id, command: command.trim(), description: description.trim(), category: cat.trim() || 'Linux' }));
    }}>
      <Field label="Команда">{id => <Textarea id={id} value={command} onChange={e => setCommand(e.target.value)} className="min-h-[72px] font-mono text-[13px]" autoFocus />}</Field>
      <Field label="Описание">{id => <Input id={id} value={description} onChange={e => setDescription(e.target.value)} maxLength={200} />}</Field>
      <Field label="Категория">{() => <Chips value={cat} onChange={setCat} options={[...new Set([cat, ...COMMAND_CATEGORIES])]} />}</Field>
    </FormShell>
  );
}

export default function CommandsPage() {
  const { rows, isLoading, error, refetch } = useRows('commands');
  const save = useSaveRow('commands');
  const del = useDeleteRow('commands');
  const confirm = useConfirm();
  const toast = useToast();
  const [cat, setCat] = useState('Все');
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<CommandRow | 'new' | null>(null);
  const cats = useMemo(() => ['Все', ...new Set([...COMMAND_CATEGORIES.filter(c => rows.some(r => r.category === c)), ...rows.map(r => r.category)])], [rows]);
  const list = rows.filter(r => (cat === 'Все' || r.category === cat) && (!q || `${r.command} ${r.description}`.toLowerCase().includes(q.toLowerCase())));

  const seed = async () => {
    try {
      for (const c of DEFAULT_COMMANDS) await save.mutateAsync(c);
      toast.success('Добавлен стартовый набор команд');
    } catch (e) {
      toast.error(friendlyError(e, 'Не удалось добавить команды'));
    }
  };
  const remove = async (c: CommandRow) => {
    if (!(await confirm({ title: 'Удалить команду?', text: c.command, confirmText: 'Удалить', danger: true }))) return;
    try { await del.mutateAsync(c.id); toast.success('Команда удалена'); } catch (e) { toast.error(friendlyError(e, 'Не удалось удалить команду')); }
  };

  return (
    <div className="animate-fade-in">
      <PageHeader title="Команды" subtitle="Где та самая команда, которую вечно приходится гуглить?" actions={<Button variant="primary" onClick={() => setEdit('new')}><Plus size={16} /> Команда</Button>} />
      {error ? <ErrorState onRetry={() => void refetch()} /> : isLoading ? <Skeleton className="h-48" /> : rows.length === 0 ? (
        <Card><EmptyState icon={<Terminal size={20} />} title="Команд пока нет" text={'Сохраняйте команды Linux, Git, Docker и других инструментов —\nи копируйте одним нажатием.'} action="Добавить команду" onAction={() => setEdit('new')} />
          <div className="-mt-4 pb-6 text-center"><Button variant="ghost" size="sm" onClick={() => void seed()}>или добавить стартовый набор</Button></div></Card>
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Найти команду" aria-label="Найти команду" className="sm:max-w-xs" />
            <Chips value={cat} onChange={setCat} options={cats} />
          </div>
          {list.length === 0 ? <p className="py-10 text-center text-sm text-muted">Ничего не найдено.</p> : (
            <div className="grid gap-2 lg:grid-cols-2">
              {list.map(c => (
                <div key={c.id} className="card group p-3">
                  <div className="mb-2 flex items-center justify-between"><span className="text-xs text-muted">{c.category}</span>
                    <span className="flex opacity-60 transition-opacity group-hover:opacity-100">
                      <Button variant="ghost" size="icon" aria-label="Изменить" onClick={() => setEdit(c)}><Pencil size={14} /></Button>
                      <Button variant="ghost" size="icon" aria-label="Удалить" onClick={() => void remove(c)}><Trash2 size={14} /></Button>
                    </span></div>
                  <CommandCopy command={c.command} description={c.description} />
                </div>
              ))}
            </div>
          )}
        </>
      )}
      <Modal open={!!edit} onOpenChange={o => !o && setEdit(null)} title={edit === 'new' ? 'Новая команда' : 'Изменить команду'}>
        {edit && <CommandForm initial={edit === 'new' ? undefined : edit} category={cat !== 'Все' ? cat : undefined} onDone={() => setEdit(null)} />}
      </Modal>
    </div>
  );
}
