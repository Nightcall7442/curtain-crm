'use client';

import { GraduationCap, Package, TrendingUp, UserSquare, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import type { ReactElement } from 'react';

import { Card, CardBody, CardHeader } from '@/components/ui/Card';

/**
 * «В планах» — один пункт меню вместо четырёх строк «скоро».
 *
 * Решение достроить эти домены принято заказчиком (28.08), и страницы-
 * объяснения под каждый остаются: они честно перечисляют, чего не хватает
 * в системе, вместо правдоподобных выдуманных цифр. Но держать под них
 * четыре пункта меню — слишком дорогая цена за напоминание: они съедали
 * пятую часть навигации, ничего не делая.
 */

const PLANNED: readonly {
  readonly href: string;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly summary: string;
}[] = [
  {
    href: '/clients',
    label: 'Клиенты',
    icon: UserSquare,
    summary: 'История обращений и повторные продажи — сейчас имя и телефон живут в заказе.',
  },
  {
    href: '/sales',
    label: 'Продажи',
    icon: TrendingUp,
    summary: 'Воронка и конверсия — сейчас нет учёта обращений, делить закрытые заказы не на что.',
  },
  {
    href: '/warehouse',
    label: 'Склад тканей',
    icon: Package,
    summary: 'Остатки и списание при раскрое — складского учёта в системе пока нет.',
  },
  {
    href: '/training',
    label: 'Обучение',
    icon: GraduationCap,
    summary: 'Материалы и аттестации для новых сотрудников.',
  },
];

export default function PlansPage(): ReactElement {
  return (
    <Card>
      <CardHeader title="Разделы в планах" />
      <CardBody>
        <p className="mb-4 max-w-prose text-caption text-secondary">
          Эти четыре домена решено достроить. Каждый раздел честно описывает, каких данных
          и учёта ему не хватает, — это план работ, а не выдуманные цифры.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {PLANNED.map((entry) => {
            const Icon = entry.icon;
            return (
              <Link
                key={entry.href}
                href={entry.href}
                className="card-link group flex items-start gap-3 rounded-tile border border-subtle bg-base/40 p-4 transition-colors hover:bg-raised/50"
              >
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-accent-muted" aria-hidden />
                <span>
                  <span className="block font-medium text-primary group-hover:text-accent">
                    {entry.label}
                  </span>
                  <span className="mt-0.5 block text-footnote text-muted">{entry.summary}</span>
                </span>
              </Link>
            );
          })}
        </div>
      </CardBody>
    </Card>
  );
}
