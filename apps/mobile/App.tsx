import { NavigationContainer } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import superjson from 'superjson';

import { AuthContext, type AuthState, type AuthUser } from './src/hooks/useAuth';
import { LocaleProvider } from './src/hooks/useLocale';
import { authFetch, isUnauthorized, setSessionExpiredHandler } from './src/lib/authFetch';
import { tokenStorage } from './src/lib/storage';
import { resolveApiUrl, trpc } from './src/lib/trpc';
import { RootNavigator } from './src/navigation/RootNavigator';
import { colors } from './src/theme';

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
              <StatusBar style="light" backgroundColor={colors.header} />
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
  const loginMutation = trpc.auth.login.useMutation();

  const signOut = useCallback(async (): Promise<void> => {
    const refreshToken = await tokenStorage.getRefreshToken();

    // Токены чистим сразу: выход должен работать и при недоступном сервере.
    await tokenStorage.clear();
    setUser(null);
    utils.invalidate().catch(() => undefined);

    if (refreshToken !== null) {
      // Сообщаем серверу «в фоне»: ответ на выход пользователю не нужен.
      utils.client.auth.logout.mutate({ refreshToken }).catch(() => undefined);
    }
  }, [utils]);

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
      await tokenStorage.save({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      });
      setUser(result.user);
    },
    [loginMutation],
  );

  const value = useMemo<AuthState>(
    () => ({
      user,
      isRestoring,
      signIn,
      signOut,
      signInError: loginMutation.error?.message ?? null,
      isSigningIn: loginMutation.isPending,
    }),
    [user, isRestoring, signIn, signOut, loginMutation.error, loginMutation.isPending],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
