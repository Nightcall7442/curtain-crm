'use client';

import type { ReactElement } from 'react';

import {
  RATING_ROLE_METRICS,
  ROLE_LABELS_RU,
} from '@curtain-crm/shared';

import { Card, CardBody, CardHeader, EmptyState } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/Table';
import type { RouterOutputs } from '@/lib/trpc';
import { formatPercent, formatQuantity } from '@/lib/utils';

import { ScoreMeter } from './ScoreMeter';

/**
 * Доска по одной роли.
 *
 * Здесь метрика печатается в СВОИХ единицах — м², сум, заказы, — а не в
 * нормированном балле: внутри роли сравнение честное и приводить его к
 * безразмерной шкале незачем. Балл рядом нужен только чтобы совпадать со
 * сводной таблицей: иначе руководитель увидит швею первой в своей доске и
 * пятой в общей и решит, что одна из таблиц врёт.
 */

type Board = RouterOutputs['rating']['board']['boards'][number];

export function RoleBoard({ board }: { readonly board: Board }): ReactElement {
  const metric = RATING_ROLE_METRICS[board.role];

  return (
    <Card>
      <CardHeader
        title={ROLE_LABELS_RU[board.role]}
        action={
          <span className="text-overline text-muted">
            {`${board.rows.length.toString()} чел.`}
          </span>
        }
      />

      {board.rows.length === 0 ? (
        <EmptyState
          message="За период никто не закрыл заказ в этой роли"
          hint="Строка появится, когда заказ дойдёт до статуса «Выполнен»"
        />
      ) : (
        <CardBody className="p-0">
          <DataTable
            rows={board.rows}
            rowKey={(row) => row.userId}
            columns={[
              {
                key: 'place',
                header: '#',
                align: 'right',
                className: 'w-8 font-mono text-muted tabular-nums',
                render: (_row, index) => index + 1,
              },
              {
                key: 'name',
                header: 'Сотрудник',
                render: (row) => <span className="text-primary">{row.fullName}</span>,
              },
              {
                key: 'volume',
                header: metric.label,
                align: 'right',
                className: 'font-mono tabular-nums',
                render: (row) =>
                  // У продавца сумма уже собрана сервером вместе с валютой,
                  // у остальных — обычное число со своей единицей.
                  row.volumeFormatted ?? `${formatQuantity(row.volumeValue)} ${metric.unit}`,
              },
              {
                key: 'orders',
                header: 'Заказов',
                align: 'right',
                className: 'font-mono tabular-nums',
                render: (row) => row.ordersCount,
              },
              {
                key: 'quality',
                header: 'Качество',
                align: 'right',
                className: 'font-mono tabular-nums',
                render: (row) =>
                  row.qualityPercent === null
                    ? '—'
                    : formatPercent(row.qualityPercent, { fractionDigits: 0 }),
              },
              {
                key: 'punctuality',
                header: 'В срок',
                align: 'right',
                className: 'font-mono tabular-nums',
                render: (row) =>
                  row.punctualityPercent === null
                    ? '—'
                    : formatPercent(row.punctualityPercent, { fractionDigits: 0 }),
              },
              {
                key: 'score',
                header: 'Балл',
                className: 'w-[132px]',
                render: (row) => <ScoreMeter score={row.score} />,
              },
            ]}
          />
        </CardBody>
      )}
    </Card>
  );
}
