// Web-Push-Abo dieses Geräts verwalten. Das Abo (Endpoint + Schlüssel) wird in push_subscriptions gespeichert;
// gesendet wird von der GitHub Action.

export const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

/** base64url → Uint8Array (für applicationServerKey) */
export function urlBase64ToUint8Array(value) {
  const base64 = (value + '='.repeat((4 - (value.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const toBase64Url = (buffer) => {
  if (!buffer) return '';
  const bytes = new Uint8Array(buffer);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** Kurze Gerätebezeichnung für die Liste, z. B. „iPhone · Safari“ */
export function deviceLabel(ua = '') {
  const device = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android'
    : /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Gerät';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) ? 'Safari' : '';
  return browser ? `${device} · ${browser}` : device;
}

/** PushSubscription.toJSON() → Zeile für push_subscriptions */
export function subscriptionRow(json, label) {
  if (!json?.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new Error('Unvollständiges Push-Abo');
  return { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, device_label: label };
}

/** Umgebung: unterstützt? iOS ohne Installation? */
export function pushEnvironment(nav = typeof navigator !== 'undefined' ? navigator : {}, win = typeof window !== 'undefined' ? window : {}) {
  const ua = nav.userAgent || '';
  const ios = /iPad|iPhone|iPod/.test(ua) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
  const standalone = Boolean(win.matchMedia?.('(display-mode: standalone)').matches || nav.standalone);
  const supported = 'serviceWorker' in nav && 'PushManager' in win && 'Notification' in win;
  return { ios, standalone, supported };
}

/**
 * Zustand für die Anzeige:
 * 'not-configured' | 'needs-install' (iOS, nicht als App installiert) | 'unsupported' | 'denied' | 'off' | 'on'
 */
export async function pushStatus() {
  if (!VAPID_PUBLIC_KEY) return 'not-configured';
  const env = pushEnvironment();
  if (env.ios && !env.standalone) return 'needs-install';
  if (!env.supported) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

const sameKey = (sub, key) => {
  const current = sub?.options?.applicationServerKey;
  return !current || toBase64Url(current) === key;
};

async function currentSubscription(create) {
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub, VAPID_PUBLIC_KEY)) { // Schlüssel wurde gewechselt → neu abonnieren
    await sub.unsubscribe();
    sub = null;
  }
  if (!sub && create) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) });
  }
  return sub;
}

async function saveSubscription(client, sub) {
  const row = subscriptionRow(sub.toJSON(), deviceLabel(navigator.userAgent));
  const { error } = await client.from('push_subscriptions').upsert(row, { onConflict: 'endpoint' });
  if (error) throw error;
}

/** Muss aus einem Klick heraus aufgerufen werden (iOS zeigt die Abfrage sonst nicht). */
export async function enablePush(client) {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Benachrichtigungen wurden nicht erlaubt.');
  const sub = await currentSubscription(true);
  await saveSubscription(client, sub);
}

export async function disablePush(client) {
  const sub = await currentSubscription(false);
  if (!sub) return;
  await client.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
}

/** Beim Start: Abo erneuern, falls der Browser es verworfen hat (iOS tut das gelegentlich), und auf dem Server sicherstellen. */
export async function syncPushSubscription(client) {
  if ((await pushStatus()) === 'not-configured' || Notification.permission !== 'granted') return false;
  const sub = await currentSubscription(true);
  await saveSubscription(client, sub);
  return true;
}

/** Beispielnachricht lokal anzeigen (prüft die Anzeige, nicht den Versand). */
export async function showTestNotification() {
  const reg = await navigator.serviceWorker.ready;
  await reg.showNotification('Stock Dashboard', { body: 'So sieht eine Benachrichtigung aus.', tag: 'test', icon: 'icon-192.png', badge: 'icon-192.png' });
}
