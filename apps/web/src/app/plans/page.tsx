'use client';

import {
  CalendarRange,
  FileText,
  GraduationCap,
  Package,
  Target,
  TrendingUp,
  UserSquare,
  type LucideIcon,
} from 'lucide-react';
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
 *
 * Списка два, и разделены они не для красоты: у первых четырёх есть
 * страница-объяснение, у последних трёх нет вообще ничего. Молча держать
 * их в одном списке значило бы обещать переход, которого нет, а не
 * упоминать вовсе — прятать от заказчика треть невыполненной работы.
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

/** Домены, к которым ещё не приступали: страницы-объяснения у них нет. */
const NOT_STARTED: readonly {
  readonly label: string;
  readonly icon: LucideIcon;
  readonly summary: string;
}[] = [
  {
    label: 'Календарь',
    icon: CalendarRange,
    summary: 'Расписание замеров и установок одной сеткой — сейчас сроки видны только в заказах.',
  },
  {
    label: 'Документы',
    icon: FileText,
    summary: 'Договоры и акты — сейчас система хранит только фотографии по стадиям заказа.',
  },
  {
    label: 'KPI',
    icon: Target,
    summary:
      'Отдельная панель показателей. Частично закрыта разделом «Рейтинг»: там считается брак, ' +
      'выработка и своевременность по фактическим заказам.',
  },
];

export default function PlansPage(): ReactElement {
  return (
    <Card>
      <CardHeader title="Разделы в планах" />
      <CardBody>
        <p className="mb-4 max-w-prose text-caption text-secondary">
          Эти домены решено достроить. Каждый раздел честно описывает, каких данных
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

        <p className="mb-3 mt-6 max-w-prose text-caption text-secondary">
          К этим ещё не приступали — открыть пока нечего, поэтому они здесь просто названы:
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {NOT_STARTED.map((entry) => {
            const Icon = entry.icon;
            return (
              <div
                key={entry.label}
                className="flex items-start gap-3 rounded-tile border border-dashed border-subtle bg-base/20 p-4"
              >
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-muted" aria-hidden />
                <span>
                  <span className="block font-medium text-secondary">{entry.label}</span>
                  <span className="mt-0.5 block text-footnote text-muted">{entry.summary}</span>
                </span>
              </div>
            );
          })}
        </div>
      </CardBody>
    </Card>
  );
}
