'use client';

import { useState, type ReactElement } from 'react';

import { useToast } from '@/components/providers/ToastProvider';
import { Button, Field, fieldErrors, FormError, Input, Modal, Select } from '@/components/ui/Form';
import { trpc } from '@/lib/trpc';
import { todayIso } from '@curtain-crm/shared';

/**
 * Выходной, назначенный руководителем.
 *
 * Раньше выходной существовал только как просьба снизу: сотрудник просил,
 * руководитель одобрял. Но график цеха составляет руководитель — и поставить
 * человека на отдых сам он не мог, хотя именно этим и занимается, распределяя
 * нагрузку на неделю.
 *
 * Назначенный выходной согласован сразу: это не просьба, которую кто-то ещё
 * будет рассматривать. Сотрудник получает уведомление и видит день в своём
 * графике в приложении.
 */
export function AssignDayOffDialog({
  open,
  onClose,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
}): ReactElement {
  const toast = useToast();
  const utils = trpc.useUtils();

  const [userId, setUserId] = useState('');
  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState(todayIso());
  const [reason, setReason] = useState('');

  const staff = trpc.users.list.useQuery(
    { page: 1, pageSize: 100, isActive: true },
    { enabled: open },
  );

  const assign = trpc.dayOff.assign.useMutation({
    onSuccess() {
      toast.success('Выходной назначен', 'Сотрудник получит уведомление');
      void utils.dayOff.list.invalidate();
      void utils.shifts.timesheet.invalidate();
      setReason('');
      onClose();
    },
    onError(error) {
      toast.error('Не удалось назначить', error.message);
    },
  });

  const errors = fieldErrors(assign.error);

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
            loading={assign.isPending}
            disabled={userId === ''}
            onClick={() => {
              assign.mutate({
                userId: Number.parseInt(userId, 10),
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
            assign.error !== null && Object.keys(errors).length === 0 ? assign.error.message : null
          }
        />

        <Field label="Сотрудник" required error={errors['userId']}>
          <Select
            value={userId}
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
      </div>
    </Modal>
  );
}
