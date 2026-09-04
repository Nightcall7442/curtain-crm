import { NavigationContainer } from '@react-navigation/native';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import superjson from 'superjson';

import { AuthContext, type AuthState, type AuthUser } from './src/hooks/useAuth';
import { LocaleProvider } from './src/hooks/useLocale';
import { authFetch, isUnauthorized, setSessionExpiredHandler } from './src/lib/authFetch';
import { accountStorage, tokenStorage } from './src/lib/storage';
import { resolveApiUrl, trpc } from './src/lib/trpc';
import { RootNavigator } from './src/navigation/RootNavigator';

/**
 * Корень приложения: провайдеры, клиент tRPC и состояние аутентификации.
 *
 * Восстановление сессии выполняется до первого рендера навигатора, иначе
 * при запуске на секунду мелькал бы экран входа, хотя сотрудник уже вошёл.
 */
export default function App(): ReactElement {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // В цехе связь нестабильная: даём данным полежать и не дёргаем
            // сервер на каждое переключение вкладки.
            staleTime: 30_000,
            retry: 2,
          },
          mutations: { retry: false },
        },
      }),
  );

  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: resolveApiUrl(),
          transformer: superjson,
          fetch: authFetch,
          headers() {
            const token = tokenStorage.getAccessTokenSync();
            return token === null ? {} : { authorization: `Bearer ${token}` };
          },
        }),
      ],
    }),
  );

  return (
    /*
      Язык — выше входа в приложение: экран логина и сообщения об ошибках
      авторизации тоже должны быть на понятном языке, а профиля в этот
      момент ещё нет.
    */
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <LocaleProvider>
          <SafeAreaProvider>
            <AuthGate>
              {/*
                Цвет фона строке состояния больше не задаётся.

                В SDK 57 `expo-status-bar` лишился `backgroundColor`: Android
                перешёл на edge-to-edge, и под строкой состояния рисует само
                содержимое. Здесь это ровно то, что нужно — сверху либо
                хвойная шапка навигации (`headerStyle` в обоих навигаторах),
                либо подложка приветствия на главной, и обе того же цвета.

                `style="light"` остаётся: он про цвет часов и значков, а не
                про фон, и его никто не отменял.
              */}
              <StatusBar style="light" />
              <NavigationContainer>
                <RootNavigator />
              </NavigationContainer>
            </AuthGate>
          </SafeAreaProvider>
        </LocaleProvider>
      </QueryClientProvider>
    </trpc.Provider>
  );
}

/**
 * Держит состояние сессии и отдаёт его через `AuthContext`.
 *
 * Отдельный компонент внутри провайдеров, а не часть `App`: ему нужны хуки
 * tRPC, которые доступны только ниже `trpc.Provider`.
 */
