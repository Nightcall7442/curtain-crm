import { z } from 'zod';

import { Role, type Role as RoleName } from '../enums/role.enum';
import type { Locale, Translated } from '../i18n/locale';

/**
 * Рейтинг сотрудников — общий контракт для API, веб-панели и мобильного
 * приложения.
 *
 * Здесь лежит ВСЯ арифметика балла и весь список метрик. Ни `apps/api`, ни
 * клиенты не считают балл самостоятельно: иначе веб и мобилка неизбежно
 * разойдутся в округлении, и сотрудник увидит на телефоне 67, а в панели 68.
 *
 * Что рейтинг НЕ делает: не оценивает человека. Он ранжирует следы работы,
 * которые система действительно фиксирует, — закрытые заказы, площадь
 * пошитого, возвраты на переделку и попадание в срок. Ни оценок руководителя,
 * ни планов, ни KPI в модели данных нет, и выдумывать их мы не стали.
 */

/* -------------------------------------------------------------------------- */
/*  Период                                                                    */
/* -------------------------------------------------------------------------- */

export const RATING_SCOPES = ['week', 'month'] as const;

export type RatingScope = (typeof RATING_SCOPES)[number];

export const RatingScope = {
  WEEK: 'week',
  MONTH: 'month',
} as const satisfies Record<string, RatingScope>;

export const ratingScopeSchema = z.enum(RATING_SCOPES);

export const RATING_SCOPE_LABELS: Translated<RatingScope> = {
  ru: { week: 'Неделя', month: 'Месяц' },
  uz: { week: 'Hafta', month: 'Oy' },
};

export const RATING_SCOPE_LABELS_RU = RATING_SCOPE_LABELS.ru;

/* -------------------------------------------------------------------------- */
/*  Кто участвует                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Роли, участвующие в конкурсе.
 *
 * Совпадает по составу с `ASSIGNABLE_ROLES` плюс продавец, но смыслы разные
 * и расходиться они могут: там «кого можно поставить исполнителем этапа»,
 * здесь «чью работу система умеет измерить». Продавец исполнителем этапа не
 * назначается, а выручку по его заказам посчитать можно.
 */
export const RATED_ROLES = [
  Role.SELLER,
  Role.MASTER,
  Role.SEWER,
  Role.QC,
  Role.INSTALLER,
] as const;

export type RatedRole = (typeof RATED_ROLES)[number];

export const ratedRoleSchema = z.enum(RATED_ROLES);

export function isRatedRole(role: RoleName): role is RatedRole {
  return (RATED_ROLES as readonly RoleName[]).includes(role);
}

/**
 * Почему сотрудник вне конкурса.
 *
 * Директор, администратор и SMM остаются в общем списке — их не прячут, —
 * но балла у них нет и быть не может: заказы на них не назначаются, и
 * измеримого следа работы в базе не остаётся. Придумать администратору
 * «скорость проверки заказов» было бы легко и было бы враньём: заказчик
 * такого показателя не задавал, а рейтинг, собранный из выдуманных метрик,
 * начинает влиять на премии.
 */
export const UNRATED_ROLE_REASON: Readonly<Record<Locale, Readonly<Record<string, string>>>> = {
  ru: {
    ceo: 'Директор не участвует в конкурсе: заказы на него не назначаются',
    admin: 'Администратор не участвует в конкурсе: измеримых метрик по нему система не ведёт',
    smm: 'Функционал роли SMM не определён — измерять пока нечего',
  },
  uz: {
    ceo: "Direktor tanlovda qatnashmaydi: unga buyurtma tayinlanmaydi",
    admin: "Administrator tanlovda qatnashmaydi: tizim uning bo'yicha o'lchanadigan ko'rsatkich yuritmaydi",
    smm: "SMM rolining vazifalari hali belgilanmagan — o'lchaydigan narsa yo'q",
  },
};

export const UNRATED_ROLE_REASON_RU = UNRATED_ROLE_REASON.ru;

const UNRATED_FALLBACK: Readonly<Record<Locale, string>> = {
  ru: 'У этой роли нет измеримых показателей в системе',
  uz: "Bu rolda tizimda o'lchanadigan ko'rsatkichlar yo'q",
};

/** Пояснение, почему у сотрудника нет балла; `null` — если роль участвует. */
export function unratedReason(
  roles: readonly RoleName[],
  locale: Locale = 'ru',
): string | null {
  if (roles.some(isRatedRole)) return null;

  for (const role of roles) {
    const reason = UNRATED_ROLE_REASON[locale][role];
    if (reason !== undefined) return reason;
  }

  return UNRATED_FALLBACK[locale];
}

/* -------------------------------------------------------------------------- */
/*  Из чего складывается балл                                                 */
/* -------------------------------------------------------------------------- */

export const RATING_COMPONENTS = ['volume', 'quality', 'punctuality'] as const;

export type RatingComponent = (typeof RATING_COMPONENTS)[number];

/**
 * Веса компонентов балла.
 *
 * Объём весит больше половины намеренно: это единственная часть, на которую
 * сотрудник влияет напрямую и каждый день. Качество и срок — ограничители:
 * они не дают выиграть конкурс, закрыв много заказов кое-как и с опозданием.
 *
 * Веса подобраны, а не выведены из данных, — других в системе взять неоткуда.
 * Поэтому интерфейс показывает три компонента ОТДЕЛЬНО рядом с баллом:
 * несогласный с формулой видит исходные числа и может спорить с ней предметно.
 */
export const RATING_WEIGHTS: Readonly<Record<RatingComponent, number>> = {
  volume: 50,
  quality: 30,
  punctuality: 20,
};

