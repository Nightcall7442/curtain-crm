'use client';

import type { ReactElement } from 'react';
import { LogOut } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useAuth } from '@/components/providers/AuthProvider';
import { cn } from '@/lib/utils';

import { isNavItemActive, visibleNavigation } from './navigation';

/**
 * Боковое меню.
 *
 * Состав пунктов зависит от ролей сотрудника — см. `navigation.ts`.
 * Свёрнутое состояние (`collapsed`) оставляет только иконки: в цехе панель
 * открывают на ноутбуках с узкими экранами.
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
        'glass-nav glass-edge flex h-full flex-col transition-[width] duration-200',
        collapsed ? 'w-[68px]' : 'w-[228px]',
      )}
    >
      {/* Логотип */}
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-white/10 px-4">
        <span
          aria-hidden
          className="grid h-9 w-9 shrink-0 place-items-center rounded-tile bg-accent-bright font-display text-heading text-on-accent"
        >
          DH
        </span>
        {!collapsed && (
          <span className="min-w-0">
            <span className="block truncate font-display text-subhead tracking-[0.01em] text-nav-text">
              Design House
            </span>
            <span className="block truncate text-overline tracking-[0.04em] text-nav-text/55">
              шторы премиум класса
            </span>
          </span>
        )}
      </div>

      {/* Пункты меню */}
      <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Основная навигация">
        <ul className="space-y-0.5">
          {items.map((item) => {
            const active = isNavItemActive(item, pathname);
            const Icon = item.icon;
            const hasChildren = item.children !== undefined && item.children.length > 0;

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  title={collapsed ? item.label : undefined}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'pressable group relative flex items-center gap-3 rounded-tile px-3 py-2 text-caption',
                    active
                      ? 'bg-white/12 text-nav-text'
                      : 'text-nav-text/70 hover:bg-white/[0.07] hover:text-nav-text',
                  )}
                >
                  {/* Зелёная метка активного пункта */}
                  {active && (
                    <span
                      aria-hidden
                      className="absolute inset-y-1.5 left-0 w-[3px] rounded-r bg-accent-bright"
                    />
                  )}
                  <Icon
                    className={cn(
                      'h-[18px] w-[18px] shrink-0',
                      active && 'text-accent-bright',
                    )}
                  />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                  {!collapsed && item.stub === true && (
                    <span className="ml-auto rounded-full border border-white/20 px-2 py-px text-overline uppercase tracking-[0.08em] text-nav-text/55">
                      скоро
                    </span>
                  )}
                </Link>

                {/* Вложенные пункты раскрываются только у активного раздела */}
                {!collapsed && hasChildren && active && (
                  <ul className="mt-0.5 space-y-0.5 border-l border-white/15 pl-3 ml-5">
                    {item.children?.map((child) => {
                      const childActive = pathname === child.href;
                      return (
                        <li key={child.href}>
                          <Link
                            href={child.href}
                            onClick={onNavigate}
                            aria-current={childActive ? 'page' : undefined}
                            className={cn(
                              'block rounded px-3 py-1.5 text-caption transition-colors',
                              childActive
                                ? 'text-accent-bright'
                                : 'text-nav-text/55 hover:text-nav-text',
                            )}
                          >
                            {child.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Выход */}
      <div className="shrink-0 border-t border-white/10 p-2">
        <button
          type="button"
          onClick={logout}
          title={collapsed ? 'Выйти' : undefined}
          className="pressable flex w-full items-center gap-3 rounded-tile px-3 py-2 text-caption text-nav-text/70 hover:bg-white/[0.07] hover:text-nav-text"
        >
          <LogOut className="h-[18px] w-[18px] shrink-0" />
          {!collapsed && <span>Выйти</span>}
        </button>
      </div>
    </aside>
  );
}
