import { auditLog, type DbExecutor } from '@curtain-crm/db';

import type { AuditAction } from '../lib/constants';

/**
 * Журнал значимых действий.
 *
 * Пишем сюда всё, что затрагивает деньги, права и учёт рабочего времени.
 * Вызов ВСЕГДА выполняется внутри той же транзакции, что и само действие:
 * иначе возможна пара «роль выдана, записи нет» или наоборот.
 */

/** Сущности, по которым ведётся аудит. */
export const AUDIT_ENTITY_TYPES = [
  'user',
  'branch',
  'shift',
  'order',
  'purchase_item',
  'payroll_scheme',
  'payroll_record',
  'catalog_item',
  'task',
  'day_off_request',
  'retail_item',
  'retail_sale',
] as const;

export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

export interface RecordAuditInput {
  readonly actorId: number;
  readonly action: AuditAction;
  readonly entityType: AuditEntityType;
  readonly entityId?: number | null;
  /** Детали: старое и новое значение, причина, аргументы процедуры. */
  readonly details?: Record<string, unknown>;
  readonly ipAddress?: string | null;
}

/**
 * Добавляет запись в журнал.
 *
 * Таблица append-only: обновления и удаления записей не предусмотрены
 * ни здесь, ни где-либо ещё в кодовой базе.
 */
export async function recordAudit(
  executor: DbExecutor,
  input: RecordAuditInput,
): Promise<void> {
  await executor.insert(auditLog).values({
    actorId: input.actorId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    details: input.details ?? null,
    ipAddress: input.ipAddress ?? null,
  });
}

/**
 * Компактное описание изменения полей — типовое содержимое `details`.
 * Возвращает только реально изменившиеся поля, чтобы журнал не заполнялся шумом.
 */
export function diffFields<TRecord extends Record<string, unknown>>(
  before: TRecord,
  after: Partial<TRecord>,
): Record<string, { readonly from: unknown; readonly to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};

  for (const [key, nextValue] of Object.entries(after)) {
    if (nextValue === undefined) continue;
    const previousValue = before[key];
    if (Object.is(previousValue, nextValue)) continue;
    changes[key] = { from: previousValue, to: nextValue };
  }

  return changes;
}
