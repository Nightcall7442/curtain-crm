import { RATING_SCOPE_LABELS, RATING_SCOPES, type RatingScope } from '@curtain-crm/shared';
import type { ReactElement } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useLocale } from '../hooks/useLocale';
import { colors, fonts, radius, sizes, typography } from '../theme';

/**
 * Переключатель периода рейтинга «Неделя / Месяц».
 *
 * Один на оба экрана — «Рейтинг» и «Рейтинг сотрудников». Раньше у
 * соседних экранов был один и тот же выбор в двух видах: сегменты на
 * бежевой дорожке в одном и тёмные чипы в другом.
 */
export function RatingScopeSwitch({
  value,
  onChange,
}: {
  readonly value: RatingScope;
  readonly onChange: (value: RatingScope) => void;
}): ReactElement {
  const { t } = useLocale();

  return (
    <View style={styles.scopeRow}>
      {RATING_SCOPES.map((scope) => {
        const active = value === scope;

        return (
          <Pressable
            key={scope}
            onPress={() => {
              onChange(scope);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[styles.scopeButton, active ? styles.scopeButtonActive : null]}
          >
            <Text style={[styles.scopeText, active ? styles.scopeTextActive : null]}>
              {t(RATING_SCOPE_LABELS, scope)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  scopeRow: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    padding: 3,
  },
  scopeButton: {
    minHeight: sizes.touchTarget,
    flex: 1,
    borderRadius: radius.pill,
    alignItems: 'center',
    // Подпись по центру кнопки: с одними вертикальными полями она стояла
    // на 5 точек выше середины (8 сверху, 18 снизу).
    justifyContent: 'center',
  },
  scopeButtonActive: {
    backgroundColor: colors.surface,
  },
  scopeText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  scopeTextActive: {
    // Насыщенность — семейством: вес на Medium браузер рисует поддельным жирным.
    fontFamily: fonts.semibold,
    color: colors.accent,
    fontWeight: '600',
  },
});
