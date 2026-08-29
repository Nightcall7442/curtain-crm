'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { useState, type ReactNode, type ReactElement } from 'react';
import superjson from 'superjson';

import { authFetch } from '@/lib/authFetch';
import { apiUrl, tokenStorage, trpc } from '@/lib/trpc';

import { AuthProvider } from './AuthProvider';
import { LocaleProvider } from './LocaleProvider';
import { ToastProvider } from './ToastProvider';

/**
 * Корневые провайдеры панели: React Query, клиент tRPC и текущий сотрудник.
 *
 * Клиент создаётся через `useState`, а не в модуле: инстанс, созданный на
 * уровне модуля, был бы общим для всех пользователей при серверном рендеринге
 * и делил бы между ними кеш запросов.
 */
export function Providers({ children }: { readonly children: ReactNode }): ReactElement {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Панель открыта весь день; данные заказов меняются часто,
            // но не ежесекундно.
            staleTime: 30_000,
            refetchOnWindowFocus: true,
            retry: (failureCount, error) => {
              // 401 и 403 повторять бессмысленно: обновлением токена
              // занимается `authFetch`, а прав от повтора не прибавится.
              const code = extractTrpcCode(error);
              if (code === 'UNAUTHORIZED' || code === 'FORBIDDEN' || code === 'NOT_FOUND') {
                return false;
              }
              return failureCount < 2;
            },
          },
          mutations: { retry: false },
        },
      }),
  );

  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: apiUrl,
          transformer: superjson,
          fetch: authFetch,
          headers() {
            const token = tokenStorage.getAccessToken();
            return token === null ? {} : { authorization: `Bearer ${token}` };
          },
        }),
      ],
    }),
  );

  return (
    /*
      Язык — самый внешний из провайдеров содержимого: он не зависит ни от
      запросов, ни от того, вошёл ли сотрудник. Экран входа и сообщения об
      ошибках авторизации тоже должны быть на понятном языке, а в этот
      момент профиля ещё нет.
    */
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <LocaleProvider>
          <ToastProvider>
            <AuthProvider>{children}</AuthProvider>
          </ToastProvider>
        </LocaleProvider>
      </QueryClientProvider>
    </trpc.Provider>
  );
}

/** Код ошибки tRPC из произвольного значения, пришедшего в `onError`. */
function extractTrpcCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const data = (error as { data?: { code?: unknown } }).data;
  return typeof data?.code === 'string' ? data.code : null;
}
