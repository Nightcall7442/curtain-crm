'use client';

import { formatDateTime, ROLE_LABELS_RU, Role } from '@curtain-crm/shared';
import type { ReactElement } from 'react';

import { useAuth } from '@/components/providers/AuthProvider';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button, FormError } from '@/components/ui/Form';
import { trpc } from '@/lib/trpc';

/**
 * Роли, которые выдала система, а не директор.
 *
 * До выпуска 3 назначение на заказ само выдавало недостающую роль:
 * продавщицу ставили на установку — и она становилась установщиком. Теперь
 * так нельзя, а выданное раньше осталось. Директор просматривает список и
 * снимает лишнее; оставить роль — тоже решение, кнопку можно не нажимать.
 *
 * Видит только директор: роли меняет он один. Пустой список — блока нет.
 */
export function AutoGrantedRoles(): ReactElement | null {
  const { hasRole } = useAuth();
  const isCeo = hasRole(Role.CEO);
  const utils = trpc.useUtils();
  const list = trpc.users.autoGrantedRoles.useQuery(undefined, { enabled: isCeo });
  const revoke = trpc.users.revokeRole.useMutation({
    onSuccess: async () => {
      await utils.users.autoGrantedRoles.invalidate();
      await utils.users.list.invalidate();
    },
  });

  if (!isCeo || (list.data?.length ?? 0) === 0) return null;

  return (
    <Card>
      <CardHeader title="Роли, выданные системой автоматически" />
      <CardBody>
        <p className="mb-2 text-footnote text-muted">
          Раньше назначение на заказ само добавляло роль. Снимите лишние — менять роли вправе только
          директор.
        </p>
        <ul className="divide-y divide-subtle">
          {list.data?.map((row) => (
            <li key={`${row.userId.toString()}-${row.role}`} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-caption text-primary">
                  {`${row.fullName} · ${ROLE_LABELS_RU[row.role]}`}
                </p>
                <p className="truncate text-footnote text-muted">
                  {`выдана ${formatDateTime(row.grantedAt)}${row.grantedByName === null ? '' : ` · назначил ${row.grantedByName}`}`}
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                loading={revoke.isPending && revoke.variables?.id === row.userId && revoke.variables.role === row.role}
                onClick={() => {
                  revoke.mutate({ id: row.userId, role: row.role });
                }}
              >
                Снять роль
              </Button>
            </li>
          ))}
        </ul>
        <FormError message={revoke.error?.message ?? null} />
      </CardBody>
    </Card>
  );
}
