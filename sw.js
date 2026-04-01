// sw.js - Service Worker для полной офлайн-работы
const CACHE_NAME = 'fitness-app-v1.0.0';
const OFFLINE_URL = '/offline.html';

// Файлы для кэширования
const urlsToCache = [
  '/',
  '/index.html',
  '/offline.html',
  'https://fonts.googleapis.com/css2?family=Segoe+UI:wght@400;600;700&display=swap'
];

// Устанавливаем service worker и кэшируем файлы
self.addEventListener('install', (event) => {
  console.log('[SW] Установка');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Кэширование файлов');
        return cache.addAll(urlsToCache);
      })
      .catch((err) => {
        console.error('[SW] Ошибка кэширования:', err);
      })
  );
  // Активируем сразу
  self.skipWaiting();
});

// Очищаем старые кэши при активации
self.addEventListener('activate', (event) => {
  console.log('[SW] Активация');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Удаление старого кэша:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // Применяем кэш сразу
  self.clients.claim();
});

// Стратегия: сначала сеть, при ошибке - кэш
async function networkFirst(request) {
  try {
    // Пытаемся загрузить из сети
    const networkResponse = await fetch(request);
    
    // Если запрос успешен, обновляем кэш
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    // Если сеть недоступна, берём из кэша
    console.log('[SW] Сеть недоступна, загрузка из кэша:', request.url);
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Если запрашивается страница и нет в кэше - показываем offline.html
    if (request.destination === 'document') {
      return caches.match(OFFLINE_URL);
    }
    
    return new Response('Сетевая ошибка', {
      status: 408,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

// Стратегия: кэш сначала, потом сеть (для статики)
async function cacheFirst(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    // Фоном обновляем кэш
    fetch(request).then((networkResponse) => {
      if (networkResponse && networkResponse.status === 200) {
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, networkResponse);
        });
      }
    }).catch(() => {});
    return cachedResponse;
  }
  
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    return new Response('Файл не найден в кэше', { status: 404 });
  }
}

// Обработка запросов
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Пропускаем запросы к API и аналитике
  if (url.pathname.includes('/api/') || url.pathname.includes('analytics')) {
    return;
  }
  
  // Для HTML-документов используем network-first
  if (event.request.destination === 'document') {
    event.respondWith(networkFirst(event.request));
    return;
  }
  
  // Для статических ресурсов (css, js, изображения) используем cache-first
  if (event.request.destination === 'style' || 
      event.request.destination === 'script' || 
      event.request.destination === 'image' ||
      event.request.destination === 'font') {
    event.respondWith(cacheFirst(event.request));
    return;
  }
  
  // Для всего остального - network-first
  event.respondWith(networkFirst(event.request));
});

// Обработка push-уведомлений (опционально)
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'Фитнес-помощник';
  const options = {
    body: data.body || 'Не забудьте отметить сегодняшние привычки!',
    icon: '/icon-192.png',
    badge: '/icon-72.png',
    vibrate: [200, 100, 200],
    data: {
      url: data.url || '/'
    }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Обработка клика по уведомлению
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        for (let client of windowClients) {
          if (client.url === urlToOpen && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});