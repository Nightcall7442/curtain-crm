import { useEffect, useRef, type ReactElement, type ReactNode } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, spacing, typography } from '../theme';

/**
 * Нижняя шторка — действия поверх контекста, по макету «Хвоя UI».
 *
 * Пользователь не уезжает на отдельный экран и не теряет, где был: карточка
 * заказа остаётся за полупрозрачной подложкой. Закрывается тапом по подложке.
 *
 * Реализована на системном `Modal` + `Animated`, без нативных зависимостей:
 * работает в Expo Go и в веб-превью. Высота — по содержимому; для длинных
 * списков внутрь кладётся свой `ScrollView`.
 */
export function BottomSheet({
  visible,
  title,
  onClose,
  children,
}: {
  readonly visible: boolean;
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
}): ReactElement {
  const slide = useRef(new Animated.Value(SHEET_SHIFT)).current;
  const insets = useSafeAreaInsets();

  useEffect(() => {
    Animated.spring(slide, {
      toValue: visible ? 0 : SHEET_SHIFT,
      useNativeDriver: true,
      bounciness: 2,
      speed: 18,
    }).start();
  }, [visible, slide]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.host}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Закрыть"
        />
        <Animated.View
          style={[
            styles.sheet,
            { paddingBottom: spacing.lg + insets.bottom, transform: [{ translateY: slide }] },
          ]}
        >
          <View style={styles.grabber} />
          <Text style={styles.title}>{title}</Text>
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

/** Откуда шторка выезжает; больше любой реальной высоты содержимого. */
const SHEET_SHIFT = 480;

const styles = StyleSheet.create({
  host: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(10, 17, 13, 0.45)',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg + 4,
    borderTopRightRadius: radius.lg + 4,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  grabber: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  title: {
    ...typography.sectionTitle,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
});
