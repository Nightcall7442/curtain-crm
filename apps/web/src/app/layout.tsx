import type { ReactElement, ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import {
  Great_Vibes,
  IBM_Plex_Mono,
  IBM_Plex_Sans,
  Instrument_Serif,
  Manrope,
  Playfair_Display,
} from 'next/font/google';

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

/**
 * Заголовки публичного лендинга — единственное место, где заголовки массово
 * набраны русским и узбекским текстом, а не отдельными словами на латинице.
 * `--font-display` (Instrument Serif) для этого не годится совсем: у него
 * нет кириллицы, и каждый такой заголовок молча падал бы на Georgia из
 * запасного набора — тот самый плоский, ничем не примечательный шрифт,
 * который и выдаёт нетронутую вёрстку.
 *
 * Playfair Display кириллицу несёт. Отдельная переменная, а не замена
 * `--font-display`: тот уже стоит на экране входа и в шапке панели, и его
 * смена ради одной новой страницы перекрасила бы заголовки везде, где
 * сейчас показывается латиница по-английски, — а разговор был про лендинг.
 */
const playfairDisplay = Playfair_Display({
  subsets: ['latin', 'cyrillic'],
  weight: ['600'],
  variable: '--font-editorial',
  display: 'swap',
});

/**
 * Заголовок первого экрана лендинга — крупные прописные.
 *
 * Отдельная гарнитура, а не жирный Plex Sans: в прописных на сорока
 * пикселях Plex читается как заголовок таблицы, а не как обложка. Manrope
 * геометричнее и плотнее в капсе, кириллицу несёт полностью, и рядом с
 * засечным знаком фирмы даёт ту самую пару «серифный логотип — гротескный
 * заголовок», на которой держится композиция референса.
 */
const manrope = Manrope({
  subsets: ['latin', 'cyrillic'],
  weight: ['500', '800'],
  variable: '--font-hero',
  display: 'swap',
});

/**
 * Рукописная подпись «Your Style / Our Inspiration» поверх фотографии.
 *
 * Только латиница — она и набирается латиницей в обеих локалях. Это
 * подпись-росчерк, а не текст интерфейса: переводить её незачем, а
 * кириллический скрипт того же настроения потянул бы третий шрифтовой
 * файл ради двух слов.
 */
const greatVibes = Great_Vibes({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-script',
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
      className={`${plexSans.variable} ${plexMono.variable} ${instrumentSerif.variable} ${playfairDisplay.variable} ${manrope.variable} ${greatVibes.variable}`}
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
