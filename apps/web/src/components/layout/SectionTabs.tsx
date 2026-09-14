'use client';

import type { ReactElement } from 'react';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useAuth } from '@/components/providers/AuthProvider';
import { cn } from '@/lib/utils';

import { isNavItemActive, visibleNavigation } from './navigation';

/**
 * Вложенные разделы («Рабочие» → Сотрудники, Табель…) — рядом пилюль над
 * содержимым. Рейка слева их не вмещает, а в шапке им не место: они про
 * раздел, а не про панель. Рисуется только там, где вложенные пункты есть.
 */
export function SectionTabs(): ReactElement | null {
  const pathname = usePathname();
  const { user } = useAuth();
  const section = visibleNavigation(user?.roles ?? []).find(
    (item) => item.children !== undefined && item.children.length > 0 && isNavItemActive(item, pathname),
  );

  if (section?.children === undefined) return null;

  return (
    <nav aria-label={section.label} className="flex flex-wrap gap-1.5">
      {section.children.map((child) => {
        const active = pathname === child.href;
        return (
          <Link
            key={child.href}
            href={child.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'pressable rounded-full border px-3.5 py-1.5 text-caption font-medium transition-colors',
              active
                ? 'border-accent/40 bg-accent/15 text-accent'
                : 'border-ink/10 bg-ink/[0.04] text-secondary hover:bg-ink/[0.09] hover:text-primary',
            )}
          >
            {child.label}
          </Link>
        );
      })}
    </nav>
  );
}
