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
            className="h-8 w-8 animate-spin rounded-full border-2 border-strong border-t-accent"
          />
          <span className="text-caption text-muted">Загрузка…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-base">
      <Sidebar collapsed={collapsed} />

      {/*
        Прокручивается вся колонка целиком, а не только `main`.
        Иначе шапка оказывается СОСЕДОМ области прокрутки, под ней ничего не
        проезжает, и стекло размывает пустой фон — то есть выглядит просто
        мутным прямоугольником. Стекло имеет смысл только над движущимся
        содержимым.
      */}
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <Header
          onToggleSidebar={() => {
            setCollapsed((value) => !value);
          }}
        />
        {/*
          Ключ по адресу перезапускает анимацию на каждом переходе: без него
          содержимое проявляется один раз за загрузку панели, и переключение
          разделов снова выглядит мгновенной подменой без обратной связи.
        */}
        {/*
          ВЕРТИКАЛЬНЫЙ РИТМ СТРАНИЦЫ ЗАДАЁТСЯ ЗДЕСЬ, а не каждой страницей.

          До этого каждая страница решала сама, и решала по-разному:
          `space-y-2` в уведомлениях, `space-y-4` в большинстве, `space-y-8`
          в настройках, а половина разделов не задавала ничего вовсе. При
          переходе между разделами карточки заметно «прыгали».

          `space-y-6` — расстояние между верхнеуровневыми блоками страницы.
          Внутри карточек и сеток отступы свои и мельче: 24 px разделяет
          самостоятельные блоки, 16 px — карточки внутри одного блока,
          8–12 px — элементы внутри карточки. Три ступени, не восемь.
        */}
        <main
          key={pathname}
          className="page-enter flex-1 space-y-6 p-4 lg:p-6 xl:p-8"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
