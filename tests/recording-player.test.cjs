// Run with: node --test tests/recording-player.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'recording-player.js'), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));

class Audio extends EventTarget {
  constructor() {
    super(); this.src = ''; this.currentTime = 0; this.duration = NaN;
    this.readyState = 0; this.paused = true; this.ended = false; this.error = null;
    this.buffered = { length: 0 };
  }
  getAttribute(name) { return this[name]; }
  removeAttribute(name) { this[name] = ''; }
  load() { this.currentTime = 0; this.duration = NaN; this.readyState = 0; this.paused = true; this.error = null; }
  pause() { this.paused = true; }
  play() { this.paused = false; return Promise.resolve(); }
  metadata(duration = 69) {
    this.duration = duration; this.readyState = 1;
    this.dispatchEvent(new Event('loadedmetadata'));
  }
}

function setup({ privateMode = false, fetcher, initial } = {}) {
  const saved = new Map(initial || []);
  const cache = {
    match: async url => saved.get(String(url))?.clone(),
    put: async (url, response) => saved.set(String(url), response.clone()),
    delete: async url => saved.delete(String(url)),
    keys: async () => [...saved.keys()],
  };
  const caches = { open: async () => {
    if (privateMode) throw new Error('Storage denied');
    return cache;
  } };
  let fetches = 0;
  const environment = {
    window: { location: { href: 'https://example.test/IELTS/' }, setInterval: () => 0,
      addEventListener() {}, removeEventListener() {}, caches,
      RECORDING_AUDIO: { clips: { t: { url: './media/listening-lite/t.mp3', bytes: 1024 } } },
    },
    caches, document: { hidden: false }, navigator: { onLine: true }, performance,
    Blob, Response, URL, AbortController, setTimeout, clearTimeout, clearInterval,
    fetch: async (...args) => {
      fetches += 1;
      return fetcher ? fetcher(...args) : new Response(new Uint8Array(1024), { headers: { 'Content-Type': 'audio/mpeg' } });
    },
  };
  vm.runInNewContext(source, environment);
  const audio = new Audio();
  const player = new environment.window.RecordingPlayer(audio);
  const track = { id: 't', url: './media/listening/t.mp3' };
  return { player, audio, track, saved, fetches: () => fetches };
}

test('optimized source is selected; reopening the same track never reloads it', async () => {
  const { player, audio, track } = setup();
  player.load(track); await flush(); audio.metadata(); player.seek(25);
  player.load(track);
  assert.match(audio.src, /listening-lite\/t.mp3$/);
  assert.equal(audio.currentTime, 25);
  player.close();
});

test('duration discovered after loadedmetadata still restores the seek position', async () => {
  const { player, audio, track } = setup();
  player.load(track); await flush();
  player.pendingTime = 22;
  audio.metadata(Infinity);
  audio.duration = 69;
  audio.dispatchEvent(new Event('durationchange'));
  assert.equal(player.duration, 69);
  assert.equal(audio.currentTime, 22);
  assert.equal(player.pendingTime, null);
  player.close();
});

test('storage-denied browsers still cache in RAM and preserve a paused position', async () => {
  const { player, audio, track } = setup({ privateMode: true });
  player.load(track); await flush(); audio.metadata(); player.seek(20);
  await player.download(); audio.metadata();
  assert.match(audio.src, /^blob:/);
  assert.equal(player.memoryOnly, true);
  assert.equal(audio.currentTime, 20);
  assert.equal(audio.paused, true);
  player.close();
});

test('a partial download is never persisted', async () => {
  const { player, track, saved } = setup({ fetcher: async () => new Response(new Uint8Array(512), {
    status: 206, headers: { 'Content-Type': 'audio/mpeg' },
  }) });
  player.load(track); await flush(); await player.download();
  assert.equal(saved.size, 0);
  assert.equal(player.objectUrl, '');
  assert.equal(player.wantPlay, false);
  assert.match(player.message, /缓存未完成/);
  player.close();
});

test('a cache job that finishes after cancellation cannot overwrite a newer source', async () => {
  let resolveFetch;
  const { player, track, audio } = setup({ fetcher: () => new Promise(resolve => { resolveFetch = resolve; }) });
  player.load(track); await flush(); audio.metadata(); player.seek(12);
  const downloading = player.download(); await flush();
  player.cancelDownload();
  resolveFetch(new Response(new Uint8Array(1024), { headers: { 'Content-Type': 'audio/mpeg' } }));
  await downloading;
  assert.equal(player.objectUrl, '');
  assert.equal(player.wantPlay, false);
  assert.equal(player.pendingTime, 12);
  player.close();
});

test('a complete persisted recording reopens as a Blob without fetching it again', async () => {
  const { player, audio, track, fetches } = setup();
  player.load(track); await flush(); await player.download();
  assert.equal(fetches(), 1);
  player.close(); player.load(track); await flush(); await flush();
  assert.match(audio.src, /^blob:/);
  assert.equal(player.cached, true);
  assert.equal(fetches(), 1);
  player.close();
});

test('autoplay restriction does not trigger retries or a full download', async () => {
  const { player, track, audio, fetches } = setup();
  audio.play = () => Promise.reject(Object.assign(new Error('Blocked'), { name: 'NotAllowedError' }));
  player.load(track); await flush(); player.toggle(); await flush();
  assert.equal(player.wantPlay, false);
  assert.equal(player.retries, 0);
  assert.equal(fetches(), 0);
  assert.match(player.message, /点击播放/);
  player.close();
});

test('idle recording preparation caches only the selected track and does not play it', async () => {
  const { player, audio, track, fetches, saved } = setup();
  await player.preloadTrack(track);
  await player.preloadTrack(track);
  assert.equal(fetches(), 1);
  assert.equal(saved.size, 1);
  assert.equal(audio.paused, true);
  assert.equal(audio.src, '');
  player.load(track); await flush(); await flush();
  assert.match(audio.src, /^blob:/);
  assert.equal(player.cached, true);
  player.close();
});
