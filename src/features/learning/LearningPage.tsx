import { GraduationCap, Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Modal, useConfirm } from '@/components/ui/dialog';
import { Chips, Field, Input } from '@/components/ui/form';
import { Card, EmptyState, ErrorState, PageHeader, Progress, Skeleton } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { useDeleteRow, useRows, useSaveRow } from '@/data/hooks';
import { FormShell, useSubmit } from '@/features/forms/shared';
import { LEARNING_PRESETS } from '@/lib/constants';
import { friendlyError } from '@/lib/errors';
import { cn } from '@/lib/utils';
import type { LearningTopic, LearningTrack } from '@/types';

function TrackForm({ taken, onDone }: { taken: string[]; onDone: () => void }) {
  const [title, setTitle] = useState('');
  const [err, setErr] = useState('');
  const save = useSaveRow('learning_tracks');
  const { saving, error, run } = useSubmit('Не удалось добавить направление', 'Направление добавлено', onDone);
  return (
    <FormShell saving={saving} error={error || err} submitText="Добавить" onSubmit={() => {
      if (!title.trim()) return setErr('Введите название');
      if (taken.some(t => t.toLowerCase() === title.trim().toLowerCase())) return setErr('Такое направление уже есть');
      setErr('');
      void run(() => save.mutateAsync({ title: title.trim(), position: taken.length }));
    }}>
      <Field label="Что изучаем?">{id => <Input id={id} value={title} onChange={e => setTitle(e.target.value)} placeholder="Например: Linux" autoFocus maxLength={80} />}</Field>
      <Chips value={title} onChange={setTitle} options={LEARNING_PRESETS.filter(p => !taken.includes(p))} />
    </FormShell>
  );
}

function Track({ track, topics }: { track: LearningTrack; topics: LearningTopic[] }) {
  const saveTopic = useSaveRow('learning_topics');
  const delTopic = useDeleteRow('learning_topics');
  const delTrack = useDeleteRow('learning_tracks');
  const confirm = useConfirm();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const done = topics.filter(t => t.done).length;
  const p = topics.length ? (done / topics.length) * 100 : 0;

  const fail = (e: unknown, what: string) => toast.error(friendlyError(e, what));
  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      await saveTopic.mutateAsync({ track_id: track.id, title: title.trim(), position: topics.length ? Math.max(...topics.map(t => t.position)) + 1 : 0 });
      setTitle('');
    } catch (err) { fail(err, 'Не удалось добавить тему'); }
  };
  const toggle = async (t: LearningTopic) => {
    try { await saveTopic.mutateAsync({ id: t.id, done: !t.done, done_at: t.done ? null : new Date().toISOString() }); } catch (err) { fail(err, 'Не удалось обновить тему'); }
  };
  const removeTrack = async () => {
    if (!(await confirm({ title: `Удалить «${track.title}»?`, text: topics.length ? `Вместе с ${topics.length} темами.` : undefined, confirmText: 'Удалить', danger: true }))) return;
    try { await delTrack.mutateAsync(track.id); toast.success('Направление удалено'); } catch (err) { fail(err, 'Не удалось удалить направление'); }
  };

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">{track.title}</h3>
        <span className="flex items-center gap-1">
          <span className="tabular text-sm text-muted">Прогресс {Math.round(p)}%</span>
          <Button variant="ghost" size="icon" aria-label="Удалить направление" onClick={() => void removeTrack()}><Trash2 size={15} /></Button>
        </span>
      </div>
      <Progress value={p} tone="good" className="mt-2" label={`Прогресс: ${track.title}`} />
      <ul className="mt-3 space-y-0.5">
        {topics.map(t => (
          <li key={t.id} className="group flex items-center gap-3 rounded-lg px-1 py-1.5">
            <input id={`t-${t.id}`} type="checkbox" checked={t.done} onChange={() => void toggle(t)} className="h-[18px] w-[18px] shrink-0 accent-[hsl(var(--accent))]" />
            <label htmlFor={`t-${t.id}`} className={cn('min-w-0 flex-1 cursor-pointer text-sm', t.done && 'text-muted line-through')}>{t.title}</label>
            <Button variant="ghost" size="icon" aria-label={`Удалить тему ${t.title}`} className="h-7 w-7 opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100 max-lg:opacity-60"
              onClick={() => delTopic.mutate(t.id, { onError: err => fail(err, 'Не удалось удалить тему') })}><Trash2 size={13} /></Button>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="mt-2 flex gap-2">
        <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Новая тема" aria-label={`Новая тема: ${track.title}`} maxLength={160} />
        <Button type="submit" aria-label="Добавить тему"><Plus size={16} /></Button>
      </form>
    </Card>
  );
}

export default function LearningPage() {
  const tracks = useRows('learning_tracks');
  const topics = useRows('learning_topics');
  const [open, setOpen] = useState(false);
  const loading = tracks.isLoading || topics.isLoading;
  const error = tracks.error || topics.error;

  return (
    <div className="animate-fade-in">
      <PageHeader title="Обучение" subtitle="Что я уже изучил и что дальше?" actions={<Button variant="primary" onClick={() => setOpen(true)}><Plus size={16} /> Направление</Button>} />
      {error ? <ErrorState onRetry={() => { void tracks.refetch(); void topics.refetch(); }} /> : loading ? <Skeleton className="h-48" /> : tracks.rows.length === 0 ? (
        <Card><EmptyState icon={<GraduationCap size={20} />} title="Направлений пока нет" text={'Добавьте то, что изучаете — Python, Linux, Docker —\nи отмечайте пройденные темы.'} action="Добавить направление" onAction={() => setOpen(true)} /></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {tracks.rows.map(t => <Track key={t.id} track={t} topics={topics.rows.filter(x => x.track_id === t.id)} />)}
        </div>
      )}
      <Modal open={open} onOpenChange={setOpen} title="Новое направление">
        <TrackForm taken={tracks.rows.map(t => t.title)} onDone={() => setOpen(false)} />
      </Modal>
    </div>
  );
}
