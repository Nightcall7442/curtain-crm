'use client';

import type { ReactElement } from 'react';
import { ROLE_LABELS_RU } from '@curtain-crm/shared';
import { Bell, CalendarDays, ChevronDown, Menu } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useAuth } from '@/components/providers/AuthProvider';
import { trpc } from '@/lib/trpc';
import { cn, formatDate, initials } from '@/lib/utils';

import { pageTitle } from './navigation';

/**
 * Верхняя панель: заголовок раздела, текущая дата, уведомления и профиль.
 *
 * Счётчик непрочитанных берётся из `notifications.unreadCount` и обновляется
 * раз в минуту: чаще незачем, а бейдж, отстающий на день, бесполезен.
 */
export function Header({
  onToggleSidebar,
}: {
  readonly onToggleSidebar: () => void;
}): ReactElement {
  const pathname = usePathname();
  const { user } = useAuth();

  const unreadQuery = trpc.notifications.unreadCount.useQuery(undefined, {
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const unread = unreadQuery.data ?? 0;
  const primaryRole = user?.roles[0];

  return (
    /*
      ШАПКА — ФИРМЕННОЙ ХВОИ, как в мобильном приложении.

      Была светлой: зелень оставалась только в узкой полосе меню слева, и
      панель выглядела чужой рядом с телефоном, где верх экрана зелёный. Тут
      же обнаруживалось и второе: светлая шапка на льняном фоне ничем от него
      не отличалась, и страница начиналась без начала — латунную линию под
      ней пришлось заводить как раз поэтому.

      Тёмный верх решает оба: меню и шапка складываются в единую фирменную
      рамку, а лист содержимого внутри неё виден сразу. Латунная линия
      осталась — теперь она отделяет рамку от листа, а не спасает границу.
    */
    <header className="glass-nav sticky top-0 z-20 flex h-16 shrink-0 items-center gap-4 px-4 shadow-[0_1px_0_rgb(var(--brass)_/_0.45)]">
      <button
        type="button"
        onClick={onToggleSidebar}
        aria-label="Свернуть меню"
        className="grid h-9 w-9 place-items-center rounded-tile text-nav-text/75 transition-colors hover:bg-white/10 hover:text-nav-text"
      >
        <Menu className="h-[18px] w-[18px]" />
      </button>

      <h1 className="truncate font-display text-title text-nav-text">
        {pageTitle(pathname)}
      </h1>

      <div className="ml-auto flex items-center gap-2">
        {/* Текущая дата — на макете она в шапке рядом с выбором периода */}
        {/* На тёмной шапке плашки держатся не рамкой, а осветлением. */}
        <span className="hidden items-center gap-2 rounded-tile bg-white/10 px-3 py-1.5 text-caption text-nav-text/85 md:flex">
          <CalendarDays className="h-4 w-4 text-brass" />
          {formatDate(new Date())}
        </span>

        <Link
          href="/notifications"
          aria-label={`Уведомления${unread > 0 ? `, непрочитанных: ${unread.toString()}` : ''}`}
          className="relative grid h-9 w-9 place-items-center rounded-tile text-nav-text/75 transition-colors hover:bg-white/10 hover:text-nav-text"
        >
          <Bell className="h-[18px] w-[18px]" />
          {unread > 0 && (
            <span
              className={cn(
                'absolute -right-0.5 -top-0.5 grid min-w-[18px] place-items-center rounded-full',
                /*
                  `text-on-accent`, а не `text-white`: токен означает «подпись
                  на сплошной заливке» и переворачивается вместе со схемой.
                  В тёмной `--danger` светлый (#E8757F), и белая цифра на нём
                  дала бы 2,2:1 — счётчик непрочитанных попросту исчез бы.
                  Имя токена по главному потребителю (кнопке), роль общая.
                */
                'bg-danger px-1 text-overline font-semibold leading-[18px] text-on-accent',
              )}
            >
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </Link>

        <div className="flex items-center gap-2 rounded-tile bg-white/10 px-2 py-1.5">
          <span
            aria-hidden
            className="grid h-7 w-7 place-items-center rounded-full bg-brass/25 text-overline font-semibold text-nav-text"
          >
            {user === null ? '—' : initials(user.fullName)}
          </span>
          <span className="hidden min-w-0 leading-tight sm:block">
            <span className="block truncate text-caption text-nav-text">
              {user?.fullName ?? '—'}
            </span>
            <span className="block truncate text-overline text-nav-text/60">
              {primaryRole === undefined ? 'Design House' : ROLE_LABELS_RU[primaryRole]}
            </span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-nav-text/60" aria-hidden />
        </div>
      </div>
    </header>
  );
}
