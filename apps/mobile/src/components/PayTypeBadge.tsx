import {
  TERMINAL_PAY_TYPE_LABELS,
  TERMINAL_PAY_TYPE_STYLE,
  TerminalPayType,
  terminalPayTypeOf,
} from '@curtain-crm/shared';
import type { ReactElement } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useLocale } from '../hooks/useLocale';
import { fonts, radius, spacing, typography } from '../theme';
import { Icon } from './Icon';

/**
 * Значок типа оплаты терминального чека: Click, Payme, Uzum, Humo, Uzcard
 * или наличные (просьба заказчика 05.11). Фирменный цвет и название, у
 * наличных — купюра; цвета общие с сайтом (`TERMINAL_PAY_TYPE_STYLE`).
 *
 * `size="lg"` — плитка выбора в «Пробить чек», обычный — у строки чека.
 * Без типа (старый чек) или тип, которого это приложение ещё не знает, —
 * значка нет: экран не падает, пока APK не обновили.
 */
export function PayTypeBadge({
  type,
  size = 'sm',
}: {
  readonly type: string | null | undefined;
  readonly size?: 'sm' | 'lg';
}): ReactElement | null {
  const { locale } = useLocale();
  const known = terminalPayTypeOf(type);
  if (known === null) return null;
  const style = TERMINAL_PAY_TYPE_STYLE[known];
  const large = size === 'lg';

  return (
    <View
      style={[styles.badge, large ? styles.large : null, { backgroundColor: style.background }]}
      accessibilityLabel={TERMINAL_PAY_TYPE_LABELS[locale][known]}
    >
      {known === TerminalPayType.CASH ? (
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
  /*
    Без `alignSelf`: значок встаёт так, как строка ставит соседей. Прежний
    `flex-start` прижимал его к верху строки с `alignItems: 'center'`, и
    значок высотой 20 сидел на полточки выше середины строки в 21.
  */
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    // Строка сноски и по 2 сверху и снизу: высота от шкалы, а не на глаз.
    height: typography.footnote.lineHeight + spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
  },
  large: {
    height: 30,
    paddingHorizontal: spacing.md,
    alignSelf: 'center',
  },
  /*
    Гарнитура — та же Manrope, что во всём приложении. Без `fontFamily`
    подпись бралась из системного шрифта (Roboto, Arial), и «Наличные»
    рядом с остальным текстом смотрелись чужими. Кегль 12 — нижняя граница
    читаемого текста в приложении (см. `typography.footnote`).
  */
  mark: {
    ...typography.footnote,
    fontFamily: fonts.extrabold,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  markLarge: {
    fontSize: 14,
    lineHeight: typography.caption.lineHeight,
  },
});
