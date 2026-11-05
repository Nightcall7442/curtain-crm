import {
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/manrope';
import { DefaultTheme, NavigationContainer, type LinkingOptions, type Theme } from '@react-navigation/native';
import { focusManager, QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { Alert, AppState, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import superjson from 'superjson';

import { WebAlertHost } from './src/components/WebAlertHost';
import { AuthContext, useAuth, type AuthState, type AuthUser } from './src/hooks/useAuth';
import { LocaleProvider, useLocale, type Translate } from './src/hooks/useLocale';
import { authFetch, endSession, isUnauthorized, setSessionExpiredHandler } from './src/lib/authFetch';
import { accountStorage, tokenStorage } from './src/lib/storage';
import { resolveApiUrl, trpc } from './src/lib/trpc';
import { installWebAlert } from './src/lib/webAlert';
import { RootNavigator } from './src/navigation/RootNavigator';
import { colors } from './src/theme';

/*
  Вернулся в приложение — данные обновляются.

  В браузере React Query сам слышит, что вкладка снова активна, и
  перезапрашивает устаревшее. В приложении такого события нет: без этой
  связки главная и касса показывали цифры с минуты, когда приложение
  открыли, — свернул утром, развернул вечером, а «сегодня» всё утреннее.
  PWA живёт в браузере и слушает вкладку сама — её не трогаем.
*/
/*
  В браузере `Alert.alert` ничего не показывает — подтверждения и ошибки
  молча пропадали. Подменяем до первого рендера; окна рисует `WebAlertHost`.
*/
installWebAlert();

if (Platform.OS !== 'web') {
  focusManager.setEventListener((handleFocus) => {
    const subscription = AppState.addEventListener('change', (state) => {
      handleFocus(state === 'active');
    });
    return () => {
      subscription.remove();
    };
  });
}

/**
 * Цвета навигации — из палитры «Хвоя», а не стандартные react-navigation.
 *
 * Главное здесь — `border`. Им навигатор в браузере рисует волосяную линию
 * под шапкой, и по умолчанию она холодно-серая (#D8D8D8): под тёмной хвоей
 * на льняном фоне выходил светлый шов, которого у APK нет. Линия цвета
 * самой шапки не видна. `card`/`text` — тёмная поверхность навигации и
 * текст на ней, как в шапке и панели вкладок.
 */
const navigationTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.accent,
    background: colors.background,
    card: colors.header,
    text: colors.headerText,
    border: colors.header,
    notification: colors.danger,
  },
};

/**
 * История браузера — чтобы «назад» в PWA закрывал экран, а не приложение.
 *
 * Без `linking` навигация браузерную историю не трогала вовсе: открыл
 * «Рейтинг», нажал системное «назад» на Android — и PWA закрылась (во
 * вкладке — пустая страница). Теперь каждый переход кладёт запись в
 * историю, и «назад» снимает экран со стека, как кнопка «назад» в APK.
 *
 * Адрес при этом не меняется — всегда корень приложения. Глубокие адреса
 * вроде `/app/order/5` сервер не отдаёт (он знает только `/app/`), и
 * обновление страницы на них кончалось бы 404. Записи истории различаются
 * не адресом, а сохранённым состоянием навигации; после перезагрузки
 * приложение открывается с главной — как после перезапуска APK.
 */
const WEB_ROOT_PATH = `${process.env['EXPO_BASE_URL'] ?? ''}/`;

const webLinking: LinkingOptions<ReactNavigation.RootParamList> = {
  prefixes: [],
  getStateFromPath: () => undefined,
  getPathFromState: () => WEB_ROOT_PATH,
};

/**
 * Корень приложения: провайдеры, клиент tRPC и состояние аутентификации.
 *
 * Восстановление сессии выполняется до первого рендера навигатора, иначе
 * при запуске на секунду мелькал бы экран входа, хотя сотрудник уже вошёл.
 */
export default function App(): ReactElement | null {
  /*
    Шрифт грузится до первого кадра: иначе экран мигнул бы системной
    гарнитурой и перерисовался. Не загрузился (сбой, нет файла) — едем на
    системном: приложение важнее шрифта.
  */
  const [fontsReady, fontsError] = useFonts({
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });

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

  if (!fontsReady && fontsError === null) return null;

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
              <AppNavigation />
            </AuthGate>
            <WebAlertHost />
          </SafeAreaProvider>
        </LocaleProvider>
      </QueryClientProvider>
    </trpc.Provider>
  );
}

