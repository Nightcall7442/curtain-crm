import type { AuditAction } from './constants';

/**
 * Русские подписи действий журнала — для ленты в Telegram-группе.
 *
 * Словарь полный: `Record<AuditAction, string>` не даст добавить действие и
 * забыть подпись — сборка упадёт. Лента читается людьми в группе, и строка
 * «order.status_changed» там никому ничего не говорит.
 *
 * У веб-панели свой словарь: она не зависит от `apps/api` по значениям и
 * переводит коды, пришедшие с сервера. Дублирование намеренное — иначе
 * панели пришлось бы тянуть серверный модуль ради подписей.
 */
export const AUDIT_ACTION_LABELS: Readonly<Record<AuditAction, string>> = {
  'user.created': 'Сотрудник создан',
  'user.updated': 'Сотрудник изменён',
  'user.deactivated': 'Сотрудник отключён',
  'user.activated': 'Сотрудник включён',
  'user.password_reset': 'Пароль сброшен',
  'user.impersonated': 'Вход под сотрудником',
  'user.avatar_changed': 'Фото сотрудника изменено',
  'user.sewer_category_set': 'Категория швеи изменена',
  'user.role_granted': 'Роль выдана',
  'user.role_revoked': 'Роль снята',
  'user.branches_changed': 'Филиалы изменены',

  'branch.created': 'Филиал создан',
  'branch.updated': 'Филиал изменён',

  'shift.adjusted': 'Смена скорректирована',
  'shift.deleted': 'Смена удалена',

  'order.created': 'Заказ создан',
  'order.updated': 'Заказ изменён',
  'order.status_changed': 'Статус заказа изменён',
  'order.cancelled': 'Заказ отменён',
  'order.assignee_changed': 'Исполнитель изменён',
  'order.price_changed': 'Цена заказа изменена',
  'order.stage_fees_changed': 'Расценки по этапам изменены',
  'order.item_meters_changed': 'Метраж позиции изменён',
  'order.cornice_taken': 'Карниз взят в работу',
  'order.cornice_done': 'Карниз повешен',

  'fabric_stock.received': 'Приход ткани',
  'fabric_stock.counted': 'Ткань пересчитана',
  'fabric_stock.written_off': 'Ткань списана на заказ',

  'ready_made_item.created': 'Готовая штора заведена',
  'ready_made_item.updated': 'Готовая штора изменена',
  'ready_made_item.stock_changed': 'Остаток готовых штор изменён',
  'ready_made_item.activated': 'Готовая штора возвращена в продажу',
  'ready_made_item.deactivated': 'Готовая штора снята с продажи',
  'ready_made_item.sold': 'Готовая штора продана',

  'retail_item.created': 'Товар витрины создан',
  'retail_item.updated': 'Товар витрины изменён',
  'retail_item.stock_changed': 'Остаток на витрине изменён',
  'retail_item.activated': 'Товар возвращён на витрину',
  'retail_item.deactivated': 'Товар снят с витрины',
  'retail_sale.created': 'Чек пробит',

  'task.created': 'Поручение выдано',
  'task.completed': 'Поручение выполнено',
  'task.cancelled': 'Поручение отменено',

  'dayoff.requested': 'Отгул запрошен',
  'dayoff.approved': 'Отгул одобрен',
  'dayoff.rejected': 'Отгул отклонён',
  'dayoff.cancelled': 'Отгул отменён',
  'dayoff.assigned': 'Выходной назначен',
  'dayoff.withdrawn': 'Выходной снят',
  'dayoff.weekly_set': 'Выходной по графику изменён',

  'discipline.recorded': 'Дисциплина: запись',
  'discipline.explained': 'Дисциплина: объяснение',
  'discipline.removed': 'Дисциплина: запись удалена',

  'event.created': 'Мероприятие добавлено',
  'event.removed': 'Мероприятие убрано',

  'terminal_check.created': 'Терминальный чек пробит',

  'purchase_item.created': 'Товар закупки создан',
  'purchase_item.price_changed': 'Цена товара изменена',
  'purchase_item.deactivated': 'Товар отключён',
  'purchase_item.activated': 'Товар включён',

  'payroll.scheme_changed': 'Схема оплаты изменена',
  'payroll.calculated': 'Зарплата рассчитана',
  'payroll.approved': 'Расчёт утверждён',
  'payroll.paid': 'Зарплата выплачена',
  'payroll.paid_part': 'Выплачена часть зарплаты',

  'payment.received': 'Принята оплата',
  'payment.collected': 'Наличные сданы в кассу',
  'payment.refunded': 'Возврат клиенту',

  'catalog.item_created': 'Позиция справочника создана',
  'catalog.item_updated': 'Позиция справочника изменена',
  'catalog.item_deactivated': 'Позиция справочника отключена',
  'catalog.items_imported': 'Коды загружены файлом',
};
