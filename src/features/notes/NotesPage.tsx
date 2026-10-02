import { Pin, PinOff, Plus, StickyNote, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Modal, useConfirm } from '@/components/ui/dialog';
import { Chips, Input } from '@/components/ui/form';
import { Badge, Card, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { useDeleteRow, useRows, useSaveRow } from '@/data/hooks';
import { NoteForm } from '@/features/forms/NoteForm';
import { fmtDate } from '@/lib/format';
import { friendlyError } from '@/lib/errors';
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
    try { await save.mutateAsync({ id: n.id, pinned: !n.pinned }); } catch (e) { toast.error(friendlyError(e, 'Не удалось закрепить заметку')); }
  };
  const remove = async (n: Note) => {
    if (!(await confirm({ title: 'Удалить заметку?', text: n.title || 'Без названия', confirmText: 'Удалить', danger: true }))) return;
    try { await del.mutateAsync(n.id); toast.success('Заметка удалена'); } catch (e) { toast.error(friendlyError(e, 'Не удалось удалить заметку')); }
  };

  return (
    <div className="animate-fade-in">
      <PageHeader title="Заметки" subtitle="Где моя нужная информация?" actions={<Button variant="primary" onClick={() => setEdit('new')}><Plus size={16} /> Заметка</Button>} />
      {error ? <ErrorState onRetry={() => void refetch()} /> : isLoading ? <Skeleton className="h-48" /> : rows.length === 0 ? (
        <Card><EmptyState icon={<StickyNote size={20} />} title="Заметок пока нет" text={'Записывайте всё, что нужно не потерять:\nидеи, инструкции, данные по авто и финансам.'} action="Добавить заметку" onAction={() => setEdit('new')} /></Card>
      ) : (
        <>
          <div className="mb-4 space-y-3">
            <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Поиск по заметкам" aria-label="Поиск по заметкам" className="sm:max-w-sm" />
            {tags.length > 1 && <Chips value={tag} onChange={setTag} options={tags} />}
          </div>
          {list.length === 0 ? <p className="py-10 text-center text-sm text-muted">Ничего не найдено.</p> : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {list.map(n => (
                <article key={n.id} className="card group flex cursor-pointer flex-col p-4 transition-colors hover:border-muted/40" onClick={() => setEdit(n)}>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="line-clamp-2 text-sm font-semibold">{n.title || 'Без названия'}</h3>
                    <span className="-mr-2 -mt-1.5 flex shrink-0" onClick={e => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" aria-label={n.pinned ? 'Открепить' : 'Закрепить'} onClick={() => void pin(n)}>{n.pinned ? <Pin size={15} className="text-accent" /> : <PinOff size={15} />}</Button>
                      <Button variant="ghost" size="icon" aria-label="Удалить" onClick={() => void remove(n)}><Trash2 size={15} /></Button>
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-5 whitespace-pre-line text-[13px] text-muted">{n.body}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5 pt-1">
                    {n.tags.map(t => <Badge key={t} tone="accent">#{t}</Badge>)}
                    <span className="ml-auto text-[11px] text-muted/70">{fmtDate(n.updated_at)}</span>
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
