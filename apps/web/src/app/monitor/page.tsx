import { redirect } from 'next/navigation';

/** У раздела нет своей страницы: открывается табло цеха. */
export default function MonitorPage(): never {
  redirect('/monitor/workshop');
}
