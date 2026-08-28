'use client';

import { isManagement, type Role } from '@curtain-crm/shared';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode, type ReactElement } from 'react';

import { setSessionExpiredHandler } from '@/lib/authFetch';
import { tokenStorage, trpc } from '@/lib/trpc';

/**
 * Текущий сотрудник и его права.
 *
 * Роли берутся из ответа `auth.me`, то есть из БД, а не из токена — при отзыве
 * роли директором панель узнает об этом при первом же перезапросе, а не через
 * четверть часа.
 *
 * ВАЖНО: скрытие пунктов меню и кнопок здесь — исключительно удобство.
 * Настоящая проверка прав выполняется в tRPC-процедурах (`roleGuard`),
 * и обойти её, открыв адрес напрямую, невозможно.
 */

export interface AuthUser {
  readonly id: number;
  readonly fullName: string;
  readonly phone: string;
  readonly roles: readonly Role[];
  readonly branchIds: readonly number[];
  readonly primaryBranchId: number | null;
}

interface AuthContextValue {
  readonly user: AuthUser | null;
  readonly isLoading: boolean;
  readonly isManagement: boolean;
  readonly hasRole: (...roles: readonly Role[]) => boolean;
  readonly logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const LOGIN_PATH = '/login';

export function AuthProvider({ children }: { readonly children: ReactNode }): ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const isLoginPage = pathname === LOGIN_PATH;

  const meQuery = trpc.auth.me.useQuery(undefined, {
    // На экране входа запрашивать профиль незачем — токена ещё нет.
    enabled: !isLoginPage,
    retry: false,
    staleTime: 60_000,
  });

  const logoutMutation = trpc.auth.logout.useMutation();

  const logout = useCallback(() => {
    const refreshToken = tokenStorage.getRefreshToken();

    // Токены чистим сразу, не дожидаясь ответа сервера: выход должен
    // сработать даже при недоступном API.
    tokenStorage.clear();

    if (refreshToken !== null) {
      logoutMutation.mutate({ refreshToken });
    }

    router.replace(LOGIN_PATH);
  }, [logoutMutation, router]);

  /** Обработчик протухшей сессии для `authFetch`. */
  useEffect(() => {
    setSessionExpiredHandler(() => {
      router.replace(LOGIN_PATH);
    });
    return () => {
      setSessionExpiredHandler(null);
    };
  }, [router]);

  /** Неаутентифицированного пользователя уводим на вход. */
  useEffect(() => {
    if (isLoginPage) return;
    if (meQuery.isLoading) return;

    if (meQuery.isError || meQuery.data === null) {
      router.replace(LOGIN_PATH);
    }
  }, [isLoginPage, meQuery.isError, meQuery.isLoading, meQuery.data, router]);

  const value = useMemo<AuthContextValue>(() => {
    const user = meQuery.data ?? null;
    const roles = user?.roles ?? [];

    return {
      user,
      isLoading: !isLoginPage && meQuery.isLoading,
      isManagement: isManagement(roles),
      hasRole: (...required: readonly Role[]) => required.some((role) => roles.includes(role)),
      logout,
    };
  }, [isLoginPage, logout, meQuery.data, meQuery.isLoading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Текущий сотрудник.
 *
 * Бросает исключение вне провайдера: это ошибка сборки дерева компонентов,
 * и молча вернуть `null` означало бы получить непонятный сбой где-то ниже.
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error('useAuth должен вызываться внутри <AuthProvider>');
  }
  return context;
}
