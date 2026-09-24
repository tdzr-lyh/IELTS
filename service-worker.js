const APP_CACHE = "listening-practice-book-v20";
const AUDIO_CACHE = "listening-practice-audio-v3";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=20",
  "./app.js?v=20",
  "./listening-data.js?v=20",
  "./manifest.webmanifest?v=20",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

function isAudioRequest(request, url) {
  return request.destination === "audio" || /\.(mp3|m4a|ogg|wav)(\?|$)/i.test(url.pathname);
}

function parseRange(rangeHeader, length) {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader || "");
  if (!match) return null;
  let start = match[1] ? Number(match[1]) : null;
  let end = match[2] ? Number(match[2]) : null;
  if (start === null && end !== null) {
    start = Math.max(0, length - end);
    end = length - 1;
  } else {
    start = start ?? 0;
    end = Math.min(end ?? length - 1, length - 1);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start > end) return null;
  return { start, end };
}

async function rangeFromCachedResponse(response, rangeHeader) {
  if (!response || response.status !== 200) return null;
  const buffer = await response.arrayBuffer();
  const range = parseRange(rangeHeader, buffer.byteLength);
  if (!range) return null;
  const { start, end } = range;
  const headers = new Headers(response.headers);
  headers.set("Accept-Ranges", "bytes");
  headers.set("Content-Range", `bytes ${start}-${end}/${buffer.byteLength}`);
  headers.set("Content-Length", String(end - start + 1));
  return new Response(buffer.slice(start, end + 1), {
    status: 206,
    statusText: "Partial Content",
    headers,
  });
}

async function streamAudio(request) {
  const rangeHeader = request.headers.get("range");

  // 先把浏览器的 Range 请求原样交给 CDN。旧版本会等待整段 MP3 下载完才返回，
  // 这正是手机端迟迟无法开始播放的主要原因。
  try {
    return await fetch(request);
  } catch (error) {
    const cache = await caches.open(AUDIO_CACHE);
    const cacheKey = new Request(request.url, { method: "GET" });
    const cached = await cache.match(cacheKey);
    if (!cached) throw error;
    if (rangeHeader) {
      const partial = await rangeFromCachedResponse(cached, rangeHeader);
      if (partial) return partial;
    }
    return cached;
  }
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
            .filter((key) => key !== APP_CACHE && key !== AUDIO_CACHE)
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
    event.respondWith(streamAudio(event.request));
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
