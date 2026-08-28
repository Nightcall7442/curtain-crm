import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '@curtain-crm/db';
import { normalizePhone } from '@curtain-crm/shared';
import { z } from 'zod';

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants';

/**
 * Переиспользуемые Zod-схемы.
 *
 * Вынесены отдельно, чтобы валидация телефона, пагинации и координат была
 * одинаковой во всех роутерах: двенадцать копий регулярного выражения для
 * телефона рано или поздно разъедутся.
 */

/** Идентификатор записи в БД. */
export const idSchema = z.number().int().positive();

/**
 * Телефон. Принимает любой человеческий ввод и приводит к E.164.
 *
 * Схема именно трансформирующая: процедура получает уже нормализованный
 * номер, и ни одна из них не может случайно записать в БД «+998 90 123 45 67».
 */
export const phoneSchema = z
  .string()
  .trim()
  .min(1, 'Укажите номер телефона')
  .transform((value, ctx) => {
    const normalized = normalizePhone(value);
    if (normalized === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Некорректный номер. Формат: +998 90 123 45 67',
      });
      return z.NEVER;
    }
    return normalized;
  });

export const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Пароль должен быть не короче ${MIN_PASSWORD_LENGTH.toString()} символов`)
  .max(MAX_PASSWORD_LENGTH, `Пароль должен быть не длиннее ${MAX_PASSWORD_LENGTH.toString()} символов`);

/** Непустая строка после обрезки пробелов. */
export const nonEmptyString = (max: number, message = 'Поле обязательно для заполнения') =>
  z.string().trim().min(1, message).max(max);

/** Необязательный текст: пустая строка приводится к `null`. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length === 0 ? null : value))
    .nullable()
    .optional();

/** Причина действия — обязательный комментарий для откатов, отмен, корректировок. */
export const reasonSchema = z
  .string()
  .trim()
  .min(3, 'Опишите причину подробнее — минимум 3 символа')
  .max(1000);

/** Пагинация, единая для всех списочных процедур. */
export const paginationSchema = z.object({
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

/** Географическая точка, присылаемая мобильным приложением. */
export const geoPointSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

/** Расчётный период — календарный месяц. */
export const periodSchema = z.object({
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
});

/** Денежная сумма в основных единицах, приходящая из формы. */
export const moneySchema = z
  .number()
  .nonnegative('Сумма не может быть отрицательной')
  .max(999_999_999_999, 'Сумма слишком велика');

/**
 * Файл, переданный в теле tRPC-запроса.
 *
 * tRPC работает поверх JSON, поэтому бинарные данные приходят в base64.
 * Ограничение размера проверяется отдельно в процедуре — здесь только формат,
 * потому что предельный размер зависит от типа файла (фото / аудио).
 */
export const base64FileSchema = z.object({
  fileName: z.string().trim().max(255).optional(),
  mimeType: z.string().trim().min(1).max(100),
  /** Содержимое в base64 без префикса `data:`. */
  content: z.string().min(1),
});

export type Base64File = z.infer<typeof base64FileSchema>;
