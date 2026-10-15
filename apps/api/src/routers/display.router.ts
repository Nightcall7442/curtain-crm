import { MonitorGroup, monitorGroupSchema, resolveLocale } from '@curtain-crm/shared';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { findActiveDisplayLink, touchDisplayLinkSeen } from '../services/displayLinks.service';
import { toDisplayBoard } from '../services/monitor.redact';
import { buildBoard } from '../services/monitor.service';
import { baseProcedure, router } from '../trpc';

/**
 * Табло для телевизора в цеху — по секретной ссылке, без входа.
 *
 * Токен ссылки и есть пропуск: филиал, группы и язык берутся из неё, а не из
 * запроса, — подменить их адресом нельзя. Ответ проходит через
 * `toDisplayBoard`, поэтому адресов, клиентов и id заказов на экране нет.
 * Частоту обращений держит ограничитель по адресу в `index.ts`.
 */
export const displayRouter = router({
  board: baseProcedure
    .input(z.object({ token: z.string().min(20).max(100), group: monitorGroupSchema }))
    .query(async ({ ctx, input }) => {
      const link = await findActiveDisplayLink(ctx.db, input.token);
      if (link === null) {
        // NOT_FOUND, а не UNAUTHORIZED: на 401 клиент панели обновляет токен и, получив
        // 401 снова, выходит из сессии. Руководитель, открывший отозванную ссылку у себя,
        // вылетел бы из панели. Ссылки нет — значит «не найдено».
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Ссылка недействительна' });
      }

      const shown = input.group === MonitorGroup.WORKSHOP ? link.showWorkshop : link.showInstallation;
      if (!shown) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Эта группа на ссылке не показывается' });
      }

      const now = new Date();
      // Язык в базе ограничен `display_links_locale`, но строка об этом не знает.
      const locale = resolveLocale(link.locale);
      await touchDisplayLinkSeen(ctx.db, link, now);
      const board = await buildBoard(ctx.db, {
        group: input.group,
        branchId: link.branchId,
        now,
        locale,
        previewOnly: true,
      });
      return toDisplayBoard(board, { ...link, locale });
    }),
});
