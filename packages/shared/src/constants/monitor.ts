import type { MonitorGroup, PlanRole } from '../enums/monitor.enum';
import { Role } from '../enums/role.enum';
import type { Translated } from '../i18n/locale';

/**
 * Опрос табло. 20 секунд — достаточно, чтобы статус «ушёл на выезд»
 * появился раньше, чем человек дойдёт до машины, и при этом пара открытых
 * экранов не нагружает сервер, который считает снимок 6–8 запросами.
 */
export const MONITOR_POLL_MS = 20_000;

/** Без успешного ответа дольше этого табло пишет «нет связи», данные остаются. */
export const MONITOR_STALE_AFTER_MS = 60_000;

/** ТВ со ссылкой на оба табло показывает их по очереди. */
export const TV_ROTATE_MS = 30_000;

/** Если люди не помещаются на экран ТВ, страницы листаются сами. */
export const TV_PAGE_MS = 15_000;

/**
 * Полная перезагрузка страницы ТВ: телевизор в цехе работает неделями,
 * и без неё он показывал бы старую версию панели до первого выключения.
 */
export const TV_RELOAD_MS = 6 * 60 * 60 * 1000;

/** Сколько заказов очереди показывает карточка; остальные — «+N». */
export const MONITOR_QUEUE_PREVIEW = 3;

/** Мест на пьедестале. */
export const MONITOR_PODIUM_SIZE = 5;

/** В чём меряется выработка: у швей — штуки, как в рейтинге; у выездных — заказы. */
export const MONITOR_UNIT: Readonly<Record<MonitorGroup, 'pieces' | 'orders'>> = {
  workshop: 'pieces',
  installation: 'orders',
};

/** Длинная сторона превью фото сотрудника для табло, px. */
export const AVATAR_PREVIEW_MAX_PX = 640;

/** В чём меряется план роли — в тех же единицах, что и выработка на табло. */
export const PLAN_UNIT: Readonly<Record<PlanRole, 'pieces' | 'orders'>> = {
  [Role.SEWER]: 'pieces',
  [Role.INSTALLER]: 'orders',
  [Role.CORNICE_INSTALLER]: 'orders',
};

/** Верхняя граница плана месяца: защищает от лишнего нуля при вводе. */
export const PLAN_TARGET_MAX = 100_000;

/** Номер швейной машинки за швеёй. */
export const WORKSTATION_MIN = 1;
export const WORKSTATION_MAX = 99;

/**
 * Сколько минут после назначенного времени установка ещё считается «впереди».
 * Пробки и поиск подъезда — обычное дело; красить установку раньше значит
 * приучить руководителя не смотреть на красный.
 */
export const INSTALLATION_LATE_GRACE_MINUTES = 30;

export const MONITOR_SORTS = ['place', 'plan', 'name', 'workstation'] as const;

export type MonitorSort = (typeof MONITOR_SORTS)[number];

export const MONITOR_SORT_LABELS: Translated<MonitorSort> = {
  ru: { place: 'По месту', plan: 'По плану', name: 'По имени', workstation: 'По машинке' },
  uz: { place: 'O‘rin bo‘yicha', plan: 'Reja bo‘yicha', name: 'Ism bo‘yicha', workstation: 'Mashina bo‘yicha' },
};
