/**
 * Выходной ли у человека в этот день: по постоянному дню недели или по
 * одобренной заявке. Даты — календарные `YYYY-MM-DD` по Ташкенту,
 * интервал заявки включает оба края.
 *
 * Строки сравниваются как строки: формат фиксированной длины с ведущими
 * нулями упорядочен так же, как даты, и не зависит от часового пояса.
 */
export function isDayOffOn(
  dayIso: string,
  weeklyDayOff: number | null,
  approved: readonly { readonly startDate: string; readonly endDate: string }[],
): boolean {
  if (weeklyDayOff !== null && isoWeekdayOfIso(dayIso) === weeklyDayOff) return true;
  return approved.some((range) => range.startDate <= dayIso && dayIso <= range.endDate);
}

/** ISO-день недели календарной даты: 1 — понедельник … 7 — воскресенье. */
function isoWeekdayOfIso(dayIso: string): number {
  const day = new Date(`${dayIso}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}
