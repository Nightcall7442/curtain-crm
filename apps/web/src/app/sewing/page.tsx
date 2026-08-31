import { redirect } from 'next/navigation';

/**
 * Раздел стал вкладкой «Швейный цех» в «Заказах» (ревизия «Диспетчерская»).
 * Адрес сохранён ради закладок и внешних ссылок.
 */
export default function SewingPage(): never {
  redirect('/orders?tab=sewing');
}
