import { Platform } from 'react-native';

/**
 * `useNativeDriver` для `Animated` — только там, где нативный драйвер есть.
 *
 * На телефоне анимация уходит в нативный поток и не дёргается, пока JS
 * занят. В браузере такого модуля нет: react-native-web на каждое
 * `useNativeDriver: true` пишет в консоль предупреждение и всё равно
 * анимирует на JS. Флаг один на всё приложение — консоль PWA чистая, а
 * на Android ничего не меняется.
 */
export const NATIVE_DRIVER = Platform.OS !== 'web';
