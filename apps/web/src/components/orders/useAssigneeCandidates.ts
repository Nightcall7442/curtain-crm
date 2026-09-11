'use client';

import { useState } from 'react';

import { trpc } from '@/lib/trpc';
import { isManagement, type Role } from '@curtain-crm/shared';

/**
 * Кандидаты на роль в заказе.
 *
 * Сначала — только те, у кого эта роль есть: обычный случай, короткий
 * список. По «Ещё» — все активные сотрудники, кроме директора и админа
 * (руководство не ставят швеёй): подработка вне своей роли — обычное дело,
 * роль такому сотруднику выдаст сам API при назначении.
 *
 * Уже назначенный остаётся в списке всегда — иначе после снятия роли поле
 * показывало бы пустоту вместо человека.
 */
export function useAssigneeCandidates(
  role: Role,
  currentId: number | null,
): {
  readonly loading: boolean;
  readonly candidates: readonly { readonly id: number; readonly fullName: string; readonly mainRole: Role | null }[];
  readonly canShowMore: boolean;
  readonly showMore: () => void;
} {
  const [all, setAll] = useState(false);
  const staff = trpc.users.list.useQuery({ page: 1, pageSize: 100, isActive: true });
  const items = staff.data?.items ?? [];

  const own = items.filter((person) => person.roles.includes(role));
  const others = items.filter(
    (person) => !person.roles.includes(role) && !isManagement(person.roles),
  );

  const pool = all ? [...own, ...others] : own;
  const current = items.find((person) => person.id === currentId);
  if (current !== undefined && !pool.includes(current)) pool.push(current);

  return {
    loading: staff.isLoading,
    candidates: pool.map((person) => ({
      id: person.id,
      fullName: person.fullName,
      // Подпись основной роли — только «чужим», чтобы было видно, кого берут со стороны.
      mainRole: person.roles.includes(role) ? null : (person.roles[0] ?? null),
    })),
    canShowMore: !all && others.length > 0,
    showMore: () => {
      setAll(true);
    },
  };
}
