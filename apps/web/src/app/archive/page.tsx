import { redirect } from 'next/navigation';

/**
 * Архив стал вкладкой в «Заказах» (ревизия «Диспетчерская»): выполненные и
 * отменённые — это фильтр по статусу, а не отдельное место. Адрес сохранён
 * ради закладок и внешних ссылок.
 */
export default function ArchivePage(): never {
  redirect('/orders?tab=archive');
}
