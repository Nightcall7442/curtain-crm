import type { AppRouter } from '@curtain-crm/api';
import { createTRPCReact } from '@trpc/react-query';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Типизированный клиент tRPC для мобильного приложения.
 *
 * `AppRouter` — только тип; при `verbatimModuleSyntax` импорт стирается,
 * и серверные зависимости в бандл Metro не попадают.
 */
export const trpc = createTRPCReact<AppRouter>();

/**
 * Адрес API.
 *
 * На устройстве `localhost` указывает на само устройство, а не на компьютер
 * разработчика, поэтому в разработке адрес выводится из хоста Metro-сервера,
 * который Expo кладёт в `hostUri`. Эмулятор Android дополнительно требует
 * `10.0.2.2` вместо `127.0.0.1`.
 *
 * В сборке адрес берётся из `extra.apiUrl` в `app.json`.
 */
export function resolveApiUrl(): string {
  // `expoConfig.extra` типизирован как `Record<string, any>`, поэтому
  // значение сначала приводится к `unknown` и сужается проверкой:
  // иначе любая опечатка в `app.json` попала бы в код как `any`.
  const extra: unknown = Constants.expoConfig?.extra;
  const configured =
    typeof extra === 'object' && extra !== null
      ? (extra as Record<string, unknown>)['apiUrl']
      : undefined;

  if (typeof configured === 'string' && configured.length > 0) return configured;

  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri !== undefined && hostUri.length > 0) {
    const [host] = hostUri.split(':');
    if (host !== undefined && host.length > 0) {
      const resolvedHost =
        Platform.OS === 'android' && (host === 'localhost' || host === '127.0.0.1')
          ? '10.0.2.2'
          : host;
      return `http://${resolvedHost}:3000/trpc`;
    }
  }

  return Platform.OS === 'android'
    ? 'http://10.0.2.2:3000/trpc'
    : 'http://localhost:3000/trpc';
}
