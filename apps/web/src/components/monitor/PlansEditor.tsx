'use client';

import {
  formatIsoDate,
  MONTH_NAMES_RU,
  PLAN_TARGET_MAX,
  ROLE_LABELS_RU,
  workshopToday,
  type PlanRole,
} from '@curtain-crm/shared';
import { ChevronLeft, ChevronRight, Info, Target } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';

import { Card, CardHeader, ErrorState, Skeleton } from '@/components/ui/Card';
import { Button, FormError, IconButton, Input } from '@/components/ui/Form';
import { DataTable, type Column } from '@/components/ui/Table';
import { trpc, type RouterOutputs } from '@/lib/trpc';
import { cn, formatNumber } from '@/lib/utils';

import { UNIT_SHORT } from './labels';

type Overview = RouterOutputs['monitor']['plans']['list'];
type RolePlans = Overview['roles'][number];
type PlanPerson = RolePlans['people'][number];

const pad = (value: number): string => value.toString().padStart(2, '0');

/** Текущий месяц мастерской: `2026-10`. */
function currentMonth(): string {
  const today = workshopToday();
  return `${today.year.toString()}-${pad(today.month)}`;
}

/** `2026-10` → `2026-11` при `delta = 1`. */
function shiftMonth(month: string, delta: number): string {
  const [year = 1970, monthNumber = 1] = month.split('-').map((part) => Number.parseInt(part, 10));
  const index = year * 12 + (monthNumber - 1) + delta;
  return `${Math.floor(index / 12).toString()}-${pad((index % 12) + 1)}`;
}

function monthTitle(month: string): string {
  const [year = '', monthNumber = '1'] = month.split('-');
  return `${MONTH_NAMES_RU[Number.parseInt(monthNumber, 10) - 1] ?? month} ${year}`;
}

/** `2026-10-01` → «окт 2026». */
function shortMonth(isoDay: string): string {
  const [year = '', monthNumber = '1'] = isoDay.split('-');
  const name = MONTH_NAMES_RU[Number.parseInt(monthNumber, 10) - 1] ?? '';
  return `${name.slice(0, 3).toLowerCase()} ${year}`;
}

/** Целое из поля ввода: пусто — `null`, мусор — `NaN` (кнопка не активна). */
function parseTarget(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const number = Number(trimmed);
  return Number.isInteger(number) && number >= 1 && number <= PLAN_TARGET_MAX ? number : Number.NaN;
}

const roleTitle = (role: PlanRole): string => ROLE_LABELS_RU[role];

function useRefresh(): () => Promise<void> {
  const utils = trpc.useUtils();
  return async () => {
    await Promise.all([utils.monitor.plans.list.invalidate(), utils.monitor.board.invalidate(), utils.users.performance.invalidate()]);
  };
}

/** Норма роли: правка на месте. */
function NormEditor({ month, plans }: { readonly month: string; readonly plans: RolePlans }): ReactElement {
  const refresh = useRefresh();
  const saved = plans.norm?.target ?? null;
  const [value, setValue] = useState(saved === null ? '' : saved.toString());
  useEffect(() => {
    setValue(saved === null ? '' : saved.toString());
  }, [saved, month]);
  const save = trpc.monitor.plans.setRoleNorm.useMutation({ onSuccess: refresh });
  const target = parseTarget(value);
  const changed = target !== saved;
  const unit = UNIT_SHORT[plans.unit];

  return (
    <div className="space-y-2 px-5 pb-4 pt-1">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (target === null || Number.isNaN(target)) return;
          save.mutate({ role: plans.role, month, target });
        }}
      >
        <label className="min-w-0 flex-1 sm:max-w-[220px]">
          <span className="mb-1 block text-footnote text-muted">Норма на человека, {unit}</span>
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={PLAN_TARGET_MAX}
            size="sm"
            value={value}
            invalid={Number.isNaN(target)}
            placeholder="не задана"
            onChange={(event) => {
              setValue(event.target.value);
            }}
          />
        </label>
        <Button
          type="submit"
          size="sm"
          loading={save.isPending}
          disabled={!changed || target === null || Number.isNaN(target)}
        >
          Сохранить норму
        </Button>
        <p className="w-full text-footnote text-muted sm:ml-auto sm:w-auto">
          {plans.norm === null
            ? 'Нормы на этот месяц нет'
            : `Действует с ${formatIsoDate(plans.norm.effectiveFrom)}`}
        </p>
      </form>
      <FormError message={save.error?.message ?? null} />
    </div>
  );
}

