import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {showNextPreview, nextPlaylistIndex} from './preview.mjs';

// Execute the production handlers, replacing only module imports/exports so Node
// can supply Video.js and DOM doubles without loading CSS or a browser runtime.
const source = readFileSync(new URL('./browser.js', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '')
  .replace('export function PlexaVideoPlayer', 'function PlexaVideoPlayer');

function element() {
  const attributes = new Map(), listeners = new Map();
  return {
    hidden: false, children: [], style: {setProperty() {}},
    append(...children) { this.children.push(...children); },
    setAttribute(name, value) { attributes.set(name, String(value)); },
    getAttribute(name) { return attributes.get(name) ?? null; },
    set src(value) { attributes.set('src', value); },
    get src() { return attributes.get('src'); },
    addEventListener(name, listener) {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(listener);
    },
    dispatch(name) { for (const listener of listeners.get(name) || []) listener(); },
    querySelector() { return null; },
    remove() {},
  };
}

function harness(length, consent = true) {
  const root = element(), video = element(), measurement = element();
  const nodes = {status: element(), measurement, download: element()};
  measurement.checked = consent;
  const handlers = new Map(), events = [], sources = [];
  const state = {muted: true, volume: 1, time: 111, duration: 120, inAd: false, plays: 0, ids: 0};
  const player = {
    on(names, listener) {
      for (const name of [].concat(names)) {
        if (!handlers.has(name)) handlers.set(name, []);
        handlers.get(name).push(listener);
      }
    },
    one(name, listener) {
      const once = () => {
        handlers.set(name, handlers.get(name).filter(fn => fn !== once));
        listener();
      };
      this.on(name, once);
    },
    ready(listener) { listener(); },
    muted(value) { if (value !== undefined) state.muted = value; return state.muted; },
    volume(value) { if (value !== undefined) state.volume = value; return state.volume; },
    el: () => root,
    duration: () => state.duration,
    currentTime: () => state.time,
    remoteTextTracks: () => [],
    autoplay(value) { state.autoplay = value; },
    poster(value) { state.poster = value; },
    src(value) { sources.push(value.src); state.time = 0; },
    play() { state.plays++; return Promise.resolve(); },
    ads: {isInAdMode: () => state.inAd},
  };
  const context = vm.createContext({
    videojs: () => player, showNextPreview, nextPlaylistIndex,
    document: {
      documentElement: element(), createElement: element,
      getElementById: id => nodes[id] || null,
    },
    crypto: {randomUUID: () => `00000000-0000-4000-8000-${String(++state.ids).padStart(12, '0')}`},
    fetch(url, options) {
      assert.equal(url, '/api/player/events');
      events.push(JSON.parse(options.body));
      return Promise.resolve();
    },
    innerWidth: 1280, clearTimeout, setTimeout, window: {},
  });
  vm.runInContext(source, context, {filename: 'features/player/browser.js'});
  const queue = Array.from({length}, (_,i) => ({
    id: `v${i}`, title: `Video ${i}`, thumbnail: `https://example.test/${i}.png`,
    contentUrl: `https://example.test/${i}.mp4`,
  }));
  context.PlexaVideoPlayer(video, {id: 'v0', destinationId: 'test', queue});
  return {
    state, video, sources, events,
    card: root.children.find(node => node.className === 'plexa-next'),
    sound: root.children.find(node => node.className === 'plexa-sound'),
    fire(name) { for (const listener of [...(handlers.get(name) || [])]) listener(); },
    recorded(name) { return events.filter(event => event.event === name); },
  };
}

test('empty queue neither advances nor restarts on ended or next click', () => {
  const h = harness(0), initialPlays = h.state.plays;
  h.fire('playing');
  h.fire('ended');
  h.card.dispatch('click');
  assert.deepEqual(h.sources, []);
  assert.equal(h.state.plays, initialPlays);
  assert.equal(h.state.ids, 1);
  assert.equal(h.card.hidden, true);
  assert.equal(h.recorded('complete').length, 1);
});

test('single-item queue loops with a fresh playback ID and retained mute', () => {
  const h = harness(1), initialPlays = h.state.plays;
  assert.equal(h.video.muted, true);
  assert.equal(h.video.defaultMuted, true);
  assert.equal(h.video.autoplay, true);
  h.fire('playing');
  h.fire('ended');
  assert.equal(h.card.hidden, true, 'hide preview until new content starts');
  h.fire('playing');
  assert.deepEqual(h.sources, ['https://example.test/0.mp4']);
  assert.equal(h.state.plays, initialPlays + 1);
  assert.equal(h.state.muted, true);
  const [first, second] = h.recorded('start');
  assert.equal(first.videoId, second.videoId);
  assert.notEqual(first.playbackId, second.playbackId);
  assert.equal(h.recorded('complete')[0].playbackId, first.playbackId);
});

test('ended wraps last to first with unique IDs, correct completions and sound retained', () => {
  const h = harness(3);
  h.fire('playing');
  h.fire('playing'); // A second playing event must not duplicate start analytics.
  h.sound.dispatch('click');
  for (let i = 0; i < 7; i++) {
    h.fire('ended');
    h.fire('playing');
    assert.equal(h.state.muted, false);
  }
  assert.deepEqual(h.sources, [1,2,0,1,2,0,1].map(i => `https://example.test/${i}.mp4`));
  const starts = h.recorded('start'), completions = h.recorded('complete');
  assert.equal(starts.length, 8);
  assert.equal(completions.length, 7);
  assert.equal(new Set(starts.map(event => event.playbackId)).size, 8);
  completions.forEach((event, i) => {
    assert.equal(event.videoId, starts[i].videoId);
    assert.equal(event.playbackId, starts[i].playbackId);
  });
});

test('next preview wraps, respects ten seconds, retains image fallback and skips without completion', () => {
  const h = harness(2);
  h.fire('playing');
  h.fire('ended');
  h.fire('playing');
  assert.equal(h.card.getAttribute('aria-label'), 'Play next: Video 0');
  h.state.time = 109.9;
  h.fire('seeking');
  assert.equal(h.card.hidden, true);
  h.state.time = 110;
  h.fire('timeupdate');
  assert.equal(h.card.hidden, false);
  const image = h.card.children[0];
  image.dispatch('error');
  h.fire('timeupdate');
  assert.equal(image.hidden, true);
  h.state.time = 120;
  h.fire('timeupdate');
  assert.equal(h.card.hidden, true);
  h.state.time = 111;
  h.fire('seeking');
  h.card.dispatch('click');
  assert.equal(h.card.hidden, true);
  h.fire('playing');
  assert.deepEqual(h.sources, ['https://example.test/1.mp4', 'https://example.test/0.mp4']);
  assert.equal(h.recorded('complete').length, 1, 'manual skip does not record completion');
  assert.equal(new Set(h.recorded('start').map(event => event.playbackId)).size, 3);
  assert.equal(h.state.muted, true);
  assert.equal(image.hidden, false, 'new thumbnail URL clears the failure');
});

test('ads cannot advance the playlist and looping does not bypass analytics consent', () => {
  const h = harness(2, false);
  h.fire('playing');
  h.state.inAd = true;
  h.fire('ads-ad-started');
  assert.equal(h.card.hidden, true);
  h.fire('ended');
  h.card.dispatch('click');
  assert.deepEqual(h.sources, []);
  h.state.inAd = false;
  h.fire('contentresumed');
  h.fire('ended');
  h.fire('playing');
  h.fire('ended');
  h.fire('playing');
  assert.equal(h.sources.length, 2);
  assert.deepEqual(h.events, []);
});
