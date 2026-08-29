'use client';

import { useState, type ReactElement } from 'react';
import { Minus, Trophy, TrendingDown, TrendingUp } from 'lucide-react';

import {
  formatDayRange,
  MONTH_NAMES_RU,
  RATING_SCOPE_LABELS_RU,
  RATING_SCOPES,
  ROLE_LABELS_RU,
  RatingScope,
  type RatingScope as RatingScopeName,
} from '@curtain-crm/shared';

import { RoleBoard } from '@/components/rating/RoleBoard';
import { ScoreComponent, ScoreMeter } from '@/components/rating/ScoreMeter';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody, CardHeader, ErrorState, Skeleton } from '@/components/ui/Card';
import { controlClass } from '@/components/ui/Form';
import { StatCard } from '@/components/ui/StatCard';
import { DataTable } from '@/components/ui/Table';
import { trpc } from '@/lib/trpc';
import { cn, formatNumber, initials } from '@/lib/utils';

/**
 * Рейтинг сотрудников.
 *
 * Страница отвечает на два разных вопроса и потому состоит из двух частей.
 * Сводная таблица — «кто впереди по компании»: балл сравним между ролями,
 * потому что нормирован внутри каждой. Доски по ролям — «кто впереди среди
 * швей»: там метрики в своих единицах, и сравнение прямое.
 *
 * Балл сопровождается разбивкой на объём, качество и сроки. Веса подобраны,
 * а не выведены из данных (см. `RATING_WEIGHTS` в `@curtain-crm/shared`),
 * и прятать составляющие за итоговой цифрой нельзя: рейтинг влияет на то,
 * как людей воспринимают, и должен быть оспоримым по существу.
 */
export default function RatingPage(): ReactElement {
  const now = new Date();

  const [scope, setScope] = useState<RatingScopeName>(RatingScope.MONTH);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const board = trpc.rating.board.useQuery({ scope, year, month });

  if (board.isError) {
    return (
      <Card>
        <ErrorState
          message={board.error.message}
          onRetry={() => {
            void board.refetch();
          }}
        />
      </Card>
    );
  }

  const data = board.data;

  return (
    <div className="space-y-6">
      {/* Период ------------------------------------------------------------ */}
      <Card>
        <CardHeader
          title="Период рейтинга"
          icon={<Trophy className="h-4 w-4" />}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <div
                role="group"
                aria-label="Период"
                className="flex overflow-hidden rounded border border-subtle"
              >
                {RATING_SCOPES.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setScope(value);
                    }}
                    aria-pressed={scope === value}
                    className={cn(
                      'px-3 py-1.5 text-footnote transition-colors',
                      scope === value
                        ? 'bg-accent/12 text-accent'
                        : 'text-secondary hover:bg-raised hover:text-primary',
                    )}
                  >
                    {RATING_SCOPE_LABELS_RU[value]}
                  </button>
                ))}
              </div>

              {/*
                Выбор месяца при недельном срезе выключен, а не спрятан:
                исчезающий на переключении элемент заставляет искать его глазами.
                Неделя всегда текущая — так решено на сервере.
              */}
              <select
                value={month}
                disabled={scope === RatingScope.WEEK}
                onChange={(event) => {
                  setMonth(Number.parseInt(event.target.value, 10));
                }}
                aria-label="Месяц"
                className={controlClass('sm', 'w-auto pr-8 disabled:opacity-40')}
              >
                {MONTH_NAMES_RU.map((name, index) => (
                  <option key={name} value={index + 1}>
                    {name}
                  </option>
                ))}
              </select>

              <select
                value={year}
                disabled={scope === RatingScope.WEEK}
                onChange={(event) => {
                  setYear(Number.parseInt(event.target.value, 10));
                }}
                aria-label="Год"
                className={controlClass('sm', 'w-auto pr-8 disabled:opacity-40')}
              >
                {[now.getFullYear() - 1, now.getFullYear()].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
          }
        />

        {data !== undefined && (
          <CardBody className="py-2.5">
            <p className="text-footnote text-muted">
              {scope === RatingScope.WEEK
                ? `Текущая неделя, ${formatDayRange(new Date(data.period.start), new Date(data.period.end))}`
                : `${MONTH_NAMES_RU[month - 1] ?? ''} ${year.toString()}`}
              {' · в зачёт идут только заказы, закрытые внутри периода'}
            </p>
          </CardBody>
        )}
      </Card>

      {/* Аналитика --------------------------------------------------------- */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {data === undefined ? (
          Array.from({ length: 5 }, (_unused, index) => (
            <Skeleton key={index} className="h-[104px]" />
          ))
        ) : (
          <>
            <StatCard
              label="Участников"
              value={data.summary.participants.toString()}
              caption="Сотрудников с измеримой ролью"
            />
            <StatCard
              label="Средний балл"
              value={data.summary.averageScore === null ? '—' : formatNumber(data.summary.averageScore)}
              caption="По всем участникам"
            />
            <StatCard
              label="Медианный балл"
              value={data.summary.medianScore === null ? '—' : formatNumber(data.summary.medianScore)}
              caption="Балл типичного сотрудника"
            />
            <StatCard
              label="Заказов в зачёте"
              value={data.summary.ordersCounted.toString()}
              caption="Закрыто за период"
            />
            <StatCard
              label="Без заказов"
              value={data.summary.withoutOrders.toString()}
              caption="Участвуют, но период пуст"
            />
          </>
        )}
      </section>

      {/* Сводная таблица --------------------------------------------------- */}
      <Card>
        <CardHeader
          title="Сводный рейтинг"
          action={
            data === undefined ? undefined : (
              <span className="text-overline text-muted">
                {`вне конкурса: ${data.summary.unrated.toString()}`}
              </span>
            )
          }
        />

        <DataTable
          isLoading={board.isLoading}
          rows={data?.rows ?? []}
          rowKey={(row) => row.userId}
          emptyMessage="За период нет ни одного закрытого заказа"
          columns={[
            {
              key: 'place',
              header: 'Место',
              align: 'right',
              className: 'w-14',
              render: (row) =>
                row.place === null ? (
                  <span className="text-muted">—</span>
                ) : (
                  <span className="font-mono text-body font-semibold text-primary tabular-nums">
                    {row.place}
                  </span>
                ),
            },
            {
              key: 'delta',
              header: 'Δ',
              align: 'center',
              className: 'w-12',
              render: (row) => <PlaceDelta value={row.placeDelta} />,
            },
            {
              key: 'employee',
              header: 'Сотрудник',
              render: (row) => (
                <div className="flex items-center gap-2.5">
                  <Avatar url={row.avatarUrl} fullName={row.fullName} />
                  <div className="min-w-0">
                    <span className="block truncate text-caption text-primary">{row.fullName}</span>
                    <span className="block truncate text-overline text-muted">
                      {row.roles.map((role) => ROLE_LABELS_RU[role]).join(', ')}
                    </span>
                  </div>
                </div>
              ),
            },
            {
              key: 'orders',
              header: 'Заказов',
              align: 'right',
              className: 'font-mono tabular-nums',
              render: (row) => row.ordersCount,
            },
            {
              key: 'components',
              header: 'Из чего сложился балл',
              render: (row) =>
                row.unratedReason !== null ? (
                  <span className="text-footnote text-muted">{row.unratedReason}</span>
                ) : row.byRole.length === 0 ? (
                  <span className="text-footnote text-muted">
                    За период нет закрытых заказов
                  </span>
                ) : (
                  <div className="flex flex-col gap-1">
                    {row.byRole.map((entry) => (
                      <div key={entry.role} className="flex flex-wrap items-baseline gap-x-3">
                        <Badge tone="accent">{ROLE_LABELS_RU[entry.role]}</Badge>
                        <ScoreComponent component="volume" value={entry.volumeScore} />
                        <ScoreComponent component="quality" value={entry.qualityPercent} />
                        <ScoreComponent component="punctuality" value={entry.punctualityPercent} />
                      </div>
                    ))}
                  </div>
                ),
            },
            {
              key: 'score',
              header: 'Балл',
              className: 'w-[150px]',
              render: (row) =>
                row.score === null ? (
                  <span className="text-footnote text-muted">вне конкурса</span>
                ) : (
                  <ScoreMeter score={row.score} />
                ),
            },
          ]}
        />
      </Card>

      {/* Доски по ролям ---------------------------------------------------- */}
      {data !== undefined && (
        <section className="grid gap-3 xl:grid-cols-2">
          {data.boards.map((entry) => (
            <RoleBoard key={entry.role} board={entry} />
          ))}
        </section>
      )}
    </div>
  );
}

