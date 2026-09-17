import { disciplineEvents, payrollSchemes, type DbExecutor } from '@curtain-crm/db';
import {
  DISCIPLINE_KIND_LABELS_RU,
  disciplinePoints,
  DisciplineKind,
  isDisciplineViolation,
  type DisciplineKind as DisciplineKindName,
} from '@curtain-crm/shared';
import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';

import { recordAudit } from './audit.service';
import { notifyDisciplineRecorded } from './notifications.service';

const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;

/**
 * Опоздание — само, по смене из условий оплаты.
 *
 * Почасовику руководитель назначил смену «с 09:00»; отметился в 09:22 —
 * это опоздание, и его не должен вспоминать менеджер к вечеру: система
 * записывает его в дисциплину в момент отметки, по той же таблице баллов
 * (до 15 мин, 15–30, больше 30) и с тем же правилом повтора. Одно на день:
 * вторая отметка после отлучки опозданием не считается.
 *
 * Отметился раньше или вовремя — ничего не пишем: «пришёл вовремя» и есть
 * норма, а не заслуга.
 */
export async function recordLatenessIfAny(
  executor: DbExecutor,
  userId: number,
  startedAt: Date,
  ipAddress: string | null,
): Promise<void> {
  const [scheme] = await executor
    .select({ shiftStart: payrollSchemes.shiftStart })
    .from(payrollSchemes)
    .where(and(eq(payrollSchemes.userId, userId), eq(payrollSchemes.isActive, true), sql`${payrollSchemes.shiftStart} is not null`))
    .orderBy(desc(payrollSchemes.effectiveFrom))
    .limit(1);
  const shiftStart = scheme?.shiftStart ?? null;
  if (shiftStart === null) return;

  const local = new Date(startedAt.getTime() + TASHKENT_OFFSET_MS);
  const [hours, minutes] = shiftStart.split(':').map((part: string) => Number.parseInt(part, 10));
  const plannedMinutes = (hours ?? 0) * 60 + (minutes ?? 0);
  const actualMinutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  const lateBy = actualMinutes - plannedMinutes;
  if (lateBy <= 0) return;

  const day = local.toISOString().slice(0, 10);
  const monthStart = `${day.slice(0, 7)}-01`;
  const nextMonth = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);

  // Одно опоздание в день — повторная отметка после отлучки не считается.
  const [already] = await executor
    .select({ id: disciplineEvents.id })
    .from(disciplineEvents)
    .where(
      and(
        eq(disciplineEvents.userId, userId),
        eq(disciplineEvents.occurredOn, day),
        sql`${disciplineEvents.kind} in ('late_under_15', 'late_15_30', 'late_over_30')`,
      ),
    )
    .limit(1);
  if (already !== undefined) return;

  const kind: DisciplineKindName =
    lateBy <= 15 ? DisciplineKind.LATE_UNDER_15 : lateBy <= 30 ? DisciplineKind.LATE_15_30 : DisciplineKind.LATE_OVER_30;

  const [prior] = await executor
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(disciplineEvents)
    .where(
      and(
        eq(disciplineEvents.userId, userId),
        eq(disciplineEvents.kind, kind),
        gte(disciplineEvents.occurredOn, monthStart),
        lt(disciplineEvents.occurredOn, nextMonth),
      ),
    );
  const isRepeat = isDisciplineViolation(kind) && (prior?.count ?? 0) > 0;
  const points = disciplinePoints(kind, isRepeat);
  const actual = `${local.getUTCHours().toString().padStart(2, '0')}:${local.getUTCMinutes().toString().padStart(2, '0')}`;

  const [created] = await executor
    .insert(disciplineEvents)
    .values({
      userId,
      kind,
      points: points.toFixed(1),
      isRepeat,
      occurredOn: day,
      description: `Смена с ${shiftStart}, отметка в ${actual} — опоздание ${lateBy.toString()} мин`,
      recordedBy: userId,
    })
    .returning({ id: disciplineEvents.id });

  await recordAudit(executor, {
    actorId: userId,
    action: 'discipline.recorded',
    entityType: 'discipline_event',
    entityId: created?.id ?? null,
    details: { auto: true, kind, points, isRepeat, lateBy, label: DISCIPLINE_KIND_LABELS_RU[kind] },
    ipAddress,
  });
  await notifyDisciplineRecorded(executor, userId, { kind, points, occurredOn: day, recordedByName: 'Система' });
}
