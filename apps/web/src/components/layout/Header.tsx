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
    <header className="glass-light sticky top-0 z-20 flex h-16 shrink-0 items-center gap-4 border-b border-subtle px-4">
      <button
        type="button"
        onClick={onToggleSidebar}
        aria-label="Свернуть меню"
        className="grid h-9 w-9 place-items-center rounded-tile text-secondary transition-colors hover:bg-raised hover:text-primary"
      >
        <Menu className="h-[18px] w-[18px]" />
      </button>

      <h1 className="truncate font-display text-title text-primary">
        {pageTitle(pathname)}
      </h1>

      <div className="ml-auto flex items-center gap-2">
        {/* Текущая дата — на макете она в шапке рядом с выбором периода */}
        <span className="hidden items-center gap-2 rounded-tile border border-subtle bg-panel px-3 py-1.5 text-caption text-secondary md:flex">
          <CalendarDays className="h-4 w-4 text-accent" />
          {formatDate(new Date())}
        </span>

        <Link
          href="/notifications"
          aria-label={`Уведомления${unread > 0 ? `, непрочитанных: ${unread.toString()}` : ''}`}
          className="relative grid h-9 w-9 place-items-center rounded-tile text-secondary transition-colors hover:bg-raised hover:text-primary"
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

        <div className="flex items-center gap-2 rounded-tile border border-subtle bg-panel px-2 py-1.5">
          <span
            aria-hidden
            className="grid h-7 w-7 place-items-center rounded-full bg-accent-soft text-overline font-semibold text-accent"
          >
            {user === null ? '—' : initials(user.fullName)}
          </span>
          <span className="hidden min-w-0 leading-tight sm:block">
            <span className="block truncate text-caption text-primary">
              {user?.fullName ?? '—'}
            </span>
            <span className="block truncate text-overline text-muted">
              {primaryRole === undefined ? 'Design House' : ROLE_LABELS_RU[primaryRole]}
            </span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted" aria-hidden />
        </div>
      </div>
    </header>
  );
}
