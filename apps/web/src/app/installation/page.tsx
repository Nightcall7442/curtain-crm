import { redirect } from 'next/navigation';

/**
 * Раздел стал вкладкой «Установка» в «Заказах» (ревизия «Диспетчерская»).
 * Адрес сохранён ради закладок и внешних ссылок.
 */
export default function InstallationPage(): never {
  redirect('/orders?tab=installation');
}
