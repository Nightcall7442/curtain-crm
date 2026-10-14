'use client';

import { formatTime } from '@curtain-crm/shared';
import { useEffect, useState, type ReactElement } from 'react';

import { cn } from '@/lib/utils';

/** «обновлено 12 с назад»: до пяти секунд — «только что», дальше — секунды и минуты. */
function agoText(lastSuccessAt: Date, now: number): string {
  const seconds = Math.max(0, Math.round((now - lastSuccessAt.getTime()) / 1000));
  if (seconds < 5) return 'обновлено только что';
  if (seconds < 60) return `обновлено ${seconds.toString()} с назад`;
  return `обновлено ${Math.floor(seconds / 60).toString()} мин назад`;
}

/**
 * Живое ли табло: «онлайн · обновлено 12 с назад» с пульсирующей точкой или
 * «нет связи · данные от 14:02». Счётчик секунд тикает здесь, а не на всём
 * табло: перерисовывается одна строка.
 */
export function LiveIndicator({
  lastSuccessAt,
  stale,
  className,
}: {
  readonly lastSuccessAt: Date | null;
  readonly stale: boolean;
  readonly className?: string;
}): ReactElement {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const offline = stale && lastSuccessAt !== null;

  return (
    <span className={cn('inline-flex items-center gap-2 text-caption text-secondary', className)}>
      <span aria-hidden className="relative grid h-2.5 w-2.5 place-items-center">
        {!offline && lastSuccessAt !== null && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-positive/60" />
        )}
        <span
          className={cn(
            'relative inline-flex h-2 w-2 rounded-full',
            offline ? 'bg-danger' : lastSuccessAt === null ? 'bg-muted' : 'bg-positive',
          )}
        />
      </span>
      {/* Состояние связи объявляется программе чтения экрана; бегущие секунды — нет. */}
      <span role="status" className={cn(offline && 'font-medium text-danger')}>
        {lastSuccessAt === null ? 'подключение…' : offline ? 'нет связи' : 'онлайн'}
      </span>
      {lastSuccessAt !== null && (
        <span aria-hidden={!offline}>
          · {offline ? `данные от ${formatTime(lastSuccessAt)}` : agoText(lastSuccessAt, now)}
        </span>
      )}
    </span>
  );
}
