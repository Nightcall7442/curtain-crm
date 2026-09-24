import { branches, events, users } from '@curtain-crm/db';
import { TRPCError } from '@trpc/server';
import { and, asc, eq, gte, lte, or } from 'drizzle-orm';
import { z } from 'zod';

import { ALLOWED_IMAGE_MIME_TYPES, getEnv } from '../lib/constants';
import { base64FileSchema, idSchema, nonEmptyString, optionalText } from '../lib/schemas';
import { protectedProcedure } from '../middleware/auth.middleware';
import { managementProcedure } from '../middleware/roleGuard.middleware';
import { recordAudit } from '../services/audit.service';
import { upcomingBirthdays } from '../services/staff.service';
import { buildStorageKey, decodeBase64Payload, getStorage } from '../services/storage.service';
import { router } from '../trpc';

/**
 * Ближайшие события мастерской.
 *
 * Два источника в одной ленте: дни рождения система знает сама, мероприятия
 * (собрание, выезд, обучение) заводит руководство — их она знать не может.
 *
 * Выходных здесь нет: владелец вычеркнул их с карточки. Ими и так занят
 * отдельный раздел, а место в ряду они отнимали у именинников, ради которых
 * карточку и смотрят.
 */

const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;

/**
 * Сколько дней рождения в ленте всегда.
 *
 * Горизонт в 30 дней задуман для мероприятий и выходных: дальше них
 * заглядывать незачем. Дням рождения он выходил боком — в пустой месяц
 * в карточке оставался один именинник, и владелец попросил показывать
 * три ближайших, даже если до них ещё далеко: подарок покупают заранее.
 */
const ALWAYS_BIRTHDAYS = 3;

/** Год вперёд — весь круг дней рождения; ближе ничего не потеряется. */
const BIRTHDAY_LOOKAHEAD_DAYS = 365;

/** Сегодня по Ташкенту, `YYYY-MM-DD`: день события — календарный, не UTC. */
const today = (): string => new Date(Date.now() + TASHKENT_OFFSET_MS).toISOString().slice(0, 10);

const dayAfter = (days: number): string =>
  new Date(Date.now() + TASHKENT_OFFSET_MS + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

/** Сколько дней от сегодня до даты; прошедшее — ноль («идёт сейчас»). */
const daysFromToday = (date: string): number =>
  Math.max(0, Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today()}T00:00:00Z`)) / 86_400_000));

export const eventsRouter = router({
  /**
   * Лента ближайших событий: мероприятия и дни рождения.
   *
   * Одним запросом, а не тремя: карточка на главной показывает их вперемешку
   * по дате, и склеивать три ответа на клиенте значило бы гонять сортировку
   * по каждому экрану.
   */
  upcoming: protectedProcedure
    .input(z.object({ withinDays: z.number().int().min(1).max(365).default(30) }).default({}))
    .query(async ({ ctx, input }) => {
      const from = today();
      const until = dayAfter(input.withinDays);

      const [allBirthdays, own] = await Promise.all([
        upcomingBirthdays(ctx.db, BIRTHDAY_LOOKAHEAD_DAYS),
        ctx.db
          .select({
            id: events.id,
            title: events.title,
            description: events.description,
            startDate: events.startDate,
            endDate: events.endDate,
            photoKey: events.photoKey,
            branchName: branches.name,
            authorName: users.fullName,
          })
          .from(events)
          .innerJoin(users, eq(users.id, events.createdBy))
          .leftJoin(branches, eq(branches.id, events.branchId))
          .where(
            and(
              // Многодневное событие висит в ленте, пока не кончится.
              or(gte(events.endDate, from), gte(events.startDate, from)),
              lte(events.startDate, until),
            ),
          )
          .orderBy(asc(events.startDate))
          .limit(50),
      ]);

      /*
        Три ближайших — и те, что попали в горизонт, сверх них. Список уже
        отсортирован по близости, поэтому берётся началом.
      */
      const birthdays = allBirthdays.filter(
        (row, index) => index < ALWAYS_BIRTHDAYS || row.daysUntil <= input.withinDays,
      );

      const storage = getStorage();
      const withUrl = async (key: string | null): Promise<string | null> =>
        key === null ? null : storage.getUrl(key);

      const rows = [
        ...own.map((row) => ({
          kind: 'event' as const,
          id: `event-${row.id.toString()}`,
          eventId: row.id,
          title: row.title,
          subtitle: row.description ?? row.branchName ?? row.authorName,
          photoKey: row.photoKey,
          date: row.startDate,
          endDate: row.endDate,
          daysUntil: daysFromToday(row.startDate),
        })),
        ...birthdays.map((row) => ({
          kind: 'birthday' as const,
          id: `birthday-${row.userId.toString()}`,
          eventId: null as number | null,
          title: row.fullName,
          subtitle: row.jobTitle,
          photoKey: row.avatarStorageKey,
          date: row.birthDate,
          endDate: null as string | null,
          daysUntil: row.daysUntil,
        })),
      ].sort((a, b) => a.daysUntil - b.daysUntil);

      return Promise.all(
        rows.map(async ({ photoKey, ...row }) => ({ ...row, photoUrl: await withUrl(photoKey) })),
      );
    }),

  /** Завести мероприятие: название, день и, если есть, картинка. */
  create: managementProcedure
    .input(
      z.object({
        title: nonEmptyString(200, 'Укажите название'),
        description: optionalText(500),
        startDate: z.string().date(),
        endDate: z.string().date().optional(),
        branchId: idSchema.optional(),
        photo: base64FileSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.endDate !== undefined && input.endDate < input.startDate) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Конец мероприятия раньше начала' });
      }

      const photoKey =
        input.photo === undefined
          ? null
          : (
              await getStorage().upload({
                key: buildStorageKey(['events'], input.photo.mimeType),
                body: decodeBase64Payload(input.photo, {
                  allowedMimeTypes: ALLOWED_IMAGE_MIME_TYPES,
                  maxBytes: getEnv().MAX_UPLOAD_SIZE_MB * 1024 * 1024,
                }),
                mimeType: input.photo.mimeType,
              })
            ).key;

      return ctx.db.transaction(async (tx) => {
        const [created] = await tx
          .insert(events)
          .values({
            title: input.title,
            description: input.description ?? null,
            startDate: input.startDate,
            endDate: input.endDate ?? null,
            branchId: input.branchId ?? null,
            photoKey,
            createdBy: ctx.user.id,
          })
          .returning();

        if (created === undefined) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Не удалось сохранить мероприятие' });
        }

        await recordAudit(tx, {
          actorId: ctx.user.id,
          action: 'event.created',
          entityType: 'event',
          entityId: created.id,
          details: { title: created.title, startDate: created.startDate },
          ipAddress: ctx.ipAddress,
        });

        return created;
      });
    }),

  /** Убрать мероприятие: отменилось или завели по ошибке. */
  remove: managementProcedure
    .input(z.object({ id: idSchema }))
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const [removed] = await tx.delete(events).where(eq(events.id, input.id)).returning({
          id: events.id,
          title: events.title,
        });

        if (removed === undefined) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Мероприятие не найдено' });
        }

        await recordAudit(tx, {
          actorId: ctx.user.id,
          action: 'event.removed',
          entityType: 'event',
          entityId: removed.id,
          details: { title: removed.title },
          ipAddress: ctx.ipAddress,
        });

        return removed;
      }),
    ),
});
