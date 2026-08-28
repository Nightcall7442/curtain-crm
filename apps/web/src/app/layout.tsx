import type { ReactElement, ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';

import { Shell } from '@/components/layout/Shell';
import { Providers } from '@/components/providers/Providers';

import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'Design House — CRM',
  description: 'Система учёта мастерской по пошиву и установке штор',
};

export const viewport: Viewport = {
  themeColor: '#04120f',
  colorScheme: 'dark',
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
    <html lang="ru">
      <body className="min-h-screen bg-base text-primary antialiased">
        <Providers>
          <Shell>{children}</Shell>
        </Providers>
      </body>
    </html>
  );
}