/** Личный план: пусто — норма роли; очистить сохранённый — вернуть к норме. */
function PersonalCell({
  month,
  role,
  person,
}: {
  readonly month: string;
  readonly role: PlanRole;
  readonly person: PlanPerson;
}): ReactElement {
  const refresh = useRefresh();
  const saved = person.personal?.target ?? null;
  const [value, setValue] = useState(saved === null ? '' : saved.toString());
  useEffect(() => {
    setValue(saved === null ? '' : saved.toString());
  }, [saved, month]);
  const save = trpc.monitor.plans.setPersonal.useMutation({ onSuccess: refresh });
  const target = parseTarget(value);
  const changed = target !== saved && !Number.isNaN(target);

  return (
    <form
      className="flex items-center gap-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!changed) return;
        save.mutate({ userId: person.userId, role, month, target });
      }}
    >
      <Input
        type="number"
        inputMode="numeric"
        min={1}
        max={PLAN_TARGET_MAX}
        size="sm"
        className="w-24"
        aria-label={`Личный план: ${person.fullName}`}
        placeholder="норма"
        value={value}
        invalid={Number.isNaN(target) || save.isError}
        title={save.error?.message}
        onChange={(event) => {
          setValue(event.target.value);
        }}
      />
      {changed && (
        <Button type="submit" size="sm" variant="secondary" loading={save.isPending}>
          {target === null ? 'К норме' : 'Сохранить'}
        </Button>
      )}
    </form>
  );
}

function sourceLabel(person: PlanPerson): string {
  if (person.plan === null) return 'плана нет';
  return person.plan.source === 'personal' ? `личный с ${shortMonth(person.plan.effectiveFrom)}` : 'норма роли';
}

function RoleCard({ month, plans }: { readonly month: string; readonly plans: RolePlans }): ReactElement {
  const unit = UNIT_SHORT[plans.unit];
  const columns: readonly Column<PlanPerson>[] = [
    {
      key: 'name',
      header: 'Сотрудник',
      className: 'w-full',
      render: (person) => <span className="font-medium text-primary">{person.fullName}</span>,
      sortValue: (person) => person.fullName,
    },
    {
      key: 'plan',
      header: 'Действует',
      align: 'right',
      render: (person) =>
        person.plan === null ? (
          <span className="text-muted">—</span>
        ) : (
          <span className="tabular-nums">
            {formatNumber(person.plan.target, 0)} {unit}
          </span>
        ),
      sortValue: (person) => person.plan?.target ?? -1,
    },
    {
      key: 'source',
      header: 'Источник',
      render: (person) => (
        <span className={cn('whitespace-nowrap', person.plan?.source === 'personal' ? 'text-accent' : 'text-muted')}>
          {sourceLabel(person)}
        </span>
      ),
    },
    {
      key: 'personal',
      header: 'Личный план',
      render: (person) => <PersonalCell month={month} role={plans.role} person={person} />,
    },
    {
      key: 'done',
      header: 'Сделано',
      align: 'right',
      render: (person) => <span className="tabular-nums">{formatNumber(person.done, 0)}</span>,
      sortValue: (person) => person.done,
    },
    {
      key: 'percent',
      header: '%',
      align: 'right',
      render: (person) => (
        <span className="font-semibold tabular-nums">{person.percent === null ? '—' : `${person.percent.toString()}%`}</span>
      ),
      sortValue: (person) => person.percent ?? -1,
    },
  ];

  return (
    <Card>
      <CardHeader title={roleTitle(plans.role)} icon={<Target aria-hidden className="h-4 w-4" />} />
      <NormEditor month={month} plans={plans} />
      <DataTable
        rows={plans.people}
        columns={columns}
        rowKey={(person) => person.userId}
        emptyMessage={`Сотрудников с ролью «${roleTitle(plans.role)}» нет`}
      />
    </Card>
  );
}

/**
 * Планы на месяц: норма каждой роли и личные планы людей. Правка действует
 * с выбранного месяца и дальше, прошлые месяцы не переписываются.
 */
export function PlansEditor(): ReactElement {
  const [month, setMonth] = useState(currentMonth);
  const plans = trpc.monitor.plans.list.useQuery({ month });

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="text-title font-semibold text-primary">Планы</h1>
        <div className="flex items-center gap-1 rounded-full border border-ink/10 bg-ink/[0.04] p-1">
          <IconButton
            size="sm"
            label="Предыдущий месяц"
            icon={<ChevronLeft aria-hidden className="h-4 w-4" />}
            onClick={() => {
              setMonth((current) => shiftMonth(current, -1));
            }}
          />
          <span className="min-w-[132px] text-center text-subhead font-semibold text-primary">{monthTitle(month)}</span>
          <IconButton
            size="sm"
            label="Следующий месяц"
            icon={<ChevronRight aria-hidden className="h-4 w-4" />}
            onClick={() => {
              setMonth((current) => shiftMonth(current, 1));
            }}
          />
        </div>
        {month !== currentMonth() && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setMonth(currentMonth());
            }}
          >
            Текущий месяц
          </Button>
        )}
      </header>

      <p className="flex items-start gap-2 text-footnote text-muted">
        <Info aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Сохранение действует с выбранного месяца и дальше, пока план не изменят. Пустой личный план — человек
        работает по норме роли.
      </p>

      {plans.data === undefined ? (
        plans.isError ? (
          <Card>
            <ErrorState
              message={plans.error.message}
              onRetry={() => {
                void plans.refetch();
              }}
            />
          </Card>
        ) : (
          <div className="space-y-4" aria-busy="true">
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-[220px] w-full rounded-[20px]" />
            ))}
          </div>
        )
      ) : (
        plans.data.roles.map((entry) => <RoleCard key={entry.role} month={month} plans={entry} />)
      )}
    </div>
  );
}
