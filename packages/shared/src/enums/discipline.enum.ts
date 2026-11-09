import { z } from 'zod';

import type { Translated } from '../i18n/locale';

/**
 * Дисциплина: события с баллами.
 *
 * Система ответственности из презентации владельца «Design House — Employee
 * Discipline & Performance System»: менеджер фиксирует ФАКТ, факт получает
 * БАЛЛ по таблице, сумма баллов за месяц ведёт к ДЕЙСТВИЮ. Правила одни
 * для всех — поэтому категории и баллы лежат здесь, а не в форме: менеджер
 * выбирает категорию, а не пишет цифру «по настроению».
 *
 * Плюсы тоже считаются: хорошая работа — признание, а не только минусы.
 */
export const DISCIPLINE_KINDS = [
  /* Нарушения */
  'late_under_15',
  'late_15_30',
  'late_over_30',
  'absence',
  'no_show_no_notice',
  'client_rudeness',
  'client_complaint',
  'measure_error',
  'order_failure',
  /* Поощрения */
  'plan_done',
  'positive_review',
  'helped_team',
] as const;

export type DisciplineKind = (typeof DISCIPLINE_KINDS)[number];

export const DisciplineKind = {
  LATE_UNDER_15: 'late_under_15',
  LATE_15_30: 'late_15_30',
  LATE_OVER_30: 'late_over_30',
  ABSENCE: 'absence',
  NO_SHOW_NO_NOTICE: 'no_show_no_notice',
  CLIENT_RUDENESS: 'client_rudeness',
  CLIENT_COMPLAINT: 'client_complaint',
  MEASURE_ERROR: 'measure_error',
  ORDER_FAILURE: 'order_failure',
  PLAN_DONE: 'plan_done',
  POSITIVE_REVIEW: 'positive_review',
  HELPED_TEAM: 'helped_team',
} as const satisfies Record<string, DisciplineKind>;

export const disciplineKindSchema = z.enum(DISCIPLINE_KINDS);

export const DISCIPLINE_KIND_LABELS: Translated<DisciplineKind> = {
  ru: {
    late_under_15: 'Опоздание до 15 мин',
    late_15_30: 'Опоздание 15–30 мин',
    late_over_30: 'Опоздание больше 30 мин',
    absence: 'Прогул',
    no_show_no_notice: 'Не вышел и не предупредил',
    client_rudeness: 'Грубость клиенту / серьёзное нарушение',
    client_complaint: 'Жалоба клиента',
    measure_error: 'Ошибка замера',
    order_failure: 'Срыв заказа',
    plan_done: 'Выполнил план',
    positive_review: 'Положительный отзыв',
    helped_team: 'Помог команде',
  },
  uz: {
    late_under_15: '15 daqiqagacha kechikish',
    late_15_30: '15–30 daqiqa kechikish',
    late_over_30: "30 daqiqadan ko'p kechikish",
    absence: 'Ishga chiqmaslik',
    no_show_no_notice: 'Chiqmadi va ogohlantirmadi',
    client_rudeness: "Mijozga qo'pollik / jiddiy qoidabuzarlik",
    client_complaint: 'Mijoz shikoyati',
    measure_error: "O'lchov xatosi",
    order_failure: 'Buyurtmani buzish',
    plan_done: 'Rejani bajardi',
    positive_review: 'Ijobiy fikr',
    helped_team: 'Jamoaga yordam berdi',
  },
};

export const DISCIPLINE_KIND_LABELS_RU = DISCIPLINE_KIND_LABELS.ru;

/**
 * Коды причин в журнале, когда запись дисциплины правит или снимает сама
 * система (`reason` в `discipline.adjusted` / `discipline.removed`).
 *
 * Обычно `reason` в журнале — слова человека. Здесь — код, по которому
 * сервер отличает правку правилом от решения руководителя (прощение руками
 * — `forgivenByHand`), а журнал на сайте переводит его в слова. Один список
 * на сервер и сайт: опечатка в коде на одной стороне молча ломала бы
 * и разбор, и подпись.
 *  - `late_request_review` — пересчёт после решения по запросу на опоздание;
 *  - `manual_discipline_change` — повторы месяца пересчитаны после того, как
 *    руководитель руками добавил или убрал опоздание.
 */
export const DISCIPLINE_AUDIT_REASONS = ['late_request_review', 'manual_discipline_change'] as const;

export type DisciplineAuditReason = (typeof DISCIPLINE_AUDIT_REASONS)[number];

export const DisciplineAuditReason = {
  LATE_REQUEST_REVIEW: 'late_request_review',
  MANUAL_DISCIPLINE_CHANGE: 'manual_discipline_change',
} as const satisfies Record<string, DisciplineAuditReason>;

/**
 * Уровень реакции по штрафным баллам за месяц.
 *
 * Не наказание, а ступень: сначала просто фиксируем, потом разговор, потом
 * письменно и план исправления, дальше — решение руководства. Автоматически
 * ни одна ступень ничего не делает — она подсказывает менеджеру, какой
 * разговор пора провести.
 */
export const DISCIPLINE_LEVELS = ['control', 'verbal', 'written', 'management'] as const;

export type DisciplineLevel = (typeof DISCIPLINE_LEVELS)[number];

export const DisciplineLevel = {
  CONTROL: 'control',
  VERBAL: 'verbal',
  WRITTEN: 'written',
  MANAGEMENT: 'management',
} as const satisfies Record<string, DisciplineLevel>;

export const DISCIPLINE_LEVEL_LABELS: Translated<DisciplineLevel> = {
  ru: {
    control: 'Обычный контроль',
    verbal: 'Устное предупреждение',
    written: 'Письменное предупреждение',
    management: 'Решение руководства',
  },
  uz: {
    control: 'Oddiy nazorat',
    verbal: "Og'zaki ogohlantirish",
    written: 'Yozma ogohlantirish',
    management: 'Rahbariyat qarori',
  },
};

export const DISCIPLINE_LEVEL_LABELS_RU = DISCIPLINE_LEVEL_LABELS.ru;

export const MAX_DISCIPLINE_DESCRIPTION_LENGTH = 500;
export const MAX_DISCIPLINE_COMMENT_LENGTH = 500;
