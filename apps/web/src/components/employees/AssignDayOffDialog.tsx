'use client';

import { useState, type ReactElement } from 'react';

import { useToast } from '@/components/providers/ToastProvider';
import { Button, Field, fieldErrors, FormError, Input, Modal, Select } from '@/components/ui/Form';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { ISO_WEEKDAYS, todayIso, WEEKDAY_NAMES_RU, weekdayName } from '@curtain-crm/shared';

/**
 * Выходной, назначенный руководителем.
 *
 * Раньше выходной существовал только как просьба снизу: сотрудник просил,
 * руководитель одобрял. Но график цеха составляет руководитель — и поставить
 * человека на отдых сам он не мог, хотя именно этим и занимается, распределяя
 * нагрузку на неделю.
 *
 * Два вида: «по графику» — один и тот же день каждую неделю («у Дилноры —
 * пятница»), и «на даты» — разовый, на конкретный период. Оба согласованы
 * сразу: это не просьба, которую кто-то ещё будет рассматривать. Сотрудник
 * получает уведомление и видит день в своём графике в приложении.
 */

type Mode = 'weekly' | 'dates';

const MODES: readonly { readonly value: Mode; readonly label: string }[] = [
  { value: 'weekly', label: 'Каждую неделю' },
  { value: 'dates', label: 'На даты' },
];

const WEEKDAY_OPTIONS = [
  { value: '', label: 'Нет постоянного выходного' },
  ...ISO_WEEKDAYS.map((day) => ({ value: day.toString(), label: WEEKDAY_NAMES_RU[day] })),
];

export function AssignDayOffDialog({
  open,
  onClose,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
}): ReactElement {
  const toast = useToast();
  const utils = trpc.useUtils();

  const [mode, setMode] = useState<Mode>('weekly');
  const [userId, setUserId] = useState('');
  const [weekday, setWeekday] = useState('');
  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState(todayIso());
  const [reason, setReason] = useState('');

  const staff = trpc.users.list.useQuery(
    { page: 1, pageSize: 100, isActive: true },
    { enabled: open },
  );
  const person = staff.data?.items.find((item) => item.id.toString() === userId);
  const currentWeekday = person?.weeklyDayOff ?? null;

  const done = (): void => {
    void utils.dayOff.list.invalidate();
    void utils.shifts.timesheet.invalidate();
    void utils.users.list.invalidate();
    setReason('');
    onClose();
  };

  const assign = trpc.dayOff.assign.useMutation({
    onSuccess() {
      toast.success('Выходной назначен', 'Сотрудник получит уведомление');
      done();
    },
    onError(error) {
      toast.error('Не удалось назначить', error.message);
    },
  });

  const setWeekly = trpc.dayOff.setWeekly.useMutation({
    onSuccess(result) {
      toast.success(
        result.weeklyDayOff === null ? 'Постоянный выходной снят' : 'Выходной по графику назначен',
        'Сотрудник получит уведомление',
      );
      done();
    },
    onError(error) {
      toast.error('Не удалось назначить', error.message);
    },
  });

  const active = mode === 'weekly' ? setWeekly : assign;
  const errors = fieldErrors(active.error);

  return (
    <Modal
      open={open}
      title="Назначить выходной"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button
            loading={active.isPending}
            disabled={userId === ''}
            onClick={() => {
              const id = Number.parseInt(userId, 10);
              if (mode === 'weekly') {
                setWeekly.mutate({
                  userId: id,
                  weekday: weekday === '' ? null : Number.parseInt(weekday, 10),
                });
                return;
              }
              assign.mutate({
                userId: id,
                startDate,
                endDate,
                reason: reason.trim() === '' ? null : reason.trim(),
              });
            }}
          >
            Назначить
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormError
          message={
            active.error !== null && Object.keys(errors).length === 0 ? active.error.message : null
          }
        />

        <Field label="Сотрудник" required error={errors['userId']}>
          <Select
            value={userId}
            onChange={(event) => {
              setUserId(event.target.value);
              const next = staff.data?.items.find(
                (item) => item.id.toString() === event.target.value,
              );
              setWeekday(next?.weeklyDayOff?.toString() ?? '');
            }}
            placeholder="Выберите сотрудника"
            options={(staff.data?.items ?? []).map((item) => ({
              value: item.id.toString(),
              label:
                item.weeklyDayOff === null
                  ? item.fullName
                  : `${item.fullName} · ${weekdayName(item.weeklyDayOff)}`,
            }))}
          />
        </Field>

        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Вид выходного">
          {MODES.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={mode === option.value}
              onClick={() => {
                setMode(option.value);
              }}
              className={cn(
                'rounded-full border px-2.5 py-1 text-footnote transition-colors',
                mode === option.value
                  ? 'border-accent/50 bg-accent/15 text-accent'
                  : 'border-subtle text-secondary hover:bg-ink/[0.08] hover:text-primary',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        {mode === 'weekly' ? (
          <Field
            label="День недели"
            required
            hint={
              currentWeekday === null
                ? 'Повторяется каждую неделю, пока не снять'
                : `Сейчас: ${weekdayName(currentWeekday)}`
            }
            error={errors['weekday']}
          >
            <Select
              value={weekday}
              onChange={(event) => {
                setWeekday(event.target.value);
              }}
              options={WEEKDAY_OPTIONS}
            />
          </Field>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="С" required error={errors['startDate']}>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(event) => {
                    setStartDate(event.target.value);
                    // Один день — обычный случай, и вторую дату тогда не трогают.
                    if (event.target.value > endDate) setEndDate(event.target.value);
                  }}
                />
              </Field>

              <Field label="По включительно" required error={errors['endDate']}>
                <Input
                  type="date"
                  value={endDate}
                  min={startDate}
                  onChange={(event) => {
                    setEndDate(event.target.value);
                  }}
                />
              </Field>
            </div>

            <Field label="Причина" hint="Увидит сотрудник — по желанию" error={errors['reason']}>
              <Input
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value);
                }}
                placeholder="Например: смена по графику у сменщицы"
              />
            </Field>
          </>
        )}
      </div>
    </Modal>
  );
}
