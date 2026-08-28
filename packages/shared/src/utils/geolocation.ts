/**
 * Геолокация: расстояния и проверка нахождения сотрудника у филиала.
 *
 * Логика перенесена из `curtain-bot` (`calculate_distance`, `find_nearest_workshop`,
 * `is_near_any_workshop`) и доработана:
 *  - координаты цехов больше не хардкодятся в константах, а приходят из таблицы
 *    `branches`, поэтому функции принимают список филиалов параметром;
 *  - радиус берётся из самого филиала (`branches.radius_meters`), а не из
 *    глобальной переменной окружения — филиалы могут иметь разный радиус;
 *  - добавлена валидация входных координат: `NaN`, `Infinity` и значения вне
 *    диапазона широты/долготы отбрасываются, а не превращаются в `NaN`-расстояние,
 *    которое молча проваливало бы сравнение с радиусом;
 *  - формула гаверсинуса заменена на численно устойчивый вариант с `atan2`
 *    (как в оригинале) и средним радиусом Земли по IUGG.
 */

/** Средний радиус Земли (IUGG mean radius), метры. */
export const EARTH_RADIUS_METERS = 6_371_008.8;

/** Радиус чек-ина по умолчанию для нового филиала, метры. */
export const DEFAULT_CHECK_IN_RADIUS_METERS = 100;

/** Минимально и максимально допустимый радиус, который можно задать филиалу. */
export const MIN_CHECK_IN_RADIUS_METERS = 20;
export const MAX_CHECK_IN_RADIUS_METERS = 5_000;

export interface GeoPoint {
  readonly latitude: number;
  readonly longitude: number;
}

/** Филиал как точка на карте с собственным радиусом допуска. */
export interface GeoBranch<TId = number> extends GeoPoint {
  readonly id: TId;
  readonly name: string;
  readonly radiusMeters: number;
}

export interface NearestBranchResult<TId = number> {
  readonly branch: GeoBranch<TId>;
  /** Расстояние от сотрудника до филиала, метры (округлено до целых). */
  readonly distanceMeters: number;
  /** Находится ли сотрудник внутри радиуса этого филиала. */
  readonly isWithinRadius: boolean;
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export function isValidLatitude(value: unknown): value is number {
  return isFiniteNumber(value) && value >= -90 && value <= 90;
}

export function isValidLongitude(value: unknown): value is number {
  return isFiniteNumber(value) && value >= -180 && value <= 180;
}

export function isValidGeoPoint(value: unknown): value is GeoPoint {
  if (typeof value !== 'object' || value === null) return false;
  const point = value as Partial<GeoPoint>;
  return isValidLatitude(point.latitude) && isValidLongitude(point.longitude);
}

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/**
 * Расстояние между двумя точками по формуле гаверсинуса, в метрах.
 *
 * @throws {RangeError} если координаты не являются корректной точкой на сфере.
 *   Бросаем исключение осознанно: молчаливый возврат `NaN` или `Infinity`
 *   привёл бы к тому, что проверка `distance <= radius` вернула бы `false`
 *   и сотрудник получил бы непонятный отказ в чек-ине вместо явной ошибки.
 */
export function haversineDistanceMeters(from: GeoPoint, to: GeoPoint): number {
  if (!isValidGeoPoint(from)) {
    throw new RangeError('Некорректные координаты отправной точки');
  }
  if (!isValidGeoPoint(to)) {
    throw new RangeError('Некорректные координаты целевой точки');
  }

  const fromLatRad = toRadians(from.latitude);
  const toLatRad = toRadians(to.latitude);
  const deltaLatRad = toRadians(to.latitude - from.latitude);
  const deltaLonRad = toRadians(to.longitude - from.longitude);

  const sinHalfDeltaLat = Math.sin(deltaLatRad / 2);
  const sinHalfDeltaLon = Math.sin(deltaLonRad / 2);

  const a =
    sinHalfDeltaLat * sinHalfDeltaLat +
    Math.cos(fromLatRad) * Math.cos(toLatRad) * sinHalfDeltaLon * sinHalfDeltaLon;

  // Ограничиваем `a` сверху: из-за погрешности double значение может выйти
  // за 1 для почти антиподальных точек, и `Math.sqrt(1 - a)` дал бы NaN.
  const clampedA = Math.min(1, Math.max(0, a));
  const c = 2 * Math.atan2(Math.sqrt(clampedA), Math.sqrt(1 - clampedA));

  return EARTH_RADIUS_METERS * c;
}

/**
 * Ближайший к сотруднику филиал из переданного списка.
 *
 * @returns `null`, если список филиалов пуст (например, все филиалы неактивны).
 */
export function findNearestBranch<TId>(
  position: GeoPoint,
  branches: readonly GeoBranch<TId>[],
): NearestBranchResult<TId> | null {
  let nearest: NearestBranchResult<TId> | null = null;

  for (const branch of branches) {
    const distanceMeters = Math.round(haversineDistanceMeters(position, branch));
    if (nearest !== null && distanceMeters >= nearest.distanceMeters) continue;

    nearest = {
      branch,
      distanceMeters,
      isWithinRadius: distanceMeters <= branch.radiusMeters,
    };
  }

  return nearest;
}

/**
 * Филиал, в радиусе которого находится сотрудник.
 *
 * Важно: это НЕ то же самое, что «ближайший филиал внутри радиуса». Если два
 * филиала стоят рядом и сотрудник попадает в оба радиуса, выбирается ближайший
 * из подходящих — поэтому сначала фильтруем, а потом ищем минимум.
 *
 * @returns `null`, если сотрудник не находится ни у одного филиала.
 */
export function findBranchInRadius<TId>(
  position: GeoPoint,
  branches: readonly GeoBranch<TId>[],
): NearestBranchResult<TId> | null {
  const withinRadius = branches.filter(
    (branch) => haversineDistanceMeters(position, branch) <= branch.radiusMeters,
  );
  return findNearestBranch(position, withinRadius);
}

/** Находится ли точка в пределах радиуса конкретного филиала. */
export function isWithinBranchRadius(position: GeoPoint, branch: GeoBranch<unknown>): boolean {
  return haversineDistanceMeters(position, branch) <= branch.radiusMeters;
}

/** Форматирование расстояния для сообщений пользователю: «85 м» / «1.2 км». */
export function formatDistance(distanceMeters: number): string {
  if (!isFiniteNumber(distanceMeters) || distanceMeters < 0) return '—';
  if (distanceMeters < 1_000) return `${Math.round(distanceMeters).toString()} м`;
  return `${(distanceMeters / 1_000).toFixed(1)} км`;
}
