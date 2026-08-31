import { redirect } from 'next/navigation';

/**
 * Раздел стал вкладкой «Качество» в «Заказах» (ревизия «Диспетчерская»).
 * Адрес сохранён ради закладок и внешних ссылок.
 */
export default function QualityPage(): never {
  redirect('/orders?tab=quality');
}
