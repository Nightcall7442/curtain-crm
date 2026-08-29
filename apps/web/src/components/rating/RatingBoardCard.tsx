'use client';

import type { ReactElement } from 'react';
import { Trophy } from 'lucide-react';
import Link from 'next/link';

import { ROLE_LABELS_RU } from '@curtain-crm/shared';

import { Card, CardBody, CardHeader, EmptyState, ErrorState, Skeleton } from '@/components/ui/Card';
import { trpc } from '@/lib/trpc';
import { cn, initials } from '@/lib/utils';

import { ScoreMeter } from './ScoreMeter';

/**
 * Табло рейтинга на главной панели.
 *
 * Дашборд уже показывает «лучшего в каждой роли», но не отвечает на вопрос
 * «кто впереди по мастерской в целом» — доски по ролям несравнимы между
 * собой по построению. Сквозной балл как раз для этого и считается, поэтому
 * его место на первом экране, а не только в отдельном разделе.
 *
 * Восемь строк, а не все: дашборд собирает обзор, а не полную таблицу.
 * За полной — ссылка в заголовке.
 */

/** Сколько строк помещается, не превращая карточку в отдельный раздел. */
const VISIBLE_ROWS = 8;

export function RatingBoardCard({
  year,
  month,
}: {
  readonly year: number;
  readonly month: number;
}): ReactElement {
  const board = trpc.rating.board.useQuery({ year, month });

  const rows = (board.data?.rows ?? []).filter((row) => row.place !== null).slice(0, VISIBLE_ROWS);

  return (
    <Card>
      <CardHeader
        title="Рейтинг сотрудников"
        icon={<Trophy className="h-4 w-4" />}
        action={
          <Link
            href="/rating"
            className="text-footnote font-semibold text-accent transition-opacity hover:opacity-70"
          >
            Вся таблица
          </Link>
        }
      />

      {board.isError ? (
        <ErrorState
          message={board.error.message}
          onRetry={() => {
            void board.refetch();
          }}
        />
      ) : board.isLoading ? (
        <CardBody className="space-y-2.5">
          {Array.from({ length: 5 }, (_unused, index) => (
            <Skeleton key={index} className="h-8" />
          ))}
        </CardBody>
      ) : rows.length === 0 ? (
        <EmptyState
          message="За период нет закрытых заказов"
          hint="Строки появятся, когда первый заказ месяца дойдёт до статуса «Выполнен»"
        />
      ) : (
        <ul className="px-2 pb-2">
          {rows.map((row, index) => (
            <li
              key={row.userId}
              className={cn(
                'flex items-center gap-3 rounded-tile px-2 py-2 transition-colors hover:bg-raised/60',
                // Разделитель внутри строки, а не на всю ширину карточки:
                // линия начинается там же, где текст.
                index === rows.length - 1 ? null : 'border-b border-subtle/60',
              )}
            >
              <span
                className={cn(
                  'w-5 shrink-0 text-right font-mono text-caption tabular-nums',
                  // Тройка лидеров выделена весом, а не медалями: три значка
                  // подряд в списке из восьми строк превращают его в ёлку.
                  row.place !== null && row.place <= 3
                    ? 'font-semibold text-primary'
                    : 'text-muted',
                )}
              >
                {row.place}
              </span>

              <span
                aria-hidden
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent-soft text-overline font-semibold text-accent"
              >
                {initials(row.fullName)}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-caption text-primary">{row.fullName}</span>
                <span className="block truncate text-footnote text-muted">
                  {row.roles.map((role) => ROLE_LABELS_RU[role]).join(', ')}
                </span>
              </span>

              <ScoreMeter score={row.score ?? 0} className="w-[124px] shrink-0" />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
