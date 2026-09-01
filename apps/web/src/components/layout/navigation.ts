import {
  MANAGEMENT_ROLES,
  Role,
  ROLE_MANAGER_ROLES,
  type Role as RoleName,
} from '@curtain-crm/shared';
import {
  BarChart3,
  ClipboardList,
  Compass,
  LayoutGrid,
  ScrollText,
  Settings,
  Trophy,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

/**
 * Структура бокового меню.
 *
 * `roles` определяет, кому пункт ПОКАЗЫВАЕТСЯ. Это только удобство: доступ
 * к данным закрывают tRPC-процедуры, поэтому переход по адресу напрямую
 * ничего не откроет — страница просто получит `FORBIDDEN` от API.
 *
 * `stub: true` помечает разделы, под которые в системе пока нет ни модели
 * данных, ни API. Они остаются в меню, но честно сообщают, что не реализованы,
 * вместо того чтобы показывать выдуманные цифры.
 */

export interface NavItem {
  readonly href: string;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly roles: readonly RoleName[];
  readonly children?: readonly NavChild[];
  readonly stub?: boolean;
  /** Совпадение адреса только целиком — нужно для главной страницы. */
  readonly exact?: boolean;
}

export interface NavChild {
  readonly href: string;
  readonly label: string;
  readonly roles: readonly RoleName[];
}

const ALL_ROLES: readonly RoleName[] = [
  Role.CEO,
  Role.ADMIN,
  Role.SELLER,
  Role.MASTER,
  Role.SEWER,
  Role.QC,
  Role.INSTALLER,
  Role.SMM,
];

/**
 * Меню сжато с 19 пунктов до 10 (ревизия «Диспетчерская»).
 *
 * «Производство», «Швейный цех», «Установка», «Качество» и «Архив» стали
 * вкладками раздела «Заказы»: всё это один список с готовым фильтром, и
 * пять пунктов меню создавали пять «мест», где может быть заказ. Старые
 * адреса перенаправляют на свою вкладку.
 *
 * «Финансы» из меню убраны: пункт перенаправлял в «Отчёты», а два имени
 * у одних цифр — источник путаницы. Четыре раздела-заглушки собраны под
 * одним пунктом «В планах»: решение их достроить принято, но четыре
 * строки меню под «скоро» — слишком дорогая цена за напоминание.
 */
export const NAVIGATION: readonly NavItem[] = [
  { href: '/', label: 'Главная', icon: LayoutGrid, roles: ALL_ROLES, exact: true },
  { href: '/orders', label: 'Заказы', icon: ClipboardList, roles: ALL_ROLES },
  {
    href: '/employees',
    label: 'Рабочие',
    icon: Users,
    roles: MANAGEMENT_ROLES,
    children: [
      { href: '/employees', label: 'Сотрудники', roles: MANAGEMENT_ROLES },
      { href: '/employees/tasks', label: 'Поручения', roles: MANAGEMENT_ROLES },
      { href: '/employees/department', label: 'Ведомость', roles: MANAGEMENT_ROLES },
      { href: '/employees/timesheet', label: 'Табель', roles: MANAGEMENT_ROLES },
    ],
  },
  { href: '/payroll', label: 'Зарплаты', icon: Wallet, roles: MANAGEMENT_ROLES },
  { href: '/rating', label: 'Рейтинг', icon: Trophy, roles: MANAGEMENT_ROLES },
  { href: '/reports', label: 'Отчёты', icon: BarChart3, roles: MANAGEMENT_ROLES },
  {
    href: '/audit',
    label: 'Журнал действий',
    icon: ScrollText,
    // Только директор: журнал показывает и действия администратора, поэтому
    // проверяющий и проверяемый не должны совпадать.
    roles: ROLE_MANAGER_ROLES,
  },
  { href: '/settings', label: 'Настройки', icon: Settings, roles: MANAGEMENT_ROLES },
  { href: '/plans', label: 'В планах', icon: Compass, roles: MANAGEMENT_ROLES, stub: true },
];

/** Пункты меню, доступные набору ролей. */
export function visibleNavigation(userRoles: readonly RoleName[]): NavItem[] {
  return NAVIGATION.filter((item) => item.roles.some((role) => userRoles.includes(role))).map(
    (item) =>
      item.children === undefined
        ? item
        : {
            ...item,
            children: item.children.filter((child) =>
              child.roles.some((role) => userRoles.includes(role)),
            ),
          },
  );
}

/** Активен ли пункт для текущего адреса. */
export function isNavItemActive(item: Pick<NavItem, 'href' | 'exact'>, pathname: string): boolean {
  if (item.exact === true) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** Заголовок страницы по адресу — показывается в шапке. */
export function pageTitle(pathname: string): string {
  if (pathname === '/') return 'Главная панель';

  for (const item of NAVIGATION) {
    const child = item.children?.find((entry) => entry.href === pathname);
    if (child !== undefined) return `${item.label} — ${child.label}`;
    if (isNavItemActive(item, pathname)) return item.label;
  }

  return 'Design House';
}
