'use client';

import Link from 'next/link';
import { useState, type ReactElement } from 'react';

import { AuditDetails } from '@/components/audit/AuditDetails';
import { Card, CardHeader, ErrorState } from '@/components/ui/Card';
import { controlClass } from '@/components/ui/Form';
import { DataTable, Pagination } from '@/components/ui/Table';
import { trpc } from '@/lib/trpc';
import { formatDateTime } from '@/lib/utils';

/**
 * Журнал действий.
 *
 * Писали в `audit_log` с самого начала, а прочитать его можно было только
 * запросом в базу руками. Экран закрывает три вопроса, с которыми в журнал
 * приходят: что происходило с сущностью, кто это сделал и что было за период.
 *
 * Доступен только директору — так же, как процедура `audit.list`. Скрытие
 * пункта меню тут, как везде, лишь удобство: `ceoProcedure` откажет и админу,
 * который откроет адрес напрямую.
 */

/** Человекочитаемые названия сущностей. Коды остаются в `details`. */
const ENTITY_LABELS_RU: Readonly<Record<string, string>> = {
  user: 'Сотрудник',
  branch: 'Филиал',
  shift: 'Смена',
  order: 'Заказ',
  purchase_item: 'Товар закупки',
  payroll_scheme: 'Схема оплаты',
  payroll_record: 'Расчёт зарплаты',
  catalog_item: 'Справочник',
  day_off_request: 'Заявка на отгул',
  task: 'Поручение',
  retail_item: 'Товар витрины',
  retail_sale: 'Чек',
};

/**
 * Куда ведёт запись журнала.
 *
 * Не у всякой сущности есть свой экран: филиал и схему оплаты открыть
 * негде, и ссылка вела бы в никуда. Поэтому список белый, а не «строим
 * адрес из типа»: пока страницы нет, запись остаётся текстом.
 */
const ENTITY_HREFS: Readonly<Record<string, (id: number) => string>> = {
  order: (id) => `/orders/${id.toString()}`,
  retail_sale: (id) => `/retail?sale=${id.toString()}`,
};

/**
 * Названия действий.
 *
 * Канонический список кодов живёт в `apps/api/src/lib/constants.ts`
 * (`AUDIT_ACTIONS`), но веб-панель не может его импортировать: `apps/web`
 * зависит от `apps/api` только по типу `AppRouter`. Дублировать список
 * значениями в `packages/shared` тоже нечестно — он про устройство сервера,
 * а не про общий словарь предметной области.
 *
 * Поэтому здесь словарь ПЕРЕВОДА, а не список: коды приходят с сервера
 * (`audit.filters`), а незнакомый код показывается как есть. Новое действие
 * появится в журнале в тот же день, что и на сервере, — просто по-английски,
 * пока сюда не допишут строку.
 */
const ACTION_LABELS_RU: Readonly<Record<string, string>> = {
  'user.created': 'Сотрудник создан',
  'user.updated': 'Сотрудник изменён',
  'user.deactivated': 'Сотрудник отключён',
  'user.activated': 'Сотрудник включён',
  'user.password_reset': 'Пароль сброшен',
  'user.role_granted': 'Роль выдана',
  'user.role_revoked': 'Роль снята',
  'user.branches_changed': 'Филиалы изменены',

  'branch.created': 'Филиал создан',
  'branch.updated': 'Филиал изменён',

  'shift.adjusted': 'Смена скорректирована',
  'shift.deleted': 'Смена удалена',

  'order.created': 'Заказ создан',
  'order.updated': 'Заказ изменён',
  'order.status_changed': 'Статус изменён',
  'order.cancelled': 'Заказ отменён',
  'order.assignee_changed': 'Исполнитель изменён',
  'order.price_changed': 'Цена изменена',
  'order.stage_fees_changed': 'Расценки по этапам изменены',

  'retail_item.created': 'Товар витрины создан',
  'retail_item.updated': 'Товар витрины изменён',
  'retail_item.stock_changed': 'Остаток на витрине изменён',
  'retail_item.activated': 'Товар возвращён на витрину',
  'retail_item.deactivated': 'Товар снят с витрины',
  'retail_sale.created': 'Чек пробит',

  'task.created': 'Поручение выдано',
  'user.avatar_changed': 'Фото сотрудника изменено',

  'purchase_item.created': 'Товар закупки создан',
  'purchase_item.price_changed': 'Цена товара изменена',
  'purchase_item.deactivated': 'Товар отключён',
  'purchase_item.activated': 'Товар включён',

  'payroll.scheme_changed': 'Схема оплаты изменена',
  'payroll.calculated': 'Зарплата рассчитана',
  'payroll.approved': 'Расчёт утверждён',
  'payroll.paid': 'Зарплата выплачена',

  'catalog.item_created': 'Позиция справочника создана',
  'catalog.item_updated': 'Позиция справочника изменена',
  'catalog.item_deactivated': 'Позиция справочника отключена',
};

