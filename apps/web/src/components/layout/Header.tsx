'use client';

import type { ReactElement } from 'react';

import { ROLE_LABELS_RU } from '@curtain-crm/shared';
import { Bell, CalendarDays, ChevronDown, LogOut, Menu, Moon, Search, Settings, Sun } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

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
  const { user, logout } = useAuth();

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
        className="grid h-9 w-9 place-items-center rounded-full text-secondary transition-colors hover:bg-ink/10 hover:text-primary"
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
        className="mx-auto hidden h-10 w-full max-w-[420px] items-center gap-2 rounded-full border border-ink/10 bg-ink/[0.05] px-4 text-caption text-muted transition-colors hover:border-accent/30 hover:bg-ink/[0.08] md:flex"
      >
        <Search className="h-4 w-4 shrink-0" aria-hidden />
        <span className="truncate">Поиск по заказам, сотрудникам, разделам</span>
        <kbd className="ml-auto hidden rounded-md border border-ink/10 px-1.5 text-overline text-muted lg:block">
          Ctrl K
        </kbd>
      </button>

      <div className="ml-auto flex items-center gap-2 md:ml-0">
        <span className="hidden items-center gap-2 rounded-full border border-ink/10 bg-ink/[0.05] px-3 py-2 text-caption text-secondary lg:flex">
          <CalendarDays className="h-4 w-4 text-accent" />
          {formatDate(new Date())}
        </span>

        <Link
          href="/notifications"
          aria-label={`Уведомления${unread > 0 ? `, непрочитанных: ${unread.toString()}` : ''}`}
          className="relative grid h-10 w-10 place-items-center rounded-full border border-ink/10 bg-ink/[0.05] text-secondary transition-colors hover:bg-ink/10 hover:text-primary"
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

        <UserMenu
          name={user?.fullName ?? '—'}
          role={primaryRole === undefined ? 'Design House' : ROLE_LABELS_RU[primaryRole]}
          onLogout={logout}
        />
      </div>
    </header>
  );
}

/**
 * Меню человека: пилюля с аватаром раскрывает личные настройки, уведомления
 * и выход. Закрывается по клику мимо, по Escape и по переходу.
 */
function UserMenu({
  name,
  role,
  onLogout,
}: {
  readonly name: string;
  readonly role: string;
  readonly onLogout: () => void;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent): void => {
      if (root.current !== null && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const itemClass =
    'flex items-center gap-2.5 rounded-xl px-3 py-2 text-caption text-secondary transition-colors hover:bg-ink/[0.08] hover:text-primary';

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Меню профиля"
        onClick={() => {
          setOpen((value) => !value);
        }}
        className={cn(
          'pressable flex items-center gap-2 rounded-full border border-ink/10 bg-ink/[0.05] py-1 pl-1 pr-3 transition-colors hover:bg-ink/10',
          open && 'bg-ink/10',
        )}
      >
        <span
          aria-hidden
          className="grid h-8 w-8 place-items-center rounded-full bg-accent/20 text-overline font-semibold text-accent"
        >
          {name === '—' ? '—' : initials(name)}
        </span>
        <span className="hidden min-w-0 leading-tight text-left sm:block">
          <span className="block truncate text-caption font-medium text-primary">{name}</span>
          <span className="block truncate text-footnote text-muted">{role}</span>
        </span>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-muted transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      </button>

      {open && (
        <div
          role="menu"
          /*
            Почти сплошная подложка: меню висит внутри стеклянной шапки, а
            вложенный `backdrop-filter` размывает только её содержимое, не
            страницу под ней, — и сквозь прозрачное меню читался бы текст.
          */
          className="surface-card absolute right-0 top-full z-30 mt-2 w-60 bg-panel/95 p-1.5 shadow-2xl"
        >
          <div className="px-3 pb-2 pt-1.5 sm:hidden">
            <p className="truncate text-caption font-medium text-primary">{name}</p>
            <p className="truncate text-footnote text-muted">{role}</p>
          </div>
          <Link
            href="/settings#personal"
            role="menuitem"
            className={itemClass}
            onClick={() => {
              setOpen(false);
            }}
          >
            <Settings className="h-4 w-4" aria-hidden />
            Личные настройки
          </Link>
          <Link
            href="/notifications"
            role="menuitem"
            className={itemClass}
            onClick={() => {
              setOpen(false);
            }}
          >
            <Bell className="h-4 w-4" aria-hidden />
            Уведомления
          </Link>
          <div className="my-1 h-px bg-ink/[0.08]" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
            className={cn(itemClass, 'w-full text-danger hover:text-danger')}
          >
            <LogOut className="h-4 w-4" aria-hidden />
            Выйти
          </button>
        </div>
      )}
    </div>
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
      className="hidden items-center gap-1 rounded-full border border-ink/10 bg-ink/[0.05] p-1 sm:flex"
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
