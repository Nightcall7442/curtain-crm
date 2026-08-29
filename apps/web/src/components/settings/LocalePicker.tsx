'use client';

import { LOCALE_INFO, LOCALES } from '@curtain-crm/shared';
import { Languages } from 'lucide-react';
import type { ReactElement } from 'react';

import { useLocale } from '@/components/providers/LocaleProvider';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { cn } from '@/lib/utils';

/**
 * Выбор языка интерфейса.
 *
 * Названия языков написаны НА САМИХ ЯЗЫКАХ. Тот, кто ищет узбекский, ищет
 * слово «O'zbekcha»: если панель сейчас на языке, которого он не знает,
 * переведённое название языка ему ничем не поможет.
 */
export function LocalePicker(): ReactElement {
  const { locale, setLocale } = useLocale();

  return (
    <Card>
      <CardHeader
        title="Язык интерфейса"
        icon={<Languages className="h-4 w-4" />}
        level={3}
      />
      <CardBody>
        <p className="mb-3 text-caption text-secondary">
          Меняет подписи в панели. Данные заказов — имена клиентов, адреса,
          комментарии — остаются на том языке, на котором их ввели.
        </p>

        <div role="radiogroup" aria-label="Язык интерфейса" className="grid gap-2 sm:grid-cols-2">
          {LOCALES.map((value) => {
            const info = LOCALE_INFO[value];
            const active = locale === value;

            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                lang={value}
                onClick={() => {
                  setLocale(value);
                }}
                className={cn(
                  'pressable flex items-center gap-3 rounded-panel border p-3 text-left',
                  active
                    ? 'border-accent bg-accent-soft'
                    : 'border-subtle bg-panel hover:border-strong hover:bg-raised/60',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'grid h-9 w-9 shrink-0 place-items-center rounded-tile text-caption font-semibold uppercase',
                    active ? 'bg-accent text-on-accent' : 'bg-raised text-secondary',
                  )}
                >
                  {value}
                </span>

                <span className="min-w-0">
                  <span className="block text-caption font-medium text-primary">{info.label}</span>
                  <span className="block text-footnote leading-snug text-muted">
                    {info.englishName}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </CardBody>
    </Card>
  );
}
