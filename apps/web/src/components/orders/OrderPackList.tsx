'use client';

import type { ReactElement } from 'react';

import { useToast } from '@/components/providers/ToastProvider';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';

/**
 * Сбор на выезд: сверка перед установкой.
 *
 * Забытый держатель — это второй выезд через весь город, и вспоминают о нём
 * уже у клиента. Список собран из самого заказа: шторы по каждому окну,
 * карниз с пластиком и трубой, аксессуары поимённо и по количеству.
 *
 * Пока не отмечено всё, заказ не переходит в «Установка идёт» — проверку
 * держит сервер (`assertOrderPacked`), а не эта карточка.
 */
export function OrderPackList({ orderId }: { readonly orderId: number }): ReactElement | null {
  const toast = useToast();
  const utils = trpc.useUtils();

  const rows = trpc.orders.packList.useQuery({ id: orderId });

  const setPacked = trpc.orders.setPacked.useMutation({
    onSuccess() {
      void utils.orders.packList.invalidate({ id: orderId });
    },
    onError(error) {
      toast.error('Не удалось отметить', error.message);
    },
  });

  const items = rows.data ?? [];
  // Собирать нечего — карточки нет: у заказа без позиций она была бы пустой
  // рамкой с обещанием списка.
  if (rows.isLoading || items.length === 0) return null;

  const packed = items.filter((row) => row.checked).length;
  const ready = packed === items.length;

  return (
    <Card>
      <CardHeader
        title="Сбор на выезд"
        action={
          <span
            className={cn(
              'text-footnote font-medium tabular-nums',
              ready ? 'text-positive' : 'text-secondary',
            )}
          >
            {ready ? 'Всё в машине' : `${packed.toString()} из ${items.length.toString()}`}
          </span>
        }
      />
      <CardBody>
        <ul className="space-y-1">
          {items.map((row) => (
            <li key={row.key}>
              <label
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-tile px-2 py-2 hover:bg-raised',
                  setPacked.isPending ? 'opacity-60' : null,
                )}
              >
                <input
                  type="checkbox"
                  checked={row.checked}
                  disabled={setPacked.isPending}
                  onChange={(event) => {
                    setPacked.mutate({
                      id: orderId,
                      key: row.key,
                      packed: event.target.checked,
                    });
                  }}
                  className="mt-0.5 h-4 w-4 accent-[rgb(var(--accent))]"
                />

                <span className="min-w-0">
                  <span
                    className={cn(
                      'block text-caption',
                      row.checked ? 'text-muted line-through' : 'text-primary',
                    )}
                  >
                    {row.label}
                  </span>
                  {row.detail !== null && (
                    <span className="block text-footnote text-muted">{row.detail}</span>
                  )}
                  {/* Кто положил — вопрос, который задают после забытой вещи. */}
                  {row.checkedBy !== null && (
                    <span className="block text-footnote text-muted">Отметил: {row.checkedBy}</span>
                  )}
                </span>
              </label>
            </li>
          ))}
        </ul>

        {/* Собранному заказу напоминание про «не уйдёт» уже ни к чему. */}
        {!ready && (
          <p className="mt-3 text-footnote text-muted">
            Пока отмечено не всё, заказ не уйдёт в «Установка идёт».
          </p>
        )}
      </CardBody>
    </Card>
  );
}
