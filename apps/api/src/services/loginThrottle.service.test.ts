import { TRPCError } from '@trpc/server';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  AUTH_IP_REQUESTS_PER_MINUTE,
  LOGIN_BLOCK_MS,
  LOGIN_FAILURE_WINDOW_MS,
  LOGIN_MAX_FAILURES,
} from '../lib/constants';
import {
  assertLoginAllowed,
  consumeAuthRequestBudget,
  loginRetryAfterSeconds,
  registerLoginFailure,
  resetLoginAttempts,
  resetLoginThrottle,
} from './loginThrottle.service';

/**
 * Ограничитель хранит состояние в памяти модуля, поэтому каждый тест начинает
 * с чистого листа. Время передаётся аргументом, а не подменяется таймерами:
 * функции чистые относительно него, и «через 16 минут» проверяется без ожидания.
 */

const PHONE = '+998901234567';
const T0 = 1_700_000_000_000;

beforeEach(() => {
  resetLoginThrottle();
});

const failTimes = (count: number, at: number = T0): void => {
  for (let i = 0; i < count; i += 1) registerLoginFailure(PHONE, at);
};

describe('ограничение по номеру', () => {
  it('пропускает, пока попыток меньше порога', () => {
    failTimes(LOGIN_MAX_FAILURES - 1);

    expect(loginRetryAfterSeconds(PHONE, T0)).toBe(0);
    expect(() => {
      assertLoginAllowed(PHONE, T0);
    }).not.toThrow();
  });

  it('закрывает вход на пороге', () => {
    failTimes(LOGIN_MAX_FAILURES);

    expect(loginRetryAfterSeconds(PHONE, T0)).toBe(LOGIN_BLOCK_MS / 1000);
    expect(() => {
      assertLoginAllowed(PHONE, T0);
    }).toThrow(TRPCError);
  });

  it('отдаёт TOO_MANY_REQUESTS и не называет остаток попыток', () => {
    failTimes(LOGIN_MAX_FAILURES);

    try {
      assertLoginAllowed(PHONE, T0);
      expect.unreachable('вход должен был быть отбит');
    } catch (error) {
      expect(error).toBeInstanceOf(TRPCError);
      expect((error as TRPCError).code).toBe('TOO_MANY_REQUESTS');
      expect((error as TRPCError).message).not.toMatch(/\d+\s*попыт/);
    }
  });

  it('открывает вход после истечения блокировки', () => {
    failTimes(LOGIN_MAX_FAILURES);

    expect(loginRetryAfterSeconds(PHONE, T0 + LOGIN_BLOCK_MS - 1)).toBeGreaterThan(0);
    expect(loginRetryAfterSeconds(PHONE, T0 + LOGIN_BLOCK_MS)).toBe(0);
  });

  it('после блокировки счётчик начинается заново', () => {
    failTimes(LOGIN_MAX_FAILURES);
    const after = T0 + LOGIN_BLOCK_MS;

    // Одной неудачи после разблокировки не хватает, чтобы закрыть вход снова.
    registerLoginFailure(PHONE, after);
    expect(loginRetryAfterSeconds(PHONE, after)).toBe(0);
  });

  it('не считает подряд идущими неудачи из разных окон', () => {
    failTimes(LOGIN_MAX_FAILURES - 1);

    // Последняя попытка приходит уже за пределами окна — окно начинается заново.
    registerLoginFailure(PHONE, T0 + LOGIN_FAILURE_WINDOW_MS + 1);
    expect(loginRetryAfterSeconds(PHONE, T0 + LOGIN_FAILURE_WINDOW_MS + 1)).toBe(0);
  });

  it('успешный вход обнуляет счётчик', () => {
    failTimes(LOGIN_MAX_FAILURES - 1);
    resetLoginAttempts(PHONE);

    failTimes(LOGIN_MAX_FAILURES - 1);
    expect(loginRetryAfterSeconds(PHONE, T0)).toBe(0);
  });

  it('считает номера порознь', () => {
    failTimes(LOGIN_MAX_FAILURES);

    expect(loginRetryAfterSeconds('+998931000000', T0)).toBe(0);
  });

  it('одинаково закрывает номер независимо от того, есть ли такая учётная запись', () => {
    // Ограничитель не обращается к БД вовсе: он знает только строку номера.
    // Это и есть свойство, из-за которого блокировка не выдаёт существование
    // сотрудника — проверяем, что несуществующий номер ведёт себя так же.
    const unknown = '+998900000000';
    failTimes(LOGIN_MAX_FAILURES);
    for (let i = 0; i < LOGIN_MAX_FAILURES; i += 1) registerLoginFailure(unknown, T0);

    expect(loginRetryAfterSeconds(unknown, T0)).toBe(loginRetryAfterSeconds(PHONE, T0));
    expect(loginRetryAfterSeconds(unknown, T0)).toBeGreaterThan(0);
  });
});

describe('ограничение обращений по адресу', () => {
  const IP = '203.0.113.10';

  it('пропускает запросы в пределах минутного потолка', () => {
    for (let i = 0; i < AUTH_IP_REQUESTS_PER_MINUTE; i += 1) {
      expect(consumeAuthRequestBudget(IP, T0)).toBe(0);
    }
  });

  it('отбивает запрос сверх потолка', () => {
    for (let i = 0; i < AUTH_IP_REQUESTS_PER_MINUTE; i += 1) consumeAuthRequestBudget(IP, T0);

    expect(consumeAuthRequestBudget(IP, T0)).toBeGreaterThan(0);
  });

  it('открывает окно заново через минуту', () => {
    for (let i = 0; i <= AUTH_IP_REQUESTS_PER_MINUTE; i += 1) consumeAuthRequestBudget(IP, T0);

    expect(consumeAuthRequestBudget(IP, T0 + 60_000)).toBe(0);
  });

  it('считает адреса порознь', () => {
    for (let i = 0; i <= AUTH_IP_REQUESTS_PER_MINUTE; i += 1) consumeAuthRequestBudget(IP, T0);

    expect(consumeAuthRequestBudget('198.51.100.7', T0)).toBe(0);
  });

  it('не ограничивает запрос без определяемого адреса', () => {
    for (let i = 0; i <= AUTH_IP_REQUESTS_PER_MINUTE * 2; i += 1) {
      expect(consumeAuthRequestBudget(null, T0)).toBe(0);
    }
  });
});
