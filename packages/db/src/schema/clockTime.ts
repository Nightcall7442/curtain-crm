import { customType } from 'drizzle-orm/pg-core';

/**
 * Время дня `ЧЧ:ММ` поверх колонки `time`.
 *
 * Postgres отдаёт `time` с секундами («10:30:00»), а клиенты и график смены
 * (`payroll_schemes.shift_start`) знают время как «10:30». Обрезка здесь, в
 * типе колонки, — чтобы «10:30» приходило одинаково из `returning()`, из
 * `db.query` и из обычного `select`, а не в одном месте из трёх.
 * Тип `time`, а не строка: «25:99» база не примет сама.
 *
 * Отдельным файлом и без реэкспорта из `index.ts`: это тип колонки, а не
 * таблица; им пользуются `late_requests` и `late_check_ins`.
 */
export const clockTime = customType<{ data: string; driverData: string }>({
  dataType: () => 'time',
  fromDriver: (value) => value.slice(0, 5),
});
