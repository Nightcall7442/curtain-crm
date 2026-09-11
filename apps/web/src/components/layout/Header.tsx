'use client';

import type { ReactElement } from 'react';

import { ROLE_LABELS_RU } from '@curtain-crm/shared';
import { Bell, CalendarDays, ChevronDown, Menu, Moon, Search, Sun } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { useAuth } from '@/components/providers/AuthProvider';
import { applyTheme, readStoredTheme, storeTheme, type Theme } from '@/lib/theme';
import { trpc } from '@/lib/trpc';
import { cn, formatDate, initials } from '@/lib/utils';

import { pageTitle } from './navigation';

/**
 * Шапка — как на макете «Неон»: слева заголовок раздела, по центру строка
 * поиска, справа дата, уведомления и человек. Поиск — та же палитра команд,
 * что и по Ctrl+K: строка лишь делает её видимой тем, кто клавиш не знает.
 */
export function Header({
  onToggleSidebar,
  onOpenSearch,
}: {
  readonly onToggleSidebar: () => void;
  readonly onOpenSearch: () => void;
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
    <header className="glass-light sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 px-4 lg:px-6">
      <button
        type="button"
        onClick={onToggleSidebar}
        aria-label="Свернуть меню"
        className="grid h-9 w-9 place-items-center rounded-full text-secondary transition-colors hover:bg-white/10 hover:text-primary"
      >
        <Menu className="h-[18px] w-[18px]" />
      </button>

      <h1 className="truncate font-hero text-heading font-semibold tracking-[-0.01em] text-primary">
        {pageTitle(pathname)}
      </h1>

      <ThemeToggle />

      {/* Поиск — пилюля по центру, растягивается на свободное место. */}
      <button
        type="button"
        onClick={onOpenSearch}
        className="mx-auto hidden h-10 w-full max-w-[420px] items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 text-caption text-muted transition-colors hover:border-accent/30 hover:bg-white/[0.08] md:flex"
      >
        <Search className="h-4 w-4 shrink-0" aria-hidden />
        <span className="truncate">Поиск по заказам, сотрудникам, разделам</span>
        <kbd className="ml-auto hidden rounded-md border border-white/10 px-1.5 text-overline text-muted lg:block">
          Ctrl K
        </kbd>
      </button>

      <div className="ml-auto flex items-center gap-2 md:ml-0">
        <span className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-2 text-caption text-secondary lg:flex">
          <CalendarDays className="h-4 w-4 text-accent" />
          {formatDate(new Date())}
        </span>

        <Link
          href="/notifications"
          aria-label={`Уведомления${unread > 0 ? `, непрочитанных: ${unread.toString()}` : ''}`}
          className="relative grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/[0.05] text-secondary transition-colors hover:bg-white/10 hover:text-primary"
        >
          <Bell className="h-[18px] w-[18px]" />
          {unread > 0 && (
            <span
              className={cn(
                'absolute -right-1 -top-1 grid min-w-[18px] place-items-center rounded-full',
                'bg-accent px-1 text-overline font-semibold leading-[18px] text-on-accent',
              )}
            >
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </Link>

        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] py-1 pl-1 pr-3">
          <span
            aria-hidden
            className="grid h-8 w-8 place-items-center rounded-full bg-accent/20 text-overline font-semibold text-accent"
          >
            {user === null ? '—' : initials(user.fullName)}
          </span>
          <span className="hidden min-w-0 leading-tight sm:block">
            <span className="block truncate text-caption font-medium text-primary">
              {user?.fullName ?? '—'}
            </span>
            <span className="block truncate text-footnote text-muted">
              {primaryRole === undefined ? 'Design House' : ROLE_LABELS_RU[primaryRole]}
            </span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted" aria-hidden />
        </div>
      </div>
    </header>
  );
}

/**
 * Переключатель светлой/тёмной — две круглые кнопки в пилюле, как на макете.
 * Пишет тот же ключ, что и настройки: выбор один, откуда бы его ни сделали.
 */
function ThemeToggle(): ReactElement {
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    setTheme(readStoredTheme());
  }, []);

  const choose = (next: Theme): void => {
    setTheme(next);
    applyTheme(next);
    storeTheme(next);
  };

  return (
    <div
      role="group"
      aria-label="Тема"
      className="hidden items-center gap-1 rounded-full border border-white/10 bg-white/[0.05] p-1 sm:flex"
    >
      {(
        [
          ['dark', Moon, 'Тёмная'],
          ['light', Sun, 'Светлая'],
        ] as const
      ).map(([value, Icon, label]) => (
        <button
          key={value}
          type="button"
          aria-label={label}
          aria-pressed={theme === value}
          onClick={() => {
            choose(value);
          }}
          className={cn(
            'grid h-7 w-7 place-items-center rounded-full transition-colors',
            theme === value
              ? 'bg-accent text-on-accent shadow-[0_6px_14px_-6px_rgb(var(--accent)_/_0.9)]'
              : 'text-muted hover:text-primary',
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  );
}
