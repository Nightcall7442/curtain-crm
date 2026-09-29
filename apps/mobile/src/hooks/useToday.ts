import { todayIso } from '@curtain-crm/shared';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/** Как часто сверять дату, пока приложение открыто: полночь не пропустить. */
const CHECK_EVERY_MS = 60_000;

/**
 * Сегодняшняя дата `YYYY-MM-DD`, которая сама меняется в полночь.
 *
 * Экран, запомнивший дату при открытии, живёт дольше дня: приложение
 * сворачивают, а не закрывают, и касса, открытая вчера, наутро продолжала
 * бы показывать вчерашний день под заголовком «сегодня». Здесь дата
 * сверяется при возврате в приложение и раз в минуту, пока оно открыто;
 * одинаковая строка перерисовки не вызывает.
 */
export function useToday(): string {
  const [today, setToday] = useState(() => todayIso());

  useEffect(() => {
    const refresh = (): void => {
      setToday(todayIso());
    };
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    const timer = setInterval(refresh, CHECK_EVERY_MS);
    return () => {
      subscription.remove();
      clearInterval(timer);
    };
  }, []);

  return today;
}
