/* One audio element, bounded recovery, and complete-file caching for dictation.
 * Streaming stays native (including Range requests); partial responses are never
 * saved to Cache Storage. Cached files play through a local Blob URL on mobile.
 */
(() => {
  "use strict";
  const CACHE_NAME = "listening-recordings-v1";
  const CACHE_LIMIT = 12;
  const MAX_BYTES = 12 * 1024 * 1024;

  class RecordingPlayer {
    constructor(audio, { onChange = () => {}, onMessage = () => {} } = {}) {
      this.audio = audio;
      this.onChange = onChange;
      this.onMessage = onMessage;
      this.track = null;
      this.generation = 0;
      this.sourceVersion = 0;
      this.wantPlay = false;
      this.loading = false;
      this.downloading = false;
      this.downloadProgress = 0;
      this.cached = false;
      this.memoryOnly = false;
      this.pendingTime = null;
      this.duration = NaN;
      this.originalMode = false;
      this.objectUrl = "";
      this.message = "";
      this.retries = 0;
      this.controller = null;
      this.cacheCheck = null;
      this.lastProgressAt = performance.now();
      this.lastTime = 0;
      this.waits = [];
      this.lastSeekAt = 0;
      this.listeners = [];
      const listen = (name, handler) => {
        audio.addEventListener(name, handler);
        this.listeners.push([name, handler]);
      };
      const updateDuration = () => {
        if (Number.isFinite(audio.duration)) this.duration = audio.duration;
        if (this.pendingTime !== null && audio.readyState > 0 && Number.isFinite(audio.duration)) {
          audio.currentTime = Math.max(0, Math.min(this.pendingTime, audio.duration));
          this.pendingTime = null;
        }
        this.emit();
      };
      ["loadedmetadata", "durationchange"].forEach((name) => listen(name, updateDuration));
      ["timeupdate", "progress", "seeked"].forEach((name) => listen(name, () => this.emit()));
      ["canplay", "playing"].forEach((name) => listen(name, () => {
        this.loading = false;
        this.message = "";
        this.lastProgressAt = performance.now();
        this.emit();
      }));
      listen("waiting", () => {
        if (this.wantPlay && !this.downloading) {
          this.loading = true;
          const now = performance.now();
          if (!this.objectUrl && now - this.lastSeekAt > 1500 && !audio.seeking && this.bufferedAhead < 2) {
            this.waits = this.waits.filter((time) => now - time < 30000);
            this.waits.push(now);
            if (this.waits.length >= 4 && this.retries < 2) {
              this.retries = 2;
              this.download();
              return;
            }
          }
        }
        this.emit();
      });
      listen("pause", () => {
        if (!this.wantPlay) this.loading = false;
        this.emit();
      });
      listen("ended", () => {
        this.wantPlay = false;
        this.loading = false;
        this.emit();
      });
      listen("error", () => {
        if (!this.track || this.downloading || !audio.getAttribute("src")) return;
        // A cached copy may still be resolving on an offline page.
        if (this.cacheCheck) {
          const generation = this.generation;
          const source = this.sourceVersion;
          this.cacheCheck.finally(() => {
            if (generation === this.generation && source === this.sourceVersion && audio.error && !this.downloading) this.recover();
          });
        } else this.recover();
      });
      this.onOnline = () => {
        if (this.wantPlay && !this.downloading && !this.objectUrl) {
          this.retries = 0;
          this.reconnect();
        }
      };
      window.addEventListener("online", this.onOnline);
      this.watchdog = window.setInterval(() => this.checkPlayback(), 1000);
    }

    emit() { this.onChange(this); }

    get url() {
      const optimized = this.originalMode ? null : window.RECORDING_AUDIO?.clips?.[this.track?.id];
      return this.track ? new URL(optimized?.url || this.track.url, window.location.href).href : "";
    }

    get position() { return this.pendingTime ?? (Number.isFinite(this.audio.currentTime) ? this.audio.currentTime : 0); }

    get bufferedAhead() {
      const { buffered, currentTime } = this.audio;
      for (let i = 0; i < buffered.length; i += 1) {
        if (buffered.start(i) <= currentTime + 0.1 && buffered.end(i) >= currentTime) {
          return Math.max(0, buffered.end(i) - currentTime);
        }
      }
      return 0;
    }

    get status() {
      if (this.downloading) return `正在缓存整段 ${this.downloadProgress}% · 完成后可断网听`;
      if (this.message) return this.message;
      if (this.objectUrl) return this.memoryOnly ? "本次已缓存 · 播放无需网络" : "已缓存整段 · 可离线播放";
      if (this.loading) return this.retries ? "正在重连，保留当前进度…" : "正在缓冲音频…";
      const ahead = Math.floor(this.bufferedAhead);
      return ahead > 0 ? `已缓冲 ${ahead} 秒` : "网络不稳时可先缓存整段";
    }

    load(track) {
      if (this.track?.id === track.id) return;
      this.close();
      this.track = track;
      this.retries = 0;
      const generation = this.generation;
      this.setSource(this.url, 0);
      const lookup = this.readCached(this.url).then((blob) => {
        if (!blob || generation !== this.generation || this.downloading || this.objectUrl) return;
        this.useBlob(blob, this.position);
        this.cached = true;
        this.emit();
      }).catch(() => {}).finally(() => {
        if (this.cacheCheck === lookup) this.cacheCheck = null;
      });
      this.cacheCheck = lookup;
      this.emit();
    }

    setSource(url, position) {
      this.sourceVersion += 1;
      this.pendingTime = position;
      this.lastTime = position;
      this.lastProgressAt = performance.now();
      this.audio.pause();
      this.audio.preload = "auto";
      this.audio.src = url;
      this.audio.playbackRate = 1;
      this.audio.defaultPlaybackRate = 1;
      this.audio.load();
      if (this.wantPlay) this.startPlayback();
    }

    async startPlayback() {
      if (!this.track || this.downloading) return;
      this.wantPlay = true;
      this.loading = this.audio.readyState < 3;
      this.message = "";
      const generation = this.generation;
      const source = this.sourceVersion;
      this.emit();
      try {
        await this.audio.play();
      } catch (error) {
        if (generation !== this.generation || source !== this.sourceVersion || error?.name === "AbortError") return;
        if (error?.name === "NotAllowedError") {
          this.wantPlay = false;
          this.loading = false;
          this.message = "音频已就绪，请点击播放";
          this.emit();
          this.onMessage("浏览器需要手动播放，请再点一次播放键");
        } else if (!this.cacheCheck) this.recover();
      }
    }

    toggle() {
      if (this.wantPlay) {
        this.wantPlay = false;
        this.loading = false;
        this.audio.pause();
        this.emit();
      } else {
        this.wantPlay = true;
        this.lastProgressAt = performance.now();
        if (!this.downloading) {
          if (this.audio.error) { this.retries = 0; this.reconnect(); }
          else this.startPlayback();
        }
        this.emit();
      }
    }

    seek(seconds) {
      if (!this.track || !Number.isFinite(seconds)) return;
      const duration = this.audio.duration;
      const target = Math.max(0, Number.isFinite(duration) ? Math.min(seconds, duration) : seconds);
      if (this.downloading || this.audio.readyState === 0) this.pendingTime = target;
      else this.audio.currentTime = target;
      this.lastTime = target;
      this.lastSeekAt = performance.now();
      this.waits = [];
      this.lastProgressAt = performance.now();
      this.emit();
    }

    checkPlayback() {
      if (!this.track || !this.wantPlay || this.downloading || this.audio.ended || document.hidden) return;
      const now = performance.now();
      if (Math.abs(this.audio.currentTime - this.lastTime) > 0.05) {
        this.lastTime = this.audio.currentTime;
        this.lastProgressAt = now;
      } else if (now - this.lastProgressAt > 9000) {
        this.recover();
      }
    }

    recover() {
      if (!this.track || this.downloading) return;
      if (!this.wantPlay) {
        this.loading = false;
        this.message = "音频尚未就绪，点击播放可重试";
        this.emit();
        return;
      }
      if (navigator.onLine === false && !this.objectUrl) {
        this.loading = true;
        this.message = "网络已断开，联网后会从当前进度继续";
        this.lastProgressAt = performance.now();
        this.emit();
        return;
      }
      if (this.audio.error?.code === 4 && !this.originalMode && !this.objectUrl) {
        this.originalMode = true;
        this.reconnect();
        return;
      }
      if (this.retries === 0 && !this.objectUrl) {
        this.retries += 1;
        this.reconnect();
      } else if (this.retries < 2 && !this.objectUrl) {
        this.retries = 2;
        this.download();
      } else {
        this.wantPlay = false;
        this.loading = false;
        this.audio.pause();
        this.message = "网络较慢，请点“缓存整段”后再播放";
        this.emit();
      }
    }

    reconnect() {
      if (!this.track) return;
      const position = this.position;
      this.loading = this.wantPlay;
      this.message = "";
      this.setSource(this.objectUrl || this.url, position);
      this.emit();
    }

    async readCached(url) {
      if (!("caches" in window)) return null;
      const cache = await caches.open(CACHE_NAME);
      const response = await cache.match(url);
      const expected = this.originalMode ? null : window.RECORDING_AUDIO?.clips?.[this.track?.id]?.bytes;
      if (!response || response.status !== 200) return null;
      const blob = await response.blob();
      if (blob.size < 512 || (expected && blob.size !== expected)) {
        await cache.delete(url);
        return null;
      }
      return blob;
    }

    useBlob(blob, position) {
      const oldUrl = this.objectUrl;
      this.objectUrl = URL.createObjectURL(blob);
      this.setSource(this.objectUrl, position);
      if (oldUrl) URL.revokeObjectURL(oldUrl);
    }

    async download() {
      if (!this.track || this.downloading || this.objectUrl) return;
      const generation = this.generation;
      const url = this.url;
      const expected = this.originalMode ? null : window.RECORDING_AUDIO?.clips?.[this.track.id]?.bytes;
      const position = this.position;
      this.downloading = true;
      this.loading = true;
      this.downloadProgress = 0;
      this.pendingTime = position;
      this.message = "";
      // Stop streaming first: never let two downloads compete for the same
      // mobile connection. Keep desired playback separate from native pause.
      this.sourceVersion += 1;
      this.audio.pause();
      this.audio.removeAttribute("src");
      this.audio.load();
      const controller = new AbortController();
      this.controller = controller;
      let idleTimer;
      const resetTimeout = () => {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => controller.abort(), 20000);
      };
      const totalTimer = setTimeout(() => controller.abort(), 180000);
      resetTimeout();
      this.emit();
      try {
        let blob = await this.readCached(url).catch(() => null);
        if (!blob) {
          const response = await fetch(url, { signal: controller.signal, cache: "reload" });
          // Only complete audio is safe to persist; reject partial/HTML replies.
          if (response.status !== 200 || !/audio\//i.test(response.headers.get("Content-Type") || "")) {
            throw new Error("Expected complete audio response");
          }
          const length = Number(response.headers.get("Content-Length")) || expected || 0;
          if (length > MAX_BYTES) throw new Error("Audio is too large");
          const reader = response.body?.getReader();
          if (reader) {
            const chunks = [];
            let received = 0;
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              if (generation !== this.generation) { await reader.cancel(); return; }
              resetTimeout();
              received += value.byteLength;
              if (received > MAX_BYTES) { await reader.cancel(); throw new Error("Audio is too large"); }
              chunks.push(value);
              this.downloadProgress = length ? Math.min(99, Math.floor(received / length * 100)) : 0;
              this.emit();
            }
            blob = new Blob(chunks, { type: "audio/mpeg" });
          } else blob = await response.blob();
          if (blob.size < 512 || blob.size > MAX_BYTES || (expected && blob.size !== expected)) {
            throw new Error("Incomplete audio file");
          }
        }
        if (generation !== this.generation) return;
        clearTimeout(idleTimer);
        clearTimeout(totalTimer);
        this.downloading = false;
        this.downloadProgress = 100;
        this.cached = true;
        this.memoryOnly = true;
        this.controller = null;
        this.useBlob(blob, this.position);
        this.loading = this.wantPlay;
        this.emit();
        // Cache failures (quota/private mode) do not prevent playback from RAM.
        if ("caches" in window) {
          try {
            const cache = await caches.open(CACHE_NAME);
            await cache.delete(url);
            await cache.put(url, new Response(blob, { headers: {
              "Content-Type": "audio/mpeg", "Content-Length": String(blob.size),
            } }));
            const keys = await cache.keys();
            for (const key of keys.slice(0, Math.max(0, keys.length - CACHE_LIMIT))) await cache.delete(key);
            if (generation === this.generation) { this.memoryOnly = false; this.emit(); }
          } catch { /* In-memory playback is still available. */ }
        }
      } catch (error) {
        if (generation !== this.generation) return;
        this.downloading = false;
        this.loading = false;
        this.wantPlay = false;
        this.controller = null;
        this.setSource(url, this.position);
        this.message = "缓存未完成，请检查网络后重试；进度已保留";
        this.emit();
        this.onMessage("缓存未完成，稍后可重新点击“缓存整段”");
      } finally {
        clearTimeout(idleTimer);
        clearTimeout(totalTimer);
      }
    }

    cancelDownload() {
      if (!this.downloading) return;
      const position = this.position;
      this.generation += 1;
      this.controller?.abort();
      this.controller = null;
      this.downloading = false;
      this.loading = false;
      this.wantPlay = false;
      this.setSource(this.url, position);
      this.message = "已取消缓存，点击播放可继续";
      this.emit();
    }

    close() {
      this.generation += 1;
      this.sourceVersion += 1;
      this.controller?.abort();
      this.controller = null;
      this.cacheCheck = null;
      this.track = null;
      this.wantPlay = false;
      this.loading = false;
      this.downloading = false;
      this.cached = false;
      this.memoryOnly = false;
      this.message = "";
      this.pendingTime = null;
      this.duration = NaN;
      this.originalMode = false;
      this.waits = [];
      this.lastSeekAt = 0;
      this.audio.pause();
      this.audio.removeAttribute("src");
      this.audio.load();
      if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = "";
    }

    destroy() {
      this.close();
      clearInterval(this.watchdog);
      window.removeEventListener("online", this.onOnline);
      this.listeners.forEach(([name, handler]) => this.audio.removeEventListener(name, handler));
    }
  }
  window.RecordingPlayer = RecordingPlayer;
})();
