'use client';

import { formatMoney, formatMoneyShort, OrderStatus } from '@curtain-crm/shared';
import Link from 'next/link';
import type { ReactElement } from 'react';

import { RankedBars } from '@/components/charts/Bars';
import { LineSeries } from '@/components/charts/LineSeries';
import {
  AttentionCard,
  BigNumberCard,
  HeroCard,
  PulseCard,
  RingCard,
} from '@/components/dashboard/NeonWidgets';
import { ProductionPipeline } from '@/components/dashboard/ProductionPipeline';
import { Card, CardBody, CardHeader, EmptyState, ErrorState, Skeleton } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/Table';
import { trpc } from '@/lib/trpc';
import { formatNumber } from '@/lib/utils';

/**
 * Главная панель руководства.
 *
 * Показывает ТОЛЬКО подтверждённые данными показатели. Виджеты, для которых
 * в системе нет источника, на этот экран не вынесены: цифра, которой неоткуда
 * взяться, опаснее её отсутствия — по ней начинают принимать решения.
 *
 * Чего здесь поэтому нет:
 *  - конверсии продавца — нет ни лидов, ни необорванных обращений, и делить
 *    закрытые заказы не на что;
 *  - остатков ткани — складского учёта в системе нет вовсе;
 *  - процента выполнения плана — производственного плана как сущности нет,
 *    а `payroll_schemes.kpi_target` это план для расчёта зарплаты, не для цеха.
 *
 * А вот качество работы источник имеет: система фиксирует возвраты на
 * переделку, и «без брака 97 %» считается по ним (см. `performance.service.ts`).
 *
 * Все запросы ниже — `managementProcedure`, поэтому рядовому сотруднику этот
 * экран не показывается вовсе (см. `app/page.tsx`): он получил бы восемь
 * отказов подряд вместо главной страницы.
 */
