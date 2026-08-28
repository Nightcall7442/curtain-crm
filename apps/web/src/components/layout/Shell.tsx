'use client';

import { usePathname } from 'next/navigation';
import { useState, type ReactNode, type ReactElement } from 'react';

import { useAuth } from '@/components/providers/AuthProvider';

import { Header } from './Header';
import { Sidebar } from './Sidebar';

/**
 * Оболочка приложения: меню слева, шапка сверху, содержимое страницы.
 *
 * Решение «показывать оболочку или нет» принимается по адресу, а не отдельной
 * группой маршрутов: страницы уже разложены по каталогам `app/*`, и заводить
 * route group пришлось бы ценой переноса всех файлов. Исключение ровно одно —
 * экран входа.
 */
const BARE_ROUTES = new Set(['/login']);

export function Shell({ children }: { readonly children: ReactNode }): ReactElement {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const { isLoading, user } = useAuth();

  if (BARE_ROUTES.has(pathname)) {
    return <>{children}</>;
  }

  // Пока профиль загружается, оболочку не рисуем: иначе на долю секунды
  // мелькнёт меню с пустыми правами, а затем перестроится под роли.
  if (isLoading || user === null) {
    return (
      <div className="grid min-h-screen place-items-center bg-base">
        <div className="flex flex-col items-center gap-3">
          <span
            aria-hidden
            className="h-8 w-8 animate-spin rounded-full border-2 border-strong border-t-gold"
          />
          <span className="text-[13px] text-muted">Загрузка…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-base">
      <Sidebar collapsed={collapsed} />

      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          onToggleSidebar={() => {
            setCollapsed((value) => !value);
          }}
        />
        <main className="flex-1 overflow-y-auto p-4">{children}</main>
      </div>
    </div>
  );
}
