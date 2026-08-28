import type { Role } from '@curtain-crm/shared';

/**
 * Типы уровня приложения, общие для контекста, middleware и сервисов.
 * Доменные типы (роли, статусы) живут в `@curtain-crm/shared`,
 * типы строк БД — в `@curtain-crm/db`.
 */

/**
 * Аутентифицированный сотрудник в контексте запроса.
 *
 * Роли и филиалы загружаются из БД на каждый запрос, а не берутся из токена, —
 * см. пояснение в `lib/jwt.ts`.
 */
export interface AuthenticatedUser {
  readonly id: number;
  readonly fullName: string;
  readonly phone: string;
  readonly isActive: boolean;
  readonly roles: readonly Role[];
  readonly branchIds: readonly number[];
  /** Основной филиал — подставляется по умолчанию при создании заказа. */
  readonly primaryBranchId: number | null;
}

/** Параметры пагинации, общие для всех списочных процедур. */
export interface PaginationInput {
  readonly page: number;
  readonly pageSize: number;
}

/** Страница результатов. */
export interface Page<TItem> {
  readonly items: readonly TItem[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly totalPages: number;
}

/** Собирает страницу результатов из выборки и общего количества. */
export function toPage<TItem>(
  items: readonly TItem[],
  total: number,
  pagination: PaginationInput,
): Page<TItem> {
  return {
    items,
    total,
    page: pagination.page,
    pageSize: pagination.pageSize,
    totalPages: pagination.pageSize > 0 ? Math.ceil(total / pagination.pageSize) : 0,
  };
}

/** Смещение для SQL по номеру страницы. */
export function toOffset(pagination: PaginationInput): number {
  return (pagination.page - 1) * pagination.pageSize;
}
