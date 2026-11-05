import { TERMINAL_PAY_TYPES, terminalPayTypeOf, type TerminalPayType } from '../enums/payment.enum';
import { parseMoney, sumMoney, type MoneyMinor } from '../utils/money';

/**
 * Сумма терминальных чеков за день — то, что заказчик хочет видеть под
 * «День» (05.11): итог и разбивка по типам оплаты.
 *
 * Разбивка — в порядке типов (Click, Payme, …, наличные), пустые не
 * показываются. Старые чеки, пробитые до вопроса «какой тип оплаты?»,
 * идут отдельной строкой «без типа» в конце.
 */
export interface TerminalChecksSummary {
  readonly total: MoneyMinor;
  readonly count: number;
  readonly byType: readonly {
    readonly payType: TerminalPayType | null;
    readonly count: number;
    readonly amount: MoneyMinor;
  }[];
}

export function summarizeTerminalChecks(
  rows: readonly { readonly amount: string; readonly payType?: string | null }[],
): TerminalChecksSummary {
  // Незнакомый тип и отсутствующее поле — в «без типа»: так строки
  // разбивки всегда сходятся с итогом.
  const typed = rows.map((row) => ({ payType: terminalPayTypeOf(row.payType), amount: parseMoney(row.amount) }));
  const byType = [...TERMINAL_PAY_TYPES, null].flatMap((payType) => {
    const own = typed.filter((row) => row.payType === payType);
    return own.length === 0
      ? []
      : [{ payType, count: own.length, amount: sumMoney(own.map((row) => row.amount)) }];
  });

  return {
    total: sumMoney(typed.map((row) => row.amount)),
    count: rows.length,
    byType,
  };
}
