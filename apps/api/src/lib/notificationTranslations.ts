import {
  CURRENCY_SYMBOL,
  formatIsoDateShort,
  NotificationType,
  type Locale,
  type NotificationType as NotificationTypeName,
} from '@curtain-crm/shared';

import { compileTranslator, type TranslationTable } from './sourceTranslation';

/**
 * Перевод уведомлений для клиента на узбекском.
 *
 * Уведомление пишется в базу по-русски в момент события — язык получателя
 * сервер не знает, он живёт на телефоне. Поэтому переводится не запись, а
 * её показ: `notifications.list` прогоняет заголовок и тело через эту
 * таблицу по языку запроса. Заодно переводятся и старые уведомления, и
 * ничего не меняется в схеме.
 *
 * Тексты с именами и номерами описаны шаблонами; подписи справочников
 * внутри них (статус, роль, месяц, день недели) переводит
 * `sourceTranslation.ts`. Тела вида `{автор}: {текст}` без русских слов в
 * таблице не нужны — им перевод не требуется.
 */

const EXACT: Readonly<Record<string, string>> = {
  'Вам выдана новая роль': 'Sizga yangi rol berildi',
  'Роль отозвана': 'Rol olib tashlandi',
  'Новое поручение': 'Yangi topshiriq',
  'Доп. работа выполнена': "Qo'shimcha ish bajarildi",
  'Доп. работа отменена': "Qo'shimcha ish bekor qilindi",
  'Доп. работа ждёт подтверждения': "Qo'shimcha ish tasdiqni kutmoqda",
  'Доп. работа принята': "Qo'shimcha ish qabul qilindi",
  'Доп. работа возвращена': "Qo'shimcha ish qaytarildi",
  'Запрос на выходные': "Dam olish so'rovi",
  'Выходные одобрены': 'Dam olish kunlari tasdiqlandi',
  'Вам назначен выходной': 'Sizga dam olish kuni tayinlandi',
  'Постоянный выходной снят': 'Doimiy dam olish kuni olib tashlandi',
  'Вам назначен выходной по графику': "Sizga jadval bo'yicha dam olish kuni tayinlandi",
  'Выходные отклонены': 'Dam olish kunlari rad etildi',
  'Запрос на опоздание': "Kechikish so'rovi",
  'Опоздание согласовано': 'Kechikish tasdiqlandi',
  'В опоздании отказано': 'Kechikish rad etildi',
  'Время инкассации': 'Inkassatsiya vaqti',
  'Терминальный чек пробит': 'Terminal cheki urildi',
  'Пробейте терминальный чек': 'Terminal chekini uring',
  'Изменён состав заказа — проверьте позиции': "Buyurtma tarkibi o'zgardi — pozitsiyalarni tekshiring",
  'Изменены данные заказа': "Buyurtma ma'lumotlari o'zgardi",
  'Зафиксировано нарушение': 'Qoidabuzarlik qayd etildi',
  'Зафиксировано поощрение': "Rag'batlantirish qayd etildi",
  'Смена закрыта автоматически — вы не отметили уход': "Smena avtomatik yopildi — siz ketishni belgilamadingiz",
};