function AuthGate({ children }: { readonly children: React.ReactNode }): ReactElement {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);

  const utils = trpc.useUtils();
  const queryClient = useQueryClient();
  const loginMutation = trpc.auth.login.useMutation();

  const signOut = useCallback(async (): Promise<void> => {
    const refreshToken = await tokenStorage.getRefreshToken();

    // Токены чистим сразу: выход должен работать и при недоступном сервере.
    await tokenStorage.clear();
    // И убираем аккаунт из быстрого переключения: сервер сейчас погасит его
    // refresh-токен, и запись стала бы кнопкой, которая всегда падает.
    if (user !== null) await accountStorage.forget(user.id);
    setUser(null);
    utils.invalidate().catch(() => undefined);

    if (refreshToken !== null) {
      // Сообщаем серверу «в фоне»: ответ на выход пользователю не нужен.
      utils.client.auth.logout.mutate({ refreshToken }).catch(() => undefined);
    }
  }, [utils, user]);

  /** Восстановление сессии при запуске. */
  useEffect(() => {
    let cancelled = false;

    const restore = async (): Promise<void> => {
      const stored = await tokenStorage.restore();

      if (stored === null) {
        if (!cancelled) setIsRestoring(false);
        return;
      }

      try {
        // `auth.me` заодно проверяет, что учётная запись всё ещё активна:
        // уволенный сотрудник не должен войти по сохранённому токену.
        const profile = await utils.client.auth.me.query();
        // Кто мы — нужно и после перезапуска: `tokenStorage.save()` по этому
        // id обновляет запись в списке аккаунтов, когда `authFetch` молча
        // обновит протухший токен.
        await tokenStorage.setCurrentUserId(profile.id);
        if (!cancelled) setUser(profile);
      } catch (error) {
        /**
         * Токены стираются ТОЛЬКО когда сервер прямо сказал «не авторизован».
         *
         * Раньше `catch` ловил любую ошибку и чистил хранилище. Под это
         * попадал обычный обрыв связи: сотрудник открывал приложение в цехе,
         * где сеть ещё не поднялась, запрос падал — и его выкидывало на экран
         * входа, причём безвозвратно, потому что refresh-токен уже удалён.
         *
         * Сетевая ошибка не говорит ничего о том, жива ли сессия. Экран входа
         * при обрыве связи сотрудник всё равно увидит — профиль не загрузился,
         * — но токены останутся на месте, и следующий запуск при живой сети
         * восстановит сессию сам. Если же сессия действительно отозвана,
         * сервер ответит 401, и выход произойдёт штатно.
         */
        if (isUnauthorized(error)) await tokenStorage.clear();
      } finally {
        if (!cancelled) setIsRestoring(false);
      }
    };

    void restore();

    return () => {
      cancelled = true;
    };
  }, [utils]);

  /** Протухшая сессия — возвращаем на экран входа. */
  useEffect(() => {
    setSessionExpiredHandler(() => {
      setUser(null);
    });
    return () => {
      setSessionExpiredHandler(null);
    };
  }, []);

  const signIn = useCallback(
    async (phone: string, password: string): Promise<void> => {
      const result = await loginMutation.mutateAsync({ phone, password });
      await tokenStorage.setCurrentUserId(result.user.id);
      await tokenStorage.save({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      });
      // Аккаунт попадает в список быстрого переключения только после входа
      // ПАРОЛЕМ на этом устройстве — чужой сюда не добавить.
      await accountStorage.remember({
        userId: result.user.id,
        fullName: result.user.fullName,
        phone: result.user.phone,
        refreshToken: result.refreshToken,
      });
      setUser(result.user);
    },
    [loginMutation],
  );

  /**
   * Переключение на сохранённый аккаунт.
   *
   * Пароль не нужен: предъявляется сохранённый refresh-токен, сервер отдаёт
   * новую пару и профиль. Новую пару обязательно записываем и в сессию, и
   * обратно в список — токен одноразовый, сервер ротирует его при каждом
   * обновлении, и старый он потом сочтёт кражей.
   *
   * Кеш запросов чистится целиком: в нём лежат заказы, смены и зарплата
   * прежнего человека, и показать их новому было бы утечкой, а не задержкой
   * отрисовки.
   */
  const switchAccount = useCallback(
    async (userId: number): Promise<void> => {
      const account = (await accountStorage.list()).find((item) => item.userId === userId);
      if (account === undefined) {
        throw new Error('Учётная запись больше не сохранена на этом телефоне');
      }

      /*
        Запись убирается ДО обращения к серверу, а не после ошибки.

        Сервер ротирует refresh-токен и считает повторное предъявление
        старого кражей — гасит сотруднику ВСЕ устройства (проверено:
        второй запрос с тем же токеном возвращает 401 «Все устройства
        отключены»). Значит сохранённый токен одноразовый, и опаснее всего
        оставить в списке уже потраченный: следующее нажатие выкинуло бы
        человека отовсюду.

        Защищённое хранилище умеет молча не записать (нет прав, нет пароля
        экрана). Поэтому сначала стираем, потом тратим токен, потом пишем
        новый: если запись не удастся, потеряется ярлык быстрого входа —
        человек введёт пароль. Обратный порядок стоил бы ему всех сессий.
      */
      await accountStorage.forget(userId);

      const session = await utils.client.auth.refresh.mutate({
        refreshToken: account.refreshToken,
      });

      await tokenStorage.setCurrentUserId(session.user.id);
      await tokenStorage.save({
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
      });
      await accountStorage.remember({
        userId: session.user.id,
        fullName: session.user.fullName,
        phone: session.user.phone,
        refreshToken: session.refreshToken,
      });

      queryClient.clear();
      setUser(session.user);
    },
    [utils, queryClient],
  );

  const value = useMemo<AuthState>(
    () => ({
      user,
      isRestoring,
      signIn,
      signOut,
      switchAccount,
      signInError: loginMutation.error?.message ?? null,
      isSigningIn: loginMutation.isPending,
    }),
    [user, isRestoring, signIn, signOut, switchAccount, loginMutation.error, loginMutation.isPending],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
