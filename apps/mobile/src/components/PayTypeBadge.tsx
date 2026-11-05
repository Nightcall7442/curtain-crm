import {
  TERMINAL_PAY_TYPE_LABELS,
  TERMINAL_PAY_TYPE_STYLE,
  TerminalPayType,
  type TerminalPayType as TerminalPayTypeName,
} from '@curtain-crm/shared';
import type { ReactElement } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useLocale } from '../hooks/useLocale';
import { Icon } from './Icon';

/**
 * Значок типа оплаты терминального чека: Click, Payme, Uzum, Humo, Uzcard
 * или наличные (просьба заказчика 05.11). Фирменный цвет и название, у
 * наличных — купюра; цвета общие с сайтом (`TERMINAL_PAY_TYPE_STYLE`).
 *
 * `size="lg"` — плитка выбора в «Пробить чек», обычный — у строки чека.
 */
export function PayTypeBadge({
  type,
  size = 'sm',
}: {
  readonly type: TerminalPayTypeName;
  readonly size?: 'sm' | 'lg';
}): ReactElement {
  const { locale } = useLocale();
  const style = TERMINAL_PAY_TYPE_STYLE[type];
  const large = size === 'lg';

  return (
    <View
      style={[styles.badge, large ? styles.large : null, { backgroundColor: style.background }]}
      accessibilityLabel={TERMINAL_PAY_TYPE_LABELS[locale][type]}
    >
      {type === TerminalPayType.CASH ? (
        <>
          <Icon name="paid" size={large ? 16 : 12} color={style.color} />
          <Text style={[styles.mark, large ? styles.markLarge : null, { color: style.color }]}>
            {TERMINAL_PAY_TYPE_LABELS[locale].cash}
          </Text>
        </>
      ) : (
        <Text style={[styles.mark, large ? styles.markLarge : null, { color: style.color }]}>
          {style.mark}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    height: 20,
    paddingHorizontal: 7,
    borderRadius: 6,
  },
  large: {
    height: 30,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignSelf: 'center',
  },
  mark: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  markLarge: {
    fontSize: 14,
  },
});
