import { sql } from 'drizzle-orm';
import {
  check,
  doublePrecision,
  index,
  integer,
  pgTable,
  serial,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { orders } from './orders.schema';
import { shifts } from './shifts.schema';

/**
 * Выезд на установку: сотрудник ушёл с объекта работы, но не с работы.
 *
 * Раньше выбор был из двух: закрыть смену — и потерять полдня рабочего
 * времени в табеле, — или не отмечаться вовсе, и тогда человек числится в
 * цеху, где его нет. Установщики выбирали второе, и «кто сейчас в цеху» на
 * экране руководителя означало «кто сегодня отметился», а не «кто здесь».
 *
 * Отдельно от `personal_breaks`: та отлучка личная и короткая — потолок
 * тридцать минут, просрочка попадает в тревоги на главной. Выезд длится
 * сколько нужно, оплачивается как работа и просрочки не имеет вовсе. Одна
 * таблица на оба случая превратила бы установщика, уехавшего на четыре
 * часа, в нарушителя в отчёте.
 *
 * Заказ необязателен: выезжают и по заказу, и «посмотреть объект», и на
 * повторный замер, о котором в системе ещё нет строки. Требовать номер
 * значило бы получить в нём первый попавшийся.
 */
export const installationTrips = pgTable(
  'installation_trips',
  {
    id: serial('id').primaryKey(),

    /*
      Привязка к смене, а не к сотруднику — как у личной отлучки: выезд
      существует только внутри рабочего дня, и удаление смены (правка
      табеля) должно уносить его с собой.
    */
    shiftId: integer('shift_id')
      .notNull()
      .references(() => shifts.id, { onDelete: 'cascade' }),

    orderId: integer('order_id').references(() => orders.id, { onDelete: 'set null' }),

    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    /** `null` — сотрудник ещё на выезде. */
    returnedAt: timestamp('returned_at', { withTimezone: true }),

    /*
      Координаты на обоих концах: владелец просил, чтобы всё было по GPS.
      Радиусом филиала выезд НЕ проверяется ни в одну сторону — уезжают как
      раз из него и возвращаются в него же с дороги, где точность связи
      хуже. Записанное расстояние отвечает на вопрос «откуда отметился», не
      мешая отметиться вовсе.
    */
    startLatitude: doublePrecision('start_latitude').notNull(),
    startLongitude: doublePrecision('start_longitude').notNull(),
    startDistanceMeters: integer('start_distance_meters'),

    endLatitude: doublePrecision('end_latitude'),
    endLongitude: doublePrecision('end_longitude'),
    endDistanceMeters: integer('end_distance_meters'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('installation_trips_shift_idx').on(table.shiftId),
    index('installation_trips_order_idx').on(table.orderId),

    // Два одновременных выезда с одной смены — это не два выезда, а
    // забытая кнопка «вернулся». Пусть база не даст завести второй.
    uniqueIndex('installation_trips_single_active_per_shift')
      .on(table.shiftId)
      .where(sql`${table.returnedAt} is null`),

    check(
      'installation_trips_returned_after_start',
      sql`${table.returnedAt} is null or ${table.returnedAt} >= ${table.startedAt}`,
    ),
  ],
);
