'use client';

import {
  DISCIPLINE_BONUS_KINDS,
  DISCIPLINE_KIND_LABELS_RU,
  DISCIPLINE_POINTS,
  DISCIPLINE_VIOLATION_KINDS,
  formatDisciplinePoints,
  todayIso,
  type DisciplineKind,
} from '@curtain-crm/shared';
import { useState, type ReactElement } from 'react';

import { useToast } from '@/components/providers/ToastProvider';
import { Button, Field, fieldErrors, FormError, Input, Modal, Select, Textarea } from '@/components/ui/Form';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';

/**
 * Зафиксировать факт.
 *
 * Менеджер выбирает категорию, а не пишет балл: балл даёт таблица, одна для
 * всех, — это и есть защита от «наказания по настроению». Повтор той же
 * категории в месяце сервер посчитает сам и сделает балл строже; здесь об
 * этом предупреждает подсказка, чтобы цифра в списке не удивила.
 */

type Side = 'violation' | 'bonus';

const SIDES: readonly { readonly value: Side; readonly label: string }[] = [
  { value: 'violation', label: 'Нарушение' },
  { value: 'bonus', label: 'Поощрение' },
];

function kindOptions(kinds: readonly DisciplineKind[]): { value: string; label: string }[] {
  return kinds.map((kind) => ({
    value: kind,
    label: `${DISCIPLINE_KIND_LABELS_RU[kind]} · ${formatDisciplinePoints(DISCIPLINE_POINTS[kind])}`,
  }));
}

export function DisciplineRecordDialog({
  open,
  onClose,
  presetUserId,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly presetUserId?: number;
}): ReactElement {
  const toast = useToast();
  const utils = trpc.useUtils();

  const [side, setSide] = useState<Side>('violation');
  const [userId, setUserId] = useState(presetUserId?.toString() ?? '');
  const [kind, setKind] = useState('');
  const [occurredOn, setOccurredOn] = useState(todayIso());
  const [description, setDescription] = useState('');

  const staff = trpc.users.list.useQuery({ page: 1, pageSize: 100, isActive: true }, { enabled: open });

  const record = trpc.discipline.record.useMutation({
    onSuccess(result) {
      toast.success(
        `Записано: ${formatDisciplinePoints(result.points)}`,
        result.isRepeat ? 'Повтор в этом месяце — балл строже' : 'Сотрудник получит уведомление',
      );
      void utils.discipline.summary.invalidate();
      void utils.discipline.list.invalidate();
      setKind('');
      setDescription('');
      onClose();
    },
    onError(error) {
      toast.error('Не удалось записать', error.message);
    },
  });
  const errors = fieldErrors(record.error);

  return (
    <Modal
      open={open}
      title="Зафиксировать факт"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button
            loading={record.isPending}
            disabled={userId === '' || kind === ''}
            onClick={() => {
              record.mutate({
                userId: Number.parseInt(userId, 10),
                kind: kind as DisciplineKind,
                occurredOn,
                description: description.trim() === '' ? null : description.trim(),
              });
            }}
          >
            Записать
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormError message={record.error !== null && Object.keys(errors).length === 0 ? record.error.message : null} />

        <Field label="Сотрудник" required error={errors['userId']}>
          <Select
            value={userId}
            onChange={(event) => {
              setUserId(event.target.value);
            }}
            placeholder="Выберите сотрудника"
            options={(staff.data?.items ?? []).map((item) => ({ value: item.id.toString(), label: item.fullName }))}
          />
        </Field>

        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Вид записи">
          {SIDES.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={side === option.value}
              onClick={() => {
                setSide(option.value);
                setKind('');
              }}
              className={cn(
                'rounded-full border px-2.5 py-1 text-footnote transition-colors',
                side === option.value
                  ? 'border-accent/50 bg-accent/15 text-accent'
                  : 'border-subtle text-secondary hover:bg-ink/[0.08] hover:text-primary',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        <Field
          label="Категория"
          required
          hint={side === 'violation' ? 'Повтор той же категории в месяце — на балл строже' : undefined}
          error={errors['kind']}
        >
          <Select
            value={kind}
            onChange={(event) => {
              setKind(event.target.value);
            }}
            placeholder="Выберите категорию"
            options={kindOptions(side === 'violation' ? DISCIPLINE_VIOLATION_KINDS : DISCIPLINE_BONUS_KINDS)}
          />
        </Field>

        <Field label="Дата" required error={errors['occurredOn']}>
          <Input
            type="date"
            value={occurredOn}
            max={todayIso()}
            onChange={(event) => {
              setOccurredOn(event.target.value);
            }}
          />
        </Field>

        <Field label="Факт" hint="Дата, время, заказ, ситуация — конкретно. Увидит сотрудник" error={errors['description']}>
          <Textarea
            value={description}
            onChange={(event) => {
              setDescription(event.target.value);
            }}
            rows={3}
            placeholder="Например: 12.09 пришла в 9:25, смена с 9:00"
          />
        </Field>
      </div>
    </Modal>
  );
}
