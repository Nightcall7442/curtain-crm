import type { Metadata } from 'next';
import type { ReactNode } from 'react';

/**
 * Адрес страницы ТВ — секретная ссылка. Без этого браузер повторял бы его в
 * заголовке Referer каждого запроса за фото и данными, и токен оседал бы в
 * журналах всего, через что эти запросы идут.
 */
export const metadata: Metadata = { referrer: 'no-referrer' };

export default function TvLayout({ children }: { readonly children: ReactNode }): ReactNode {
  return children;
}
