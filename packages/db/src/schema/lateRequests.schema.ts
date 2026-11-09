import type { LatenessBeforeApproval } from '@curtain-crm/shared';
import { sql } from 'drizzle-orm';
import {
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { dayOffStatusEnum } from './enums';
import { users } from './users.schema';

/**
 * Время дня `ЧЧ:ММ` поверх колонки `time`.
 *
 * Postgres отдаёт `time` с секундами («10:30:00»), а клиенты и график смены
 * (`payroll_schemes.shift_start`) знают время как «10:30». Обрезка здесь, в
 * типе колонки, — чтобы «10:30» приходило одинаково из `returning()`, из
 * `db.query` и из обычного `select`, а не в одном месте из трёх.
 * Тип `time`, а не строка: «25:99» база не примет сама.
 */
const clockTime = customType<{ data: string; driverData: string }>({
  dataType: () => 'time',
  fromDriver: (value) => value.slice(0, 5),
});

/**
 * Запросы на опоздание: «12.11 приду к 10:30».
 *
 * Отдельно от выходных (`day_off_requests`) намеренно: выходные читают
 * табель, зарплата, рейтинг и табло, и опоздание, положенное туда,
 * посчиталось бы днём отсутствия. Здесь же человек работает — просто
 * начинает позже, и одобренный запрос сдвигает только порог опоздания
 * (`lateness.service`).
 *
 * Статусы и инварианты — как у выходных: решённый руководством запрос
 * имеет рецензента и дату решения, отклонённый — причину. Записи не
 * удаляются — это история договорённостей.
 */
export const lateRequests = pgTable(
  'late_requests',
  {
    id: serial('id').primaryKey(),

    // restrict: сотрудников не удаляют (увольнение = деактивация).
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    /** День, в который сотрудник придёт позже, — по Ташкенту. */
    date: date('date').notNull(),
    /** К какому времени придёт: «10:30». */
    arriveBy: clockTime('arrive_by').notNull(),

    /** Причина — по желанию сотрудника. В группу Telegram не уходит. */
    reason: text('reason'),

    status: dayOffStatusEnum('status').notNull().default('pending'),

    reviewedBy: integer('reviewed_by').references(() => users.id, { onDelete: 'restrict' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    /** Причина отказа. Связку «отклонён ⇒ причина» держит БД. */
    rejectionReason: text('rejection_reason'),

    /*
      Запись опоздания за этот день — какой она была до одобрения, если
      одобрение её поправило или сняло (`latenessBeforeApprovalSchema`).
      Снятие согласования возвращает её отсюда как есть, без пересчёта по
      графику, и гасит снимок вместе с одобрением; повтор и балл в снимке,
      пока одобрение в силе, пересчитывает месяц (`lateness.service`).
      Колонка в запросе, а не запись в журнале: это состояние одного
      одобрения, а не история, — читается по ключу вместе со строкой
      запроса, а не поиском по `jsonb` растущего журнала, и с другим
      одобрением того же дня его не спутать.
      `null` — одобрения нет или оно запись не поправило и не сняло; два
      исключения (лишние записи того же дня, одобрения до миграции 0076) —
      у `applyWithdrawal` в `lateness.service`.
    */
    latenessBeforeApproval: jsonb('lateness_before_approval').$type<LatenessBeforeApproval>(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Запросы сотрудника и проверка «есть ли одобренное опоздание на этот день».
    index('late_requests_user_date_idx').on(table.userId, table.date),
    // Очередь руководителя: непринятые запросы.
    index('late_requests_status_idx').on(table.status),

    /*
      На день — одна живая договорённость: ждущая решения или одобренная.
      Два «приду к» на один день — какое из них считать порогом опоздания?
      Отклонённые и отозванные не мешают попросить снова.
    */
    uniqueIndex('late_requests_one_active_per_day')
      .on(table.userId, table.date)
      .where(sql`${table.status} in ('pending', 'approved')`),

    // Инварианты статуса — те же, что у выходных, и тоже в БД.
    check(
      'late_requests_reviewed_matches_status',
      sql`(${table.status} in ('approved', 'rejected')) = (${table.reviewedBy} is not null)`,
    ),
    check(
      'late_requests_reviewed_at_matches_reviewer',
      sql`(${table.reviewedBy} is null) = (${table.reviewedAt} is null)`,
    ),
    check(
      'late_requests_rejection_reason_matches_status',
      sql`(${table.status} = 'rejected') = (${table.rejectionReason} is not null)`,
    ),
    // Снимок живёт, пока одобрение в силе: снятое согласование его не оставляет.
    check(
      'late_requests_snapshot_only_when_approved',
      sql`${table.latenessBeforeApproval} is null or ${table.status} = 'approved'`,
    ),
  ],
);

export type LateRequest = typeof lateRequests.$inferSelect;
export type NewLateRequest = typeof lateRequests.$inferInsert;