export const RATING_COMPONENT_LABELS: Translated<RatingComponent> = {
  ru: { volume: 'Объём', quality: 'Качество', punctuality: 'Сроки' },
  uz: { volume: 'Hajm', quality: 'Sifat', punctuality: 'Muddatlar' },
};

export const RATING_COMPONENT_LABELS_RU = RATING_COMPONENT_LABELS.ru;

export const RATING_COMPONENT_HINTS: Translated<RatingComponent> = {
  ru: {
    volume: 'Сколько сделано за период относительно лучшего результата в этой же роли',
    quality: 'Доля заказов, которые не вернули на переделку',
    punctuality: 'Доля заказов, закрытых не позже срока',
  },
  uz: {
    volume: "Shu roldagi eng yaxshi natijaga nisbatan davr ichida qancha bajarilgani",
    quality: 'Qayta ishlashga qaytarilmagan buyurtmalar ulushi',
    punctuality: "Muddatidan kechikmay yopilgan buyurtmalar ulushi",
  },
};

export const RATING_COMPONENT_HINTS_RU = RATING_COMPONENT_HINTS.ru;

/**
 * Метрика объёма у каждой роли.
 *
 * Единицы разные и в общий балл попадают только после нормировки внутри роли:
 * сравнивать 412 м² швеи с 48 млн выручки продавца бессмысленно, а «94 против
 * 91 балла» — осмысленно.
 */
export interface RoleMetric {
  /** Что именно меряем. */
  readonly label: string;
  /** Единица измерения для интерфейса; пустая строка — единиц нет. */
  readonly unit: string;
  /** Есть ли у роли объективный след качества (возврат на переделку). */
  readonly hasQuality: boolean;
  /**
   * Учитывается ли попадание в срок.
   *
   * У продавца — нет. Срок заказа назначается на приёмке, а держит его
   * производственная цепочка; штрафовать за него продавца было бы неверно.
   */
  readonly hasPunctuality: boolean;
}

export const RATING_ROLE_METRICS: Readonly<Record<RatedRole, RoleMetric>> = {
  seller: { label: 'Выручка', unit: 'сум', hasQuality: false, hasPunctuality: false },
  master: { label: 'Замеров', unit: 'зак.', hasQuality: true, hasPunctuality: true },
  sewer: { label: 'Сшито', unit: 'м²', hasQuality: true, hasPunctuality: true },
  qc: { label: 'Проверок', unit: 'зак.', hasQuality: true, hasPunctuality: true },
  installer: { label: 'Установок', unit: 'зак.', hasQuality: true, hasPunctuality: true },
};

/* -------------------------------------------------------------------------- */
/*  Расчёт балла                                                              */
/* -------------------------------------------------------------------------- */

/** Компоненты балла в процентах; `null` — компонент неприменим или не набран. */
export interface RatingComponents {
  /** Объём относительно лучшего в роли, 0–100. */
  readonly volume: number;
  /** Доля заказов без возврата на переделку, 0–100. */
  readonly quality: number | null;
  /** Доля заказов, закрытых в срок, 0–100. */
  readonly punctuality: number | null;
}

/**
 * Балл 0–100 из компонентов.
 *
 * Недоступные компоненты не обнуляются, а ИСКЛЮЧАЮТСЯ из формулы с
 * перенормировкой весов. Разница принципиальная: у продавца качества нет
 * вовсе, и подстановка нуля опустила бы всех продавцов ниже любой швеи —
 * не потому, что они работают хуже, а потому, что система за ними меньше
 * наблюдает. То же и у новичка, чьи заказы ещё не дошли до контроля.
 */
export function ratingScore(components: RatingComponents): number {
  let weighted = 0;
  let totalWeight = 0;

  const add = (value: number | null, weight: number): void => {
    if (value === null) return;
    weighted += value * weight;
    totalWeight += weight;
  };

  add(components.volume, RATING_WEIGHTS.volume);
  add(components.quality, RATING_WEIGHTS.quality);
  add(components.punctuality, RATING_WEIGHTS.punctuality);

  if (totalWeight === 0) return 0;

  return Math.round(weighted / totalWeight);
}

/**
 * Нормировка объёма относительно лучшего результата в роли.
 *
 * Лидер роли получает 100, остальные — свою долю от него. Единственный
 * участник роли получает 100: сравнивать не с кем, и занижать его за это
 * было бы произволом.
 *
 * Ноль в знаменателе означает, что за период не закрыто ни одного заказа
 * этой роли, — тогда ноль у всех, и роль честно выглядит пустой.
 */
export function normalizeVolume(value: number, best: number): number {
  if (best <= 0) return 0;
  return Math.round(Math.min(value / best, 1) * 100);
}

/**
 * Место в таблице с учётом дележа.
 *
 * Спортивная нумерация: неразличимые строки делят место, следующее место
 * перескакивает («1, 2, 2, 4»).
 *
 * Что считать неразличимым, решает вызывающий, а не эта функция. Дележ
 * ТОЛЬКО по баллу оказался бы почти бесполезен: объём нормируется внутри
 * роли, поэтому лидер каждой роли получает ровно 100, и на реальных данных
 * первое место делили пятеро — по одному от каждой роли. Балл вместе с
 * числом закрытых заказов различает их осмысленно, а не жребием.
 */
export function assignPlaces<T>(
  rows: readonly T[],
  sameRank: (a: T, b: T) => boolean,
): (T & { readonly place: number })[] {
  let previous: T | null = null;
  let previousPlace = 0;

  return rows.map((row, index) => {
    const place = previous !== null && sameRank(previous, row) ? previousPlace : index + 1;

    previous = row;
    previousPlace = place;

    return { ...row, place };
  });
}
