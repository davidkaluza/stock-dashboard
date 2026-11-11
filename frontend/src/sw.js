/* Service Worker: App offline verfügbar machen und Push-Nachrichten anzeigen. */
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

self.skipWaiting();
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// App-Dateien (vom Build eingesetzt)
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Alle Navigationen innerhalb der App → index.html (auch offline)
registerRoute(new NavigationRoute(createHandlerBoundToURL(`${import.meta.env.BASE_URL}index.html`)));

// Google Fonts
registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com',
  new StaleWhileRevalidate({ cacheName: 'google-fonts-css' }),
);
registerRoute(
  ({ url }) => url.origin === 'https://fonts.gstatic.com',
  new CacheFirst({
    cacheName: 'google-fonts',
    plugins: [new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 365 * 24 * 60 * 60 })],
  }),
);

// Supabase-Anfragen werden bewusst nicht gecacht: die App hält die letzten Daten selbst im localStorage.

// ── Push ───────────────────────────────────────────────────────
// Payload von pipeline/run.py: {title, body, symbol?, tag?}

const APP_URL = new URL(import.meta.env.BASE_URL, self.location.origin).href;

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data?.text() };
  }
  const title = data.title || 'Stock Dashboard';
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    tag: data.tag,              // gleiche Regel ersetzt ältere Meldung statt zu stapeln
    renotify: Boolean(data.tag),
    icon: `${import.meta.env.BASE_URL}icon-192.png`,
    badge: `${import.meta.env.BASE_URL}icon-192.png`,
    data: { symbol: data.symbol || null },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const symbol = event.notification.data?.symbol;
  const url = symbol ? `${APP_URL}?symbol=${encodeURIComponent(symbol)}` : APP_URL;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find((w) => w.url.startsWith(APP_URL));
    if (existing) {
      await existing.focus();
      return existing.navigate(url);
    }
    return self.clients.openWindow(url);
  })());
});
