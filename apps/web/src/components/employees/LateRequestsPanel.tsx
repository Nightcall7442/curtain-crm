'use client';

import {
  DAY_OFF_STATUS_LABELS_RU,
  DAY_OFF_STATUSES,
  DayOffStatus,
  MAX_LATE_REQUEST_REJECTION_REASON_LENGTH,
  workshopDayIso,
  type DayOffStatus as DayOffStatusName,
} from '@curtain-crm/shared';
import { Check } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { RejectRequestDialog } from '@/components/employees/RejectRequestDialog';
import { useAuth } from '@/components/providers/AuthProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { DayOffStatusBadge } from '@/components/ui/Badge';
import { Card, CardHeader, ErrorState } from '@/components/ui/Card';
import { FilterBar, Select } from '@/components/ui/Form';
import { DataTable } from '@/components/ui/Table';
import { trpc } from '@/lib/trpc';
import { formatDate, formatDateTime } from '@/lib/utils';

/**
 * Запросы на опоздание: «12.11 приду к 10:30».
 *
 * Сотрудник просит заранее со своего телефона, руководитель решает здесь.
 * Одобренное опоздание сдвигает начало смены на этот день: отметка до
 * «приду к» опозданием не считается и штрафа не даёт. Отказать можно только
 * с причиной — её получит сотрудник и увидит группа цеха.
 *
 * Отдельно от выходных и не строкой в их таблице: опоздание — рабочий
 * день, а не отсутствие, и у него своё поле — время.
 *
 * Порядок строк задаёт сервер — тот же, что у выходных: ждущие решения
 * сверху, ниже решённые, свежие первыми.
 *
 * Одобренное можно снять — так же, как согласованный выходной. Снятый
 * запрос становится отозванным, и сотрудник может попросить заново.
 */