/**
 * Изменение места к предыдущему периоду.
 *
 * Знак печатается текстом и дублируется стрелкой: направление не должно
 * зависеть от способности различить зелёный и красный.
 */
function PlaceDelta({ value }: { readonly value: number | null }): ReactElement {
  if (value === null) {
    return <span className="text-muted">—</span>;
  }

  if (value === 0) {
    return (
      <span className="inline-flex items-center text-muted" title="Место не изменилось">
        <Minus className="h-3.5 w-3.5" aria-hidden />
        <span className="sr-only">Без изменений</span>
      </span>
    );
  }

  const isUp = value > 0;
  const Icon = isUp ? TrendingUp : TrendingDown;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 font-mono text-footnote tabular-nums',
        isUp ? 'text-positive' : 'text-danger',
      )}
      title={isUp ? 'Поднялся в таблице' : 'Опустился в таблице'}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {isUp ? `+${value.toString()}` : value.toString()}
    </span>
  );
}

/** Фото сотрудника; при его отсутствии — инициалы. */
function Avatar({
  url,
  fullName,
}: {
  readonly url: string | null;
  readonly fullName: string;
}): ReactElement {
  if (url !== null) {
    // Обычный <img>, а не next/image: адрес приходит из хранилища и меняется
    // вместе с драйвером, а оптимизатору Next нужен заранее известный список
    // источников. Так же сделано в списке сотрудников.
    return (
      <img
        src={url}
        alt=""
        className="h-8 w-8 shrink-0 rounded-full border border-subtle object-cover"
      />
    );
  }

  return (
    <span
      aria-hidden
      className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-subtle bg-raised text-overline font-medium text-secondary"
    >
      {initials(fullName)}
    </span>
  );
}
