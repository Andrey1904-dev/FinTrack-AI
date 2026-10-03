import { GraduationCap, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { Button, IconButton } from '@/components/ui/button';
import { Modal, useConfirm } from '@/components/ui/dialog';
import { Chips, Field, Input } from '@/components/ui/form';
import { EmptyState, ErrorState, PageHeader, Panel, Progress, Skeleton, Stat } from '@/components/ui/misc';
import { codeFor } from '@/features/layout/nav';
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
    <FormShell
      saving={saving}
      error={error || err}
      submitText="Добавить"
      onSubmit={() => {
        if (!title.trim()) return setErr('Введите название');
        if (taken.some(t => t.toLowerCase() === title.trim().toLowerCase())) return setErr('Такое направление уже есть');
        setErr('');
        void run(() => save.mutateAsync({ title: title.trim(), position: taken.length }));
      }}
    >
      <Field label="Что изучаем?">
        {id => <Input id={id} value={title} onChange={e => setTitle(e.target.value)} placeholder="Например: Linux" autoFocus maxLength={80} />}
      </Field>
      <Field label="Быстрый выбор">
        {() => <Chips value={title} onChange={setTitle} options={LEARNING_PRESETS.filter(p => !taken.includes(p))} />}
      </Field>
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
      await saveTopic.mutateAsync({
        track_id: track.id,
        title: title.trim(),
        position: topics.length ? Math.max(...topics.map(t => t.position)) + 1 : 0,
      });
      setTitle('');
    } catch (err) {
      fail(err, 'Не удалось добавить тему');
    }
  };

  const toggle = async (t: LearningTopic) => {
    try {
      await saveTopic.mutateAsync({ id: t.id, done: !t.done, done_at: t.done ? null : new Date().toISOString() });
    } catch (err) {
      fail(err, 'Не удалось обновить тему');
    }
  };

  const removeTrack = async () => {
    if (
      !(await confirm({
        title: `Удалить «${track.title}»?`,
        text: topics.length ? `Вместе с ${topics.length} темами.` : undefined,
        confirmText: 'Удалить',
        danger: true,
      }))
    )
      return;
    try {
      await delTrack.mutateAsync(track.id);
      toast.success('Направление удалено');
    } catch (err) {
      fail(err, 'Не удалось удалить направление');
    }
  };

  return (
    <Panel className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-semibold leading-snug text-txt">{track.title}</h2>
          <p className="tnum mt-1 text-[11px] text-mute">
            {done} из {topics.length} тем · {Math.round(p)}%
          </p>
        </div>
        <IconButton label={`Удалить направление ${track.title}`} size="icon-sm" className="-mr-1.5 -mt-1" onClick={() => void removeTrack()}>
          <Trash2 size={14} />
        </IconButton>
      </div>

      <Progress value={p} tone={p >= 100 ? 'good' : 'accent'} className="mt-3" label={`Прогресс: ${track.title}`} />

      {topics.length > 0 && (
        <ul className="mt-3">
          {topics.map(t => (
            <li key={t.id} className="group flex items-center gap-2 border-b border-line/60 py-1 last:border-b-0">
              <label className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center">
                <input
                  id={`t-${t.id}`}
                  type="checkbox"
                  checked={t.done}
                  onChange={() => void toggle(t)}
                  className="h-[18px] w-[18px] rounded-[2px] accent-[#F0A828]"
                />
              </label>
              <span className={cn('min-w-0 flex-1 text-[13px] leading-snug', t.done ? 'text-mute line-through' : 'text-dim')}>{t.title}</span>
              <IconButton
                label={`Удалить тему ${t.title}`}
                size="icon-sm"
                className="opacity-60 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                onClick={() => delTopic.mutate(t.id, { onError: err => fail(err, 'Не удалось удалить тему') })}
              >
                <Trash2 size={13} />
              </IconButton>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="mt-3 flex gap-2">
        <Input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Новая тема"
          aria-label={`Новая тема: ${track.title}`}
          maxLength={160}
        />
        <Button type="submit" aria-label="Добавить тему" className="shrink-0">
          <Plus size={16} />
        </Button>
      </form>
    </Panel>
  );
}

export default function LearningPage() {
  const tracks = useRows('learning_tracks');
  const topics = useRows('learning_topics');
  const [open, setOpen] = useState(false);
  const loading = tracks.isLoading || topics.isLoading;
  const error = tracks.error || topics.error;

  const { doneCount, totalTopics, finished } = useMemo(
    () => ({
      doneCount: topics.rows.filter(t => t.done).length,
      totalTopics: topics.rows.length,
      finished: tracks.rows.filter(tr => {
        const list = topics.rows.filter(t => t.track_id === tr.id);
        return list.length > 0 && list.every(t => t.done);
      }).length,
    }),
    [tracks.rows, topics.rows],
  );

  return (
    <div className="animate-fadein">
      <PageHeader
        title="Обучение"
        code={codeFor('/learning')}
        subtitle="Что я уже изучил и что дальше"
        actions={
          <Button variant="primary" onClick={() => setOpen(true)}>
            <Plus size={16} /> Направление
          </Button>
        }
      />

      {error ? (
        <ErrorState
          onRetry={() => {
            void tracks.refetch();
            void topics.refetch();
          }}
        />
      ) : loading ? (
        <Skeleton className="h-64" />
      ) : tracks.rows.length === 0 ? (
        <Panel label="Направления">
          <EmptyState
            icon={<GraduationCap size={18} />}
            title="Направлений пока нет"
            text={'Добавьте то, что изучаете — Python, Linux, Docker —\nи отмечайте пройденные темы.'}
            action="Добавить направление"
            onAction={() => setOpen(true)}
          />
        </Panel>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-3 gap-3">
            <Stat label="Направления" value={tracks.rows.length} sub={`${finished} пройдено`} />
            <Stat label="Темы" value={totalTopics} sub="всего в списке" />
            <Stat
              label="Пройдено"
              value={`${totalTopics ? Math.round((doneCount / totalTopics) * 100) : 0}%`}
              tone="good"
              sub={`${doneCount} из ${totalTopics}`}
            />
          </div>

          <div className="grid gap-3 xl:grid-cols-2">
            {tracks.rows.map(t => (
              <Track key={t.id} track={t} topics={topics.rows.filter(x => x.track_id === t.id)} />
            ))}
          </div>
        </>
      )}

      <Modal open={open} onOpenChange={setOpen} title="Новое направление">
        <TrackForm taken={tracks.rows.map(t => t.title)} onDone={() => setOpen(false)} />
      </Modal>
    </div>
  );
}
