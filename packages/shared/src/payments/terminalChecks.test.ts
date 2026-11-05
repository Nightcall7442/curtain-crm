import { describe, expect, it } from 'vitest';

import {
  TERMINAL_PAY_TYPE_LABELS,
  TERMINAL_PAY_TYPES,
  terminalPayTypeOf,
  terminalPayTypeSchema,
} from '../enums/payment.enum';
import { parseMoney } from '../utils/money';
import { summarizeTerminalChecks } from './terminalChecks';

describe('типы оплаты терминального чека', () => {
  it('ровно те, что назвал заказчик', () => {
    expect(TERMINAL_PAY_TYPES).toEqual(['click', 'payme', 'uzum', 'humo', 'uzcard', 'cash']);
    expect(TERMINAL_PAY_TYPE_LABELS.ru.cash).toBe('Наличные');
    expect(TERMINAL_PAY_TYPE_LABELS.uz.cash).toBe('Naqd');
    expect(TERMINAL_PAY_TYPE_LABELS.ru.humo).toBe('Humo');
    expect(terminalPayTypeSchema.safeParse('visa').success).toBe(false);
  });

  it('незнакомый тип (с сервера новее приложения) и пустое значение — «без типа»', () => {
    expect(terminalPayTypeOf('uzum')).toBe('uzum');
    expect(terminalPayTypeOf('paynet')).toBeNull();
    expect(terminalPayTypeOf(undefined)).toBeNull();
    expect(terminalPayTypeOf(null)).toBeNull();
  });
});

describe('summarizeTerminalChecks', () => {
  it('итог дня и разбивка по типам — в порядке типов, пустые не показываются', () => {
    const summary = summarizeTerminalChecks([
      { amount: '1900000.00', payType: 'payme' },
      { amount: '500000.00', payType: 'click' },
      { amount: '300000.00', payType: 'payme' },
      { amount: '250000.00', payType: 'cash' },
    ]);
    expect(summary.total).toBe(parseMoney('2950000'));
    expect(summary.count).toBe(4);
    expect(summary.byType).toEqual([
      { payType: 'click', count: 1, amount: parseMoney('500000') },
      { payType: 'payme', count: 2, amount: parseMoney('2200000') },
      { payType: 'cash', count: 1, amount: parseMoney('250000') },
    ]);
  });

  it('старые чеки без типа — отдельной строкой в конце', () => {
    const summary = summarizeTerminalChecks([
      { amount: '100000.00', payType: null },
      { amount: '200000.00', payType: 'uzcard' },
    ]);
    expect(summary.byType).toEqual([
      { payType: 'uzcard', count: 1, amount: parseMoney('200000') },
      { payType: null, count: 1, amount: parseMoney('100000') },
    ]);
  });

  it('незнакомый тип и отсутствующее поле — в строку «без типа»: строки сходятся с итогом', () => {
    const summary = summarizeTerminalChecks([
      { amount: '100000.00', payType: 'paynet' },
      { amount: '50000.00' },
      { amount: '200000.00', payType: 'humo' },
    ]);
    expect(summary.total).toBe(parseMoney('350000'));
    expect(summary.byType).toEqual([
      { payType: 'humo', count: 1, amount: parseMoney('200000') },
      { payType: null, count: 2, amount: parseMoney('150000') },
    ]);
  });

  it('пустой день — ноль и пустая разбивка', () => {
    expect(summarizeTerminalChecks([])).toEqual({ total: 0, count: 0, byType: [] });
  });
});
