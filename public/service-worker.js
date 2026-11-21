const CACHE_PREFIX = "grand-lumen-";
const CACHE_NAME = CACHE_PREFIX + "pwa-v12";
const APP_SCOPE = new URL(self.registration.scope);
const APP_PATH = APP_SCOPE.pathname.endsWith("/") ? APP_SCOPE.pathname : APP_SCOPE.pathname + "/";
const APP_SHELL = [
  APP_SCOPE.href,
  new URL("icons/grand-lumen-192.png", APP_SCOPE).href,
  new URL("icons/grand-lumen-512.png", APP_SCOPE).href
];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE_NAME);
      await Promise.all(APP_SHELL.map(async asset => {
        try {
          const response = await fetch(new Request(asset, { cache: "reload" }));
          if (response.ok) await cache.put(asset, response);
        } catch {}
      }));
    } catch {}
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin || !requestUrl.pathname.startsWith(APP_PATH)) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        }
        return response;
      } catch {
        return await caches.match(request) || await caches.match(APP_SCOPE.href) ||
          new Response("Grand-Lumen is unavailable offline.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
      }
    })());
    return;
  }

  const isAppAsset = ["script", "style", "image", "font"].includes(request.destination);
  if (!isAppAsset) return;

  event.respondWith((async () => {
    const cached = await caches.match(request);
    try {
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    } catch {
      return cached || Response.error();
    }
  })());
});

self.addEventListener("push", event => {
  event.waitUntil((async () => {
    let payload = {};
    try { payload = event.data ? event.data.json() : {}; } catch { payload = { body: event.data ? event.data.text() : "You have a new Team message." }; }
    const title = payload.title || "New Team message";
    const options = {
      body: payload.body || "You have a new message.",
      icon: new URL("icons/grand-lumen-192.png", self.registration.scope).href,
      badge: new URL("icons/grand-lumen-192.png", self.registration.scope).href,
      tag: payload.tag || "grand-lumen-team-message",
      renotify: true,
      data: { url: payload.url || self.registration.scope + "?openTeam=1" }
    };
    await self.registration.showNotification(title, options);
  })());
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = event.notification.data && event.notification.data.url ? event.notification.data.url : self.registration.scope;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if ("focus" in client) {
        await client.focus();
        if ("navigate" in client) await client.navigate(target);
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});
