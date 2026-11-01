import { parseMoney, PayrollRecordStatus, PayrollSchemeType } from '@curtain-crm/shared';
import { TRPCError } from '@trpc/server';
import { describe, expect, it } from 'vitest';

import {
  calculateCommission,
  calculateFixed,
  calculateHourly,
  calculateKpi,
  calculatePayroll,
  calculatePerOrder,
  calculatePieceRate,
  payableRoles,
  reopensPaidRecord,
  withStageFees,
  type PayrollInputs,
  type PayrollSchemeParams,
} from './payroll.service';
import { formatPeriod, periodBounds } from './shifts.service';

/**
 * Расчётные функции — чистые, без обращений к БД, поэтому тестируются напрямую.
 * Сбор исходных данных (часы, заказы) вынесен в отдельные функции и здесь
 * не проверяется.
 */

const HOUR = 3600;

const NO_INPUTS: PayrollInputs = {
  workedHours: 0,
  shiftSeconds: [],
  completedOrders: 0,
  completedOrdersAmount: 0,
  stageFeesAmount: 0,
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
  const rate = parseMoney('11111.11');

  it('складывает смены, каждая — целыми сумами (пример заказчика)', () => {
    const result = calculateHourly(
      scheme({ type: PayrollSchemeType.HOURLY, rate }),
      inputs({ shiftSeconds: [9 * HOUR, 8.5 * HOUR, 7 * HOUR, 13 * HOUR] }),
    );

    // 100 000 + 94 444 + 77 778 + 144 444
    expect(result.amount).toBe(parseMoney('416666'));
    expect(result.breakdown[0]?.label).toBe('Смены: 4, часов 37.50');
  });

  it('целая ставка: одна длинная смена — как раньше', () => {
    const result = calculateHourly(
      scheme({ type: PayrollSchemeType.HOURLY, rate: parseMoney('35000') }),
      inputs({ shiftSeconds: [160 * HOUR] }),
    );

    expect(result.amount).toBe(parseMoney('5600000'));
  });

  it('не начисляет ничего без смен', () => {
    const result = calculateHourly(scheme({ type: PayrollSchemeType.HOURLY, rate }), NO_INPUTS);
    expect(result.amount).toBe(0);
  });

  it('считает битые отрицательные секунды нулём, а не отрицательной зарплатой', () => {
    const result = calculateHourly(
      scheme({ type: PayrollSchemeType.HOURLY, rate }),
      inputs({ shiftSeconds: [-10 * HOUR, 9 * HOUR] }),
    );
    expect(result.amount).toBe(parseMoney('100000'));
  });

  it('падает, если ставка не задана', () => {
    expect(() =>
      calculateHourly(scheme({ type: PayrollSchemeType.HOURLY }), inputs({ shiftSeconds: [HOUR] })),
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

describe('calculatePieceRate', () => {
  const pieceScheme = scheme({ type: PayrollSchemeType.PIECE_RATE });

  it('сам по себе не начисляет ничего', () => {
    expect(calculatePieceRate().amount).toBe(0);
  });

  /*
   * Ради этого тип и заведён: у сдельщика в ведомости должны стоять расценки
   * заказов и ничего больше. Считаем через диспетчер, потому что расценки
   * добавляет он.
   */
  it('приносит ровно расценки за этапы', () => {
    const result = calculatePayroll(
      pieceScheme,
      inputs({ stageFeesAmount: parseMoney('1250000') }),
    );

    expect(result.amount).toBe(parseMoney('1250000'));
    expect(result.breakdown).toHaveLength(1);
  });

  it('без заполненных полей схемы не падает', () => {
    expect(() => calculatePayroll(pieceScheme, NO_INPUTS)).not.toThrow();
  });
});

describe('withStageFees', () => {
  const base = calculateFixed(scheme({ baseAmount: parseMoney('5000000') }));

  it('добавляет сдельные к начислению по схеме', () => {
    const result = withStageFees(base, inputs({ stageFeesAmount: parseMoney('700000') }));

    expect(result.amount).toBe(parseMoney('5700000'));
  });

  /*
   * Ради этого строка и отдельная: у схемы `commission` сотрудник получит и
   * процент от заказа, и расценку за свой этап того же заказа. Владелец так
   * решил, но в ведомости это обязано быть различимо.
   */
  it('показывает сдельные отдельной строкой, не сливая их с начислением схемы', () => {
    const result = withStageFees(base, inputs({ stageFeesAmount: parseMoney('700000') }));

    expect(result.breakdown).toHaveLength(2);
    expect(result.breakdown[0]?.amount).toBe(parseMoney('5000000'));
    expect(result.breakdown[1]?.amount).toBe(parseMoney('700000'));
  });

  it('при нуле не засоряет расшифровку пустой строкой', () => {
    const result = withStageFees(base, NO_INPUTS);

    expect(result).toBe(base);
    expect(result.breakdown).toHaveLength(1);
  });

  it('не трогает процент выполнения KPI', () => {
    const kpi = calculateKpi(
      scheme({
        type: PayrollSchemeType.KPI,
        baseAmount: parseMoney('1000000'),
        rate: parseMoney('500000'),
        kpiTarget: 10,
      }),
      inputs({ completedOrders: 5 }),
    );

    expect(withStageFees(kpi, inputs({ stageFeesAmount: parseMoney('100000') })).kpiPercent).toBe(
      50,
    );
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
        inputs({ shiftSeconds: [2 * HOUR] }),
      ).amount,
    ).toBe(parseMoney('2000'));

    expect(
      calculatePayroll(
        scheme({ type: PayrollSchemeType.PER_ORDER, rate: parseMoney('50000') }),
        inputs({ completedOrders: 2 }),
      ).amount,
    ).toBe(parseMoney('100000'));
  });

  it('прибавляет сдельные к результату любой схемы', () => {
    const result = calculatePayroll(
      scheme({ type: PayrollSchemeType.HOURLY, rate: parseMoney('30000') }),
      inputs({ shiftSeconds: [10 * HOUR], stageFeesAmount: parseMoney('250000') }),
    );

    expect(result.amount).toBe(parseMoney('550000'));
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

describe('reopensPaidRecord', () => {
  const inputs = { workedHours: 168.4, completedOrders: 0, completedOrdersAmount: '0.00', stageFeesAmount: '0.00' };
  const paid = { status: PayrollRecordStatus.PAID, paidAmount: '2093500.00', inputs };

  it('новая работа и сумма выросла — переоткрывается', () => {
    expect(
      reopensPaidRecord(paid, { amount: parseMoney('2200000'), inputs: { ...inputs, workedHours: 177.4 } }),
    ).toBe(true);
  });

  it('работа та же, сумма выросла только от правила расчёта — выплаченный месяц не трогаем', () => {
    expect(reopensPaidRecord(paid, { amount: parseMoney('2093517'), inputs })).toBe(false);
  });

  it('старый снимок без сдельных — это ноль, а не «изменилось»', () => {
    const old = { ...paid, inputs: { workedHours: 168.4, completedOrders: 0, completedOrdersAmount: '0.00' } };
    expect(reopensPaidRecord(old, { amount: parseMoney('2093517'), inputs })).toBe(false);
  });

  it('не выплачена — вопрос не к ней', () => {
    expect(
      reopensPaidRecord({ ...paid, status: PayrollRecordStatus.APPROVED }, { amount: parseMoney('1'), inputs }),
    ).toBe(false);
  });
});
