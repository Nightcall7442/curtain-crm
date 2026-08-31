// Расчёт стоимости сеанса.
//
// Стоимость пропорциональна времени: price_per_hour за каждый полный час,
// доли часа — посекундно. Считаем в копейках целочисленной арифметикой
// (никаких float для денег), округление половины — вверх.

const SECONDS_PER_HOUR = 3600;
const KOPECKS_PER_RUBLE = 100;

/**
 * Стоимость сеанса в копейках.
 * @param {number} pricePerHour цена тарифа, рублей в час (целое, >= 0)
 * @param {number} durationSeconds длительность сеанса в секундах (>= 0)
 * @returns {number} копейки
 */
export function costKopecks(pricePerHour, durationSeconds) {
  if (!Number.isInteger(pricePerHour) || pricePerHour < 0) {
    throw new RangeError("pricePerHour must be a non-negative integer");
  }
  if (!Number.isFinite(durationSeconds) || durationSeconds < 0) {
    throw new RangeError("durationSeconds must be >= 0");
  }
  const numerator =
    pricePerHour * KOPECKS_PER_RUBLE * Math.floor(durationSeconds);
  return Math.floor((numerator + SECONDS_PER_HOUR / 2) / SECONDS_PER_HOUR);
}

/**
 * Стоимость сеанса между двумя метками времени (ISO-строки UTC).
 * @param {number} pricePerHour
 * @param {string} startedAt
 * @param {string} endedAt
 */
export function sessionCostKopecks(pricePerHour, startedAt, endedAt) {
  const seconds = (Date.parse(endedAt) - Date.parse(startedAt)) / 1000;
  if (Number.isNaN(seconds) || seconds < 0) {
    throw new RangeError("endedAt must not be earlier than startedAt");
  }
  return costKopecks(pricePerHour, seconds);
}

/** Для отображения в API: 90050 -> 900.5. */
export function kopecksToRubles(kopecks) {
  return kopecks / KOPECKS_PER_RUBLE;
}