const PATTERNS: readonly (readonly [ru: string, uz: string])[] = [
  ['Новый заказ {n}', 'Yangi buyurtma {n}'],
  ['Установка {n}: {date} в {time}', "O'rnatish {n}: {date}, soat {time}"],
  ['Заказ {n} изменён', "{n} buyurtmasi o'zgartirildi"],
  ['Клиент «{client}». Адрес: {address}', 'Mijoz «{client}». Manzil: {address}'],
  ['Клиент «{client}».', 'Mijoz «{client}».'],
  ['Вам назначен заказ клиента «{client}» как «{role}»', "Sizga «{client}» mijozining buyurtmasi «{role}» sifatida tayinlandi"],
  ['Заказ {n} ждёт исполнителя', '{n} buyurtmasi ijrochini kutmoqda'],
  ['Клиент «{client}», этап «{stage}». Исполнитель ещё не назначен.', "Mijoz «{client}», bosqich «{stage}». Ijrochi hali tayinlanmagan."],
  ['Заказ {n}: {status}', 'Buyurtma {n}: {status}'],
  // Причины, которые пишет сама система, — раньше общего шаблона: иначе
  // узбекский текст кончался бы русской фразой.
  [
    'Статус заказа изменён на «{status}» ({actor}). Причина: Оплата получена полностью — заказ закрыт автоматически',
    "Buyurtma «{status}» holatiga o'tkazildi ({actor}). Sabab: to'lov to'liq olindi — buyurtma avtomatik yopildi",
  ],
  [
    'Статус заказа изменён на «{status}» ({actor}). Причина: Загружено фото после установки — заказ закрыт автоматически',
    "Buyurtma «{status}» holatiga o'tkazildi ({actor}). Sabab: o'rnatishdan keyingi surat yuklandi — buyurtma avtomatik yopildi",
  ],
  ['Статус заказа изменён на «{status}» ({actor}). Причина: {reason}', "Buyurtma «{status}» holatiga o'tkazildi ({actor}). Sabab: {reason}"],
  ['Статус заказа изменён на «{status}» ({actor}).', "Buyurtma «{status}» holatiga o'tkazildi ({actor})."],
  ['Комментарий к заказу {n}', '{n} buyurtmasiga izoh'],
  ['Смена {date} скорректирована', '{date} smenasi tuzatildi'],
  ['На руках {sum} — сдайте в кассу', "Qo'lda {sum} — kassaga topshiring"],
  ['Время смены изменено ({actor}). Причина: {reason}', "Smena vaqti o'zgartirildi ({actor}). Sabab: {reason}"],
  ['Зарплата за {period} выплачена', "{period} uchun ish haqi to'landi"],
  ['Расчёт за {period} утверждён', '{period} uchun hisob tasdiqlandi'],
  ['Сумма: {amount}. Подтвердите, что деньги получили.', 'Summa: {amount}. Pulni olganingizni tasdiqlang.'],
  ['Сумма: {amount}', 'Summa: {amount}'],
  ['Вам назначена роль «{role}» ({actor})', 'Sizga «{role}» roli tayinlandi ({actor})'],
  ['Роль «{role}» отозвана ({actor})', '«{role}» roli olib tashlandi ({actor})'],
  ['{creator}: «{title}» — срок до {date}', '{creator}: «{title}» — muddat {date} gacha'],
  ['Ответ по поручению «{title}»', "«{title}» topshirig'i bo'yicha javob"],
  ['{requester} просит выходные: {period}', "{requester} dam olish so'ramoqda: {period}"],
  ['Запрос на {period} одобрен ({reviewer})', "{period} uchun so'rovingiz tasdiqlandi ({reviewer})"],
  ['{requester} просит опоздать {date} — придёт к {time}', "{requester} {date} kuni kechikishni so'ramoqda — soat {time} gacha keladi"],
  ['Можно прийти {date} к {time} ({reviewer})', '{date} kuni soat {time} gacha kelishingiz mumkin ({reviewer})'],
  [
    'Опоздание {date} до {time} не согласовано. Причина: {reason}',
    '{date} kuni soat {time} gacha kechikish rad etildi. Sabab: {reason}',
  ],
  ['{by}: выходные теперь только по запросу', "{by}: dam olish kunlari endi faqat so'rov bo'yicha"],
  ['{by}: каждую неделю — {weekday}', '{by}: har hafta — {weekday}'],
  ['{kind} ({points}) за {date} — {by}', '{kind} ({points}) {date} uchun — {by}'],
  ['{by}: сегодня {n} из {target} — цель выполнена', '{by}: bugun {target} dan {n} — maqsad bajarildi'],
  ['{by}: сегодня {n} из {target}, осталось {left}', '{by}: bugun {target} dan {n}, {left} ta qoldi'],
  ['Сегодня {n} из {target} — осталось {left}', 'Bugun {target} dan {n} — {left} ta qoldi'],
];

const translate = compileTranslator({ exact: EXACT, patterns: PATTERNS } satisfies TranslationTable);

/**
 * Заголовок или тело уведомления на языке клиента; русский — как есть.
 *
 * Суммы в уведомление попадают уже отформатированными («1 925 000 сум»), и
 * подстановка переносит их как есть — вместе с русским словом. Валюту
 * дописываем на язык читателя отдельно: ради одного слова держать вторую
 * форму текста не стоит.
 */
export function translateNotificationText(text: string, locale: Locale): string {
  const translated = translate(text, locale);
  // `\b` после кириллицы не работает — границу слова проверяем сами.
  return locale === 'uz' ? translated.replace(/сум(?!\p{L})/gu, CURRENCY_SYMBOL.uz) : translated;
}

/* -------------------------------------------------------------------------- */
/*  Записи, сохранённые в старой формулировке                                 */
/* -------------------------------------------------------------------------- */

const ISO_DAY = String.raw`\d{4}-\d{2}-\d{2}`;
/** «2026-11-18» или «2026-11-18 — 2026-11-19» — период выходных в старом виде. */
const ISO_PERIOD = `(${ISO_DAY}(?: — ${ISO_DAY})?)`;

const shortDates = (text: string): string =>
  text.replace(new RegExp(ISO_DAY, 'g'), (day) => formatIsoDateShort(day));

/** Автоматическое закрытие смены — как его записывал `reminders.service` раньше. */
const LEGACY_AUTO_CLOSED =
  'Система изменил время смены. Причина: Закрыта автоматически: сотрудник не отметил уход';
const AUTO_CLOSED = 'Смена закрыта автоматически — вы не отметили уход';

/** Уведомления о смене статуса заказа — в старом виде «{актор} перевёл заказ…». */
const ORDER_STATUS_TYPES: readonly NotificationTypeName[] = [
  NotificationType.ORDER_STATUS_CHANGED,
  NotificationType.ORDER_ROLLED_BACK,
  NotificationType.ORDER_REJECTED_TO_CEO,
  NotificationType.ORDER_QC_FAILED,
  NotificationType.ORDER_CANCELLED,
  NotificationType.ORDER_COMPLETED,
];