/**
 * Контейнер навигации.
 *
 * История браузера ведётся только для вошедшего: на экране входа навигатора
 * нет, и запись «назад» из прошлой сессии было бы не к чему применить.
 */
function AppNavigation(): ReactElement {
  const { user } = useAuth();
  const signedIn = user !== null;
  const linking = useMemo(
    () => (Platform.OS === 'web' ? { ...webLinking, enabled: signedIn } : undefined),
    [signedIn],
  );

  return (
    <NavigationContainer theme={navigationTheme} linking={linking}>
      <RootNavigator />
    </NavigationContainer>
  );
}

/** Сколько ждать ответа сервера на выход, прежде чем выйти без него. */
const LOGOUT_WAIT_MS = 3000;

/**
 * «Сохранить этот вход?» — вопрос после первого входа под этой учётной записью.
 *
 * Системный диалог, а не свой экран: вопрос всплывает ровно один раз на
 * аккаунт, между вводом пароля и входом в приложение. Свой компонент ради
 * такого пришлось бы вплетать в дерево навигации, которое в этот момент
 * как раз перестраивается.
 *
 * Отказ — вариант по умолчанию: кнопка «Не сохранять» помечена `cancel`,
 * и закрытие диалога системным жестом означает «нет». Согласие на живую
 * сессию без пароля должно быть нажато явно.
 */
function confirmRememberAccount(fullName: string, m: Translate): Promise<boolean> {
  /*
    В браузере вопрос не задаётся, и ответ считается отказом.

    `Alert.alert` на вебе не показывает ничего и ни одну кнопку не нажимает —
    обещание висело бы вечно, а вместе с ним и вход: экран так и оставался
    бы формой логина после успешного ответа сервера. Веб-сборка нужна для
    проверки вёрстки, быстрый вход там и не нужен.
  */
  if (Platform.OS === 'web') return Promise.resolve(false);

  return new Promise((resolve) => {
    Alert.alert(
      m('auth.rememberTitle'),
      m('auth.rememberBody', { name: fullName }),
      [
        { text: m('auth.dontSave'), style: 'cancel', onPress: () => { resolve(false); } },
        { text: m('auth.save'), onPress: () => { resolve(true); } },
      ],
      { cancelable: true, onDismiss: () => { resolve(false); } },
    );
  });
}

/**
 * Держит состояние сессии и отдаёт его через `AuthContext`.
 *
 * Отдельный компонент внутри провайдеров, а не часть `App`: ему нужны хуки
 * tRPC, которые доступны только ниже `trpc.Provider`.
 */