export function ManagementDashboard(): ReactElement {
  const now = new Date();
  const period = { year: now.getFullYear(), month: now.getMonth() + 1 };

  const dashboard = trpc.reports.dashboard.useQuery({});
  const attention = trpc.reports.attention.useQuery({});
  const topProducts = trpc.reports.topProducts.useQuery({ ...period, limit: 5 });
  const dynamics = trpc.reports.dynamics.useQuery(period);
  const sellers = trpc.reports.sellerRating.useQuery({ ...period, limit: 5 });
  const workshops = trpc.reports.workshops.useQuery({});
  const installQueue = trpc.reports.installationQueue.useQuery({});
  const performers = trpc.reports.topPerformers.useQuery(period);

  if (dashboard.isError) {
    return (
      <Card>
        <ErrorState
          message={dashboard.error.message}
          onRetry={() => {
            void dashboard.refetch();
          }}
        />
      </Card>
    );
  }

  const data = dashboard.data;
  const statusCount = (status: OrderStatus): number =>
    data?.statusCounts.find((entry) => entry.status === status)?.count ?? 0;

  /**
   * Число и ссылка строки цеха — оба выводятся из статуса.
   * Собирать адрес `/orders?status=…` в девяти местах руками означало бы
   * девять шансов разойтись с тем, что читает страница заказов.
   */
  const rowFor = (status: OrderStatus): { readonly value: number; readonly href: string } => ({
    value: statusCount(status),
    href: `/orders?status=${status}`,
  });

  /*
    Заказы по дням: `dynamics` отдаёт накопленный итог, столбикам нужен
    дневной прирост. Дни без заказов в выборке отсутствуют — итог за них
    равен предыдущему, и прирост выходит нулевой сам собой.
  */
  const today = now.getDate();
  const daily: number[] = [];
  let previousTotal = 0;
  for (let day = 1; day <= today; day += 1) {
    const point = dynamics.data?.current.filter((entry) => entry.day <= day).at(-1);
    const total = point?.orders ?? previousTotal;
    daily.push(Math.max(0, total - previousTotal));
    previousTotal = total;
  }

  const completed = data?.completedThisMonth ?? 0;
  const active = data?.activeOrders ?? 0;
  const completionPercent = completed + active === 0 ? 0 : Math.round((completed / (completed + active)) * 100);

  const attentionEntries = (attention.data ?? [])
    .filter((entry) => entry.count > 0)
    .map((entry) => ({ ...entry, href: ATTENTION_HREFS[entry.key] }));

  return (
    <div className="space-y-6">
      {/*
        --- Верхний ряд ------------------------------------------------------
        Слева — пульс заказов по дням с числами периода, справа — сплошная
        неоновая карточка выручки: главное число месяца и три пилюли с
        объёмом. Так на макете; так и по смыслу — утром директор смотрит,
        сколько пришло и сколько заработано.
      */}
      <section className="grid gap-4 xl:grid-cols-12">
        <div className="min-w-0 xl:col-span-8">
          {dashboard.isLoading || dynamics.isLoading ? (
            <Skeleton className="h-[260px]" />
          ) : data === undefined ? null : (
            <PulseCard
              title="Заказы"
              days={daily}
              today={today}
              stats={[
                {
                  label: 'Сегодня',
                  value: data.ordersToday.toString(),
                  delta: data.ordersTodayDelta,
                  caption: `Вчера: ${data.ordersYesterday.toString()}`,
                },
                {
                  label: 'За неделю',
                  value: data.ordersThisWeek.toString(),
                  delta: data.ordersWeekDelta,
                  caption: `Прошлая неделя: ${data.ordersPrevWeek.toString()}`,
                },
                {
                  label: 'За месяц',
                  value: data.ordersThisMonth.toString(),
                  delta: data.ordersMonthDelta,
                  caption: `Прошлый месяц: ${data.ordersPrevMonth.toString()}`,
                },
              ]}
            />
          )}
        </div>
        <div className="xl:col-span-4">
          {dashboard.isLoading ? (
            <Skeleton className="h-[260px]" />
          ) : data === undefined ? null : (
            <HeroCard
              title="Выручка за месяц"
              value={formatMoneyShort(data.revenueThisMonthMinor, { withoutCurrency: true })}
              unit="сум"
              delta={data.revenueMonthDelta}
              caption={`Точно: ${data.revenueThisMonthFormatted} · прошлый месяц: ${formatMoneyShort(data.revenuePrevMonthMinor)}`}
              chips={[
                { label: 'Заказов за месяц', value: data.ordersThisMonth.toString(), href: '/orders' },
                {
                  label: 'Выполнено',
                  value: data.completedThisMonth.toString(),
                  href: `/orders?status=${OrderStatus.COMPLETED}`,
                },
                { label: 'На смене сейчас', value: data.employeesOnShift.toString(), href: '/employees/timesheet' },
              ]}
            />
          )}
        </div>
      </section>

      {/* --- Конвейер — во всю ширину: это последовательность, ей нельзя тесно --- */}
      <Card>
        <CardHeader title="Этапы производства" />
        <CardBody className="px-4 pb-4">
          {dashboard.isLoading ? (
            <Skeleton className="h-[104px]" />
          ) : data === undefined ? null : (
            <ProductionPipeline stages={data.productionStages} />
          )}
        </CardBody>
      </Card>

      {/* --- Число в работе, кольцо, что горит ------------------------------- */}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-12">
        <div className="xl:col-span-3">
          {dashboard.isLoading ? (
            <Skeleton className="h-full min-h-[160px]" />
          ) : data === undefined ? null : (
            <BigNumberCard
              title="В работе"
              value={data.activeOrders.toString()}
              caption="Заказов сейчас в производстве и на установке"
              litDots={Math.min(27, Math.round((completionPercent / 100) * 27))}
              href="/orders"
            />
          )}
        </div>
        <div className="xl:col-span-3">
          {dashboard.isLoading ? (
            <Skeleton className="h-full min-h-[220px]" />
          ) : (
            <RingCard
              title="Выполнено за месяц"
              segments={[
                { key: 'done', label: 'Выполнено', value: completed, color: 'rgb(var(--accent))' },
                { key: 'active', label: 'В работе', value: active, color: 'rgb(255 255 255 / 0.10)' },
              ]}
              centerValue={completed.toString()}
              centerLabel={`${completionPercent.toString()}% от всех`}
              action={{ label: 'Закрытые заказы', href: `/orders?status=${OrderStatus.COMPLETED}` }}
            />
          )}
        </div>

        <div className="md:col-span-2 xl:col-span-6">
          <AttentionCard
            title="Требует внимания"
            subtitle="Заказы, где нужно решение руководителя"
            headline={
              attention.data === undefined
                ? undefined
                : {
                    value: attention.data.reduce((sum, entry) => sum + entry.count, 0).toString(),
                    caption: 'заказов ждут действия',
                  }
            }
            entries={attentionEntries}
            isLoading={attention.isLoading}
          />
        </div>
      </section>

      {/* --- Цеха и очередь ------------------------------------------------ */}
      <section className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Швейный цех" />
          <CardBody className="space-y-2">
            <StageRow
              label="Ждут назначения швеи"
              {...rowFor(OrderStatus.PENDING_SEWING_ASSIGNMENT)}
            />
            <StageRow
              label="В пошиве"
              {...rowFor(OrderStatus.SEWING_IN_PROGRESS)}
            />
            <StageRow
              label="Пошив завершён"
              {...rowFor(OrderStatus.SEWING_DONE)}
            />
            <WorkshopFooter
              isLoading={workshops.isLoading}
              items={
                workshops.data === undefined
                  ? []
                  : [
                      // Площадь, а не погонные метры: площадь система считает
                      // из размеров позиции, а расход ткани зависит от раскроя
                      // и нигде не фиксируется.
                      {
                        label: 'Объём в работе',
                        value: `${formatNumber(workshops.data.sewing.pendingAreaM2)} м²`,
                      },
                      {
                        label: 'Сшито сегодня',
                        value: workshops.data.sewing.doneToday.toString(),
                      },
                    ]
              }
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Контроль качества" />
          <CardBody className="space-y-2">
            <StageRow
              label="На контроле"
              {...rowFor(OrderStatus.PENDING_QC)}
            />
            <StageRow
              label="Брак, на доработке"
              {...rowFor(OrderStatus.QC_FAILED)}
            />
            <StageRow
              label="Контроль пройден"
              {...rowFor(OrderStatus.QC_PASSED)}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Установка" />
          <CardBody className="space-y-2">
            <StageRow
              label="Ждут назначения установщика"
              {...rowFor(OrderStatus.PENDING_INSTALLATION_ASSIGNMENT)}
            />
            <StageRow
              label="Установщик назначен"
              {...rowFor(OrderStatus.INSTALLATION_ASSIGNED)}
            />
            <StageRow
              label="Установка идёт"
              {...rowFor(OrderStatus.INSTALLATION_IN_PROGRESS)}
            />
            <WorkshopFooter
              isLoading={workshops.isLoading}
              items={
                workshops.data === undefined
                  ? []
                  : [
                      {
                        label: 'Установлено сегодня',
                        value: workshops.data.installation.doneToday.toString(),
                      },
                      {
                        label: 'Всего в очереди',
                        value: (installQueue.data?.total ?? 0).toString(),
                      },
                    ]
              }
            />
          </CardBody>
        </Card>
      </section>

      {/* --- Очередь на установку и лучшие сотрудники ----------------------- */}
      <section className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Очередь на установку" />
          <CardBody className="space-y-2">
            {installQueue.isLoading ? (
              <Skeleton className="h-24" />
            ) : installQueue.data === undefined ? null : (
              <>
                <StageRow
                  label="Просрочено"
                  value={installQueue.data.overdue}
                  href="/orders?stage=ready_for_install"
                />
                <StageRow
                  label="Срок сегодня"
                  value={installQueue.data.dueToday}
                  href="/orders?stage=ready_for_install"
                  tone={installQueue.data.dueToday > 0 ? 'danger' : 'neutral'}
                />
                <StageRow
                  label="Срок на этой неделе"
                  value={installQueue.data.dueThisWeek}
                  href="/orders?stage=installation"
                />
                {/* Заказы без срока не попадают ни в одну корзину выше —
                    молча терять их нельзя. */}
                {installQueue.data.undated > 0 && (
                  <StageRow
                    label="Без срока"
                    value={installQueue.data.undated}
                    href="/orders?stage=ready_for_install"
                  />
                )}
              </>
            )}
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Лучшие сотрудники месяца" />
          <CardBody>
            {performers.isLoading ? (
              <Skeleton className="h-24" />
            ) : performers.data === undefined ? null : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <PerformerCard
                  role="Продавец"
                  name={performers.data.seller?.fullName ?? null}
                  metrics={
                    performers.data.seller === null
                      ? []
                      : [
                          { label: 'Заказы', value: performers.data.seller.ordersCount.toString() },
                          { label: 'Выручка', value: performers.data.seller.revenueFormatted },
                        ]
                  }
                />
                <PerformerCard
                  role="Мастер-замерщик"
                  name={performers.data.master?.fullName ?? null}
                  metrics={
                    performers.data.master === null
                      ? []
                      : [
                          { label: 'Заказы', value: performers.data.master.ordersCount.toString() },
                          {
                            label: 'Срок замера',
                            value:
                              performers.data.master.avgMeasurementDays === null
                                ? '—'
                                : `${formatNumber(performers.data.master.avgMeasurementDays)} дн`,
                          },
                          {
                            label: 'Без переделок',
                            value: percentOrDash(performers.data.master.qualityPercent),
                          },
                        ]
                  }
                />
                <PerformerCard
                  role="Швея"
                  name={performers.data.sewer?.fullName ?? null}
                  metrics={
                    performers.data.sewer === null
                      ? []
                      : [
                          {
                            label: 'Сшито',
                            value: `${formatNumber(performers.data.sewer.areaM2)} м²`,
                          },
                          { label: 'Заказы', value: performers.data.sewer.ordersCount.toString() },
                          {
                            label: 'Без брака',
                            value: percentOrDash(performers.data.sewer.qualityPercent),
                          },
                        ]
                  }
                />
                <PerformerCard
                  role="Установщик"
                  name={performers.data.installer?.fullName ?? null}
                  metrics={
                    performers.data.installer === null
                      ? []
                      : [
                          {
                            label: 'Установок',
                            value: performers.data.installer.ordersCount.toString(),
                          },
                          {
                            label: 'Без доработок',
                            value: percentOrDash(performers.data.installer.qualityPercent),
                          },
                        ]
                  }
                />
              </div>
            )}
          </CardBody>
        </Card>
      </section>

      {/* --- Товары и динамика заказов -------------------------------------- */}
      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Самые продаваемые модели (месяц)" />
          <CardBody>
            {topProducts.isLoading ? (
              <Skeleton className="h-32" />
            ) : topProducts.data === undefined || topProducts.data.length === 0 ? (
              <EmptyState
                message="За этот месяц заказов ещё нет"
                hint="Рейтинг строится по позициям созданных заказов"
              />
            ) : (
              <RankedBars
                items={topProducts.data.map((item) => ({
                  key: item.model,
                  label: item.model,
                  value: item.ordersCount,
                  valueLabel: `${item.ordersCount.toString()} зак.`,
                }))}
              />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Динамика заказов" />
          <CardBody>
            {dynamics.isLoading ? (
              <Skeleton className="h-44" />
            ) : dynamics.data === undefined ? null : (
              <LineSeries
                current={dynamics.data.current.map((point) => ({ x: point.day, y: point.orders }))}
                previous={dynamics.data.previous.map((point) => ({
                  x: point.day,
                  y: point.orders,
                }))}
              />
            )}
          </CardBody>
        </Card>
      </section>

      {/*
        --- Выручка и продавцы ---------------------------------------------
        Сквозного рейтинга сотрудников здесь больше нет: карточка была
        точной копией раздела «Рейтинг» и удваивала длину страницы. Рейтинг
        продавцов остаётся — у него на дашборде нет двойника.
      */}
      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Динамика выручки" />
          <CardBody>
            {dynamics.isLoading ? (
              <Skeleton className="h-44" />
            ) : dynamics.data === undefined ? null : (
              <LineSeries
                current={dynamics.data.current.map((point) => ({
                  x: point.day,
                  // В миллионах сумов: полная сумма не помещается в подпись оси.
                  y: Math.round(point.revenueMinor / 100 / 1_000_000),
                }))}
                previous={dynamics.data.previous.map((point) => ({
                  x: point.day,
                  y: Math.round(point.revenueMinor / 100 / 1_000_000),
                }))}
                formatValue={(value) => `${value.toString()} млн`}
              />
            )}
          </CardBody>
        </Card>

        <Card>
        <CardHeader title="Рейтинг продавцов (месяц)" />
        <DataTable
          isLoading={sellers.isLoading}
          rows={sellers.data ?? []}
          rowKey={(row) => row.userId}
          emptyMessage="За этот месяц закрытых заказов ещё нет"
          columns={[
            {
              key: 'place',
              header: 'Место',
              align: 'center',
              render: (row) => <span className="text-accent">{row.place}</span>,
            },
            {
              key: 'name',
              header: 'Продавец',
              render: (row) => <span className="text-primary">{row.fullName}</span>,
            },
            { key: 'orders', header: 'Заказы', align: 'right', render: (row) => row.ordersCount },
            {
              key: 'revenue',
              header: 'Выручка',
              align: 'right',
              render: (row) => (
                <span className="text-primary" title={formatMoney(row.revenueMinor)}>
                  {formatMoneyShort(row.revenueMinor)}
                </span>
              ),
            },
          ]}
        />
        </Card>
      </section>
    </div>
  );
}

/** Процент или прочерк, если сравнивать не с чем. */
function percentOrDash(value: number | null): string {
  return value === null ? '—' : `${value.toString()}%`;
}

/**
 * Куда ведёт каждая тревога.
 *
 * Адреса выводятся из статуса, как и строки цехов ниже: у просрочки
 * своего фильтра в списке заказов нет, поэтому ссылки у неё нет тоже —
 * ссылка, открывающая «не то», хуже её отсутствия.
 */
const ATTENTION_HREFS: Readonly<Record<string, string>> = {
  waiting_sewing: `/orders?status=${OrderStatus.PENDING_SEWING_ASSIGNMENT}`,
  waiting_install: `/orders?status=${OrderStatus.PENDING_INSTALLATION_ASSIGNMENT}`,
  waiting_qc: `/orders?status=${OrderStatus.PENDING_QC}`,
};

/**
 * Подвал карточки цеха: показатели, которых нет среди статусов.
 *
 * Отделён линией от строк-ссылок выше намеренно: те ведут в список заказов,
 * а эти никуда не ведут — числу «197,9 м²» не соответствует никакой фильтр.
 */
function WorkshopFooter({
  isLoading,
  items,
}: {
  readonly isLoading: boolean;
  readonly items: readonly { readonly label: string; readonly value: string }[];
}): ReactElement | null {
  if (isLoading) return <Skeleton className="mt-2 h-8" />;
  if (items.length === 0) return null;

  return (
    <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 border-t border-subtle pt-2 text-footnote">
      {items.map((item) => (
        <div key={item.label} className="flex items-baseline gap-1.5">
          <dt className="text-muted">{item.label}:</dt>
          <dd className="font-medium text-primary">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Лучший сотрудник в роли.
 *
 * У ролей разные метрики намеренно: продавца меряют выручкой, швею —
 * площадью, мастера — сроком. Сводить их к одному «баллу» значило бы
 * придумать веса, которых никто не задавал.
 */
function PerformerCard({
  role,
  name,
  metrics,
}: {
  readonly role: string;
  readonly name: string | null;
  readonly metrics: readonly { readonly label: string; readonly value: string }[];
}): ReactElement {
  return (
    <section className="rounded-2xl bg-ink/[0.04] p-4">
      <h4 className="text-footnote font-medium text-muted">{role}</h4>

      {name === null ? (
        <p className="mt-2 text-footnote text-muted">За месяц закрытых заказов нет</p>
      ) : (
        <>
          <p className="mt-1 text-caption font-medium text-primary">{name}</p>
          <dl className="mt-2 space-y-1 text-footnote">
            {metrics.map((metric) => (
              <div key={metric.label} className="flex items-baseline justify-between gap-2">
                <dt className="text-muted">{metric.label}</dt>
                <dd className="text-secondary">{metric.value}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </section>
  );
}

/** Строка «показатель — число» внутри карточек цехов. */
function StageRow({
  label,
  value,
  href,
  tone = 'neutral',
}: {
  readonly label: string;
  readonly value: number;
  readonly href: string;
  readonly tone?: 'neutral' | 'positive' | 'danger';
}): ReactElement {
  const valueClass =
    tone === 'danger' ? 'text-danger' : tone === 'positive' ? 'text-positive' : 'text-primary';

  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded px-2 py-1.5 text-caption transition-colors hover:bg-ink/[0.06]"
    >
      <span className="text-secondary">{label}</span>
      <span className={`font-semibold ${valueClass}`}>{value}</span>
    </Link>
  );
}