export default function AuditPage(): ReactElement {
  const [page, setPage] = useState(1);
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');

  const filters = trpc.audit.filters.useQuery();

  const query = trpc.audit.list.useQuery({
    page,
    pageSize: 25,
    ...(entityType === '' ? {} : { entityType: entityType as 'order' }),
    ...(action === '' ? {} : { action: action as 'order.created' }),
  });

  if (query.isError) {
    return (
      <Card>
        <ErrorState
          message={query.error.message}
          onRetry={() => {
            void query.refetch();
          }}
        />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Журнал действий"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={entityType}
              onChange={(event) => {
                setEntityType(event.target.value);
                setPage(1);
              }}
              aria-label="Сущность"
              className={controlClass('sm', 'w-auto pr-8')}
            >
              <option value="">Все сущности</option>
              {(filters.data?.entityTypes ?? []).map((value) => (
                <option key={value} value={value}>
                  {ENTITY_LABELS_RU[value] ?? value}
                </option>
              ))}
            </select>

            {/* Список действий приходит с сервера: держать его вторую копию
                здесь значило бы разойтись с ним на ближайшей правке. */}
            <select
              value={action}
              onChange={(event) => {
                setAction(event.target.value);
                setPage(1);
              }}
              aria-label="Действие"
              className={controlClass('sm', 'w-auto pr-8')}
            >
              <option value="">Все действия</option>
              {(filters.data?.actions ?? []).map((value) => (
                <option key={value} value={value}>
                  {ACTION_LABELS_RU[value] ?? value}
                </option>
              ))}
            </select>
          </div>
        }
      />

      <DataTable
        isLoading={query.isLoading}
        rows={query.data?.items ?? []}
        rowKey={(row) => row.id}
        emptyMessage="Записей по этим условиям нет"
        columns={[
          {
            key: 'when',
            header: 'Когда',
            render: (row) => formatDateTime(row.createdAt),
          },
          {
            key: 'actor',
            header: 'Кто',
            render: (row) => <span className="text-primary">{row.actorName}</span>,
          },
          {
            key: 'action',
            header: 'Действие',
            // Код действия остаётся в подсказке: по нему ищут в исходниках
            // и им же фильтруют через API.
            render: (row) => (
              <span className="text-primary" title={row.action}>
                {ACTION_LABELS_RU[row.action] ?? row.action}
              </span>
            ),
          },
          {
            key: 'entity',
            header: 'Объект',
            render: (row) => {
              const label = `${ENTITY_LABELS_RU[row.entityType] ?? row.entityType}${
                row.entityId === null ? '' : ` #${row.entityId.toString()}`
              }`;

              const buildHref = ENTITY_HREFS[row.entityType];
              if (buildHref === undefined || row.entityId === null) return label;

              return (
                <Link href={buildHref(row.entityId)} className="text-accent hover:underline">
                  {label}
                </Link>
              );
            },
          },
          {
            key: 'details',
            header: 'Подробности',
            render: (row) => <AuditDetails details={row.details} />,
          },
          {
            key: 'ip',
            header: 'Адрес',
            render: (row) => row.ipAddress ?? '—',
          },
        ]}
      />

      {query.data !== undefined && (
        <Pagination
          page={query.data.page}
          totalPages={query.data.totalPages}
          total={query.data.total}
          pageSize={query.data.pageSize}
          onChange={setPage}
        />
      )}
    </Card>
  );
}
