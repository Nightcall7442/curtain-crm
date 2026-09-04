import { isManagement, type Role } from '@curtain-crm/shared';
import { createContext, useContext } from 'react';

/**
 * Состояние аутентификации мобильного приложения.
 *
 * Контекст объявлен здесь, а провайдер — в `App.tsx`: так экраны импортируют
 * только хук и не тянут за собой дерево провайдеров.
 */

export interface AuthUser {
  readonly id: number;
  readonly fullName: string;
  readonly phone: string;
  readonly roles: readonly Role[];
  readonly branchIds: readonly number[];
  readonly primaryBranchId: number | null;
}

export interface AuthState {
  readonly user: AuthUser | null;
  /** Идёт восстановление сессии при запуске приложения. */
  readonly isRestoring: boolean;
  readonly signIn: (phone: string, password: string) => Promise<void>;
  readonly signOut: () => Promise<void>;
  /** Ошибка последней попытки входа — сообщение с сервера, на русском. */
  readonly signInError: string | null;
  readonly isSigningIn: boolean;
}

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error('useAuth должен вызываться внутри AuthContext.Provider');
  }
  return context;
}

/**
 * Директор или администратор.
 *
 * Скрытие кнопок по этой проверке — удобство, а не защита: каждая
 * управленческая процедура закрыта `managementProcedure` на сервере и
 * откажет тому, кто дотянется до неё в обход интерфейса. Экран лишь не
 * показывает того, что всё равно не сработает.
 */
export function useIsManagement(): boolean {
  const { user } = useAuth();
  return isManagement(user?.roles ?? []);
}
