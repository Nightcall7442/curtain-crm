import { CommonActions, useNavigation } from '@react-navigation/native';
import type { ReactElement } from 'react';
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { useIsManagement } from '../hooks/useAuth';
import { useLocale } from '../hooks/useLocale';
import { trpc } from '../lib/trpc';
import { colors, opacity, radius, spacing, typography } from '../theme';
import { Icon } from './Icon';

/**
 * Баннер «Смена не начата» — один на всё приложение.
 *
 * Сервер не пускает сотрудника без открытой смены к заказам, кассе и
 * поручениям (412 «Сначала начните смену», shiftGuard.middleware.ts), а
 * руководство пускает всегда. Экран, где из-за этого погашена кнопка,
 * обязан сказать почему — иначе кнопка просто «мёртвая».
 *
 * Раньше у каждого экрана была своя копия разметки и своя навигация, и
 * они разошлись: из экрана стека голое `navigate('CheckInOut')` никто не
 * обрабатывал, а `navigate('Tabs', …)` без `pop` клало в стек вторую
 * копию вкладок поверх первой — «назад» возвращал не туда.
 */
/**
 * Сотруднику нужна смена, а её нет — сервер такую мутацию отклонит (412).
 *
 * `false`, пока смена грузится: кнопку не гасим зря. Руководству смена не
 * нужна — для него запрос и не уходит. Правило то же, что в
 * `shiftGuard.middleware.ts`, и одно на все экраны.
 */
export function useNeedsShift(): boolean {
  const isManager = useIsManagement();
  const shift = trpc.shifts.current.useQuery(undefined, { enabled: !isManager });
  return !isManager && shift.data === null;
}

export function ShiftRequiredBanner({
  style,
  onNavigate,
}: {
  /** Внешние отступы: в списке без `gap` баннеру нужен свой зазор снизу. */
  readonly style?: StyleProp<ViewStyle>;
  /**
   * Вызывается перед переходом на «Смену». Баннер внутри шторки передаёт
   * сюда её закрытие: шторка — модальное окно экрана-вкладки, и без этого
   * она оставалась поверх «Смены» (в браузере) или гасла без ведома
   * экрана и потом не открывалась снова (на Android).
   */
  readonly onNavigate?: () => void;
}): ReactElement | null {
  const { m } = useLocale();
  const navigation = useNavigation();
  const needsShift = useNeedsShift();

  if (!needsShift) return null;

  return (
    <Pressable
      onPress={() => {
        /*
          «Смена» — вкладка, а вкладки — один маршрут `Tabs` корневого
          стека. `pop: true` возвращает к уже открытым вкладкам и снимает
          экраны над ними, а не кладёт поверх вторую копию. С вкладки
          действие поднимается к тому же стеку, так что путь один.
        */
        onNavigate?.();
        navigation.dispatch(CommonActions.navigate('Tabs', { screen: 'CheckInOut' }, { pop: true }));
      }}
      accessibilityRole="button"
      style={({ pressed }) => [styles.banner, style, pressed ? styles.pressed : null]}
    >
      <Icon name="checkin" size={18} color={colors.warning} />
      <Text style={styles.text}>{m('work.noShift')}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.warningSoft,
  },
  text: {
    ...typography.caption,
    color: colors.warning,
    flex: 1,
  },
  pressed: {
    opacity: opacity.pressed,
  },
});
