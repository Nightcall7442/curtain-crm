import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Хаптика — тонкая обёртка над `expo-haptics`.
 *
 * Все вызовы проглатывают ошибки и молчат на вебе: вибрация — это приправа,
 * и её отсутствие не должно ронять действие, к которому она прилагается.
 * Ждать завершения тоже незачем, поэтому наружу торчат синхронные функции.
 */

/** Лёгкий щелчок: жест дошёл до порога, элемент выбран. */
export function tapLight(): void {
  if (Platform.OS === 'web') return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
}

/** Ощутимый удар: свайп сработал, действие запущено. */
export function tapMedium(): void {
  if (Platform.OS === 'web') return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
}

/** Подтверждение: смена открыта, статус переведён. */
export function notifySuccess(): void {
  if (Platform.OS === 'web') return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
}

/** Отказ: сервер отверг переход, жест сброшен. */
export function notifyError(): void {
  if (Platform.OS === 'web') return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
}
