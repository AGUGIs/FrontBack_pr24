// Service Worker (ПР13–ПР18) — v6: офлайн F5 + баннер

const APP_SHELL_CACHE = 'app-shell-v6';
const RUNTIME_CACHE = 'runtime-v6';
const DYNAMIC_CACHE = 'dynamic-v6';
const API_CACHE = 'api-cache-v6';

const SHELL_ASSETS = [
  '/index.html',
  '/manifest.json',
  '/icons/favicon.ico',
  '/icons/favicon-16x16.png',
  '/icons/favicon-32x32.png',
  '/icons/favicon-48x48.png',
  '/icons/favicon-64x64.png',
  '/icons/favicon-128x128.png',
  '/icons/favicon-256x256.png',
  '/icons/favicon-512x512.png',
];

function isConnectivityCheck(request) {
  const url = new URL(request.url);
  return (
    request.headers.get('X-Connectivity-Check') === '1' ||
    url.searchParams.has('connectivity-check')
  );
}

function isStaticAsset(pathname) {
  return (
    pathname.startsWith('/static/') ||
    pathname.endsWith('.js') ||
    pathname.endsWith('.css') ||
    pathname.endsWith('.woff2') ||
    pathname.endsWith('.map')
  );
}

async function cachePut(cacheName, request, response) {
  if (response && response.ok) {
    const cache = await caches.open(cacheName);
    await cache.put(request, response);
  }
}

async function matchIndexHtml() {
  return (await caches.match('/index.html')) || (await caches.match('/'));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(APP_SHELL_CACHE);
      await Promise.all(
        SHELL_ASSETS.map((url) =>
          cache.add(url).catch((err) => console.warn('[SW] precache skip:', url, err))
        )
      );
    })()
  );
});


self.addEventListener('activate', (event) => {
  const keep = new Set([APP_SHELL_CACHE, RUNTIME_CACHE, DYNAMIC_CACHE, API_CACHE]);
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);
  const { pathname } = url;

  if (isConnectivityCheck(event.request)) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' }).catch(
        () => new Response(null, { status: 503, statusText: 'Offline' })
      )
    );
    return;
  }

  if (pathname.startsWith('/api/')) {
    if (pathname.includes('/products')) {
      event.respondWith(
        fetch(event.request)
          .then((res) => {
            cachePut(API_CACHE, event.request, res.clone());
            return res;
          })
          .catch(() => caches.match(event.request))
      );
    }
    return;
  }

  if (url.origin !== self.location.origin) {
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          cachePut(DYNAMIC_CACHE, event.request, res.clone());
          cachePut(DYNAMIC_CACHE, '/index.html', res.clone());
          return res;
        })
        .catch(async () => {
          const page =
            (await caches.match(event.request)) || (await matchIndexHtml());
          if (page) return page;
          return new Response(
            '<!DOCTYPE html><html lang="ru"><body style="font-family:sans-serif;padding:24px">' +
              '<h1>Нет сети</h1><p>Сначала откройте сайт онлайн, затем обновите офлайн.</p></body></html>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        })
    );
    return;
  }

  if (isStaticAsset(pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(RUNTIME_CACHE);
        const cached = await cache.match(event.request);
        try {
          const res = await fetch(event.request);
          if (res.ok) await cache.put(event.request, res.clone());
          return res;
        } catch (err) {
          if (cached) return cached;
          throw err;
        }
      })()
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cached =
        (await caches.match(event.request)) ||
        (await caches.open(APP_SHELL_CACHE).then((c) => c.match(event.request)));
      if (cached) return cached;
      const res = await fetch(event.request);
      await cachePut(APP_SHELL_CACHE, event.request, res.clone());
      return res;
    })()
  );
});

self.addEventListener('push', (event) => {
  let data = { title: 'Новое уведомление', body: '', reminderId: null };
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: '/icons/favicon-128x128.png',
    badge: '/icons/favicon-48x48.png',
    vibrate: [200, 100, 200],
    data: { reminderId: data.reminderId },
  };

  if (data.reminderId) {
    options.actions = [{ action: 'snooze', title: 'Отложить на 5 минут' }];
  }

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', (event) => {
  const notification = event.notification;
  const action = event.action;

  if (action === 'snooze') {
    const reminderId = notification.data && notification.data.reminderId;
    if (reminderId) {
      event.waitUntil(
        fetch(`/api/snooze?reminderId=${reminderId}`, { method: 'POST' })
          .then(() => notification.close())
          .catch(() => notification.close())
      );
    } else {
      notification.close();
    }
    return;
  }

  notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('localhost') && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
