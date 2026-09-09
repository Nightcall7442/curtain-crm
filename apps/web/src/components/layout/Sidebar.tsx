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
      {/*
        Шапка меню — фирменный знак, а не квадрат с буквами «DH».

        Знак нарисован, им подписаны вывеска, лендинг и экран входа; в панели
        вместо него стояла заглушка из двух букв, и панель выглядела сервисом,
        купленным отдельно от мастерской. Развёрнутое меню показывает знак
        целиком — вместе с набранным в нём названием, поэтому подпись рядом
        больше не нужна и снята: одно и то же слово дважды в одной строке.

        Свёрнутое меню шириной 68 точек знак целиком не вмещает — там
        остаются инициалы: они читаются и в 28 точках, чего о полном
        начертании сказать нельзя.

        Картинка кладётся МАСКОЙ по цвету текста навигации: один файл
        работает и на тёмной панели, и на светлой, и перекрашивается вместе
        со схемой — вместо двух версий логотипа под каждую тему.
      */}
      <div className="flex h-16 shrink-0 items-center border-b border-white/10 px-4">
        {collapsed ? (
          <span
            aria-hidden
            className="grid h-9 w-9 shrink-0 place-items-center rounded-tile bg-accent-bright font-display text-heading text-on-accent"
          >
            DH
          </span>
        ) : (
          <span
            role="img"
            aria-label="Design House — шторы премиум класса"
            className="block h-10 w-[150px] bg-nav-text"
            style={{
              WebkitMaskImage: 'url(/logo.png)',
              maskImage: 'url(/logo.png)',
              WebkitMaskSize: 'contain',
              maskSize: 'contain',
              WebkitMaskRepeat: 'no-repeat',
              maskRepeat: 'no-repeat',
              WebkitMaskPosition: 'left center',
              maskPosition: 'left center',
            }}
          />
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
                  {/*
                    Метка активного пункта — латунная.

                    Зелёная стояла на зеленоватой подсветке строки: два
                    близких зелёных друг на друге давали мутное пятно вместо
                    отметки. Латунь — единственный второй цвет системы, и
                    здесь она делает ровно то, для чего заведена: отмечает
                    место, где человек сейчас находится.
                  */}
                  {active && (
                    <span
                      aria-hidden
                      className="absolute inset-y-1.5 left-0 w-[3px] rounded-r bg-brass"
                    />
                  )}
                  <Icon
                    className={cn(
                      'h-[18px] w-[18px] shrink-0',
                      active && 'text-brass',
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
