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
        'flex h-full flex-col border-r border-subtle bg-sidebar transition-[width] duration-200',
        collapsed ? 'w-[68px]' : 'w-[228px]',
      )}
    >
      {/* Логотип */}
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-subtle px-4">
        <span
          aria-hidden
          className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-gold-dim font-serif text-sm font-bold text-gold"
        >
          DH
        </span>
        {!collapsed && (
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-semibold tracking-[0.18em] text-gold-soft">
              DESIGN HOUSE
            </span>
            <span className="block truncate text-[10px] tracking-wide text-muted">
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
                    'group relative flex items-center gap-3 rounded-md px-3 py-2 text-[13px] transition-colors',
                    active
                      ? 'bg-raised text-gold-soft'
                      : 'text-secondary hover:bg-raised/60 hover:text-primary',
                  )}
                >
                  {/* Золотая метка активного пункта — как на макете */}
                  {active && (
                    <span
                      aria-hidden
                      className="absolute inset-y-1 left-0 w-[3px] rounded-r bg-gold"
                    />
                  )}
                  <Icon className={cn('h-[18px] w-[18px] shrink-0', active && 'text-gold')} />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                  {!collapsed && item.stub === true && (
                    <span className="ml-auto rounded bg-strong/60 px-1.5 py-px text-[9px] uppercase tracking-wide text-muted">
                      скоро
                    </span>
                  )}
                </Link>

                {/* Вложенные пункты раскрываются только у активного раздела */}
                {!collapsed && hasChildren && active && (
                  <ul className="mt-0.5 space-y-0.5 border-l border-subtle pl-3 ml-5">
                    {item.children?.map((child) => {
                      const childActive = pathname === child.href;
                      return (
                        <li key={child.href}>
                          <Link
                            href={child.href}
                            onClick={onNavigate}
                            aria-current={childActive ? 'page' : undefined}
                            className={cn(
                              'block rounded px-3 py-1.5 text-[12.5px] transition-colors',
                              childActive
                                ? 'text-gold-soft'
                                : 'text-muted hover:text-primary',
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
      <div className="shrink-0 border-t border-subtle p-2">
        <button
          type="button"
          onClick={logout}
          title={collapsed ? 'Выйти' : undefined}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-[13px] text-secondary transition-colors hover:bg-raised/60 hover:text-danger"
        >
          <LogOut className="h-[18px] w-[18px] shrink-0" />
          {!collapsed && <span>Выйти</span>}
        </button>
      </div>
    </aside>
  );
}
