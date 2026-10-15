import { branches, displayLinks } from '@curtain-crm/db';
import { LOCALES } from '@curtain-crm/shared';
import { TRPCError } from '@trpc/server';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { idSchema, nonEmptyString } from '../lib/schemas';
import { ceoProcedure } from '../middleware/roleGuard.middleware';
import { recordAudit } from '../services/audit.service';
import { generateDisplayToken } from '../services/displayLinks.service';
import { router } from '../trpc';

/**
 * Ссылки для ТВ в цехе — только директор.
 *
 * Ссылка открывает табло без входа, то есть это пропуск, выданный экрану.
 * Выдавать пропуска — то же, что раздавать роли, а это зона директора.
 */
export const displayLinksRouter = router({
  list: ceoProcedure.query(async ({ ctx }) =>
    ctx.db
      .select({
        id: displayLinks.id,
        label: displayLinks.label,
        branchId: displayLinks.branchId,
        branchName: branches.name,
        showWorkshop: displayLinks.showWorkshop,
        showInstallation: displayLinks.showInstallation,
        locale: displayLinks.locale,
        createdAt: displayLinks.createdAt,
        lastSeenAt: displayLinks.lastSeenAt,
        revokedAt: displayLinks.revokedAt,
      })
      .from(displayLinks)
      .leftJoin(branches, eq(branches.id, displayLinks.branchId))
      .orderBy(desc(displayLinks.createdAt), desc(displayLinks.id)),
  ),

  /** Создать ссылку. Токен возвращается один раз — в базе только его хеш. */
  create: ceoProcedure
    .input(
      z.object({
        label: nonEmptyString(60, 'Назовите экран, например «ТВ в цеху»'),
        branchId: idSchema.nullable().default(null),
        showWorkshop: z.boolean(),
        showInstallation: z.boolean(),
        locale: z.enum(LOCALES).default('ru'),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!input.showWorkshop && !input.showInstallation) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Выберите хотя бы одно табло' });
      }

      const { token, hash } = generateDisplayToken();

      return ctx.db.transaction(async (tx) => {
        const [created] = await tx
          .insert(displayLinks)
          .values({
            label: input.label,
            branchId: input.branchId,
            showWorkshop: input.showWorkshop,
            showInstallation: input.showInstallation,
            locale: input.locale,
            tokenHash: hash,
            createdBy: ctx.user.id,
          })
          .returning({ id: displayLinks.id });

        if (created === undefined) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Ссылка не создана' });
        }

        await recordAudit(tx, {
          actorId: ctx.user.id,
          action: 'display_link.created',
          entityType: 'display_link',
          entityId: created.id,
          details: {
            label: input.label,
            branchId: input.branchId,
            showWorkshop: input.showWorkshop,
            showInstallation: input.showInstallation,
          },
          ipAddress: ctx.ipAddress,
        });

        return { id: created.id, token };
      });
    }),

  /** Отозвать: телевизор с этой ссылкой сразу покажет «Ссылка недействительна». */
  revoke: ceoProcedure
    .input(z.object({ id: idSchema }))
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const [revoked] = await tx
          .update(displayLinks)
          .set({ revokedAt: new Date() })
          .where(and(eq(displayLinks.id, input.id), isNull(displayLinks.revokedAt)))
          .returning({ id: displayLinks.id, label: displayLinks.label });

        if (revoked === undefined) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Ссылка не найдена или уже отозвана' });
        }

        await recordAudit(tx, {
          actorId: ctx.user.id,
          action: 'display_link.revoked',
          entityType: 'display_link',
          entityId: revoked.id,
          details: { label: revoked.label },
          ipAddress: ctx.ipAddress,
        });

        return { ok: true as const };
      }),
    ),
});
