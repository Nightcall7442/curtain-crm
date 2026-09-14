'use client';

import { useState, type ReactElement } from 'react';

import { useToast } from '@/components/providers/ToastProvider';
import { Button, controlClass, Field, FormError, Input, Modal, Select } from '@/components/ui/Form';
import { trpc } from '@/lib/trpc';
import { isManagement } from '@curtain-crm/shared';

/**
 * Выдать доп. работу.
 *
 * Открывается из двух мест: из строки сотрудника — тогда адресат уже
 * известен и не меняется, и из шапки списка поручений — тогда сотрудника
 * выбирают здесь. Руководства в списке нет: поручения выдают, а не получают.
 */
export function TaskCreateDialog({
  open,
  onClose,
  employee,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Заранее известный адресат; без него — выбор из списка. */
  readonly employee?: { readonly id: number; readonly fullName: string };
}): ReactElement {
  const toast = useToast();
  const utils = trpc.useUtils();

  const [assigneeId, setAssigneeId] = useState('');
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [due, setDue] = useState('');

  const staff = trpc.users.list.useQuery(
    { page: 1, pageSize: 100, isActive: true },
    { enabled: open && employee === undefined },
  );
  const candidates = (staff.data?.items ?? []).filter((person) => !isManagement(person.roles));

  const targetId = employee?.id ?? (assigneeId === '' ? null : Number.parseInt(assigneeId, 10));
  const targetName =
    employee?.fullName ?? candidates.find((person) => person.id === targetId)?.fullName ?? '';

  const create = trpc.tasks.create.useMutation({
    onSuccess() {
      setTitle('');
      setDetails('');
      setDue('');
      setAssigneeId('');
      toast.success('Доп. работа отправлена', `${targetName} получит уведомление`);
      void utils.tasks.list.invalidate();
      onClose();
    },
    onError(error) {
      toast.error('Доп. работа не создана', error.message);
    },
  });

  return (
    <Modal
      open={open}
      title={employee === undefined ? 'Доп. работа' : `Доп. работа: ${employee.fullName}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button
            loading={create.isPending}
            disabled={title.trim().length === 0 || targetId === null}
            onClick={() => {
              if (targetId === null) return;
              create.mutate({
                assigneeId: targetId,
                title: title.trim(),
                ...(details.trim().length > 0 ? { details: details.trim() } : {}),
                ...(due.length > 0 ? { dueDate: due } : {}),
              });
            }}
          >
            Отправить
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormError message={create.error?.message ?? null} />

        {employee === undefined && (
          <Field label="Кому" required>
            <Select
              value={assigneeId}
              onChange={(event) => {
                setAssigneeId(event.target.value);
              }}
              placeholder={staff.isLoading ? 'Загрузка…' : 'Выберите сотрудника'}
              options={candidates.map((person) => ({
                value: person.id.toString(),
                label: person.fullName,
              }))}
            />
          </Field>
        )}

        <Field label="Что нужно сделать" required>
          <Input
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
            }}
            placeholder="Например: получить ткань у поставщика"
          />
        </Field>

        <Field label="Подробности">
          <textarea
            value={details}
            onChange={(event) => {
              setDetails(event.target.value);
            }}
            rows={3}
            placeholder="Адрес, контакты, детали — всё, что понадобится на месте"
            className={controlClass('md')}
          />
        </Field>

        <Field label="Срок" hint="Не обязателен — поручение без срока просто висит открытым">
          <Input
            type="date"
            value={due}
            onChange={(event) => {
              setDue(event.target.value);
            }}
          />
        </Field>
      </div>
    </Modal>
  );
}
