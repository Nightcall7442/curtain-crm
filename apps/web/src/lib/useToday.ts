import { todayIso } from '@curtain-crm/shared';
import { useEffect, useState } from 'react';

/** Как часто сверять дату, пока вкладка открыта: полночь не пропустить. */
const CHECK_EVERY_MS = 60_000;

/**
 * Сегодняшняя дата `YYYY-MM-DD`, которая сама меняется в полночь.
 *
 * Вкладку с кассой держат открытой днями: дата, запомненная при открытии,
 * наутро показывала бы вчерашний день. Дата сверяется при возврате на
 * вкладку и раз в минуту; одинаковая строка перерисовки не вызывает.
 */
export function useToday(): string {
  const [today, setToday] = useState(() => todayIso());

  useEffect(() => {
    const refresh = (): void => {
      setToday(todayIso());
    };
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(refresh, CHECK_EVERY_MS);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
    };
  }, []);

  return today;
}
