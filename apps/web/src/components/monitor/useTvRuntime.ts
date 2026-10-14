'use client';

import { TV_RELOAD_MS } from '@curtain-crm/shared';
import { useEffect, useState } from 'react';

/** Через сколько без движения мыши прятать курсор: на телевизоре он висит посреди табло. */
const CURSOR_HIDE_MS = 3000;

/**
 * Всё, что нужно экрану, который неделями висит на стене.
 *
 * - Тёмная схема всегда: в цеху светлый экран слепит и выгорает.
 * - Экран не гаснет (Screen Wake Lock), если браузер это умеет. Блокировка
 *   снимается, когда вкладку скрывают, — при возврате берём её заново.
 * - Курсор прячется через 3 секунды без движения.
 * - Раз в 6 часов страница перезагружается целиком: так табло само
 *   подхватывает новую версию сайта и не копит утечки памяти браузера ТВ.
 *
 * Возвращает `idle` — мышь давно не двигалась: кнопки поверх табло прячутся вместе с курсором.
 */
export function useTvRuntime(): { readonly idle: boolean } {
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const previous = root.getAttribute('data-theme');
    root.setAttribute('data-theme', 'dark');
    return () => {
      if (previous === null) root.removeAttribute('data-theme');
      else root.setAttribute('data-theme', previous);
    };
  }, []);

  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const request = async (): Promise<void> => {
      if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
      try {
        lock = await navigator.wakeLock.request('screen');
      } catch {
        // Браузер отказал (энергосбережение, политика) — экран погаснет по настройкам самого ТВ.
      }
    };
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') void request();
    };

    void request();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      void lock?.release();
    };
  }, []);

  useEffect(() => {
    let timer = 0;
    const wake = (): void => {
      setIdle(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        setIdle(true);
      }, CURSOR_HIDE_MS);
    };

    wake();
    window.addEventListener('mousemove', wake);
    window.addEventListener('pointerdown', wake);
    window.addEventListener('keydown', wake);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('mousemove', wake);
      window.removeEventListener('pointerdown', wake);
      window.removeEventListener('keydown', wake);
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      window.location.reload();
    }, TV_RELOAD_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  return { idle };
}
