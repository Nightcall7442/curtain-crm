'use client';

import { Camera } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { cn, initials } from '@/lib/utils';

export type PersonPhotoVariant = 'card' | 'podium' | 'tv' | 'drawer';

/** Монограмма без фото: на ТВ кегль растёт с экраном, в остальных — по шкале панели. */
const MONOGRAM: Readonly<Record<PersonPhotoVariant, string>> = {
  card: 'h-14 w-14 text-heading',
  podium: 'h-12 w-12 text-subhead',
  tv: 'h-[clamp(44px,4.2vw,104px)] w-[clamp(44px,4.2vw,104px)] text-[clamp(16px,1.6vw,38px)]',
  drawer: 'h-20 w-20 text-title',
};

/**
 * Фото сотрудника на табло — или место под него.
 *
 * Размер и форму задаёт родитель (`className`): полоса карточки, арка
 * пьедестала, кадр боковой панели. Кадр — по верхней трети: в широкой полосе
 * и в узкой арке лицо остаётся в кадре, а не уезжает под край.
 *
 * Обычный `<img>`, а не `next/image`, — как в `Avatar`: адрес из хранилища
 * подписан и меняется с драйвером. Ссылка табло живёт в пределах часа, и
 * опрос раз в 20 секунд берёт фото из кэша браузера. Не открылось фото
 * (удалено, истекла подпись) — показываем место под него: сломанная
 * картинка браузера на табло выглядит поломкой табло.
 */
export function PersonPhoto({
  name,
  photoUrl,
  variant,
  dimmed = false,
  className,
}: {
  readonly name: string;
  readonly photoUrl: string | null;
  readonly variant: PersonPhotoVariant;
  /** Человек не на работе: фото приглушено. */
  readonly dimmed?: boolean;
  readonly className?: string;
}): ReactElement {
  // Запоминаем адрес, который не открылся: новый адрес (фото заменили) пробуем заново.
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  const showPhoto = photoUrl !== null && photoUrl !== brokenUrl;
  // Поверх полосы карточки и ТВ лежат место и статус: затемнение краёв держит их читаемыми.
  const shaded = variant === 'card' || variant === 'tv';

  return (
    <div className={cn('relative overflow-hidden bg-raised', className)}>
      {showPhoto ? (
        <>
          <img
            src={photoUrl}
            alt={name}
            loading="lazy"
            decoding="async"
            onError={() => {
              setBrokenUrl(photoUrl);
            }}
            className={cn(
              'h-full w-full object-cover object-[50%_30%] transition-[filter] duration-300',
              dimmed && 'grayscale-[0.7]',
            )}
          />
          {shaded && (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgb(0_0_0/0.22),transparent_38%,transparent_60%,rgb(0_0_0/0.38))]"
            />
          )}
        </>
      ) : (
        <div
          role="img"
          aria-label={`${name}: фото не загружено`}
          className="photo-hatch flex h-full w-full flex-col items-center justify-center gap-2"
        >
          <span
            className={cn(
              'grid shrink-0 place-items-center rounded-full bg-ink/10 font-semibold tracking-wide text-secondary',
              MONOGRAM[variant],
            )}
          >
            {initials(name)}
          </span>
          {variant !== 'podium' && (
            <span
              className={cn(
                'inline-flex items-center gap-1.5 text-muted',
                variant === 'tv' ? 'text-[clamp(11px,0.75vw,18px)]' : 'text-footnote',
              )}
            >
              <Camera aria-hidden className="h-3.5 w-3.5" />
              Фото не загружено
            </span>
          )}
        </div>
      )}
    </div>
  );
}
