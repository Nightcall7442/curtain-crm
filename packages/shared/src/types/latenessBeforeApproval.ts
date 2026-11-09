import { z } from 'zod';

import { lateDisciplineKindSchema } from '../enums/discipline.enum';

/**
 * Запись опоздания за день — какой она была до одобрения запроса на опоздание.
 *
 * Правило владельца: одобрение может только смягчить или снять штраф, а
 * снятие согласования возвращает день РОВНО к тому, каким он был до
 * одобрения. Раньше снятие выводило запись заново — из отметки, графика и
 * смен, — и каждый раз находился новый способ получить не то, что было:
 * повтор пересчитывался строже, график задним числом давал 70 минут вместо
 * 10, удалённая смена не давала вернуть штраф вовсе. Поэтому одобрение,
 * которое запись поправило или сняло, сохраняет её целиком, а снятие
 * согласования возвращает сохранённое как есть — без пересчёта по графику
 * и сменам.
 *
 * Живое в снимке одно — повтор и балл (`row.isRepeat`, `row.points`).
 * Повтор зависит не от самого дня, а от того, было ли раньше в месяце такое
 * же опоздание, и это за время одобрения может измениться: сняли
 * согласование более раннего дня, руководитель записал или простил
 * опоздание раньше. Застывший снимок вернул бы устаревший повтор, поэтому,
 * пока одобрение в силе, их пересчитывает месяц — тем же правилом, что и
 * живую запись на этом месте (`recountHeldRepeats` в `lateness.service`).
 *
 * Хранится в самом запросе (`late_requests.lateness_before_approval`): это
 * состояние, которое принадлежит одному одобрению и живёт, пока оно в силе.
 * Схема одна на запись (`lateness.service`) и тип колонки (`packages/db`);
 * читается всегда через неё — `jsonb` в базе мог поправить кто угодно.
 */

/** Что одобрение сделало с записью дня: поправило на месте или сняло. */
export const LATENESS_APPROVAL_CHANGES = ['adjusted', 'removed'] as const;

export type LatenessApprovalChange = (typeof LATENESS_APPROVAL_CHANGES)[number];

export const latenessBeforeApprovalSchema = z.object({
  change: z.enum(LATENESS_APPROVAL_CHANGES),
  row: z.object({
    /** Поправленная запись возвращается в ту же строку; снятая — новой строкой с этими значениями. */
    id: z.number().int().positive(),
    kind: lateDisciplineKindSchema,
    isRepeat: z.boolean(),
    /**
     * Балл строкой, как его отдаёт `numeric(4,1)`: «-0.5», «-2.0». Строкой, а
     * не числом, — чтобы вернуть в колонку ровно то, что из неё взяли.
     */
    points: z.string().regex(/^-?\d{1,3}\.\d$/),
    description: z.string().nullable(),
    employeeComment: z.string().nullable(),
    /** Момент объяснения — ISO-строкой: `Date` в `jsonb` иначе не хранится. */
    employeeCommentAt: z.string().datetime().nullable(),
    occurredOn: z.string().date(),
  }),
});

export type LatenessBeforeApproval = z.infer<typeof latenessBeforeApprovalSchema>;
