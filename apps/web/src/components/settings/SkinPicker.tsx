'use client';

import { Check, Palette } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';

import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { cn } from '@/lib/utils';
import { applySkin, readStoredSkin, SKIN_INFO, SKINS, storeSkin, type Skin } from '@/lib/skin';

/**
 * Выбор оформления панели.
 *
 * Переключатель — образцы цвета, а не выпадающий список: оформление выбирают
 * глазами, и название «Индиго» ничего не сообщает тому, кто не знает, как
 * этот индиго выглядит.
 *
 * Применяется сразу, без кнопки «Сохранить»: результат виден на этой же
 * странице, и подтверждать нечего — выбор всегда обратим следующим нажатием.
 */
export function SkinPicker(): ReactElement {
  /**
   * Начальное значение — по умолчанию, а не из хранилища.
   *
   * Серверная отрисовка про `localStorage` не знает, и если прочитать его
   * прямо здесь, разметка сервера и клиента разойдутся — React ругается на
   * несовпадение и перерисовывает поддерево. Настоящее значение подставляется
   * в эффекте, уже на клиенте.
   */
  const [skin, setSkin] = useState<Skin>('forest');

  useEffect(() => {
    setSkin(readStoredSkin());
  }, []);

  const choose = (next: Skin): void => {
    setSkin(next);
    applySkin(next);
    storeSkin(next);
  };

  return (
    <Card>
      <CardHeader title="Оформление панели" icon={<Palette className="h-4 w-4" />} level={3} />
      <CardBody>
        <p className="mb-3 text-caption text-secondary">
          Выбор сохраняется в этом браузере и не влияет на других сотрудников: освещение
          в кабинете и в цехе разное, и навязывать всем один акцент незачем.
        </p>

        <div
          role="radiogroup"
          aria-label="Оформление панели"
          className="grid gap-2 sm:grid-cols-3"
        >
          {SKINS.map((value) => {
            const info = SKIN_INFO[value];
            const active = skin === value;

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
                {/*
                  Образец берёт цвет из переменной, посвящённой ИМЕННО этому
                  скину (`--swatch-forest` и соседние), а не из `--accent`:
                  тот содержит цвет текущего оформления, а не предлагаемого.

                  Заодно это решает тёмную схему: переменные образцов в ней
                  переопределены, и кнопка показывает светлый акцент — ровно
                  тот, который включится по нажатию.
                */}
                <span
                  aria-hidden
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-tile"
                  style={{ backgroundColor: `var(--swatch-${value})` }}
                >
                  {active && <Check className="h-4 w-4 text-on-accent" />}
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
