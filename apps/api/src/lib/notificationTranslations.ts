import type { Locale } from '@curtain-crm/shared';

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
  'Запрос на выходные': "Dam olish so'rovi",
  'Выходные одобрены': 'Dam olish kunlari tasdiqlandi',
  'Вам назначен выходной': 'Sizga dam olish kuni tayinlandi',
  'Постоянный выходной снят': 'Doimiy dam olish kuni olib tashlandi',
  'Вам назначен выходной по графику': "Sizga jadval bo'yicha dam olish kuni tayinlandi",
  'Выходные отклонены': 'Dam olish kunlari rad etildi',
};

const PATTERNS: readonly (readonly [ru: string, uz: string])[] = [
  ['Новый заказ {n}', 'Yangi buyurtma {n}'],
  ['Вам назначен заказ клиента «{client}» как «{role}»', "Sizga «{client}» mijozining buyurtmasi «{role}» sifatida tayinlandi"],
  ['Заказ {n} ждёт исполнителя', '{n} buyurtmasi ijrochini kutmoqda'],
  ['Клиент «{client}», этап «{stage}». Исполнитель ещё не назначен.', "Mijoz «{client}», bosqich «{stage}». Ijrochi hali tayinlanmagan."],
  ['Заказ {n}: {status}', 'Buyurtma {n}: {status}'],
  ['{actor} перевёл заказ в статус «{status}». Причина: {reason}', "{actor} buyurtmani «{status}» holatiga o'tkazdi. Sabab: {reason}"],
  ['{actor} перевёл заказ в статус «{status}».', "{actor} buyurtmani «{status}» holatiga o'tkazdi."],
  ['Комментарий к заказу {n}', '{n} buyurtmasiga izoh'],
  ['Смена {date} скорректирована', '{date} smenasi tuzatildi'],
  ['{actor} изменил время смены. Причина: {reason}', "{actor} smena vaqtini o'zgartirdi. Sabab: {reason}"],
  ['Зарплата за {period} выплачена', "{period} uchun ish haqi to'landi"],
  ['Расчёт за {period} утверждён', '{period} uchun hisob tasdiqlandi'],
  ['Сумма: {amount}. Подтвердите, что деньги получили.', 'Summa: {amount}. Pulni olganingizni tasdiqlang.'],
  ['Сумма: {amount}', 'Summa: {amount}'],
  ['{actor} назначил вам роль «{role}»', '{actor} sizga «{role}» rolini tayinladi'],
  ['{actor} отозвал роль «{role}»', '{actor} «{role}» rolini olib tashladi'],
  ['{creator}: «{title}» — срок до {date}', '{creator}: «{title}» — muddat {date} gacha'],
  ['Ответ по поручению «{title}»', "«{title}» topshirig'i bo'yicha javob"],
  ['{requester} просит выходные: {period}', "{requester} dam olish so'ramoqda: {period}"],
  ['{reviewer} одобрил ваш запрос на {period}', "{reviewer} {period} uchun so'rovingizni tasdiqladi"],
  ['{by}: выходные теперь только по запросу', "{by}: dam olish kunlari endi faqat so'rov bo'yicha"],
  ['{by}: каждую неделю — {weekday}', '{by}: har hafta — {weekday}'],
];

const translate = compileTranslator({ exact: EXACT, patterns: PATTERNS } satisfies TranslationTable);

/** Заголовок или тело уведомления на языке клиента; русский — как есть. */
export function translateNotificationText(text: string, locale: Locale): string {
  return translate(text, locale);
}

/** Для теста покрытия: все известные русские тексты. */
export const KNOWN_NOTIFICATION_TEXTS = {
  exact: Object.keys(EXACT),
  patterns: PATTERNS.map(([ru]) => ru),
} as const;
