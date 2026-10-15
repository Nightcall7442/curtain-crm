'use client';

import { formatInstallSlot, installSlotInputValue, parseInstallSlotInput } from '@curtain-crm/shared';
import { useEffect, useState, type ReactElement } from 'react';

import { useToast } from '@/components/providers/ToastProvider';
import { Button, Field, FormError, Input, Modal } from '@/components/ui/Form';
import { trpc } from '@/lib/trpc';

/**
 * Перенос установки: поставить, сдвинуть или убрать время. Время — по
 * Ташкенту, независимо от часового пояса браузера; установщик получает
 * уведомление с новым временем.
 */
export function InstallationTimeDialog({
  open,
  orderId,
  orderLabel,
  current,
  onClose,
}: {
  readonly open: boolean;
  readonly orderId: number;
  readonly orderLabel: string;
  readonly current: Date | null;
  readonly onClose: () => void;
}): ReactElement | null {
  const toast = useToast();
  const utils = trpc.useUtils();
  const [value, setValue] = useState('');

  useEffect(() => {
    if (open) setValue(current === null ? '' : installSlotInputValue(current));
  }, [open, current]);

  const schedule = trpc.orders.scheduleInstallation.useMutation({
    async onSuccess(order) {
      await Promise.all([utils.orders.byId.invalidate({ id: orderId }), utils.orders.list.invalidate()]);
      if (order.installationAt === null) {
        toast.success('Время установки убрано', orderLabel);
      } else {
        const slot = formatInstallSlot(order.installationAt);
        toast.success(`Установка ${slot.date} в ${slot.time}`, orderLabel);
      }
      onClose();
    },
  });

  if (!open) return null;
  const at = parseInstallSlotInput(value);

  return (
    <Modal
      open
      title="Время установки"
      onClose={onClose}
      footer={
        <>
          {current !== null && (
            <Button
              variant="ghost"
              className="mr-auto"
              loading={schedule.isPending && schedule.variables.at === null}
              onClick={() => {
                schedule.mutate({ orderId, at: null });
              }}
            >
              Убрать время
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button
            loading={schedule.isPending && schedule.variables.at !== null}
            disabled={at === null}
            onClick={() => {
              if (at !== null) schedule.mutate({ orderId, at });
            }}
          >
            Сохранить
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormError message={schedule.error?.message ?? null} />
        <Field label="Дата и время установки" hint="По Ташкенту. Установщик получит уведомление с новым временем">
          <Input
            type="datetime-local"
            value={value}
            autoFocus
            onChange={(event) => {
              setValue(event.target.value);
            }}
          />
        </Field>
      </div>
    </Modal>
  );
}
