/**
 * Страницы без входа и без оболочки панели.
 *
 * Корень — витрина для клиентов, `/login` — вход, `/tv/<токен>` — табло
 * для телевизора в цеху: его открывает секретная ссылка, а не сотрудник.
 * Провайдер авторизации не запрашивает на них профиль и не уводит на вход,
 * оболочка не рисует меню. Один список на обоих: разойдись они — гость
 * получил бы либо меню без прав, либо редирект с табло на вход.
 */
const PUBLIC_PATHS = new Set(['/', '/login']);
const PUBLIC_PREFIXES = ['/tv/'] as const;

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.has(pathname) || PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * Страницы во весь экран, без меню и шапки: публичные и ТВ-режим
 * руководителя. Вход для `/monitor/tv` по-прежнему нужен — её проверяет
 * провайдер авторизации, а оболочка просто не рисуется.
 */
export function isBarePath(pathname: string): boolean {
  return isPublicPath(pathname) || pathname === '/monitor/tv';
}
