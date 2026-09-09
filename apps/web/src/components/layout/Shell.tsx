'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode, type ReactElement } from 'react';

import { useAuth } from '@/components/providers/AuthProvider';

import { CommandPalette } from './CommandPalette';
import { Header } from './Header';
import { Sidebar } from './Sidebar';

/**
 * Оболочка приложения: меню слева, шапка сверху, содержимое страницы.
 *
 * Решение «показывать оболочку или нет» принимается по адресу, а не отдельной
 * группой маршрутов: страницы уже разложены по каталогам `app/*`, и заводить
 * route group пришлось бы ценой переноса всех файлов. Исключения — экран
 * входа и публичный лендинг в корне: у обоих своя, самостоятельная разметка.
 */
const BARE_ROUTES = new Set(['/login', '/']);

/**
 * Брейкпоинт, с которого меню живёт в потоке страницы. Совпадает с `lg`
 * Tailwind — та же граница используется классами `lg:` в разметке ниже,
 * и расходиться им нельзя: иначе кнопка в шапке будет открывать выдвижное
 * меню при видимом статичном.
 */
const DESKTOP_MEDIA = '(min-width: 1024px)';

export function Shell({ children }: { readonly children: ReactNode }): ReactElement {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { isLoading, user } = useAuth();

  // Переход по ссылке закрывает выдвижное меню и сам по себе (`onNavigate`
  // ниже), но сюда попадают и программные переходы — например редирект
  // после выхода. Держать меню открытым над новой страницей нельзя.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  /**
   * Ctrl+K / Cmd+K — глобальный поиск из любого раздела.
   *
   * Слушатель живёт здесь, а не в палитре: палитра закрытая не отрисована,
   * и слушать ей нечем. Браузерных сочетаний на Ctrl+K нет (адресную строку
   * фокусирует Ctrl+L), так что ни у кого ничего не отбирается.
   */
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((current) => !current);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  if (BARE_ROUTES.has(pathname)) {
    return <>{children}</>;
  }

  /*
    Пока профиль загружается, оболочку с ПУНКТАМИ не рисуем: иначе на долю
    секунды мелькнёт меню с пустыми правами, а затем перестроится под роли.

    Но и крутящийся кружок посреди пустой страницы показывать незачем: это
    самый дешёвый из возможных экранов ожидания, и он ничего не обещает.
    Здесь стоит остов той самой страницы, которая сейчас откроется — тёмное
    меню, шапка, карточки: за полсекунды глаз успевает найти будущие места
    заголовка и данных, и появление содержимого читается как продолжение,
    а не как смена экрана.
  */
  if (isLoading || user === null) {
    return (
      <div className="flex h-dvh overflow-hidden bg-base" role="status" aria-busy="true">
        <span className="sr-only">Загрузка панели</span>

        <div className="hidden w-[228px] shrink-0 flex-col gap-2 bg-nav p-4 lg:flex">
          <span className="h-10 w-[150px] rounded bg-white/10" />
          <span className="mt-4 h-8 w-full rounded-tile bg-white/[0.07]" />
          <span className="h-8 w-full rounded-tile bg-white/[0.07]" />
          <span className="h-8 w-full rounded-tile bg-white/[0.07]" />
          <span className="h-8 w-full rounded-tile bg-white/[0.07]" />
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-16 shrink-0 items-center gap-4 border-b border-subtle px-4">
            <span className="h-5 w-40 rounded bg-raised" />
            <span className="ml-auto h-9 w-32 rounded-tile bg-raised" />
          </div>

          <div className="flex-1 space-y-4 p-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <span className="h-[104px] rounded-panel border border-subtle bg-panel" />
              <span className="h-[104px] rounded-panel border border-subtle bg-panel" />
              <span className="h-[104px] rounded-panel border border-subtle bg-panel" />
            </div>
            <span className="block h-64 rounded-panel border border-subtle bg-panel" />
          </div>
        </div>
      </div>
    );
  }

  return (
    /*
      `h-dvh`, а не `h-screen`: в мобильном Safari 100vh меряется при спрятанной
      адресной строке, и нижняя кромка панели уезжает под неё. dvh следует за
      фактической высотой окна. Tailwind 3.4 генерирует утилиту из коробки.
    */
    <div className="flex h-dvh overflow-hidden bg-base">
      <CommandPalette
        open={paletteOpen}
        onClose={() => {
          setPaletteOpen(false);
        }}
      />

      {/* Статичное меню — только от `lg`: на телефоне оно съедало бы
          228 из 375 точек ширины. Уже — выдвижное, ниже. */}
      <div className="hidden lg:block">
        <Sidebar collapsed={collapsed} />
      </div>

      {/* Выдвижное меню для узких экранов: поверх содержимого, с подложкой,
          закрывается по ней и по любому переходу. */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Закрыть меню"
            onClick={() => {
              setMobileOpen(false);
            }}
            className="absolute inset-0 bg-black/50"
          />
          <div className="absolute inset-y-0 left-0 shadow-2xl">
            <Sidebar
              collapsed={false}
              onNavigate={() => {
                setMobileOpen(false);
              }}
            />
          </div>
        </div>
      )}

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
            // Одна кнопка — два жеста: на десктопе она сворачивает статичное
            // меню до иконок, на телефоне открывает выдвижное. Ширина экрана
            // читается в момент клика: слушатель на resize здесь дал бы только
            // лишний ререндер ради события, которое случается при клике.
            if (window.matchMedia(DESKTOP_MEDIA).matches) {
              setCollapsed((value) => !value);
            } else {
              setMobileOpen(true);
            }
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