/**
 * Старая формулировка → нынешняя, по типу уведомления.
 *
 * Шаблоны повторяют прежние тексты `notifications.service.ts` дословно, но
 * первая группа в них — «что угодно»: под «… перевёл заказ в статус «…».»
 * подошёл бы и комментарий, написанный человеком. Поэтому каждый шаблон
 * привязан к типам, которые этот текст и писали: комментарий, ответ по
 * поручению или чужое поручение под старый шаблон не попадут.
 */
const LEGACY_BODIES: readonly (readonly [
  readonly NotificationTypeName[],
  RegExp,
  (...parts: string[]) => string,
])[] = [
  [
    [NotificationType.SHIFT_ADJUSTED],
    /^([\s\S]+?) изменил время смены\. Причина: ([\s\S]+)$/,
    (actor, reason) => `Время смены изменено (${actor}). Причина: ${reason}`,
  ],
  [
    ORDER_STATUS_TYPES,
    /^([\s\S]+?) перевёл заказ в статус «([\s\S]+?)»\.([\s\S]*)$/,
    (actor, status, tail) => `Статус заказа изменён на «${status}» (${actor}).${tail}`,
  ],
  [
    [NotificationType.ROLE_CHANGED],
    /^([\s\S]+?) назначил вам роль «([\s\S]+)»$/,
    (actor, role) => `Вам назначена роль «${role}» (${actor})`,
  ],
  [
    [NotificationType.ROLE_CHANGED],
    /^([\s\S]+?) отозвал роль «([\s\S]+)»$/,
    (actor, role) => `Роль «${role}» отозвана (${actor})`,
  ],
  [
    [NotificationType.DAY_OFF_REQUESTED],
    new RegExp(`^([\\s\\S]+?) просит выходные: ${ISO_PERIOD}$`),
    (requester, period) => `${requester} просит выходные: ${shortDates(period)}`,
  ],
  [
    [NotificationType.DAY_OFF_APPROVED],
    new RegExp(`^([\\s\\S]+?) одобрил ваш запрос на ${ISO_PERIOD}$`),
    (reviewer, period) => `Запрос на ${shortDates(period)} одобрен (${reviewer})`,
  ],
  [
    [NotificationType.TASK_ASSIGNED],
    new RegExp(`^([\\s\\S]+?: «[\\s\\S]+» — срок до )(${ISO_DAY})$`),
    (head, day) => `${head}${formatIsoDateShort(day)}`,
  ],
];

/**
 * Тела, где старая запись отличается только датами, — по типу уведомления.
 *
 * «Назначен выходной» (`{автор}: {период}`) и «отклонены» (`{период} —
 * {причина}`) без типа не отличить от комментария, который начинается с
 * даты. Тип отсекает чужое: у этих уведомлений дата — всегда период.
 */
const LEGACY_PERIOD_BODIES: Partial<Record<NotificationTypeName, RegExp>> = {
  [NotificationType.DAY_OFF_APPROVED]: new RegExp(`^([\\s\\S]+?: )${ISO_PERIOD}$`),
  [NotificationType.DAY_OFF_REJECTED]: new RegExp(`^()${ISO_PERIOD}(?= — )`),
};

/**
 * Сохранённое уведомление — в нынешней формулировке.
 *
 * Текст пишется в базу в момент события, и правка формулировки в
 * `notifications.service.ts` не меняет уже лежащие строки: в ленте
 * оставались «Система изменил время смены», «Нигора Азизова перевёл заказ»
 * и «Смена 2026-10-25 скорректирована». Миграция данных ради текста —
 * лишняя операция на проде; переписать при показе дешевле, и переводу на
 * узбекский достаётся уже нынешний текст — старые шаблоны таблице не нужны.
 */
export function modernizeStoredNotification(
  type: NotificationTypeName,
  title: string,
  body: string,
): { readonly title: string; readonly body: string } {
  // Заголовок и автозакрытие писались только уведомлением о смене.
  const isShift = type === NotificationType.SHIFT_ADJUSTED;
  const titleMatch = isShift ? new RegExp(`^Смена (${ISO_DAY}) скорректирована$`).exec(title) : null;
  const modernTitle =
    titleMatch?.[1] === undefined ? title : `Смена ${formatIsoDateShort(titleMatch[1])} скорректирована`;

  if (isShift && body === LEGACY_AUTO_CLOSED) return { title: modernTitle, body: AUTO_CLOSED };

  for (const [types, rx, rewrite] of LEGACY_BODIES) {
    if (!types.includes(type)) continue;
    const match = rx.exec(body);
    if (match !== null) return { title: modernTitle, body: rewrite(...match.slice(1).map((part) => part ?? '')) };
  }

  const periodRx = LEGACY_PERIOD_BODIES[type];
  const periodBody = periodRx === undefined ? body : body.replace(periodRx, (_, head: string, period: string) => `${head}${shortDates(period)}`);

  return { title: modernTitle, body: periodBody };
}

/** Для теста покрытия: все известные русские тексты. */
export const KNOWN_NOTIFICATION_TEXTS = {
  exact: Object.keys(EXACT),
  patterns: PATTERNS.map(([ru]) => ru),
} as const;
