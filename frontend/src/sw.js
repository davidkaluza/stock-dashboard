/* Service Worker: App offline verfügbar machen. Push-Handler folgen in Schritt 4. */
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
