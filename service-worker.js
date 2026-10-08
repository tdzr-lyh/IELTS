const APP_CACHE = "listening-practice-book-v27";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=27",
  "./app.js?v=27",
  "./listening-data.js?v=27",
  "./manifest.webmanifest?v=27",
  "./cloud-config.js?v=1",
  "./vendor/supabase.min.js?v=1",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

function isAudioRequest(request, url) {
  return request.destination === "audio" || /\.(mp3|m4a|ogg|wav)(\?|$)/i.test(url.pathname);
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(APP_CACHE).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== APP_CACHE)
            .map((key) => caches.delete(key)),
        ),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);

  if (url.origin === self.location.origin && isAudioRequest(event.request, url)) {
    // 音频绕过 Service Worker，让手机浏览器直接向 GitHub CDN 发起原生 Range 请求。
    return;
  }

  if (url.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            event.waitUntil(
              caches.open(APP_CACHE).then((cache) => cache.put("./index.html", response.clone())),
            );
          }
          return response;
        })
        .catch(() => caches.match("./index.html")),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response.ok) {
            event.waitUntil(
              caches.open(APP_CACHE).then((cache) => cache.put(event.request, response.clone())),
            );
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
