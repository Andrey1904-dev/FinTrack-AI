import { Check, Copy, Pencil, Plus, Search, Terminal, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button, IconButton } from '@/components/ui/button';
import { Modal, useConfirm } from '@/components/ui/dialog';
import { Chips, Field, Input, Textarea } from '@/components/ui/form';
import { EmptyState, ErrorState, PageHeader, Panel, Skeleton, Stat } from '@/components/ui/misc';
import { codeFor } from '@/features/layout/nav';
import { useToast } from '@/components/ui/toast';
import { useDeleteRow, useRows, useSaveRow } from '@/data/hooks';
import { FormShell, useSubmit } from '@/features/forms/shared';
import { COMMAND_CATEGORIES, DEFAULT_COMMANDS } from '@/lib/constants';
import { friendlyError } from '@/lib/errors';
import { plural } from '@/lib/format';
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

/** Monospace command line with a copy button — also used by the global search. */
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
    <div className="flex items-center gap-2 border border-line bg-bg px-3 py-2">
      <div className="min-w-0 flex-1">
        <code className="block truncate font-mono text-[12.5px] text-cyan">{command}</code>
        {description && <p className="mt-0.5 truncate text-[11.5px] text-dim">{description}</p>}
      </div>
      <Button size="sm" variant="outline" className="shrink-0" onClick={copy} aria-label={`Скопировать: ${command}`}>
        {done ? (
          <>
            <Check size={14} /> Готово
          </>
        ) : (
          <>
            <Copy size={14} /> <span className="hidden sm:inline">Скопировать</span>
          </>
        )}
      </Button>
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
    <FormShell
      saving={saving}
      error={error || err}
      onSubmit={() => {
        if (!command.trim()) return setErr('Введите команду');
        setErr('');
        void run(() => save.mutateAsync({ id: initial?.id, command: command.trim(), description: description.trim(), category: cat.trim() || 'Linux' }));
      }}
    >
      <Field label="Команда">
        {id => (
          <Textarea
            id={id}
            value={command}
            onChange={e => setCommand(e.target.value)}
            className="min-h-[80px] font-mono text-[12.5px]"
            placeholder="docker system prune -af"
            autoFocus
          />
        )}
      </Field>
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

  const cats = useMemo(
    () => ['Все', ...new Set([...COMMAND_CATEGORIES.filter(c => rows.some(r => r.category === c)), ...rows.map(r => r.category)])],
    [rows],
  );
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
    try {
      await del.mutateAsync(c.id);
      toast.success('Команда удалена');
    } catch (e) {
      toast.error(friendlyError(e, 'Не удалось удалить команду'));
    }
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Команды"
        code={codeFor('/commands')}
        subtitle="Где та самая команда, которую вечно приходится гуглить"
        actions={
          <Button variant="primary" onClick={() => setEdit('new')}>
            <Plus size={16} /> Команда
          </Button>
        }
      />

      {error ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : isLoading ? (
        <Skeleton className="h-64" />
      ) : rows.length === 0 ? (
        <Panel label="Команды">
          <EmptyState
            icon={<Terminal size={18} />}
            title="Команд пока нет"
            text={'Сохраняйте команды Linux, Git, Docker и других инструментов —\nи копируйте одним нажатием.'}
            action="Добавить команду"
            onAction={() => setEdit('new')}
          />
          <div className="mt-4 flex justify-center">
            <Button variant="ghost" size="sm" onClick={() => void seed()}>
              или добавить стартовый набор
            </Button>
          </div>
        </Panel>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
            <Stat label="Всего команд" value={rows.length} sub={plural(rows.length, ['запись', 'записи', 'записей'])} />
            <Stat label="Категории" value={Math.max(0, cats.length - 1)} sub="разделов шпаргалки" />
            <Stat label="В выборке" value={list.length} tone="accent" sub={cat === 'Все' ? 'все категории' : cat} />
          </div>

          <div className="mb-4 space-y-3">
            <div className="relative sm:max-w-sm">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
              <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Найти команду" aria-label="Найти команду" className="pl-9" />
            </div>
            <div className="no-bar -mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
              <Chips value={cat} onChange={setCat} options={cats} />
            </div>
          </div>

          {list.length === 0 ? (
            <Panel>
              <EmptyState compact title="Ничего не найдено" text="Измените запрос или выберите другую категорию." />
            </Panel>
          ) : (
            <div className="grid gap-3 xl:grid-cols-2">
              {list.map((c, i) => (
                <div key={c.id} className="rise panel group p-3" style={i < 12 && i ? { animationDelay: `${i * 25}ms` } : undefined}>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="silk-b text-mute">{c.category}</span>
                    <span className="-mr-1 flex opacity-70 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                      <IconButton label="Изменить команду" size="icon-sm" onClick={() => setEdit(c)}>
                        <Pencil size={14} />
                      </IconButton>
                      <IconButton label="Удалить команду" size="icon-sm" onClick={() => void remove(c)}>
                        <Trash2 size={14} />
                      </IconButton>
                    </span>
                  </div>
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
