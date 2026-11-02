/* Short sounds are fetched before a tap, decoded once and played from memory.
 * Each binary pack contains complete MP3s (including whole linked phrases).
 * Partial pack data can supply an early clip without waiting for the whole pack.
 */
(() => {
  "use strict";
  const CACHE = "listening-pronunciation-v1";
  const keyFor = (value) => String(value || "").trim().replace(/\s+/g, " ").toLowerCase().replace(/’/g, "'");
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const retain = (map, key, value, limit) => {
    map.delete(key); map.set(key, value);
    while (map.size > limit) map.delete(map.keys().next().value);
  };

  class PronunciationPlayer {
    constructor(audio, { onChange = () => {}, onMessage = () => {}, onSpeaking = () => {} } = {}) {
      this.audio = audio;
      this.onChange = onChange;
      this.onMessage = onMessage;
      this.onSpeaking = onSpeaking;
      this.library = window.PRONUNCIATION_AUDIO || { clips: {}, packs: {} };
      this.groups = new Map();
      this.clips = new Map();
      this.decoded = new Map();
      this.decoding = new Map();
      this.jobs = new Map();
      this.ranges = new Map();
      this.rangeControllers = new Map();
      this.queue = [];
      this.active = 0;
      this.busy = false;
      this.token = 0;
      this.phase = "idle";
      this.word = "";
      this.context = null;
      this.decoder = null;
      this.node = null;
      this.urls = new Map();
      const Decoder = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      try { if (Decoder) this.decoder = new Decoder(1, 1, 44100); } catch { /* Native audio fallback. */ }
      audio.preload = "auto";
      audio.addEventListener("ended", () => {
        if (this.phase === "playing" && !this.node) this.finish();
      });
    }

    emit() { this.onChange(this); }
    ready(term) { const key = keyFor(term); return this.clips.has(key) || this.decoded.has(key); }
    progress(scope) {
      const terms = this.groups.get(scope) || [];
      return { ready: terms.filter((term) => this.ready(term)).length, total: terms.length };
    }
    setBusy(busy) { this.busy = Boolean(busy); if (!this.busy) this.pump(); }

    prepare(terms, scope = "mission", retry = false) {
      const keys = [...new Set(terms.map(keyFor).filter((key) => this.library.clips[key]))];
      if (!retry && (this.groups.get(scope) || []).join("\n") === keys.join("\n")) return;
      this.groups.set(scope, keys);
      if (retry && this.phase === "error") this.phase = "idle";
      for (const key of keys) {
        this.needClip(key, false).then((bytes) => this.decode(key, bytes)).catch(() => {}).finally(() => this.emit());
      }
      this.emit();
    }

    async decode(key, bytes) {
      if (this.decoded.has(key)) return this.decoded.get(key);
      if (this.decoding.has(key)) return this.decoding.get(key);
      const decoder = this.decoder || this.context;
      if (!decoder) return null;
      const pending = decoder.decodeAudioData(bytes.slice(0)).then((buffer) => {
        retain(this.decoded, key, buffer, 96);
        return buffer;
      }).catch(() => null).finally(() => this.decoding.delete(key));
      this.decoding.set(key, pending);
      return pending;
    }

    unlock() {
      try {
        const nav = window.navigator;
        // Older iOS treats Web Audio as game effects and can silence it with
        // the ringer switch. Keep the native media path on those devices.
        if (/iPhone|iPad|iPod/.test(nav?.userAgent || "") && !nav?.audioSession) return null;
        if (nav?.audioSession) nav.audioSession.type = "playback";
        const Context = window.AudioContext || window.webkitAudioContext;
        if (!this.context && Context) this.context = new Context({ latencyHint: "interactive" });
        if (this.context && this.context.state !== "running" && this.context.state !== "closed") {
          // Called synchronously inside the user's tap, never after a timer.
          this.resumeTask = this.context.resume().catch(() => {});
        }
      } catch { /* Use the audio element when Web Audio is unavailable. */ }
      return this.context;
    }

    play(term) {
      const key = keyFor(term);
      if (!key) return;
      this.stop();
      const token = this.token;
      this.word = key;
      this.phase = "loading";
      this.unlock();
      this.emit();
      const decoded = this.decoded.get(key);
      if (decoded && this.context?.state === "running") {
        this.startBuffer(decoded, token);
        return;
      }
      if (!this.context && this.clips.has(key)) {
        this.startNative(key, this.clips.get(key), token).catch((error) => this.fail(error, token));
        return;
      }
      const load = this.needClip(key, true);
      // A cold download has a visible state and a bounded wait, not a chain of
      // 5-second dictionary/TTS timeouts. Preparation can continue in background.
      let deadlineTimer;
      const deadline = new Promise((_, reject) => {
        deadlineTimer = setTimeout(() => reject(new Error("Audio preparation timed out")), 6000);
      });
      Promise.race([load, deadline]).then(async (bytes) => {
        const buffer = await this.decode(key, bytes);
        if (token !== this.token) return;
        if (this.context?.state === "suspended") await Promise.race([this.resumeTask || delay(0), delay(500)]);
        if (token !== this.token) return;
        if (buffer && this.context?.state === "running") this.startBuffer(buffer, token);
        else await this.startNative(key, bytes, token);
      }).catch((error) => {
        this.fail(error, token);
      }).finally(() => clearTimeout(deadlineTimer));
    }

    fail(error, token) {
      if (token !== this.token) return;
      this.phase = "error";
      this.onSpeaking(false);
      this.emit();
      this.onMessage(error?.name === "NotAllowedError"
        ? "浏览器需要手动播放，请再点一次发音"
        : "英音正在准备或网络暂不可用，请稍后重试；已准备的词可离线播放");
    }

    startBuffer(buffer, token) {
      if (token !== this.token) return;
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = 1;
      source.connect(this.context.destination);
      source.onended = () => { source.disconnect(); if (token === this.token) this.finish(); };
      this.node = source;
      source.start(0);
      this.phase = "playing";
      this.onSpeaking(true);
      this.emit();
    }

    async startNative(key, bytes, token) {
      if (token !== this.token) return;
      let url = this.urls.get(key);
      if (!url) {
        url = URL.createObjectURL(new Blob([bytes], { type: "audio/mpeg" }));
        this.urls.set(key, url);
        if (this.urls.size > 96) {
          const oldest = this.urls.keys().next().value;
          URL.revokeObjectURL(this.urls.get(oldest)); this.urls.delete(oldest);
        }
      }
      if (this.audio.getAttribute("src") !== url) this.audio.src = url;
      else this.audio.currentTime = 0;
      this.audio.playbackRate = 1;
      await this.audio.play();
      if (token !== this.token) return;
      this.phase = "playing";
      this.onSpeaking(true);
      this.emit();
    }

    finish() {
      this.node = null;
      this.phase = "idle";
      this.onSpeaking(false);
      this.emit();
    }

    stop() {
      this.token += 1;
      this.rangeControllers.forEach((controller) => controller.abort());
      if (this.node) { try { this.node.stop(); } catch {} this.node = null; }
      this.audio.pause();
      this.phase = "idle";
      this.onSpeaking(false);
      this.emit();
    }

    needClip(term, urgent) {
      const key = keyFor(term);
      if (this.clips.has(key)) return Promise.resolve(this.clips.get(key));
      const entry = this.library.clips[key];
      if (!entry) return Promise.reject(new Error("No packaged pronunciation"));
      const job = this.packJob(entry.pack, urgent);
      const slice = new Promise((resolve, reject) => {
        job.waiters.push({ key, entry, resolve, reject });
        this.publish(job);
      });
      if (!urgent) return slice;
      // A cold tap late in a pack can fetch just that MP3 using one Range
      // request rather than wait for all preceding clips to arrive.
      const token = this.token;
      const range = delay(1000).then(() => {
        if (token !== this.token) throw new Error("Pronunciation superseded");
        return this.clips.get(key) || this.rangeClip(key, entry);
      });
      return Promise.any([slice, range]);
    }

    packJob(id, urgent) {
      if (this.jobs.has(id)) {
        const job = this.jobs.get(id);
        if (urgent) { job.urgent = true; this.queue.sort((a, b) => Number(b.urgent) - Number(a.urgent)); this.pump(); }
        return job;
      }
      const pack = this.library.packs[id];
      const job = { id, pack, urgent, waiters: [], received: 0, bytes: new Uint8Array(pack.bytes), done: false };
      this.jobs.set(id, job);
      if (urgent) this.queue.unshift(job); else this.queue.push(job);
      this.pump();
      return job;
    }

    publish(job) {
      job.waiters = job.waiters.filter((waiter) => {
        const { key, entry, resolve } = waiter;
        if (job.received < entry.offset + entry.bytes) return true;
        const bytes = job.bytes.buffer.slice(entry.offset, entry.offset + entry.bytes);
        retain(this.clips, key, bytes, 192);
        resolve(bytes);
        return false;
      });
    }

    pump() {
      while (this.queue.length && this.active < 2) {
        const index = this.queue.findIndex((job) => job.urgent || (!this.busy && this.active === 0));
        if (index < 0) return;
        const [job] = this.queue.splice(index, 1);
        this.active += 1;
        this.fetchPack(job).catch((error) => {
          job.waiters.forEach((waiter) => waiter.reject(error)); job.waiters = [];
          if (this.jobs.get(job.id) === job) this.jobs.delete(job.id);
        }).finally(() => {
          this.active -= 1;
          // Keep only a few completed binary packs in RAM; decoded/current
          // clips and persistent cache remain independently reusable.
          const complete = [...this.jobs.values()].filter((item) => item.done);
          complete.slice(0, Math.max(0, complete.length - 6)).forEach((item) => this.jobs.delete(item.id));
          this.emit(); this.pump();
        });
      }
    }

    async fetchPack(job) {
      const url = new URL(job.pack.url, window.location.href).href;
      let cache = null;
      try { if ("caches" in window) cache = await caches.open(CACHE); } catch {}
      let response = null;
      try { response = await cache?.match(url); } catch {}
      const fromCache = Boolean(response);
      const controller = new AbortController();
      let idleTimer;
      const resetTimeout = () => {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => controller.abort(), 15000);
      };
      resetTimeout();
      const totalTimer = setTimeout(() => controller.abort(), 90000);
      try {
        if (!response) response = await fetch(url, { signal: controller.signal });
        if (response.status !== 200) throw new Error("Incomplete pronunciation pack");
        const reader = response.body?.getReader();
        if (reader) {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            resetTimeout();
            if (job.received + value.byteLength > job.pack.bytes) { await reader.cancel(); throw new Error("Invalid pack size"); }
            job.bytes.set(value, job.received); job.received += value.byteLength;
            this.publish(job); this.emit();
          }
        } else {
          const bytes = await response.arrayBuffer();
          if (bytes.byteLength !== job.pack.bytes) throw new Error("Invalid pack size");
          job.bytes.set(new Uint8Array(bytes)); job.received = bytes.byteLength;
        }
        if (job.received !== job.pack.bytes) throw new Error("Truncated pronunciation pack");
        job.done = true; this.publish(job);
        if (cache && !fromCache) {
          try {
            await cache.put(url, new Response(job.bytes, { headers: { "Content-Type": "application/octet-stream" } }));
            const keys = await cache.keys();
            for (const key of keys.slice(0, Math.max(0, keys.length - 40))) await cache.delete(key);
          } catch { /* In-memory clips still work when storage is unavailable. */ }
        }
      } catch (error) {
        if (fromCache) { try { await cache?.delete(url); } catch {} }
        throw error;
      } finally { clearTimeout(idleTimer); clearTimeout(totalTimer); }
    }

    rangeClip(key, entry) {
      if (this.ranges.has(key)) return this.ranges.get(key);
      const request = (async () => {
        const pack = this.library.packs[entry.pack];
        const controller = new AbortController();
        this.rangeControllers.set(key, controller);
        const timer = setTimeout(() => controller.abort(), 4000);
        try {
          const response = await fetch(new URL(pack.url, window.location.href).href, {
            headers: { Range: `bytes=${entry.offset}-${entry.offset + entry.bytes - 1}` }, signal: controller.signal,
          });
          const data = await response.arrayBuffer();
          const bytes = response.status === 206 && data.byteLength === entry.bytes
            ? data : response.status === 200 && data.byteLength === pack.bytes
              ? data.slice(entry.offset, entry.offset + entry.bytes) : null;
          if (!bytes) throw new Error("Invalid pronunciation range");
          retain(this.clips, key, bytes, 192); this.emit();
          return bytes;
        } finally { clearTimeout(timer); this.rangeControllers.delete(key); }
      })().finally(() => this.ranges.delete(key));
      this.ranges.set(key, request);
      return request;
    }
  }
  window.PronunciationPlayer = PronunciationPlayer;
})();
