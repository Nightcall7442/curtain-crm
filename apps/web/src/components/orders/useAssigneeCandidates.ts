'use client';

import { trpc } from '@/lib/trpc';
import type { Role } from '@curtain-crm/shared';

/**
 * Кандидаты на роль в заказе — только те, у кого эта роль есть.
 *
 * Раньше по «Ещё» сюда добавлялись все сотрудники, а недостающую роль API
 * выдавал при назначении. Так роли раздавали админ и менеджер, хотя менять
 * их вправе только директор, — теперь сервер такое назначение отклоняет, и
 * список не предлагает того, что всё равно не пройдёт. Подработка вне своей
 * роли оформляется так: директор выдаёт роль в карточке сотрудника.
 *
 * Список берётся из `users.assignable`, а не из `users.list`: тот закрыт для
 * менеджера и отдаёт полные карточки, а здесь нужны только имя и роли.
 *
 * Уже назначенный остаётся в списке всегда — иначе после снятия роли поле
 * показывало бы пустоту вместо человека. Если роли у него нет (назначен до
 * запрета), подписана его основная роль.
 */
export function useAssigneeCandidates(
  role: Role,
  currentId: number | null,
): {
  readonly loading: boolean;
  readonly candidates: readonly { readonly id: number; readonly fullName: string; readonly mainRole: Role | null }[];
} {
  const staff = trpc.users.assignable.useQuery();
  const items = staff.data ?? [];

  const pool = items.filter((person) => person.roles.includes(role));
  const current = items.find((person) => person.id === currentId);
  if (current !== undefined && !pool.includes(current)) pool.push(current);

  return {
    loading: staff.isLoading,
    candidates: pool.map((person) => ({
      id: person.id,
      fullName: person.fullName,
      mainRole: person.roles.includes(role) ? null : (person.roles[0] ?? null),
    })),
  };
}
