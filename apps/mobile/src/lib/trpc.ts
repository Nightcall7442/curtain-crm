import type { AppRouter } from '@curtain-crm/api';
import { createTRPCReact } from '@trpc/react-query';
import type { inferRouterOutputs } from '@trpc/server';
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
 * Типы ответов процедур: `RouterOutputs['rating']['me']`.
 *
 * Нужен там, где данные с сервера передаются в компонент пропсом. Вывести
 * их из `useQuery().data` нельзя — хук перегружен, и в обобщённом виде
 * возвращает `{}`. Ручное описание формы молча разъезжается с бэкендом,
 * а здесь переименование поля в процедуре ломает сборку приложения.
 */
export type RouterOutputs = inferRouterOutputs<AppRouter>;

/**
 * Адрес API.
 *
 * На устройстве `localhost` указывает на само устройство, а не на компьютер
 * разработчика, поэтому в разработке адрес выводится из хоста Metro-сервера,
 * который Expo кладёт в `hostUri`. Эмулятор Android дополнительно требует
 * `10.0.2.2` вместо `127.0.0.1`.
 *
 * В сборке адрес берётся из `extra.apiUrl` в `app.json`.
 *
 * Выше всего — переменная `EXPO_PUBLIC_API_URL`. Она нужна, чтобы запустить
 * приложение против другого сервера, не трогая `app.json`: например,
 * открыть его в браузере на локальном API, пока `extra.apiUrl` показывает
 * на прод. Правка общего конфига ради разовой проверки рано или поздно
 * уезжает в коммит и переключает всех.
 */
export function resolveApiUrl(): string {
  /*
    Читается именно так — обращением к конкретному ключу, а не перебором
    `process.env`. Metro подставляет значения `EXPO_PUBLIC_*` на этапе
    сборки текстом, и динамический доступ он подставить не может.
  */
  const fromEnv = process.env['EXPO_PUBLIC_API_URL'];
  if (typeof fromEnv === 'string' && fromEnv.length > 0) return fromEnv;

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
