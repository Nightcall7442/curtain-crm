import {
  MANAGEMENT_ROLES,
  Role,
  ROLE_MANAGER_ROLES,
  type Role as RoleName,
} from '@curtain-crm/shared';
import {
  Archive,
  BarChart3,
  Banknote,
  ClipboardList,
  Factory,
  GraduationCap,
  LayoutGrid,
  Package,
  ScrollText,
  Scissors,
  Settings,
  ShieldCheck,
  Trophy,
  TrendingUp,
  UserSquare,
  Users,
  Wallet,
  Wrench,
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

export const NAVIGATION: readonly NavItem[] = [
  { href: '/', label: 'Главная', icon: LayoutGrid, roles: ALL_ROLES, exact: true },
  { href: '/orders', label: 'Заказы', icon: ClipboardList, roles: ALL_ROLES },
  {
    href: '/production',
    label: 'Производство',
    icon: Factory,
    roles: [Role.CEO, Role.ADMIN, Role.MASTER, Role.SEWER],
  },
  {
    href: '/sewing',
    label: 'Швейный цех',
    icon: Scissors,
    roles: [Role.CEO, Role.ADMIN, Role.SEWER],
  },
  {
    href: '/installation',
    label: 'Установка',
    icon: Wrench,
    roles: [Role.CEO, Role.ADMIN, Role.INSTALLER],
  },
  {
    href: '/quality',
    label: 'Качество',
    icon: ShieldCheck,
    roles: [Role.CEO, Role.ADMIN, Role.QC],
  },
  {
    href: '/employees',
    label: 'Рабочие',
    icon: Users,
    roles: MANAGEMENT_ROLES,
    children: [
      { href: '/employees', label: 'Сотрудники', roles: MANAGEMENT_ROLES },
      { href: '/employees/department', label: 'Ведомость', roles: MANAGEMENT_ROLES },
      { href: '/employees/timesheet', label: 'Табель', roles: MANAGEMENT_ROLES },
    ],
  },
  { href: '/payroll', label: 'Зарплаты', icon: Wallet, roles: MANAGEMENT_ROLES },
  { href: '/clients', label: 'Клиенты', icon: UserSquare, roles: MANAGEMENT_ROLES, stub: true },
  { href: '/sales', label: 'Продажи', icon: TrendingUp, roles: MANAGEMENT_ROLES, stub: true },
  { href: '/warehouse', label: 'Склад тканей', icon: Package, roles: MANAGEMENT_ROLES, stub: true },
  {
    href: '/training',
    label: 'Обучение',
    icon: GraduationCap,
    roles: MANAGEMENT_ROLES,
    stub: true,
  },
  { href: '/rating', label: 'Рейтинг', icon: Trophy, roles: MANAGEMENT_ROLES },
  { href: '/reports', label: 'Отчёты', icon: BarChart3, roles: MANAGEMENT_ROLES },
  { href: '/finance', label: 'Финансы', icon: Banknote, roles: MANAGEMENT_ROLES },
  { href: '/archive', label: 'Архив', icon: Archive, roles: ALL_ROLES },
  {
    href: '/audit',
    label: 'Журнал действий',
    icon: ScrollText,
    // Только директор: журнал показывает и действия администратора, поэтому
    // проверяющий и проверяемый не должны совпадать.
    roles: ROLE_MANAGER_ROLES,
  },
  { href: '/settings', label: 'Настройки', icon: Settings, roles: MANAGEMENT_ROLES },
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
