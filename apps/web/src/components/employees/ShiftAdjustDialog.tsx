'use client';

import { useEffect, useState, type ReactElement } from 'react';

import { Button, Field, fieldErrors, FormError, Input, Select, Textarea, Modal } from '@/components/ui/Form';
import { trpc } from '@/lib/trpc';

/**
 * Ручная корректировка смены руководством.
 *
 * Два сценария в одной форме: завести смену, которую сотрудник забыл
 * отметить, и поправить время у существующей. Причина обязательна в обоих:
 * она сохраняется в самой смене, попадает в `audit_log` и уходит сотруднику
 * уведомлением — изменение его рабочего времени не должно происходить
 * незаметно для него.
 */

export interface ShiftDraft {
  readonly id: number;
  readonly userId: number;
  readonly branchId: number;
  readonly startedAt: Date;
  readonly endedAt: Date | null;
}

/** `datetime-local` требует строку без зоны и без секунд. */
function toLocalInput(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function ShiftAdjustDialog({
  open,
  shift,
  onClose,
}: {
  readonly open: boolean;
  /** `null` — создание смены задним числом. */
  readonly shift: ShiftDraft | null;
  readonly onClose: () => void;
}): ReactElement {
  const [userId, setUserId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [startedAt, setStartedAt] = useState('');
  const [endedAt, setEndedAt] = useState('');
  const [reason, setReason] = useState('');

  const utils = trpc.useUtils();
  const branches = trpc.branches.list.useQuery({}, { enabled: open });
  const staff = trpc.users.list.useQuery({ page: 1, pageSize: 100, isActive: true }, { enabled: open });

  useEffect(() => {
    if (!open) return;

    setUserId(shift === null ? '' : shift.userId.toString());
    setBranchId(shift === null ? '' : shift.branchId.toString());
    setStartedAt(shift === null ? toLocalInput(new Date()) : toLocalInput(shift.startedAt));
    setEndedAt(shift?.endedAt == null ? '' : toLocalInput(shift.endedAt));
    setReason('');
  }, [open, shift]);

  const adjust = trpc.shifts.adjustManually.useMutation({
    async onSuccess() {
      await Promise.all([
        utils.shifts.list.invalidate(),
        utils.shifts.summary.invalidate(),
        utils.users.attendance.invalidate(),
      ]);
      onClose();
    },
  });

  const remove = trpc.shifts.remove.useMutation({
    async onSuccess() {
      await Promise.all([utils.shifts.list.invalidate(), utils.shifts.summary.invalidate()]);
      onClose();
    },
  });

  const errors = fieldErrors(adjust.error);
  const canSubmit =
    userId !== '' && branchId !== '' && startedAt !== '' && reason.trim().length >= 3;

  return (
    <Modal
      open={open}
      title={shift === null ? 'Завести смену задним числом' : 'Корректировка смены'}
      onClose={onClose}
      footer={
        <>
          {shift !== null && (
            <Button
              variant="danger"
              className="mr-auto"
              loading={remove.isPending}
              disabled={reason.trim().length < 3}
              onClick={() => {
                remove.mutate({ id: shift.id, reason: reason.trim() });
              }}
            >
              Удалить смену
            </Button>
          )}

          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>

          <Button
            loading={adjust.isPending}
            disabled={!canSubmit}
            onClick={() => {
              adjust.mutate({
                ...(shift === null ? {} : { shiftId: shift.id }),
                userId: Number.parseInt(userId, 10),
                branchId: Number.parseInt(branchId, 10),
                startedAt: new Date(startedAt),
                endedAt: endedAt === '' ? null : new Date(endedAt),
                reason: reason.trim(),
              });
            }}
          >
            Сохранить
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <FormError
          message={
            Object.keys(errors).length === 0
              ? (adjust.error?.message ?? remove.error?.message ?? null)
              : null
          }
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Сотрудник" required error={errors['userId']}>
            <Select
              value={userId}
              disabled={shift !== null}
              onChange={(event) => {
                setUserId(event.target.value);
              }}
              placeholder="Выберите сотрудника"
              options={(staff.data?.items ?? []).map((person) => ({
                value: person.id.toString(),
                label: person.fullName,
              }))}
            />
          </Field>

          <Field label="Филиал" required error={errors['branchId']}>
            <Select
              value={branchId}
              onChange={(event) => {
                setBranchId(event.target.value);
              }}
              placeholder="Выберите филиал"
              options={(branches.data ?? []).map((branch) => ({
                value: branch.id.toString(),
                label: branch.name,
              }))}
            />
          </Field>

          <Field label="Начало смены" required error={errors['startedAt']}>
            <Input
              type="datetime-local"
              value={startedAt}
              onChange={(event) => {
                setStartedAt(event.target.value);
              }}
              invalid={errors['startedAt'] !== undefined}
            />
          </Field>

          <Field
            label="Окончание"
            error={errors['endedAt']}
            hint="Пусто — смена останется открытой"
          >
            <Input
              type="datetime-local"
              value={endedAt}
              onChange={(event) => {
                setEndedAt(event.target.value);
              }}
              invalid={errors['endedAt'] !== undefined}
            />
          </Field>
        </div>

        <Field
          label="Причина корректировки"
          required
          error={errors['reason']}
          hint="Увидит сотрудник и журнал аудита"
        >
          <Textarea
            rows={2}
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
            }}
            placeholder="Например: забыл отметиться, подтверждено бригадиром"
          />
        </Field>

        <p className="text-footnote text-muted">
          Смена будет помечена как изменённая вручную. Пересчёт часов и
          почасовой зарплаты произойдёт при следующем расчёте периода.
        </p>
      </div>
    </Modal>
  );
}
