import type { Metadata } from 'next';
import type { ReactElement } from 'react';

import { LandingPage } from '@/components/landing/LandingPage';

/**
 * Публичная страница мастерской — то, что открывает домен до входа в систему.
 *
 * Серверная оболочка ради одного: заголовок и описание. Лендинг сам живёт в
 * браузере (анимации, лента команды, язык), а `metadata` из клиентского
 * компонента не экспортировать — и страница наследовала бы заголовок
 * панели «Design House — CRM» с описанием «Система учёта мастерской…».
 * Именно они попадали в выдачу поиска и в превью ссылки в мессенджере, когда
 * клиенту присылали адрес.
 */

const TITLE = 'Design House · Parda Bozor — шторы на заказ в Ургенче';
const DESCRIPTION =
  'Шторы под заказ в Ургенче: замер, пошив и установка одной мастерской. Премиальные ткани, индивидуальный пошив, профессиональная установка.';

export const metadata: Metadata = {
  metadataBase: new URL('https://pardabozor.uz'),
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: 'Design House · Parda Bozor',
    locale: 'ru_RU',
    title: TITLE,
    description: DESCRIPTION,
    url: '/',
    // Кадр из собственного ролика — не сток, и он же на обложке раздела «Контакты».
    images: [{ url: '/process/frames/f_282.webp', width: 1440, height: 810 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: ['/process/frames/f_282.webp'],
  },
};

export default function Page(): ReactElement {
  return <LandingPage />;
}
