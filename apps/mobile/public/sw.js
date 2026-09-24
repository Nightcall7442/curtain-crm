/*
  Service worker приложения в браузере.

  Делает две вещи и больше ничего: даёт браузеру повод считать страницу
  приложением («установить на главный экран») и держит бандл в кеше, чтобы
  открытие в цеху с плохой связью не упиралось в три мегабайта заново.

  Данные НЕ кешируются: заказы, смены и касса ходят на `/trpc` мимо
  worker'а. Показать вчерашнюю кассу как сегодняшнюю хуже, чем показать
  ошибку сети.
*/

const CACHE = 'design-house-app-v1';

/** Файлы бандла: имя содержит хеш содержимого, поэтому устаревших не бывает. */
const isBuildAsset = (path) => path.startsWith('/app/_expo/') || path.startsWith('/app/assets/');

self.addEventListener('install', (event) => {
  // Стартовая страница кладётся сразу: без неё офлайн-открытие упрётся в пустоту.
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add('/app/'))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith('/app')) return;

  // Переход на страницу: сначала сеть — свежая версия приложения после
  // выкладки важнее мгновенного открытия. Нет сети — отдаём сохранённую.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/app/').then((hit) => hit ?? Response.error())));
    return;
  }

  if (!isBuildAsset(url.pathname)) return;

  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ??
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
