import { parseMoney, PayrollSchemeType } from '@curtain-crm/shared';
import { TRPCError } from '@trpc/server';
import { describe, expect, it } from 'vitest';

import {
  calculateCommission,
  calculateFixed,
  calculateHourly,
  calculateKpi,
  calculatePayroll,
  calculatePerOrder,
  payableRoles,
  type PayrollInputs,
  type PayrollSchemeParams,
} from './payroll.service';
import { formatPeriod, periodBounds } from './shifts.service';

/**
 * Расчётные функции — чистые, без обращений к БД, поэтому тестируются напрямую.
 * Сбор исходных данных (часы, заказы) вынесен в отдельные функции и здесь
 * не проверяется.
 */

const NO_INPUTS: PayrollInputs = {
  workedHours: 0,
  completedOrders: 0,
  completedOrdersAmount: 0,
};

const inputs = (partial: Partial<PayrollInputs>): PayrollInputs => ({ ...NO_INPUTS, ...partial });

const scheme = (partial: Partial<PayrollSchemeParams>): PayrollSchemeParams => ({
  type: PayrollSchemeType.FIXED,
  baseAmount: null,
  rate: null,
  kpiTarget: null,
  commissionPercent: null,
  ...partial,
});

describe('calculateFixed', () => {
  it('начисляет оклад целиком, независимо от часов и заказов', () => {
    const result = calculateFixed(scheme({ baseAmount: parseMoney('6000000') }));

    expect(result.amount).toBe(parseMoney('6000000'));
    expect(result.kpiPercent).toBeNull();
    expect(result.breakdown).toHaveLength(1);
  });

  it('падает с понятной ошибкой, если оклад не задан', () => {
    expect(() => calculateFixed(scheme({ type: PayrollSchemeType.FIXED }))).toThrow(TRPCError);
  });
});

describe('calculateHourly', () => {
  it('умножает ставку на отработанные часы', () => {
    const result = calculateHourly(
      scheme({ type: PayrollSchemeType.HOURLY, rate: parseMoney('35000') }),
      inputs({ workedHours: 160 }),
    );

    expect(result.amount).toBe(parseMoney('5600000'));
  });

  it('корректно считает дробные часы с округлением до копеек', () => {
    const result = calculateHourly(
      scheme({ type: PayrollSchemeType.HOURLY, rate: parseMoney('35000') }),
      inputs({ workedHours: 7.33 }),
    );

    // 35000 × 7.33 = 256 550
    expect(result.amount).toBe(parseMoney('256550'));
  });

  it('не начисляет ничего при нуле часов', () => {
    const result = calculateHourly(
      scheme({ type: PayrollSchemeType.HOURLY, rate: parseMoney('35000') }),
      NO_INPUTS,
    );
    expect(result.amount).toBe(0);
  });

  it('считает битые отрицательные часы нулём, а не отрицательной зарплатой', () => {
    const result = calculateHourly(
      scheme({ type: PayrollSchemeType.HOURLY, rate: parseMoney('35000') }),
      inputs({ workedHours: -10 }),
    );
    expect(result.amount).toBe(0);
  });

  it('падает, если ставка не задана', () => {
    expect(() =>
      calculateHourly(scheme({ type: PayrollSchemeType.HOURLY }), inputs({ workedHours: 10 })),
    ).toThrow(TRPCError);
  });
});

describe('calculateKpi', () => {
  const kpiScheme = scheme({
    type: PayrollSchemeType.KPI,
    baseAmount: parseMoney('6000000'),
    rate: parseMoney('2000000'),
    kpiTarget: 30,
  });

  it('при выполнении плана начисляет оклад и премию целиком', () => {
    const result = calculateKpi(kpiScheme, inputs({ completedOrders: 30 }));

    expect(result.amount).toBe(parseMoney('8000000'));
    expect(result.kpiPercent).toBe(100);
  });

  it('премия линейна: половина плана — половина премии', () => {
    const result = calculateKpi(kpiScheme, inputs({ completedOrders: 15 }));

    expect(result.amount).toBe(parseMoney('7000000'));
    expect(result.kpiPercent).toBe(50);
  });

  it('при нулевом выполнении остаётся только оклад', () => {
    const result = calculateKpi(kpiScheme, NO_INPUTS);

    expect(result.amount).toBe(parseMoney('6000000'));
    expect(result.kpiPercent).toBe(0);
  });

  it('перевыполнение не увеличивает премию, но видно в проценте', () => {
    const result = calculateKpi(kpiScheme, inputs({ completedOrders: 45 }));

    expect(result.amount).toBe(parseMoney('8000000'));
    expect(result.kpiPercent).toBe(150);
  });

  it('расшифровка содержит и оклад, и премию', () => {
    const result = calculateKpi(kpiScheme, inputs({ completedOrders: 15 }));

    expect(result.breakdown).toHaveLength(2);
    expect(result.breakdown[0]?.amount).toBe(parseMoney('6000000'));
    expect(result.breakdown[1]?.amount).toBe(parseMoney('1000000'));
  });

  it('отвергает нулевой и отрицательный план вместо деления на ноль', () => {
    expect(() => calculateKpi({ ...kpiScheme, kpiTarget: 0 }, NO_INPUTS)).toThrow(TRPCError);
    expect(() => calculateKpi({ ...kpiScheme, kpiTarget: -5 }, NO_INPUTS)).toThrow(TRPCError);
  });

  it.each(['baseAmount', 'rate', 'kpiTarget'] as const)('падает без поля %s', (field) => {
    expect(() => calculateKpi({ ...kpiScheme, [field]: null }, NO_INPUTS)).toThrow(TRPCError);
  });
});

