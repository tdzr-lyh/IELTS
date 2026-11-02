const APP_CACHE = "listening-practice-book-v34";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=34",
  "./app.js?v=34",
  "./listening-data.js?v=34",
  "./phrase-audio.js?v=34",
  "./pronunciation-audio.js?v=34",
  "./pronunciation-player.js?v=34",
  "./recording-audio.js?v=34",
  "./recording-player.js?v=34",
  "./manifest.webmanifest?v=34",
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
            // Audio downloads survive application updates; never remove other
            // apps' caches hosted on the same GitHub Pages origin.
            .filter((key) => key.startsWith("listening-practice-book-") && key !== APP_CACHE)
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

  // Binary pronunciation packs have their own bounded complete-file cache.
  // Bypass stale-while-revalidate and partial-response writes here.
  if (/\/media\/pronunciation\/[^/]+\.bin$/.test(url.pathname)) return;

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
