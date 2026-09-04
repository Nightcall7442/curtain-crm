import type { NotificationType } from '@curtain-crm/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactElement } from 'react';

import { colors } from '../theme';

/**
 * Иконки приложения.
 *
 * До этого иконки рисовались ЭМОДЗИ (📈 📷 👤 🕘) и текстовыми символами
 * (⌂ ▤ ♪ ☺ ›). Это была ошибка, и объяснялась она неверным доводом —
 * «иконочный шрифт добавит мегабайты в бандл». `@expo/vector-icons` уже
 * является зависимостью самого `expo`, то есть скачан в любом случае, а
 * Metro кладёт в бандл шрифт только того семейства, которое действительно
 * импортировано. Экономии не было ни байта.
 *
 * Чем эмодзи плохи как иконки: их рисует операционная система своим
 * цветным шрифтом, поэтому они не подчиняются палитре, не наследуют цвет
 * текста, по-разному выглядят на iOS, Android и в вебе и не выравниваются
 * по базовой линии рядом с подписью. Экран из таких значков читается как
 * черновик независимо от того, насколько аккуратно собрано всё остальное.
 *
 * Здесь один набор — Ionicons. Смешивать семейства нельзя: у каждого своя
 * толщина линии и своя оптическая сетка, и в одном списке это видно сразу.
 *
 * Экраны называют иконку по РОЛИ (`shift`, `orders`, `quality`), а не по
 * имени глифа в библиотеке. Смена набора тогда сводится к правке этой
 * таблицы, а не к поиску тридцати строк по всему приложению.
 */

export type IconName =
  /* Навигация */
  | 'home'
  | 'work'
  | 'checkin'
  | 'notifications'
  | 'profile'
  | 'chevron'
  | 'back'
  | 'forward'
  | 'call'
  /* Сущности и разделы */
  | 'shift'
  | 'orders'
  | 'order'
  | 'deadline'
  | 'rating'
  | 'roles'
  | 'payroll'
  | 'photo'
  | 'camera'
  | 'comment'
  | 'voice'
  | 'people'
  | 'branch'
  | 'person'
  | 'jobTitle'
  | 'calendar'
  | 'badge'
  | 'window'
  | 'priority'
  | 'logout'
  | 'remove'
  | 'eye'
  | 'eyeOff'
  /* Состояния и события уведомлений */
  | 'assigned'
  | 'statusChanged'
  | 'rolledBack'
  | 'escalated'
  | 'qcFailed'
  | 'cancelled'
  | 'completed'
  | 'paid'
  | 'roleChanged'
  | 'dayOffRequested'
  | 'dayOffApproved'
  | 'dayOffRejected';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const GLYPHS: Readonly<Record<IconName, IoniconName>> = {
  home: 'home',
  work: 'briefcase',
  checkin: 'finger-print',
  notifications: 'notifications',
  profile: 'person',
  chevron: 'chevron-forward',
  back: 'chevron-back',
  forward: 'arrow-forward',
  call: 'call',

  shift: 'time',
  orders: 'clipboard',
  order: 'document-text',
  deadline: 'alarm',
  rating: 'trophy',
  roles: 'ribbon',
  payroll: 'wallet',
  photo: 'images',
  camera: 'camera',
  comment: 'chatbubble-ellipses',
  voice: 'mic',
  people: 'people',
  branch: 'business',
  person: 'person-circle',
  jobTitle: 'briefcase',
  calendar: 'calendar',
  badge: 'card',
  window: 'grid',
  priority: 'flash',
  logout: 'log-out',
  remove: 'trash-outline',
  eye: 'eye-outline',
  eyeOff: 'eye-off-outline',

  assigned: 'add-circle',
  statusChanged: 'swap-horizontal',
  rolledBack: 'arrow-undo',
  escalated: 'alert-circle',
  qcFailed: 'close-circle',
  cancelled: 'ban',
  completed: 'checkmark-circle',
  paid: 'cash',
  roleChanged: 'person-add',
  dayOffRequested: 'sunny-outline',
  dayOffApproved: 'checkmark-circle',
  dayOffRejected: 'close-circle',
};

export function Icon({
  name,
  size = 18,
  color = colors.textSecondary,
}: {
  readonly name: IconName;
  readonly size?: number;
  readonly color?: string;
}): ReactElement {
  // Иконка декоративна: смысл несёт подпись рядом, и озвучивать её
  // повторно программе чтения с экрана незачем.
  return <Ionicons name={GLYPHS[name]} size={size} color={color} accessible={false} />;
}

/**
 * Иконка по типу уведомления.
 *
 * Живёт в клиенте, а не в `@curtain-crm/shared`: тон события — доменное
 * знание и общее для панели и телефона, а имя глифа — деталь конкретного
 * иконочного набора. Веб-панель рисует иконки из lucide, и общий словарь
 * заставлял бы её тянуть чужие имена.
 *
 * Значок дублирует тон, поэтому события одного тона всё равно различимы:
 * брак и откат оба красные, но иконки у них разные.
 */
export const NOTIFICATION_ICONS: Readonly<Record<NotificationType, IconName>> = {
  order_assigned: 'assigned',
  order_status_changed: 'statusChanged',
  order_rolled_back: 'rolledBack',
  order_rejected_to_ceo: 'escalated',
  order_qc_failed: 'qcFailed',
  order_cancelled: 'cancelled',
  order_completed: 'completed',
  order_comment_added: 'comment',
  shift_adjusted: 'shift',
  payroll_approved: 'payroll',
  payroll_paid: 'paid',
  task_assigned: 'work',
  task_completed: 'completed',
  task_cancelled: 'cancelled',
  role_changed: 'roleChanged',
  day_off_requested: 'dayOffRequested',
  day_off_approved: 'dayOffApproved',
  day_off_rejected: 'dayOffRejected',
};
