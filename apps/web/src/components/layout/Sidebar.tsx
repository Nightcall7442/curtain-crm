'use client';

import type { ReactElement } from 'react';

import { LogOut } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useAuth } from '@/components/providers/AuthProvider';
import { cn } from '@/lib/utils';

import { isNavItemActive, visibleNavigation } from './navigation';

/**
 * Боковая панель — узкая «рейка» с иконками, как на макете «Неон».
 *
 * Пункт — иконка с подписью в две строки под ней, активный — неоновая
 * плитка со свечением. Подпись остаётся: у мастерской тринадцать разделов,
 * и голая иконка «Касса» от «Склада» без неё не отличается. Свёрнутый
 * режим прячет подписи и оставляет плитки.
 *
 * Вложенные пункты («Рабочие» → Сотрудники, Табель…) здесь не рисуются:
 * рейке некуда их класть. Их показывает `SectionTabs` над содержимым — ряд
 * пилюль, как фильтры на макете.
 */
export function Sidebar({
  collapsed,
  onNavigate,
}: {
  readonly collapsed: boolean;
  readonly onNavigate?: () => void;
}): ReactElement {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const items = visibleNavigation(user?.roles ?? []);

  return (
    <aside
      className={cn(
        'glass-nav flex h-full flex-col border-r border-white/[0.06] transition-[width] duration-200',
        collapsed ? 'w-[76px]' : 'w-[96px]',
      )}
    >
      {/* Знак — неоновая плитка с монограммой: полный логотип в рейку не входит. */}
      <div className="flex h-16 shrink-0 items-center justify-center">
        <Link
          href="/dashboard"
          aria-label="Design House — на главную"
          className="grid h-10 w-10 place-items-center rounded-[14px] bg-accent font-hero text-heading font-extrabold text-on-accent shadow-[0_10px_24px_-10px_rgb(var(--accent)_/_0.8)]"
        >
          DH
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-2" aria-label="Основная навигация">
        <ul className="flex flex-col items-stretch gap-1">
          {items.map((item) => {
            const active = isNavItemActive(item, pathname);
            const Icon = item.icon;

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  title={item.label}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'pressable group flex flex-col items-center gap-1 rounded-2xl px-1 py-1.5 text-center',
                    active ? 'text-nav-text' : 'text-nav-text/60 hover:text-nav-text',
                  )}
                >
                  <span
                    className={cn(
                      'grid h-10 w-10 place-items-center rounded-[14px] transition-colors',
                      active
                        ? 'bg-accent text-on-accent shadow-[0_10px_24px_-10px_rgb(var(--accent)_/_0.9)]'
                        : 'bg-white/[0.04] group-hover:bg-white/[0.09]',
                    )}
                  >
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  {!collapsed && (
                    <span className="line-clamp-2 max-w-full px-0.5 text-[10px] font-medium leading-3 tracking-[0.01em]">
                      {item.label}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="shrink-0 px-2 pb-3 pt-2">
        <button
          type="button"
          onClick={logout}
          title="Выйти"
          className="pressable flex w-full flex-col items-center gap-1 rounded-2xl px-1 py-2 text-nav-text/60 hover:text-nav-text"
        >
          <span className="grid h-10 w-10 place-items-center rounded-[14px] bg-white/[0.04]">
            <LogOut className="h-[18px] w-[18px]" />
          </span>
          {!collapsed && <span className="text-[10px] font-medium leading-3">Выйти</span>}
        </button>
      </div>
    </aside>
  );
}
