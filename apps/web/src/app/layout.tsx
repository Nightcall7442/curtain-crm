import type { ReactElement, ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans, Instrument_Serif } from 'next/font/google';

import { Shell } from '@/components/layout/Shell';
import { Providers } from '@/components/providers/Providers';
import { LOCALE_BOOTSTRAP_SCRIPT } from '@/lib/locale';
import { SKIN_BOOTSTRAP_SCRIPT } from '@/lib/skin';
import { THEME_BOOTSTRAP_SCRIPT } from '@/lib/theme';

import '@/styles/globals.css';

/**
 * Шрифты подключаются через `next/font`, а не ссылкой на Google Fonts:
 * файлы скачиваются на этапе сборки и раздаются с нашего же домена. Это
 * убирает сторонний запрос из загрузки страницы и делает панель независимой
 * от доступности Google — существенно, когда система работает в цехе.
 */

/** Весь интерфейс: таблицы, формы, подписи. */
const plexSans = IBM_Plex_Sans({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600'],
  variable: '--font-sans',
  display: 'swap',
});

/** Номера заказов, суммы, часы — колонки цифр должны совпадать по ширине. */
const plexMono = IBM_Plex_Mono({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});

/**
 * Фирменные места: экран входа, крупные заголовки.
 *
 * Кириллицы у Instrument Serif нет, поэтому подписи на русском падают
 * на Georgia из запасного набора — начертания близки по метрикам, и подмена
 * не ломает вёрстку. Латиница («Design House») набирается им же.
 */
const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-display',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Design House — CRM',
  description: 'Система учёта мастерской по пошиву и установке штор',
};

export const viewport: Viewport = {
  /** Совпадает с `--surface-base`: строка адреса на мобильном не должна спорить с фоном. */
  themeColor: '#faf8f5',
  colorScheme: 'light',
};

/**
 * Корневой layout.
 *
 * Провайдеры оборачивают всё дерево, включая экран входа: клиент tRPC нужен
 * и там, для процедуры `auth.login`. Решение о том, показывать ли оболочку
 * с меню, принимает `Shell` по текущему адресу.
 */
export default function RootLayout({
  children,
}: {
  readonly children: ReactNode;
}): ReactElement {
  return (
    <html
      lang="ru"
      className={`${plexSans.variable} ${plexMono.variable} ${instrumentSerif.variable}`}
    >
      <head>
        {/*
          Скин применяется ДО первой отрисовки.

          Скрипт выполняется синхронно, раньше React: иначе панель успевает
          показаться в палитре по умолчанию и через кадр перекрашивается —
          при выбранном синем это заметная вспышка зелёного на каждой
          загрузке страницы.

          `dangerouslySetInnerHTML` здесь — единственный способ вставить
          синхронный скрипт: содержимое своё, константное, и в него не
          попадает ничего пользовательского.
        */}
        <script dangerouslySetInnerHTML={{ __html: SKIN_BOOTSTRAP_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: LOCALE_BOOTSTRAP_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-base font-sans text-primary antialiased">
        <Providers>
          <Shell>{children}</Shell>
        </Providers>
      </body>
    </html>
  );
}
