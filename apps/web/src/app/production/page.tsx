import { redirect } from 'next/navigation';

/**
 * Раздел стал вкладкой «Производство» в «Заказах» (ревизия «Диспетчерская»).
 * Адрес сохранён ради закладок и внешних ссылок.
 */
export default function ProductionPage(): never {
  redirect('/orders?tab=production');
}
