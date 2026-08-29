'use client';

import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';

import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { cn } from '@/lib/utils';
import {
  applyTheme,
  DEFAULT_THEME,
  readStoredTheme,
  storeTheme,
  THEME_INFO,
  THEMES,
  type Theme,
} from '@/lib/theme';

/**
 * Выбор светлой или тёмной схемы.
 *
 * Применяется сразу, без кнопки «Сохранить»: результат виден на этой же
 * странице, и подтверждать нечего — выбор всегда обратим следующим нажатием.
 */

const THEME_ICONS: Readonly<Record<Theme, LucideIcon>> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
};

export function ThemePicker(): ReactElement {
  /**
   * Начальное значение — по умолчанию, а не из хранилища.
   *
   * Серверная отрисовка про `localStorage` не знает, и если прочитать его
   * прямо здесь, разметка сервера и клиента разойдутся. Настоящее значение
   * подставляется в эффекте, уже на клиенте. Саму схему к этому моменту уже
   * применил загрузочный скрипт в `<head>` — вспышки не будет.
   */
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);

  useEffect(() => {
    setTheme(readStoredTheme());
  }, []);

  const choose = (next: Theme): void => {
    setTheme(next);
    applyTheme(next);
    storeTheme(next);
  };

  return (
    <Card>
      <CardHeader title="Светлая и тёмная схема" icon={<Sun className="h-4 w-4" />} level={3} />
      <CardBody>
        <p className="mb-3 text-caption text-secondary">
          Тёмная схема — не перевёрнутая светлая: у неё свои цвета этапов и своя
          подпись на кнопках. Оформление («Хвоя», «Сумерки», «Терракота») при
          смене схемы сохраняется.
        </p>

        <div role="radiogroup" aria-label="Схема" className="grid gap-2 sm:grid-cols-3">
          {THEMES.map((value) => {
            const info = THEME_INFO[value];
            const Icon = THEME_ICONS[value];
            const active = theme === value;

            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => {
                  choose(value);
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
                    'grid h-9 w-9 shrink-0 place-items-center rounded-tile',
                    active ? 'bg-accent text-on-accent' : 'bg-raised text-secondary',
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>

                <span className="min-w-0">
                  <span className="block text-caption font-medium text-primary">{info.label}</span>
                  <span className="block text-footnote leading-snug text-muted">{info.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      </CardBody>
    </Card>
  );
}
