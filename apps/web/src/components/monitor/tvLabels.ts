import type { Locale } from '@curtain-crm/shared';

import type { BoardUnit } from './labels';

/**
 * Подписи ТВ-табло на языке ссылки.
 *
 * Табло в цеху читают швеи и установщики, и язык выбирает руководитель при
 * создании ссылки. Статусы, группы, роли, категории и месяцы — из `shared`;
 * здесь только фразы самого экрана.
 */
export interface TvText {
  readonly unit: Readonly<Record<BoardUnit, string>>;
  readonly today: string;
  readonly week: string;
  readonly month: string;
  readonly bestOf: (month: string) => string;
  readonly byVolume: Readonly<Record<BoardUnit, string>>;
  readonly monthTotal: Readonly<Record<BoardUnit, string>>;
  readonly onShift: string;
  readonly of: (part: number, whole: number) => string;
  readonly online: string;
  readonly offline: string;
  readonly connecting: string;
  readonly updatedAgo: (seconds: number) => string;
  readonly dataFrom: (time: string) => string;
  readonly nextGroup: (group: string, seconds: number) => string;
  readonly page: (current: number, total: number) => string;
  readonly deadline: (date: string) => string;
  readonly overdue: string;
  readonly rework: string;
  readonly noWork: string;
  readonly tripSince: (time: string) => string;
  readonly breakUntil: (time: string) => string;
  readonly finishedAt: (time: string) => string;
  readonly noPhoto: string;
  readonly allBranches: string;
  readonly invalidTitle: string;
  readonly invalidHint: string;
  readonly emptyGroup: string;
  readonly planTitle: string;
  readonly noPlan: string;
  readonly workstation: (number: number) => string;
  readonly planPercent: (percent: number) => string;
}

export const TV_TEXT: Readonly<Record<Locale, TvText>> = {
  ru: {
    unit: { pieces: 'шт', orders: 'зак.' },
    today: 'сегодня',
    week: 'неделя',
    month: 'месяц',
    bestOf: (month) => `Лучшие за ${month}`,
    byVolume: { pieces: 'по сшитым штукам', orders: 'по выполненным заказам' },
    monthTotal: { pieces: 'сшито за месяц', orders: 'выполнено за месяц' },
    onShift: 'на смене',
    of: (part, whole) => `${part.toString()} из ${whole.toString()}`,
    online: 'онлайн',
    offline: 'нет связи',
    connecting: 'подключение…',
    updatedAgo: (seconds) => (seconds < 5 ? 'обновлено только что' : `обновлено ${seconds.toString()} с назад`),
    dataFrom: (time) => `данные от ${time}`,
    nextGroup: (group, seconds) => `далее «${group}» через ${seconds.toString()} с`,
    page: (current, total) => `страница ${current.toString()} из ${total.toString()}`,
    deadline: (date) => `срок ${date}`,
    overdue: 'просрочен',
    rework: 'переделка',
    noWork: 'Нет текущего заказа',
    tripSince: (time) => `На выезде с ${time}`,
    breakUntil: (time) => `Отлучка до ${time}`,
    finishedAt: (time) => `Смена закрыта в ${time}`,
    noPhoto: 'Фото не загружено',
    allBranches: 'все филиалы',
    invalidTitle: 'Ссылка недействительна',
    invalidHint: 'Попросите новую ссылку у руководителя',
    emptyGroup: 'На табло пока никого нет',
    planTitle: 'План месяца',
    noPlan: 'план не задан',
    workstation: (number) => `Машинка №${number.toString()}`,
    planPercent: (percent) => `${percent.toString()}% плана`,
  },
  uz: {
    unit: { pieces: 'dona', orders: 'buyurtma' },
    today: 'bugun',
    week: 'hafta',
    month: 'oy',
    bestOf: (month) => `${month} oyining eng yaxshilari`,
    byVolume: { pieces: 'tikilgan dona bo‘yicha', orders: 'bajarilgan buyurtmalar bo‘yicha' },
    monthTotal: { pieces: 'oy davomida tikildi', orders: 'oy davomida bajarildi' },
    onShift: 'smenada',
    of: (part, whole) => `${whole.toString()} tadan ${part.toString()}`,
    online: 'onlayn',
    offline: 'aloqa yo‘q',
    connecting: 'ulanmoqda…',
    updatedAgo: (seconds) => (seconds < 5 ? 'hozirgina yangilandi' : `${seconds.toString()} s oldin yangilandi`),
    dataFrom: (time) => `${time} holatiga`,
    nextGroup: (group, seconds) => `keyingisi «${group}» ${seconds.toString()} s dan so‘ng`,
    page: (current, total) => `${total.toString()} sahifadan ${current.toString()}-si`,
    deadline: (date) => `muddat ${date}`,
    overdue: 'muddati o‘tgan',
    rework: 'qayta ishlash',
    noWork: 'Joriy buyurtma yo‘q',
    tripSince: (time) => `${time} dan chiqishda`,
    breakUntil: (time) => `${time} gacha chiqib ketgan`,
    finishedAt: (time) => `Smena ${time} da yopildi`,
    noPhoto: 'Rasm yuklanmagan',
    allBranches: 'barcha filiallar',
    invalidTitle: 'Havola yaroqsiz',
    invalidHint: 'Rahbardan yangi havola so‘rang',
    emptyGroup: 'Tabloda hozircha hech kim yo‘q',
    planTitle: 'Oylik reja',
    noPlan: 'reja belgilanmagan',
    workstation: (number) => `${number.toString()}-mashina`,
    planPercent: (percent) => `${percent.toString()}% reja`,
  },
};
