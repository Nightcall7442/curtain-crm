'use client';

import {
  DISCIPLINE_KIND_LABELS_RU,
  DISCIPLINE_LEVEL_LABELS_RU,
  DisciplineLevel,
  formatDisciplinePoints,
  MONTH_NAMES_RU,
  type DisciplineLevel as DisciplineLevelName,
} from '@curtain-crm/shared';
import { ClipboardPlus, Trash2 } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { DisciplineRecordDialog } from '@/components/employees/DisciplineRecordDialog';
import { useToast } from '@/components/providers/ToastProvider';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader, ErrorState } from '@/components/ui/Card';
import { Button, controlClass, FilterBar, IconButton } from '@/components/ui/Form';
import { DataTable } from '@/components/ui/Table';
import { trpc } from '@/lib/trpc';
import { cn, formatDate } from '@/lib/utils';

/**
 * Дисциплина.
 *
 * Система ответственности из презентации владельца: факт → балл → действие.
 * Верхняя таблица — сводка за месяц по каждому сотруднику: сколько
 * нарушений, штрафные и бонусные баллы и УРОВЕНЬ — подсказка, какой
 * разговор пора провести. Нижняя — записи: у кого что и когда, с
 * объяснением сотрудника, если он его дал.
 *
 * Уровень ничего не делает сам: система не увольняет по цифре и не
 * удерживает из зарплаты — она показывает картину, решение принимает
 * руководитель, проверив факты и выслушав человека.
 */

const LEVEL_TONE: Readonly<Record<DisciplineLevelName, 'positive' | 'warning' | 'danger'>> = {
  control: 'positive',
  verbal: 'warning',
  written: 'danger',
  management: 'danger',
};

function Points({ value }: { readonly value: number }): ReactElement {
  return (
    <span
      className={cn(
        'tabular-nums font-semibold',
        value < 0 ? 'text-danger' : value > 0 ? 'text-positive' : 'text-muted',
      )}
    >
      {formatDisciplinePoints(value)}
    </span>
  );
}

