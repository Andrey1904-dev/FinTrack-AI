import { useState } from 'react';
import { Field, Input, Textarea } from '@/components/ui/form';
import { useSaveRow } from '@/data/hooks';
import type { Note } from '@/types';
import { FormShell, useSubmit } from './shared';

export function parseTags(text: string): string[] {
  return [...new Set(text.split(/[,\s#]+/).map(t => t.trim().toLowerCase()).filter(Boolean))].slice(0, 12);
}

export function NoteForm({ initial, onDone }: { initial?: Note; onDone: () => void }) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [tags, setTags] = useState((initial?.tags ?? []).join(', '));
  const [pinned, setPinned] = useState(initial?.pinned ?? false);
  const [fieldError, setFieldError] = useState('');
  const save = useSaveRow('notes');
  const { saving, error, run } = useSubmit('Не удалось сохранить заметку', 'Заметка сохранена', onDone);

  const submit = () => {
    if (!title.trim() && !body.trim()) return setFieldError('Заметка пустая — добавьте заголовок или текст');
    setFieldError('');
    void run(() => save.mutateAsync({ id: initial?.id, title: title.trim(), body, tags: parseTags(tags), pinned }));
  };
  return (
    <FormShell onSubmit={submit} saving={saving} error={error || fieldError}>
      <Field label="Заголовок">{id => <Input id={id} value={title} onChange={e => setTitle(e.target.value)} autoFocus maxLength={200} />}</Field>
      <Field label="Текст">{id => <Textarea id={id} value={body} onChange={e => setBody(e.target.value)} className="min-h-[160px] font-mono text-[13px]" />}</Field>
      <Field label="Теги" hint="Через запятую: docker, идеи, авто">{id => <Input id={id} value={tags} onChange={e => setTags(e.target.value)} />}</Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={pinned} onChange={e => setPinned(e.target.checked)} className="h-4 w-4 accent-[hsl(var(--accent))]" /> Закрепить вверху</label>
    </FormShell>
  );
}