function AuthGate({ children }: { readonly children: React.ReactNode }): ReactElement {
  const { m } = useLocale();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);

  const utils = trpc.useUtils();
  const queryClient = useQueryClient();
  const loginMutation = trpc.auth.login.useMutation();

  const signOut = useCallback(async (): Promise<void> => {
    /*
      Сервер узнаёт о выходе ДО того, как стёрты токены.

      `auth.logout` закрыт входом, а прежде его вызывали уже после очистки
      хранилища — без access-токена. Сервер отвечал 401, refresh-токен
      оставался живым, а в консоли браузера висели две ошибки.

      Ждём не дольше `LOGOUT_WAIT_MS`: выход обязан работать и при
      недоступном сервере.
    */
    const revoke = async (): Promise<void> => {
      const refreshToken = await tokenStorage.getRefreshToken();
      if (refreshToken === null) return;
      await utils.client.auth.logout.mutate({ refreshToken });
      /*
        Если access-токен успел протухнуть, `authFetch` по дороге обновил
        пару — и refresh-токен сменился. Старый сервер отозвал при
        ротации, новый остался бы жить: гасим и его.
      */
      const rotated = await tokenStorage.getRefreshToken();
      if (rotated !== null && rotated !== refreshToken) {
        await utils.client.auth.logout.mutate({ refreshToken: rotated });
      }
    };
    await Promise.race([
      revoke().catch(() => undefined),
      new Promise<void>((resolve) => {
        setTimeout(resolve, LOGOUT_WAIT_MS);
      }),
    ]);

    // Обновление пары, не успевшее за отведённое время, токены не вернёт.
    endSession();
    await tokenStorage.clear();
    // И убираем аккаунт из быстрого переключения: сервер погасил его
    // refresh-токен, и запись стала бы кнопкой, которая всегда падает.
    if (user !== null) await accountStorage.forget(user.id);
    setUser(null);
    /*
      Кеш — целиком и без перезапросов. `invalidate()` перезапрашивал все
      открытые запросы уже без токена: одиннадцать запросов, 401 на каждый.
      Данные прежнего сотрудника следующему всё равно показывать нельзя.
    */
    queryClient.clear();
  }, [utils, user, queryClient]);

  /**
   * Уйти на экран входа, оставив текущую сессию живой.
   *
   * Так добавляют второй аккаунт. Обычный выход для этого не годится: он
   * гасит refresh-токен на сервере и убирает запись из быстрого входа —
   * то есть каждый новый вход стирал бы предыдущий, и список никогда бы не
   * набрался. Здесь сервер о выходе не узнаёт, токен остаётся действующим и
   * лежит в сохранённой записи.
   *
   * Вызывать можно только когда текущий аккаунт УЖЕ сохранён: иначе человек
   * уйдёт на экран входа и вернётся к себе только паролем. Проверку делает
   * `AccountSwitcher` — единственное место, откуда это доступно.
   */
  const addAccount = useCallback(async (): Promise<void> => {
    await tokenStorage.clear();
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  /**
   * Вход директора под сотрудником — без его пароля.
   *
   * Сессию выдаёт сервер: право проверяется там (`ceoProcedure`) и там же
   * пишется в журнал. Здесь остаётся только принять выданную пару токенов
   * тем же путём, что и обычный вход.
   *
   * Возврат к себе обеспечивает `AccountSwitcher`: он сохраняет запись
   * директора ДО вызова, пока его refresh-токен ещё под рукой.
   */
  const impersonate = useCallback(
    async (userId: number): Promise<void> => {
      const session = await utils.client.auth.impersonate.mutate({ userId });

      await tokenStorage.setCurrentUserId(session.user.id);
      await tokenStorage.save({
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
      });

      // Кеш предыдущего сотрудника обязан уйти целиком: иначе новый экран
      // на мгновение покажет чужие заказы и чужую зарплату.
      queryClient.clear();
      setUser(session.user);
    },
    [utils, queryClient],
  );

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

      /*
        Спрашиваем, сохранять ли вход, — и только потом пускаем в приложение.

        Молча запоминать нельзя: телефон бывает чужой, а сохранённый вход
        это живая сессия, которую потом откроют одним нажатием без пароля.
        Решение принимает тот, кто только что ввёл пароль.

        Вопрос задаётся ДО `setUser`, пока на экране ещё вход: после него
        дерево навигации перестроится, и диалог всплыл бы поверх чужого
        экрана, без всякой связи с тем, что человек делал.

        Второй раз не спрашиваем: если аккаунт уже в списке, согласие
        получено раньше и переспрашивать при каждом входе — навязчиво.
      */
      const saved = await accountStorage.list();
      if (!saved.some((account) => account.userId === result.user.id)) {
        const shouldRemember = await confirmRememberAccount(result.user.fullName, m);

        if (shouldRemember) {
          await accountStorage.remember({
            userId: result.user.id,
            fullName: result.user.fullName,
            phone: result.user.phone,
            refreshToken: result.refreshToken,
          });
        }
      }

      setUser(result.user);
    },
    [loginMutation, m],
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
        throw new Error(m('auth.accountGone'));
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
    [utils, queryClient, m],
  );

  const value = useMemo<AuthState>(
    () => ({
      user,
      isRestoring,
      signIn,
      signOut,
      switchAccount,
      addAccount,
      impersonate,
      signInError: loginMutation.error?.message ?? null,
      isSigningIn: loginMutation.isPending,
    }),
    [
      user,
      isRestoring,
      signIn,
      signOut,
      switchAccount,
      addAccount,
      impersonate,
      loginMutation.error,
      loginMutation.isPending,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
