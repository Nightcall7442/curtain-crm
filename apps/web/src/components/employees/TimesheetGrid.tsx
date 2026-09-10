'use client';

import { WORKSHOP_TIME_ZONE } from '@curtain-crm/shared';
import type { ReactElement } from 'react';

import { Skeleton } from '@/components/ui/Card';
import { cn } from '@/lib/utils';

/**
 * Табель: месяц по дням.
 *
 * Итог за месяц отвечал «сколько всего», но не «когда»: выходил ли человек
 * во вторник, приходилось выяснять по журналу смен, строку за строкой.
 * Здесь в клетке стоят часы за день, «В» — согласованный выходной, а пустая
 * клетка означает, что человек не выходил и выходного не просил.
 *
 * Часы — те же, что уйдут в зарплату: за вычетом выездов и личных отлучек.
 */

export interface TimesheetGridRow {
  readonly userId: number;
  readonly userFullName: string;
  readonly days: readonly { readonly day: number; readonly hours: number }[];
  readonly daysOff: readonly number[];
  readonly totalHours: number;
  readonly shiftsCount: number;
}

/** Часы в клетке: «7,5», «8». Разряды не нужны — числа меньше суток. */
const cellHours = (hours: number): string =>
  hours.toLocaleString('ru-RU', { maximumFractionDigits: 1 });

/** Сегодняшнее число месяца по времени мастерской — или `null` в другом месяце. */
function todayColumn(year: number, month: number): number | null {
  const parts = new Intl.DateTimeFormat('ru-RU', {
    timeZone: WORKSHOP_TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(new Date());

  const value = (type: string): number =>
    Number.parseInt(parts.find((part) => part.type === type)?.value ?? '0', 10);

  if (value('year') !== year || value('month') !== month) return null;
  return value('day');
}

const WEEKDAY_LETTERS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'] as const;

export function TimesheetGrid({
  year,
  month,
  daysInMonth,
  rows,
  isLoading,
}: {
  readonly year: number;
  readonly month: number;
  readonly daysInMonth: number;
  readonly rows: readonly TimesheetGridRow[];
  readonly isLoading: boolean;
}): ReactElement {
  if (isLoading) return <Skeleton className="h-64" />;

  if (rows.length === 0) {
    return <p className="px-4 pb-4 text-footnote text-muted">За выбранный месяц данных нет</p>;
  }

  const days = Array.from({ length: daysInMonth }, (_, index) => index + 1);
  const today = todayColumn(year, month);

  return (
    /* Месяц шире экрана всегда — прокручивается таблица, а не страница. */
    <div className="overflow-x-auto">
      <table className="w-full min-w-max border-collapse text-footnote [font-variant-numeric:tabular-nums]">
        <thead>
          <tr className="border-b border-strong">
            {/* Имя не уезжает при прокрутке: без него колонка чисел безымянна. */}
            <th className="sticky left-0 z-10 bg-panel px-4 py-2 text-left font-medium text-muted">
              Сотрудник
            </th>

            {days.map((day) => {
              const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
              const isRest = weekday === 0 || weekday === 6;

              return (
                <th
                  key={day}
                  className={cn(
                    'w-9 px-1 py-2 text-center font-medium',
                    day === today ? 'text-brass-ink' : isRest ? 'text-muted' : 'text-secondary',
                  )}
                >
                  <span className="block leading-none">{day}</span>
                  <span className="block text-[10px] leading-tight text-muted">
                    {WEEKDAY_LETTERS[weekday]}
                  </span>
                </th>
              );
            })}

            <th className="px-3 py-2 text-right font-medium text-muted">Смен</th>
            <th className="px-4 py-2 text-right font-medium text-muted">Часов</th>
          </tr>
        </thead>

        <tbody>
          {rows.map((row) => {
            const hoursByDay = new Map(row.days.map((day) => [day.day, day.hours]));
            const off = new Set(row.daysOff);

            return (
              <tr key={row.userId} className="border-b border-subtle last:border-0">
                <td className="sticky left-0 z-10 bg-panel px-4 py-1.5 text-caption text-primary">
                  {row.userFullName}
                </td>

                {days.map((day) => {
                  const hours = hoursByDay.get(day);
                  const isOff = off.has(day);

                  return (
                    <td
                      key={day}
                      className={cn(
                        'px-1 py-1.5 text-center',
                        day === today ? 'bg-raised' : null,
                      )}
                      title={
                        isOff
                          ? 'Согласованный выходной'
                          : hours === undefined
                            ? undefined
                            : `${cellHours(hours)} ч`
                      }
                    >
                      {hours !== undefined ? (
                        <span className="text-primary">{cellHours(hours)}</span>
                      ) : isOff ? (
                        /* Выходной буквой, а не цветом: цвет не читается в
                           печати и не проговаривается вслух по телефону. */
                        <span className="font-medium text-brass-ink">В</span>
                      ) : (
                        <span className="text-muted">·</span>
                      )}
                    </td>
                  );
                })}

                <td className="px-3 py-1.5 text-right text-secondary">
                  {row.shiftsCount === 0 ? '—' : row.shiftsCount}
                </td>
                <td className="px-4 py-1.5 text-right text-primary">
                  {row.totalHours === 0 ? '—' : cellHours(row.totalHours)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
