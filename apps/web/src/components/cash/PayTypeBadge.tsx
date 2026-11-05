import {
  formatMoney,
  TERMINAL_PAY_TYPE_LABELS_RU,
  TERMINAL_PAY_TYPE_STYLE,
  TerminalPayType,
  terminalPayTypeOf,
  type TerminalChecksSummary,
} from '@curtain-crm/shared';
import { Banknote } from 'lucide-react';
import type { ReactElement } from 'react';

/**
 * Значок типа оплаты терминального чека: Click, Payme, Uzum, Humo, Uzcard
 * или наличные (просьба заказчика 05.11). Цвета общие с приложением
 * (`TERMINAL_PAY_TYPE_STYLE`): фирменный цвет и название, у наличных —
 * купюра. Логотипы не рисуем — надпись читается с первого взгляда.
 *
 * Без типа (старый чек) или тип, которого сайт не знает (ответ сервера
 * другой версии во время выката), — прочерк, а не падение страницы.
 */
export function PayTypeBadge({ type }: { readonly type: string | null | undefined }): ReactElement {
  const known = terminalPayTypeOf(type);
  if (known === null) return <span className="text-caption text-muted">—</span>;
  const style = TERMINAL_PAY_TYPE_STYLE[known];

  return (
    <span
      className="inline-flex h-5 items-center gap-1 rounded-md px-1.5 text-[11px] font-extrabold tracking-[0.02em]"
      style={{ backgroundColor: style.background, color: style.color }}
      title={TERMINAL_PAY_TYPE_LABELS_RU[known]}
    >
      {known === TerminalPayType.CASH ? (
        <>
          <Banknote aria-hidden className="h-3.5 w-3.5" />
          {TERMINAL_PAY_TYPE_LABELS_RU.cash}
        </>
      ) : (
        style.mark
      )}
    </span>
  );
}

/** Итог чеков за день или период и разбивка по типам — строкой под таблицей. */
export function TerminalSummaryLine({
  summary,
  label,
}: {
  readonly summary: TerminalChecksSummary;
  readonly label: string;
}): ReactElement | null {
  if (summary.count === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 pb-4 pt-1 text-caption text-secondary">
      <span>
        {`${label}: `}
        <strong className="tabular-nums text-primary">{formatMoney(summary.total)}</strong>
        {` · чеков: ${summary.count.toString()}`}
      </span>
      {summary.byType.map((line) => (
        <span key={line.payType ?? 'none'} className="inline-flex items-center gap-1.5">
          {line.payType === null ? <span className="text-muted">Без типа</span> : <PayTypeBadge type={line.payType} />}
          <span className="tabular-nums">
            {formatMoney(line.amount)}
            <span className="text-muted">{` × ${line.count.toString()}`}</span>
          </span>
        </span>
      ))}
    </div>
  );
}