export default function DisciplinePage(): ReactElement {
  const toast = useToast();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [userId, setUserId] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);

  const period = { year, month };
  const utils = trpc.useUtils();
  const summary = trpc.discipline.summary.useQuery(period);
  const events = trpc.discipline.list.useQuery(userId === null ? period : { ...period, userId });

  const remove = trpc.discipline.remove.useMutation({
    onSuccess() {
      toast.success('Запись удалена');
      void utils.discipline.summary.invalidate();
      void utils.discipline.list.invalidate();
    },
    onError(error) {
      toast.error('Не удалось удалить', error.message);
    },
  });

  const selected = summary.data?.find((row) => row.userId === userId) ?? null;

  if (summary.isError) {
    return (
      <Card>
        <ErrorState
          message={summary.error.message}
          onRetry={() => {
            void summary.refetch();
          }}
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Ключ по сотруднику: выбранный в сводке подставляется в форму при открытии. */}
      <DisciplineRecordDialog
        key={userId ?? 'all'}
        open={recording}
        onClose={() => {
          setRecording(false);
        }}
        {...(userId === null ? {} : { presetUserId: userId })}
      />

      <Card>
        <CardHeader
          title="Дисциплина за месяц"
          action={
            <FilterBar>
              <Button
                size="sm"
                icon={<ClipboardPlus className="h-3.5 w-3.5" aria-hidden />}
                onClick={() => {
                  setRecording(true);
                }}
              >
                Зафиксировать
              </Button>
              <select
                value={month}
                onChange={(event) => {
                  setMonth(Number.parseInt(event.target.value, 10));
                }}
                aria-label="Месяц"
                className={controlClass('sm', 'w-auto pr-8')}
              >
                {MONTH_NAMES_RU.map((name, index) => (
                  <option key={name} value={index + 1}>
                    {name}
                  </option>
                ))}
              </select>
              <select
                value={year}
                onChange={(event) => {
                  setYear(Number.parseInt(event.target.value, 10));
                }}
                aria-label="Год"
                className={controlClass('sm', 'w-auto pr-8')}
              >
                {[now.getFullYear() - 1, now.getFullYear()].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </FilterBar>
          }
        />
        <p className="px-5 pb-3 text-footnote text-muted">
          0–2 штрафных — обычный контроль · 3–4 — устное предупреждение · 5–6 — письменное и план
          исправления · 7+ — решение руководства. Повтор нарушения в месяце — на балл строже. Уровень —
          подсказка к разговору, а не приговор: факты проверяются, сотрудник объясняет.
        </p>
        <DataTable
          isLoading={summary.isLoading}
          rows={summary.data ?? []}
          rowKey={(row) => row.userId}
          activeRowKey={userId}
          onRowClick={(row) => {
            setUserId(userId === row.userId ? null : row.userId);
          }}
          emptyMessage="Сотрудников нет"
          columns={[
            {
              key: 'name',
              header: 'Сотрудник',
              sortValue: (row) => row.fullName,
              render: (row) => <span className="text-primary">{row.fullName}</span>,
            },
            {
              key: 'violations',
              header: 'Нарушений',
              align: 'right',
              sortValue: (row) => row.violations,
              render: (row) => (row.violations === 0 ? <span className="text-muted">—</span> : row.violations),
            },
            {
              key: 'penalty',
              header: 'Штрафные',
              align: 'right',
              sortValue: (row) => row.penalty,
              render: (row) => <Points value={row.penalty} />,
            },
            {
              key: 'bonus',
              header: 'Бонусные',
              align: 'right',
              sortValue: (row) => row.bonus,
              render: (row) => <Points value={row.bonus} />,
            },
            {
              key: 'net',
              header: 'Итог',
              align: 'right',
              sortValue: (row) => row.net,
              render: (row) => <Points value={row.net} />,
            },
            {
              key: 'level',
              header: 'Уровень',
              render: (row) =>
                row.violations === 0 && row.level === DisciplineLevel.CONTROL ? (
                  <Badge tone="positive">Чистый месяц</Badge>
                ) : (
                  <Badge tone={LEVEL_TONE[row.level]}>{DISCIPLINE_LEVEL_LABELS_RU[row.level]}</Badge>
                ),
            },
          ]}
        />
      </Card>

      <Card>
        <CardHeader
          title={selected === null ? 'Все записи' : `Записи: ${selected.fullName}`}
          action={
            selected === null ? undefined : (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setUserId(null);
                }}
              >
                Показать всех
              </Button>
            )
          }
        />
        <DataTable
          isLoading={events.isLoading}
          rows={events.data ?? []}
          rowKey={(row) => row.id}
          emptyMessage="За этот месяц записей нет"
          columns={[
            {
              key: 'date',
              header: 'Дата',
              sortValue: (row) => row.occurredOn,
              render: (row) => formatDate(row.occurredOn),
            },
            {
              key: 'who',
              header: 'Сотрудник',
              sortValue: (row) => row.fullName,
              render: (row) => <span className="text-primary">{row.fullName}</span>,
            },
            {
              key: 'kind',
              header: 'Что',
              render: (row) => (
                <span className="block max-w-[22rem]">
                  <span className="block">
                    {DISCIPLINE_KIND_LABELS_RU[row.kind]}
                    {row.isRepeat && <span className="ml-1.5 text-footnote text-warning">повтор</span>}
                  </span>
                  {row.description !== null && (
                    <span className="block truncate text-footnote text-muted" title={row.description}>
                      {row.description}
                    </span>
                  )}
                  {row.employeeComment !== null && (
                    <span className="block text-footnote text-secondary">
                      {`Объяснение: ${row.employeeComment}`}
                    </span>
                  )}
                </span>
              ),
            },
            {
              key: 'points',
              header: 'Балл',
              align: 'right',
              sortValue: (row) => row.points,
              render: (row) => <Points value={row.points} />,
            },
            {
              key: 'by',
              header: 'Записал',
              render: (row) => <span className="text-secondary">{row.recordedByName}</span>,
            },
            {
              key: 'actions',
              header: '',
              align: 'right',
              render: (row) => (
                <IconButton
                  size="sm"
                  variant="ghost"
                  icon={<Trash2 className="h-3.5 w-3.5" aria-hidden />}
                  label="Удалить запись"
                  loading={remove.isPending && remove.variables?.id === row.id}
                  onClick={() => {
                    if (window.confirm('Удалить запись? Сотрудник её больше не увидит.')) {
                      remove.mutate({ id: row.id });
                    }
                  }}
                />
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
