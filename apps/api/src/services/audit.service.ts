import { auditLog, users, type DbExecutor } from '@curtain-crm/db';
import { eq } from 'drizzle-orm';

import { AUDIT_ACTION_LABELS } from '../lib/auditLabels';
import type { AuditAction } from '../lib/constants';

import { isTelegramGroupEnabled, sendTelegramGroupMessage } from './telegram.service';

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
  'ready_made_item',
  'fabric_stock',
  'discipline_event',
  'event',
  'payment',
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

  await announceToGroup(executor, input);
}

/* -------------------------------------------------------------------------- */
/*                        Лента действий в Telegram                           */
/* -------------------------------------------------------------------------- */

/** Сколько знаков деталей уходит в группу: остальное — шум в ленте. */
const DETAILS_LIMIT = 180;

/** Значение детали строкой; объекты и массивы сюда не попадают. */
const scalar = (value: unknown): string =>
  typeof value === 'string' ? value : typeof value === 'number' || typeof value === 'boolean' ? value.toString() : '';

/** Вложенный объект («было/стало») — одним уровнем: `workPrice=100, deposit=0`. */
const flatten = (value: Record<string, unknown>): string =>
  Object.entries(value)
    .map(([key, inner]) => (scalar(inner) === '' ? '' : `${key}=${scalar(inner)}`))
    .filter((part) => part !== '')
    .join(', ');

/**
 * Короткая расшифровка деталей: «kind: late_15_30 · points: -1».
 *
 * Значения-объекты («было/стало») разворачиваются на один уровень, глубже
 * не лезем: лента читается с телефона одним взглядом и не заменяет журнал,
 * который открывается в панели целиком.
 */
function describeDetails(details: Record<string, unknown> | undefined): string {
  if (details === undefined) return '';

  const parts: string[] = [];
  for (const [key, value] of Object.entries(details)) {
    if (value === null || value === undefined) continue;

    const text = typeof value === 'object' ? flatten(value as Record<string, unknown>) : scalar(value);

    if (text === '') continue;
    parts.push(`${key}: ${text}`);
  }

  const line = parts.join(' · ');
  return line.length > DETAILS_LIMIT ? `${line.slice(0, DETAILS_LIMIT)}…` : line;
}

/**
 * Пишет действие в группу мастерской.
 *
 * Владелец попросил, чтобы бот сообщал в группу о каждом действии, — а
 * каждое значимое действие и так проходит через журнал. Поэтому лента
 * живёт здесь, а не на шестидесяти вызовах по роутерам.
 *
 * Отправка не ждётся: запрос к Telegram идёт изнутри транзакции действия, и
 * ждать его — значит сделать чужой сервис условием работы мастерской.
 * Ошибки гасит сам клиент Bot API.
 *
 * Плата за это: если транзакция потом откатится, сообщение уже уйдёт. Откат
 * случается на ошибке, то есть редко, и лишняя строка в ленте дешевле
 * задержки на каждом действии.
 */
async function announceToGroup(executor: DbExecutor, input: RecordAuditInput): Promise<void> {
  if (!isTelegramGroupEnabled()) return;

  const [actor] = await executor
    .select({ fullName: users.fullName })
    .from(users)
    .where(eq(users.id, input.actorId))
    .limit(1);

  const entity =
    input.entityId === null || input.entityId === undefined ? '' : ` #${input.entityId.toString()}`;
  const body = [
    `${actor?.fullName ?? 'Сотрудник'} · ${input.entityType}${entity}`,
    describeDetails(input.details),
  ]
    .filter((line) => line !== '')
    .join('\n');

  void sendTelegramGroupMessage(AUDIT_ACTION_LABELS[input.action], body);
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
