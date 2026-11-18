const CACHE_PREFIX = "grand-lumen-";
const CACHE_NAME = CACHE_PREFIX + "pwa-v8";
const APP_SCOPE = new URL(self.registration.scope);
const APP_PATH = APP_SCOPE.pathname.endsWith("/") ? APP_SCOPE.pathname : APP_SCOPE.pathname + "/";
const APP_SHELL = [
  APP_SCOPE.href,
  new URL("manifest.json", APP_SCOPE).href,
  new URL("icons/grand-lumen-icon.svg", APP_SCOPE).href,
  new URL("icons/grand-lumen-192.png", APP_SCOPE).href,
  new URL("icons/grand-lumen-512.png", APP_SCOPE).href
];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    for (const asset of APP_SHELL) {
      const response = await fetch(new Request(asset, { cache: "reload" }));
      if (!response.ok) throw new Error("Unable to precache " + asset + ": HTTP " + response.status);
      await cache.put(asset, response);
    }
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

  const isAppAsset = ["script", "style", "image", "font"].includes(request.destination) || requestUrl.pathname.endsWith("/manifest.json");
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