export function LateRequestsPanel(): ReactElement {
  const toast = useToast();
  const { user } = useAuth();

  /*
    Пояснение к тосту — по тому, кого решение касается. Сервер не шлёт
    уведомление, когда руководитель решает собственный запрос: себе про
    своё же решение сообщать незачем. Обещать «сотрудник получит» в этом
    случае — неправда, поэтому фраза пропадает. Чей запрос, берём из
    ответа мутации (сервер возвращает строку целиком), а не из таблицы:
    к ответу строка могла уже перечитаться.
  */
  const noticeFor = (requesterId: number): string | undefined =>
    user !== null && requesterId === user.id ? undefined : 'Сотрудник получит уведомление';

  const [status, setStatus] = useState<DayOffStatusName | ''>(DayOffStatus.PENDING);
  /** Запрос, ожидающий причину отказа. `null` — окно закрыто. */
  const [rejecting, setRejecting] = useState<{ id: number; title: string } | null>(null);

  const utils = trpc.useUtils();
  const query = trpc.lateRequests.list.useQuery(status === '' ? {} : { status });

  // Сбрасывает и список, и счётчик ждущих на вкладке: это запросы одной
  // процедуры, только с разным фильтром статуса.
  const refresh = (): void => {
    void utils.lateRequests.list.invalidate();
  };

  /*
    Одобрение и снятие задним числом пересчитывают опоздание за день, если
    отметка уже была: запись дисциплины может появиться или исчезнуть, а с
    ней меняются баллы в рейтинге и отчётах. Без сброса руководитель,
    перейдя в «Дисциплину», увидел бы прежнюю картину из кэша.
  */
  const refreshDiscipline = (): void => {
    void utils.discipline.invalidate();
    void utils.rating.invalidate();
    void utils.reports.invalidate();
  };

  const approve = trpc.lateRequests.approve.useMutation({
    onSuccess(updated) {
      toast.success('Опоздание одобрено', noticeFor(updated.userId));
      refresh();
      refreshDiscipline();
    },
    onError(error) {
      toast.error('Не удалось одобрить', error.message);
    },
  });

  const reject = trpc.lateRequests.reject.useMutation({
    onSuccess(updated) {
      setRejecting(null);
      toast.success('Запрос отклонён', noticeFor(updated.userId));
      refresh();
    },
    onError(error) {
      toast.error('Не удалось отклонить', error.message);
    },
  });

  const withdraw = trpc.lateRequests.withdraw.useMutation({
    onSuccess(updated) {
      toast.success('Согласование снято', noticeFor(updated.userId));
      refresh();
      refreshDiscipline();
    },
    onError(error) {
      toast.error('Не удалось снять', error.message);
      // Чаще всего отказ значит, что строка устарела: согласование уже снял
      // другой руководитель. Список перечитывается, чтобы кнопка не осталась
      // у запроса, который уже отозван.
      refresh();
    },
  });

  if (query.isError) {
    return (
      <Card>
        <ErrorState
          message={query.error.message}
          onRetry={() => {
            void query.refetch();
          }}
        />
      </Card>
    );
  }

  // «Сегодня» — по Ташкенту, как его считает сервер: просьба на сегодня
  // ждёт решения до начала смены, и её видно в списке сразу.
  const today = workshopDayIso(new Date());

  return (
    <Card>
      <CardHeader
        title="Опоздания"
        action={
          <FilterBar>
            <Select
              size="sm"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as DayOffStatusName | '');
              }}
              aria-label="Статус запроса"
              className="w-auto"
              placeholder="Все статусы"
              options={DAY_OFF_STATUSES.map((value) => ({
                value,
                label: DAY_OFF_STATUS_LABELS_RU[value],
              }))}
            />
          </FilterBar>
        }
      />
      <p className="px-5 pb-2 text-footnote text-muted">
        Одобренное опоздание сдвигает начало смены на этот день: отметка до «приду к» — не
        опоздание.
      </p>

      {rejecting !== null && (
        <RejectRequestDialog
          title={rejecting.title}
          maxLength={MAX_LATE_REQUEST_REJECTION_REASON_LENGTH}
          isPending={reject.isPending}
          error={reject.error?.message ?? null}
          onClose={() => {
            setRejecting(null);
          }}
          onSubmit={(reason) => {
            reject.mutate({ id: rejecting.id, reason });
          }}
        />
      )}

      <DataTable
        isLoading={query.isLoading}
        rows={query.data?.items ?? []}
        rowKey={(row) => row.id}
        emptyMessage={
          status === DayOffStatus.PENDING
            ? 'Нерассмотренных запросов на опоздание нет'
            : 'Запросов с таким статусом нет'
        }
        columns={[
          {
            key: 'employee',
            header: 'Сотрудник',
            sortValue: (row) => row.requester.fullName,
            // Длинное имя с отчеством переносится, а не раздвигает таблицу.
            render: (row) => (
              <span className="block min-w-[8rem] max-w-[14rem] text-primary">
                {row.requester.fullName}
              </span>
            ),
          },
          {
            key: 'date',
            header: 'Дата',
            className: 'whitespace-nowrap',
            sortValue: (row) => row.date,
            render: (row) => (
              <span>
                {formatDate(row.date)}
                {/*
                  Только у ждущих решения: метка торопит решить до начала
                  смены, а у закрытой строки (отозванной, отклонённой,
                  одобренной) решать нечего — там она просто шум.
                */}
                {row.status === DayOffStatus.PENDING && row.date === today && (
                  <span className="ml-1.5 text-footnote font-medium text-warning">сегодня</span>
                )}
              </span>
            ),
          },
          {
            key: 'arriveBy',
            header: 'Приду к',
            className: 'whitespace-nowrap',
            sortValue: (row) => row.arriveBy,
            render: (row) => (
              <span className="font-semibold tabular-nums text-primary">{row.arriveBy}</span>
            ),
          },
          {
            key: 'reason',
            header: 'Причина',
            // Колонка забирает свободное место, но сама причина — до двух
            // строк: полный текст в подсказке, а таблица не растёт в высоту
            // из-за одного длинного рассказа.
            className: 'w-full',
            render: (row) =>
              row.reason === null ? (
                <span className="text-muted">—</span>
              ) : (
                <span className="line-clamp-2 min-w-[12rem] text-secondary" title={row.reason}>
                  {row.reason}
                </span>
              ),
          },
          {
            key: 'status',
            header: 'Статус',
            render: (row) => <DayOffStatusBadge status={row.status} />,
          },
          {
            key: 'decision',
            header: 'Решение',
            /*
              Кнопки решения — в самой колонке «Решение», а не отдельной
              колонкой справа. Отдельная колонка держала ширину под две кнопки
              и у решённых строк, где она пустая, и на ноутбуке 1280 px
              таблица уезжала вбок.
            */
            render: (row) =>
              row.status === DayOffStatus.PENDING ? (
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                  <button
                    type="button"
                    disabled={approve.isPending}
                    onClick={() => {
                      approve.mutate({ id: row.id });
                    }}
                    className="inline-flex items-center gap-1 pressable rounded-full border border-positive/40 px-2 py-1 text-footnote font-medium text-positive hover:bg-positive/10 disabled:opacity-50"
                  >
                    <Check className="h-3 w-3" aria-hidden />
                    Одобрить
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      // Ошибка прошлой попытки к новому окну не относится.
                      reject.reset();
                      setRejecting({
                        id: row.id,
                        title: `Отклонить опоздание на ${formatDate(row.date)} (к ${row.arriveBy})`,
                      });
                    }}
                    className="pressable rounded-full border border-danger/40 px-2 py-1 text-footnote font-medium text-danger hover:bg-danger/10"
                  >
                    Отклонить
                  </button>
                </span>
              ) : row.reviewer === null ? (
                // Отозванный сотрудником — решения не было. Снятое руководителем
                // согласование сервер тоже хранит без решившего: кто снял —
                // в журнале действий, а не в этой колонке.
                <span className="text-muted">—</span>
              ) : (
                // Ширина снизу задана: без неё колонка ужималась до имени, и
                // причина отказа ложилась столбиком в шесть строк по слову.
                <span className="block min-w-[13rem] max-w-[18rem]">
                  <span className="block text-primary">{row.reviewer.fullName}</span>
                  <span className="block whitespace-nowrap text-footnote text-muted">
                    {formatDateTime(row.reviewedAt)}
                  </span>
                  {row.rejectionReason !== null && (
                    <span
                      className="line-clamp-3 text-footnote text-danger"
                      title={row.rejectionReason}
                    >
                      {`Причина отказа: ${row.rejectionReason}`}
                    </span>
                  )}
                  {/*
                    Одобренное опоздание снимается, как согласованный выходной:
                    одобрили не тому или не на тот день — иначе исправлять
                    пришлось бы через базу. Кнопка под именем решившего, а не
                    отдельной колонкой справа: та держала бы ширину и у
                    строк без действий, и на 1280 px таблица уезжала бы вбок.
                  */}
                  {row.status === DayOffStatus.APPROVED && (
                    <button
                      type="button"
                      disabled={withdraw.isPending}
                      onClick={() => {
                        /*
                          Если день уже наступил, снятие пересчитает опоздание
                          от графика — человеку могут начислиться баллы.
                          Случайный щелчок тут не безобиден, поэтому спрашиваем.
                          Будущий день ничего не пересчитывает — как и у
                          выходных, снимается сразу.
                        */
                        if (
                          row.date <= today &&
                          !window.confirm(
                            `Снять согласование? Опоздание за ${formatDate(row.date)} пересчитают по графику смены.`,
                          )
                        ) {
                          return;
                        }
                        withdraw.mutate({ id: row.id });
                      }}
                      className="mt-1.5 rounded-xl border border-ink/10 px-2 py-1 text-footnote text-secondary hover:bg-ink/[0.08] disabled:opacity-50"
                    >
                      Снять
                    </button>
                  )}
                </span>
              ),
          },
        ]}
      />
    </Card>
  );
}
