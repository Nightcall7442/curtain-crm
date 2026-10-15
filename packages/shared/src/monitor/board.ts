import type { MonitorSort } from '../constants/monitor';
import type { LiveStatus } from '../enums/monitor.enum';

/** Рост к прошлому периоду, целые проценты. С нуля роста «в процентах» нет. */
export function deltaPercent(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/** Поиск по имени не различает регистр и «ё»: на табло её пишут по-разному. */
const searchable = (value: string): string => value.toLocaleLowerCase('ru').replaceAll('ё', 'е');

/** Чипы статусов и поиск табло. */
export function filterPeople<T extends { readonly fullName: string; readonly status: LiveStatus }>(
  people: readonly T[],
  status: LiveStatus | 'all',
  query: string,
): T[] {
  const needle = searchable(query.trim());
  return people.filter(
    (person) =>
      (status === 'all' || person.status === status) &&
      (needle === '' || searchable(person.fullName).includes(needle)),
  );
}

const byName = (a: { readonly fullName: string }, b: { readonly fullName: string }): number =>
  a.fullName.localeCompare(b.fullName, 'ru');

/** Сравнение, при котором отсутствующее значение уходит в конец. */
const nullsLast = (a: number | null, b: number | null): number => {
  if (a === null) return b === null ? 0 : 1;
  if (b === null) return -1;
  return a - b;
};

interface SortablePerson {
  readonly fullName: string;
  readonly place: number;
  readonly plan?: { readonly percent: number } | null;
  readonly workstation?: number | null;
}

/** Процент плана со знаком минус: больше процент — раньше в списке. */
const planOrder = (person: SortablePerson): number | null =>
  person.plan === undefined || person.plan === null ? null : -person.plan.percent;

/**
 * Сортировка карточек: по месту за месяц, по проценту плана (больше — выше),
 * по имени или по номеру машинки. Без плана или машинки — в конце; равные —
 * по имени.
 */
export function sortPeople<T extends SortablePerson>(people: readonly T[], sort: MonitorSort): T[] {
  const compare = (a: T, b: T): number => {
    switch (sort) {
      case 'place':
        return a.place - b.place;
      case 'plan':
        return nullsLast(planOrder(a), planOrder(b));
      case 'workstation':
        return nullsLast(a.workstation ?? null, b.workstation ?? null);
      case 'name':
        return 0;
    }
  };
  return [...people].sort((a, b) => compare(a, b) || byName(a, b));
}

/** Имя на пьедестале и в ленте выездов: «Зухра Н.» — полное имя туда не помещается. */
export function shortName(fullName: string): string {
  const [first, second] = fullName.trim().split(/\s+/);
  if (first === undefined) return '';
  return second === undefined ? first : `${first} ${second.charAt(0)}.`;
}

/**
 * Сколько длится работа или выезд: «45 мин», «2 ч 15 мин», «5 дн 9 ч».
 * Дольше суток минуты уже ничего не говорят, а «129 ч» приходится делить в уме.
 */
export function formatElapsed(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  if (minutes < 60) return `${minutes.toString()} мин`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return rest === 0 ? `${hours.toString()} ч` : `${hours.toString()} ч ${rest.toString()} мин`;
  }

  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return rest === 0 ? `${days.toString()} дн` : `${days.toString()} дн ${rest.toString()} ч`;
}
