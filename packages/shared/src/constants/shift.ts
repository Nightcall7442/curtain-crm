import type { Translated } from '../i18n/locale';

/**
 * Забытая смена.
 *
 * Сотрудник открыл смену и не отметил уход — такие смены висели открытыми
 * днями, и «на смене сейчас» в разных местах считалось по-разному: главная
 * говорила «4 человека», список показывал девятерых, явка — двоих. Владелец
 * увидел все три цифры разом.
 *
 * Правило одно для всех экранов: открытая смена старше этого срока —
 * забытая. В «сейчас на смене» она не входит, а сервер закрывает её сам
 * (`SHIFT_AUTO_CLOSE_AFTER_HOURS` после начала) с пометкой, чтобы
 * руководство поправило время в табеле, если человек работал дольше.
 */
export const SHIFT_FORGOTTEN_AFTER_HOURS = 16;

/** Во сколько часов от начала закрывается забытая смена. */
export const SHIFT_AUTO_CLOSE_AFTER_HOURS = 12;

export const SHIFT_AUTO_CLOSE_REASON = 'Закрыта автоматически: сотрудник не отметил уход';

/**
 * Чем занят человек на смене — по заказу, который сейчас на нём.
 *
 * Владелец хочет видеть в явке не «работает», а «шьёт DH-0012» и «на
 * установке DH-0013»: имя и время прихода без дела — половина ответа.
 * Дело выводится из заказов: у кого заказ «в пошиве» — тот шьёт, у кого
 * «установка идёт» или открыт выезд — тот на объекте. Ничего не назначено —
 * человек просто в цеху.
 */
export const SHIFT_ACTIVITIES = ['sewing', 'installation', 'measurement', 'qc'] as const;
export type ShiftActivity = (typeof SHIFT_ACTIVITIES)[number];

export const SHIFT_ACTIVITY_LABELS: Translated<ShiftActivity> = {
  ru: {
    sewing: 'шьёт',
    installation: 'на установке',
    measurement: 'на замере',
    qc: 'проверяет',
  },
  uz: {
    sewing: 'tikmoqda',
    installation: "o'rnatishda",
    measurement: "o'lchovda",
    qc: 'tekshirmoqda',
  },
};