describe('calculateCommission', () => {
  const commissionScheme = scheme({
    type: PayrollSchemeType.COMMISSION,
    commissionPercent: 5,
  });

  it('начисляет процент от суммы закрытых заказов', () => {
    const result = calculateCommission(
      commissionScheme,
      inputs({ completedOrders: 4, completedOrdersAmount: parseMoney('20000000') }),
    );

    expect(result.amount).toBe(parseMoney('1000000'));
  });

  it('без закрытых заказов начисления нет', () => {
    expect(calculateCommission(commissionScheme, NO_INPUTS).amount).toBe(0);
  });

  it('дробный процент округляется до копеек, а не накапливает ошибку', () => {
    const result = calculateCommission(
      { ...commissionScheme, commissionPercent: 3.333 },
      inputs({ completedOrdersAmount: parseMoney('1000000') }),
    );

    // 1 000 000 × 3.333 % = 33 330
    expect(result.amount).toBe(parseMoney('33330'));
  });

  it('падает, если процент не задан', () => {
    expect(() =>
      calculateCommission(scheme({ type: PayrollSchemeType.COMMISSION }), NO_INPUTS),
    ).toThrow(TRPCError);
  });
});

describe('calculatePerOrder', () => {
  const perOrderScheme = scheme({
    type: PayrollSchemeType.PER_ORDER,
    rate: parseMoney('50000'),
  });

  it('платит ставку за каждый закрытый заказ', () => {
    const result = calculatePerOrder(perOrderScheme, inputs({ completedOrders: 7 }));

    expect(result.amount).toBe(parseMoney('350000'));
  });

  /*
   * Главное отличие от `commission` и причина, по которой тип вообще
   * появился: владелец не хотел, чтобы продавец боролся за крупный заказ
   * вместо того, чтобы вести каждый. Проверяем именно это — сумма заказов
   * на начисление не влияет.
   */
  it('не зависит от суммы заказов', () => {
    const cheap = calculatePerOrder(
      perOrderScheme,
      inputs({ completedOrders: 3, completedOrdersAmount: parseMoney('900000') }),
    );
    const expensive = calculatePerOrder(
      perOrderScheme,
      inputs({ completedOrders: 3, completedOrdersAmount: parseMoney('90000000') }),
    );

    expect(cheap.amount).toBe(expensive.amount);
  });

  it('без закрытых заказов начисления нет', () => {
    expect(calculatePerOrder(perOrderScheme, NO_INPUTS).amount).toBe(0);
  });

  it('падает, если ставка не задана', () => {
    expect(() =>
      calculatePerOrder(scheme({ type: PayrollSchemeType.PER_ORDER }), NO_INPUTS),
    ).toThrow(TRPCError);
  });
});

describe('calculatePayroll', () => {
  it('направляет расчёт в функцию, соответствующую типу схемы', () => {
    expect(calculatePayroll(scheme({ baseAmount: parseMoney('100') }), NO_INPUTS).amount).toBe(
      parseMoney('100'),
    );

    expect(
      calculatePayroll(
        scheme({ type: PayrollSchemeType.HOURLY, rate: parseMoney('1000') }),
        inputs({ workedHours: 2 }),
      ).amount,
    ).toBe(parseMoney('2000'));

    expect(
      calculatePayroll(
        scheme({ type: PayrollSchemeType.PER_ORDER, rate: parseMoney('50000') }),
        inputs({ completedOrders: 2 }),
      ).amount,
    ).toBe(parseMoney('100000'));
  });
});

describe('periodBounds', () => {
  it('строит полуинтервал месяца в UTC', () => {
    const bounds = periodBounds({ year: 2026, month: 2 });

    expect(bounds.start.toISOString()).toBe('2026-02-01T00:00:00.000Z');
    expect(bounds.end.toISOString()).toBe('2026-03-01T00:00:00.000Z');
  });

  it('корректно переходит через границу года', () => {
    const bounds = periodBounds({ year: 2026, month: 12 });

    expect(bounds.start.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(bounds.end.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('форматирует период для интерфейса', () => {
    expect(formatPeriod({ year: 2026, month: 3 })).toBe('03.2026');
  });
});

describe('payableRoles', () => {
  it('исключает SMM: функционал роли ещё не определён', () => {
    expect(payableRoles(['sewer', 'smm', 'qc'])).toEqual(['sewer', 'qc']);
  });
});
