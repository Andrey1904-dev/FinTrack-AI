import { Pin, PinOff, Plus, Search, StickyNote, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button, IconButton } from '@/components/ui/button';
import { Modal, useConfirm } from '@/components/ui/dialog';
import { Chips, Input } from '@/components/ui/form';
import { Badge, EmptyState, ErrorState, PageHeader, Panel, Skeleton, Stat } from '@/components/ui/misc';
import { codeFor } from '@/features/layout/nav';
import { useToast } from '@/components/ui/toast';
import { useDeleteRow, useRows, useSaveRow } from '@/data/hooks';
import { NoteForm } from '@/features/forms/NoteForm';
import { friendlyError } from '@/lib/errors';
import { fmtDate } from '@/lib/format';
import { plural } from '@/lib/format';
import type { Note } from '@/types';

export default function NotesPage() {
  const { rows, isLoading, error, refetch } = useRows('notes');
  const save = useSaveRow('notes');
  const del = useDeleteRow('notes');
  const confirm = useConfirm();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [tag, setTag] = useState('Все');
  const [edit, setEdit] = useState<Note | 'new' | null>(null);

  const tags = useMemo(() => ['Все', ...new Set(rows.flatMap(n => n.tags))], [rows]);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows
      .filter(n => (tag === 'Все' || n.tags.includes(tag)) && (!s || `${n.title} ${n.body} ${n.tags.join(' ')}`.toLowerCase().includes(s)))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updated_at.localeCompare(a.updated_at));
  }, [rows, q, tag]);

  const pin = async (n: Note) => {
    try {
      await save.mutateAsync({ id: n.id, pinned: !n.pinned });
    } catch (e) {
      toast.error(friendlyError(e, 'Не удалось закрепить заметку'));
    }
  };

  const remove = async (n: Note) => {
    if (!(await confirm({ title: 'Удалить заметку?', text: n.title || 'Без названия', confirmText: 'Удалить', danger: true }))) return;
    try {
      await del.mutateAsync(n.id);
      toast.success('Заметка удалена');
    } catch (e) {
      toast.error(friendlyError(e, 'Не удалось удалить заметку'));
    }
  };

  const pinned = rows.filter(n => n.pinned).length;

  return (
    <div className="animate-fadein">
      <PageHeader
        title="Заметки"
        code={codeFor('/notes')}
        subtitle="Где моя нужная информация — идеи, инструкции, данные по авто и финансам"
        actions={
          <Button variant="primary" onClick={() => setEdit('new')}>
            <Plus size={16} /> Заметка
          </Button>
        }
      />

      {error ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : isLoading ? (
        <Skeleton className="h-64" />
      ) : rows.length === 0 ? (
        <Panel label="Заметки">
          <EmptyState
            icon={<StickyNote size={18} />}
            title="Заметок пока нет"
            text={'Записывайте всё, что нужно не потерять:\nидеи, инструкции, данные по авто и финансам.'}
            action="Добавить заметку"
            onAction={() => setEdit('new')}
          />
        </Panel>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-3 gap-3">
            <Stat label="Заметки" value={rows.length} sub={plural(rows.length, ['запись', 'записи', 'записей'])} />
            <Stat label="Закреплено" value={pinned} tone="accent" sub="всегда сверху" />
            <Stat label="Теги" value={Math.max(0, tags.length - 1)} sub="разных меток" />
          </div>

          <div className="mb-4 space-y-3">
            <div className="relative sm:max-w-sm">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
              <Input
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Поиск по заметкам"
                aria-label="Поиск по заметкам"
                className="pl-9"
              />
            </div>
            {tags.length > 1 && (
              <div className="no-bar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                <Chips value={tag} onChange={setTag} options={tags} />
              </div>
            )}
          </div>

          {list.length === 0 ? (
            <Panel>
              <EmptyState compact icon={<Search size={18} />} title="Ничего не найдено" text="Измените запрос или выберите другой тег." />
            </Panel>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {list.map((n, i) => (
                <article
                  key={n.id}
                  className="rise panel group flex cursor-pointer flex-col p-4 transition-colors hover:border-amber/30"
                  style={i < 12 && i ? { animationDelay: `${i * 30}ms` } : undefined}
                  onClick={() => setEdit(n)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="line-clamp-2 min-w-0 text-[13.5px] font-semibold leading-snug text-txt">{n.title || 'Без названия'}</h2>
                    <span className="-mr-1.5 -mt-1 flex shrink-0" onClick={e => e.stopPropagation()}>
                      <IconButton label={n.pinned ? 'Открепить заметку' : 'Закрепить заметку'} size="icon-sm" onClick={() => void pin(n)}>
                        {n.pinned ? <Pin size={14} className="text-amber" /> : <PinOff size={14} />}
                      </IconButton>
                      <IconButton label="Удалить заметку" size="icon-sm" onClick={() => void remove(n)}>
                        <Trash2 size={14} />
                      </IconButton>
                    </span>
                  </div>
                  {n.body && <p className="mt-2 line-clamp-5 whitespace-pre-line text-[12px] leading-relaxed text-dim">{n.body}</p>}
                  <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3">
                    {n.tags.map(t => (
                      <Badge key={t} tone="accent">
                        #{t}
                      </Badge>
                    ))}
                    <span className="tnum ml-auto text-[10.5px] text-mute">{fmtDate(n.updated_at)}</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}

      <Modal open={!!edit} onOpenChange={o => !o && setEdit(null)} title={edit === 'new' ? 'Новая заметка' : 'Заметка'} wide>
        {edit && <NoteForm initial={edit === 'new' ? undefined : edit} onDone={() => setEdit(null)} />}
      </Modal>
    </div>
  );
}
