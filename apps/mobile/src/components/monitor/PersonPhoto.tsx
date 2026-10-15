import { useState, type ReactElement } from 'react';
import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, fonts } from '../../theme';

/** Две буквы имени — на месте фото, которого нет или которое не загрузилось. */
const initials = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

/**
 * Портрет сотрудника прямоугольником: фото из карточки сотрудника, кадр от
 * верхнего края (голова у портрета сверху). Ссылка подписана и может
 * истечь — тогда, как и без фото, инициалы на приглушённом фоне.
 */
export function PersonPhoto({
  uri,
  name,
  dimmed = false,
  style,
  initials: initialsLook,
}: {
  readonly uri: string | null;
  readonly name: string;
  readonly dimmed?: boolean;
  readonly style: StyleProp<ViewStyle>;
  /** Инициалы без фото: крупнее и выше — на большом фото низ закрывает подпись. */
  readonly initials?: { readonly size: number; readonly color: string; readonly lift: number };
}): ReactElement {
  const [failed, setFailed] = useState(false);
  const showsPhoto = uri !== null && !failed;

  return (
    <View style={[styles.frame, style]}>
      {showsPhoto ? (
        <Image
          source={{ uri }}
          style={[StyleSheet.absoluteFill, dimmed ? styles.dimmed : null]}
          resizeMode="cover"
          onError={() => {
            setFailed(true);
          }}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Text
          style={[
            styles.initials,
            initialsLook === undefined
              ? null
              : { fontSize: initialsLook.size, color: initialsLook.color, marginBottom: initialsLook.lift },
          ]}
        >
          {initials(name)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  dimmed: {
    opacity: 0.55,
  },
  initials: {
    fontFamily: fonts.bold,
    fontWeight: '700',
    fontSize: 22,
    color: colors.textMuted,
  },
});
