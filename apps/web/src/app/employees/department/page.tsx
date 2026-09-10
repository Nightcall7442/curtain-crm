import { redirect } from 'next/navigation';

/**
 * Бывшая «Ведомость».
 *
 * Съехалась в табель: оба раздела отвечали на один вопрос — «кто и сколько
 * работает». Страница осталась переадресацией, потому что ссылку на неё
 * успели положить в закладки.
 */
export default function DepartmentPage(): never {
  redirect('/employees/timesheet');
}
