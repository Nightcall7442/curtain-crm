'use client';

import {
  availableTransitions,
  OrderType,
  primaryOrderAction,
  transitionLabel,
  TransitionKind,
  type Locale,
  type OrderStatus,
  type OrderType as OrderTypeName,
  type Role,
} from '@curtain-crm/shared';
import { ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState, type ReactElement } from 'react';

import { Button } from '@/components/ui/Form';
import { cn } from '@/lib/utils';

import type { OrderAction } from './OrderActionDialog';

/**
 * Действия по заказу прямо в строке списка.
 *
 * Смысл всей затеи: раньше любое, даже самое очевидное движение заказа стоило
 * четырёх переходов — список, карточка, прокрутка к «Действиям», возврат
 * назад. У приёмки, которая за день раскидывает три десятка заказов, на это
 * уходило больше времени, чем на саму работу.
 *
 * Действия считаются ЗДЕСЬ, на клиенте, и не стоят ни одного запроса:
 * `availableTransitions` — чистая функция из общего пакета, статус строки уже
 * пришёл со списком, а роли известны из сессии. Именно поэтому кнопку можно
 * позволить себе в каждой из двадцати строк страницы.
 *
 * Права это НЕ проверяет: нарисованная кнопка ничего не разрешает. Каждый
 * переход сервер проверяет заново — по той же таблице, по ролям и по тому,
 * чей это этап. Здесь решается только то, что показать.
 */

/**
 * Действия строки по порядку: сначала главное, затем всё остальное.
 *
 * Один и тот же порядок использует и разметка, и горячие клавиши — цифра N
 * запускает N-е действие ЭТОГО списка. Считать порядок дважды нельзя: две
 * копии разойдутся, и «2» начнёт отменять заказ вместо отправки в пошив.
 */
export function orderRowActions(
  status: OrderStatus,
  roles: readonly Role[],
  locale: Locale = 'ru',
  /**
   * Тип заказа. Часть переходов существует только у готовых штор, и без
   * него список действий строки разошёлся бы с тем, что разрешает сервер.
   */
  orderType: OrderTypeName = OrderType.CUSTOM,
): readonly OrderAction[] {
  const all = availableTransitions(status, roles, orderType);
  const primary = primaryOrderAction(status, roles, locale, orderType);

  const ordered =
    primary === null
      ? all
      : [primary.transition, ...all.filter((entry) => entry.to !== primary.transition.to)];

  return ordered.map((transition) => ({
    toStatus: transition.to,
    label: transitionLabel(transition, locale),
    kind: transition.kind,
    requiresComment: transition.kind !== TransitionKind.FORWARD,
  }));
}

export function OrderRowActions({
  status,
  roles,
  locale,
  orderType = OrderType.CUSTOM,
  onPick,
}: {
  readonly status: OrderStatus;
  readonly roles: readonly Role[];
  readonly locale: Locale;
  readonly orderType?: OrderTypeName;
  readonly onPick: (action: OrderAction) => void;
}): ReactElement | null {
  const [menuOpen, setMenuOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const primary = primaryOrderAction(status, roles, locale, orderType);
  const actions = orderRowActions(status, roles, locale, orderType);

  /*
    Меню закрывается по нажатию мимо и по Escape.

    Слушатели вешаются только когда меню открыто: два десятка строк, каждая
    со своим постоянным слушателем на документе, — это двадцать вызовов на
    каждый клик по странице.
  */
  useEffect(() => {
    if (!menuOpen) return undefined;

    const onPointerDown = (event: PointerEvent): void => {
      if (event.target instanceof Node && containerRef.current?.contains(event.target) === true) {
        return;
      }
      setMenuOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setMenuOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  if (actions.length === 0) return null;

  // Если главное действие вынесено кнопкой, в меню остаётся всё прочее.
  // Если нет — в меню попадает всё, включая прямые переходы.
  const menuActions = actions.filter((action) => action.toStatus !== primary?.transition.to);
  const primaryAction = actions[0];

  return (
    <div ref={containerRef} className="relative flex items-center justify-end gap-1">
      {primary !== null && primaryAction !== undefined && (
        <Button
          size="sm"
          onClick={() => {
            onPick(primaryAction);
          }}
          title={transitionLabel(primary.transition, locale)}
        >
          {primary.shortLabel}
        </Button>
      )}

      {menuActions.length > 0 && (
        <>
          <Button
            size="sm"
            variant="secondary"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={primary === null ? 'Действия по заказу' : 'Другие действия'}
            title={primary === null ? 'Действия по заказу' : 'Другие действия'}
            className={primary === null ? undefined : 'w-8 px-0'}
            onClick={() => {
              setMenuOpen((open) => !open);
            }}
          >
            {primary === null && 'Действия'}
            <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
          </Button>

          {menuOpen && (
            /*
              Меню прижато к правому краю строки и открывается вниз. Позиция
              простая, без вычислений: колонка действий — последняя, справа от
              неё места нет, а строк выше всегда больше, чем ниже.
            */
            <div
              role="menu"
              className="absolute right-0 top-full z-20 mt-1 min-w-[240px] overflow-hidden rounded-panel border border-strong bg-panel py-1 shadow-2xl"
            >
              {menuActions.map((action) => (
                <button
                  key={action.toStatus}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onPick(action);
                  }}
                  className={cn(
                    'block w-full px-3 py-2 text-left text-caption transition-colors',
                    action.kind === TransitionKind.CANCEL || action.kind === TransitionKind.REJECT
                      ? 'text-danger hover:bg-danger/10'
                      : action.kind === TransitionKind.ROLLBACK
                        ? 'text-warning hover:bg-warning/10'
                        : 'text-secondary hover:bg-raised hover:text-primary',
                  )}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
