const CACHE_NAME = "dual-exam-flight-v12";
const AUDIO_CACHE_NAME = "dual-exam-audio-v2";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=12",
  "./app.js?v=12",
  "./listening-data.js?v=12",
  "./manifest.webmanifest?v=12",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

function isAudioRequest(request, url) {
  return request.destination === "audio" || /\.(mp3|m4a|ogg|wav)(\?|$)/i.test(url.pathname);
}

function parseRange(rangeHeader, totalLength) {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader || "");
  if (!match) return null;
  let start = match[1] ? Number(match[1]) : null;
  let end = match[2] ? Number(match[2]) : null;

  if (start === null && end !== null) {
    start = Math.max(0, totalLength - end);
    end = totalLength - 1;
  } else {
    start = start ?? 0;
    end = Math.min(end ?? totalLength - 1, totalLength - 1);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start > end || start >= totalLength) {
    return null;
  }
  return { start, end };
}

async function serveSameOriginAudio(request) {
  const cache = await caches.open(AUDIO_CACHE_NAME);
  const cacheKey = new Request(request.url, { method: "GET" });
  let response = await cache.match(cacheKey);

  if (!response) {
    // 主动获取完整文件，避免把浏览器的 206 分段响应写入 Cache Storage。
    const fullRequest = new Request(request.url, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-cache",
    });
    const networkResponse = await fetch(fullRequest);
    if (!networkResponse.ok) return networkResponse;
    response = networkResponse;
    if (networkResponse.status === 200) {
      await cache.put(cacheKey, networkResponse.clone());
    }
  }

  const rangeHeader = request.headers.get("range");
  if (!rangeHeader || response.status !== 200) return response;

  const buffer = await response.arrayBuffer();
  const range = parseRange(rangeHeader, buffer.byteLength);
  if (!range) {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${buffer.byteLength}` },
    });
  }

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

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME && key !== AUDIO_CACHE_NAME)
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
    event.respondWith(serveSameOriginAudio(event.request));
    return;
  }

  if (url.origin !== self.location.origin) {
    if (isAudioRequest(event.request, url)) {
      event.respondWith(
        caches.open(AUDIO_CACHE_NAME).then(async (cache) => {
          const cached = await cache.match(event.request);
          if (cached) return cached;
          const response = await fetch(event.request);
          if (response.ok || response.type === "opaque") {
            cache.put(event.request, response.clone());
          }
          return response;
        }),
      );
    }
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("./index.html", copy));
          return response;
        })
        .catch(() => caches.match("./index.html")),
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request)),
  );
});
