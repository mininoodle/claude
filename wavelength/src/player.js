/* player.js — Wavelength playback state machine plus the player bar (desktop/tablet), the mini player and the
   expanded now-playing view (phone). Defines window.Player (SPEC section 6).
   The state machine never depends on the DOM; the DOM is touched only inside Player.init() and later.
   window.Catalog / window.AudioEngine / window.App / window.Library are referenced only inside function bodies and
   always through typeof guards, so nothing throws while another module is missing. */
(function () {
  'use strict';

  var HISTORY_MAX = 50;
  var PERSIST_EVERY = 5;            // seconds of playback between position saves
  var DEFAULT_VOLUME = 0.7;
  var REPEAT_MODES = ['off', 'context', 'track'];
  var PHONE_MQ = '(max-width: 767px)';
  var APP_TITLE = 'Wavelength';
  var XP_FLORA = { w: 220, h: 156 };  // the expanded player's floor sprig (CSS px; drawn by Flora.sprite at dpr)

  /* ------------------------------------------------------------------ state */
  var state = {
    currentTrackId: null,
    context: null,                  // { uri, name, trackIds }
    index: 0,                       // cursor in `order`
    order: [],                      // play order of context.trackIds (shuffled when shuffle is on)
    queue: [],                      // [{ qid, trackId }] manual "Next in queue"
    history: [],                    // previously played track ids, oldest first, max 50
    isPlaying: false,
    position: 0,                    // seconds
    duration: 0,                    // seconds
    volume: DEFAULT_VOLUME,
    muted: false,
    shuffle: false,
    repeat: 'off'
  };
  var listeners = {};
  var lastVolume = DEFAULT_VOLUME;  // last non-zero volume, restored by unmute
  var qidSeq = 0;
  var lastSavedPos = 0;
  var inited = false;
  var engineBound = false;
  var playGen = 0;                  // invalidates late play() promise results after pause/stop
  var ui = null;                    // DOM references, built in init()
  var dragging = false;             // a progress slider is being dragged
  var phoneMql = null;

  /* ------------------------------------------------------------------ helpers */
  function num(v, d) { v = Number(v); return isFinite(v) ? v : d; }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function catalog() { return typeof window.Catalog === 'object' && window.Catalog ? window.Catalog : null; }
  function engine() { return typeof window.AudioEngine === 'object' && window.AudioEngine ? window.AudioEngine : null; }
  function app() { return typeof window.App === 'object' && window.App ? window.App : null; }
  function library() { return typeof window.Library === 'object' && window.Library ? window.Library : null; }
  function trackOf(id) {
    var C = catalog();
    if (!C || typeof id !== 'string' || typeof C.track !== 'function') return null;
    try { return C.track(id) || null; } catch (e) { return null; }
  }
  function albumOf(track) {
    var C = catalog();
    if (!C || !track || typeof C.album !== 'function') return null;
    try { return C.album(track.albumId) || null; } catch (e) { return null; }
  }
  function artistsOf(track) {
    var C = catalog();
    if (!C || !track) return [];
    try {
      if (typeof C.trackArtists === 'function') return C.trackArtists(track) || [];
      var list = [C.artist(track.artistId)].concat((track.featuringIds || []).map(function (id) { return C.artist(id); }));
      return list.filter(Boolean);
    } catch (e) { return []; }
  }
  function coverOf(track) {
    var C = catalog();
    if (!C || !track || typeof C.cover !== 'function') return '';
    try { return C.cover(track) || ''; } catch (e) { return ''; }
  }
  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(num(sec, 0)));
    var C = catalog();
    if (C && typeof C.formatDuration === 'function') { try { return C.formatDuration(sec * 1000); } catch (e) {} }
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }
  function darken(hex, factor) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
    if (!m) return null;
    var n = parseInt(m[1], 16), out = '#';
    [(n >> 16) & 255, (n >> 8) & 255, n & 255].forEach(function (c) {
      var v = Math.round(c * factor).toString(16);
      out += v.length < 2 ? '0' + v : v;
    });
    return out;
  }
  function shuffled(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function cloneContext(c) { return c ? { uri: c.uri, name: c.name, trackIds: c.trackIds.slice() } : null; }
  function newQid() { return 'q' + (++qidSeq) + '-' + Math.random().toString(36).slice(2, 8); }
  function toast(msg) {
    var A = app();
    if (A && typeof A.toast === 'function') { try { A.toast(msg); } catch (e) {} }
  }
  function navigate(route) {
    var A = app();
    if (A && typeof A.navigate === 'function') { try { A.navigate(route); } catch (e) {} }
  }
  // Eyebrow of the expanded player by context uri prefix (SPEC 6.4).
  function eyebrowFor(uri) {
    uri = String(uri || '');
    if (uri.indexOf('album:') === 0) return 'PLAYING FROM ALBUM';
    if (uri.indexOf('artist:') === 0) return 'PLAYING FROM ARTIST';
    if (uri.indexOf('genre:') === 0) return 'PLAYING FROM GENRE';
    if (uri === 'search' || uri.indexOf('track:') === 0) return 'PLAYING FROM SEARCH';
    return 'PLAYING FROM PLAYLIST';   // playlist:, user:, liked
  }
  function phoneLayout() {
    try { return typeof window.matchMedia !== 'function' || window.matchMedia(PHONE_MQ).matches; } catch (e) { return true; }
  }
  function desktopLayout() {
    try { return typeof window.matchMedia !== 'function' || window.matchMedia('(min-width: 1024px)').matches; } catch (e) { return true; }
  }

  /* ------------------------------------------------------------------ events */
  function on(ev, fn) { if (typeof fn === 'function') (listeners[ev] = listeners[ev] || []).push(fn); return Player; }
  function off(ev, fn) {
    var l = listeners[ev];
    if (l) { var i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); }
    return Player;
  }
  function emit(ev, a, b) {
    if (ui && uiHandlers[ev]) { try { uiHandlers[ev](a, b); } catch (err) { rethrow(err); } }
    var l = listeners[ev];
    if (!l || !l.length) return;
    l = l.slice();
    for (var i = 0; i < l.length; i++) { try { l[i](a, b); } catch (err) { rethrow(err); } }
  }
  function rethrow(err) { setTimeout(function () { throw err; }, 0); }

  /* ------------------------------------------------------------------ persistence */
  function storageBlob() {
    return {
      version: 1,
      currentTrackId: state.currentTrackId,
      context: cloneContext(state.context),
      index: state.index,
      order: state.order.slice(),
      queue: state.queue.map(function (q) { return { qid: q.qid, trackId: q.trackId }; }),
      position: state.position,
      volume: state.volume,
      muted: state.muted,
      shuffle: state.shuffle,
      repeat: state.repeat
    };
  }
  function persist() {
    lastSavedPos = state.position;
    var L = library();
    if (!L || typeof L.savePlayer !== 'function') return;
    try { L.savePlayer(storageBlob()); } catch (e) {}
  }
  // Saves the exact live position (used when the page is hidden or unloaded, between the 5 s saves).
  function persistLive() {
    if (!state.currentTrackId) return;
    state.position = livePosition();
    persist();
  }
  // Restores the stored blob silently: no events, isPlaying false, the engine untouched.
  function restore() {
    var L = library();
    if (!L || typeof L.loadPlayer !== 'function') return;
    var blob = null;
    try { blob = L.loadPlayer(); } catch (e) { blob = null; }
    if (!blob || typeof blob !== 'object' || blob.version !== 1) return;
    var valid = function (id) { return typeof id === 'string' && !!trackOf(id); };
    state.volume = clamp(num(blob.volume, DEFAULT_VOLUME), 0, 1);
    state.muted = !!blob.muted;
    state.shuffle = !!blob.shuffle;
    state.repeat = REPEAT_MODES.indexOf(blob.repeat) >= 0 ? blob.repeat : 'off';
    lastVolume = state.volume > 0 ? state.volume : DEFAULT_VOLUME;
    state.queue = Array.isArray(blob.queue)
      ? blob.queue.filter(function (q) { return q && typeof q === 'object' && valid(q.trackId); })
        .map(function (q) { return { qid: typeof q.qid === 'string' && q.qid ? q.qid : newQid(), trackId: q.trackId }; })
      : [];
    var cur = valid(blob.currentTrackId) ? blob.currentTrackId : null;
    var ctx = null;
    if (cur && blob.context && typeof blob.context === 'object' && typeof blob.context.uri === 'string' && Array.isArray(blob.context.trackIds)) {
      var ids = blob.context.trackIds.filter(valid);
      if (ids.length) ctx = { uri: blob.context.uri, name: String(blob.context.name == null ? '' : blob.context.name), trackIds: ids };
    }
    if (cur && !ctx) {
      // the current track survived but its context did not: keep it playable as a single-track context
      var t0 = trackOf(cur);
      ctx = { uri: 'track:' + cur, name: t0 ? t0.title : '', trackIds: [cur] };
    }
    state.currentTrackId = cur;
    state.context = ctx;
    if (ctx) {
      var rawOrder = Array.isArray(blob.order) ? blob.order : [];
      var order = rawOrder.filter(function (id) { return valid(id) && ctx.trackIds.indexOf(id) >= 0; });
      if (!order.length) order = ctx.trackIds.slice();
      state.order = order;
      var idx = Math.floor(num(blob.index, 0));
      // the stored index is authoritative while nothing was dropped (a queue item may be current, so
      // order[index] need not equal the current track); otherwise re-anchor it on the current track
      if (order.length !== rawOrder.length || idx < 0 || idx >= order.length) idx = Math.max(0, order.indexOf(cur));
      state.index = idx;
    } else {
      state.order = [];
      state.index = 0;
    }
    var tr = trackOf(cur);
    state.duration = tr ? tr.durationMs / 1000 : 0;
    state.position = tr ? clamp(num(blob.position, 0), 0, state.duration) : 0;
    if (state.position >= state.duration - 0.5) state.position = 0;   // a finished track restarts instead of ending at once
    state.isPlaying = false;
    lastSavedPos = state.position;
  }

  /* ------------------------------------------------------------------ document.title + media session */
  function updateTitle() {
    if (!inited) return;
    var title = APP_TITLE, tr = state.isPlaying ? trackOf(state.currentTrackId) : null;
    if (tr) {
      var names = artistsOf(tr).map(function (a) { return a.name; }).join(', ');
      title = tr.title + (names ? ' • ' + names : '');
    }
    try { if (document.title !== title) document.title = title; } catch (e) {}
  }
  function mediaSession() {
    try { return typeof navigator !== 'undefined' && 'mediaSession' in navigator ? navigator.mediaSession : null; } catch (e) { return null; }
  }
  function setupMediaSession() {
    var ms = mediaSession();
    if (!ms || typeof ms.setActionHandler !== 'function') return;
    var handlers = {
      play: function () { play(); },
      pause: function () { pause(); },
      previoustrack: function () { previous(); },
      nexttrack: function () { next(); },
      seekto: function (d) { if (d && typeof d.seekTime === 'number') seek(d.seekTime); }
    };
    Object.keys(handlers).forEach(function (k) { try { ms.setActionHandler(k, handlers[k]); } catch (e) {} });
  }
  function updateMediaMetadata(tr) {
    var ms = mediaSession();
    if (!ms) return;
    try {
      if (!tr) { ms.metadata = null; return; }
      if (typeof window.MediaMetadata !== 'function') return;
      var al = albumOf(tr), cover = coverOf(tr);
      ms.metadata = new window.MediaMetadata({
        title: tr.title,
        artist: artistsOf(tr).map(function (a) { return a.name; }).join(', '),
        album: al ? al.title : '',
        artwork: cover ? [{ src: cover, sizes: '300x300', type: 'image/png' }] : []
      });
    } catch (e) {}
  }
  function updateMediaPlayback() {
    var ms = mediaSession();
    if (!ms) return;
    try { ms.playbackState = state.currentTrackId ? (state.isPlaying ? 'playing' : 'paused') : 'none'; } catch (e) {}
    try {
      if (typeof ms.setPositionState === 'function' && state.currentTrackId && state.duration > 0) {
        ms.setPositionState({ duration: state.duration, playbackRate: 1, position: clamp(state.position, 0, state.duration) });
      }
    } catch (e) {}
  }

  /* ------------------------------------------------------------------ core transitions */
  function setPlaying(flag) {
    flag = !!flag;
    if (state.isPlaying === flag) return;
    state.isPlaying = flag;
    emit('statechange', flag);
    updateTitle();
    updateMediaPlayback();
  }
  function pushHistory(id) {
    state.history.push(id);
    if (state.history.length > HISTORY_MAX) state.history.splice(0, state.history.length - HISTORY_MAX);
  }
  // Makes `id` the current track (position 0). Returns true when the track actually changed.
  // Forward moves push the outgoing track onto the history; previous() passes `back` so that walking
  // backwards consumes the history instead of growing it (otherwise two tracks would ping-pong).
  function setCurrentTrack(id, back) {
    var prev = state.currentTrackId;
    if (prev === id) return false;
    if (prev && !back) pushHistory(prev);
    var tr = trackOf(id);
    state.currentTrackId = id;
    state.position = 0;
    lastSavedPos = 0;
    state.duration = tr ? tr.durationMs / 1000 : 0;
    emit('trackchange', tr);
    updateMediaMetadata(tr);
    updateTitle();
    persist();
    return true;
  }
  function engineHolds(id) {
    var E = engine();
    return !!(id && E && E.track && E.track.id === id);
  }
  // Position in seconds: read live from the engine while it is playing the current track, else Player's own.
  function livePosition() {
    var E = engine();
    if (state.isPlaying && engineHolds(state.currentTrackId) && E.state === 'playing') {
      var t = num(E.currentTime, state.position);
      return clamp(t, 0, state.duration || t);
    }
    return state.position;
  }
  // Switches to `id` when it differs from the current track and starts it from the beginning.
  function startTrack(id, back) {
    setCurrentTrack(id, back);
    state.position = 0;
    lastSavedPos = 0;
    if (engineHolds(id)) { try { engine().seek(0); } catch (e) {} }
    emit('timeupdate', 0, state.duration);
    play();
  }
  function play() {
    var tr = trackOf(state.currentTrackId);
    if (!tr) return;
    var E = engine();
    if (!E) return;
    bindEngine();
    try { E.init(); } catch (e) {}
    var loaded = false;
    if (!E.track || E.track.id !== tr.id) {
      try { E.load(tr); } catch (e) { return; }
      loaded = true;
    }
    try { E.setVolume(state.muted ? 0 : state.volume); } catch (e) {}
    if (loaded && state.position > 0) { try { E.seek(state.position); } catch (e) {} }
    setPlaying(true);
    var gen = ++playGen, p = null;
    try { p = E.play(); } catch (e) { p = null; }
    if (p && typeof p.then === 'function') {
      p.then(function (ok) {
        if (ok === false && gen === playGen && state.isPlaying && E.state !== 'playing') setPlaying(false);
      }).catch(function () {
        if (gen === playGen && state.isPlaying && E.state !== 'playing') setPlaying(false);
      });
    } else if (E.state !== 'playing') {
      setPlaying(false);
    }
  }
  function pause() {
    var E = engine();
    playGen++;
    if (E && engineHolds(state.currentTrackId)) {
      try {
        if (E.state === 'playing') state.position = clamp(num(E.currentTime, state.position), 0, state.duration);
        E.pause();
      } catch (e) {}
    }
    setPlaying(false);
    persist();
  }
  function togglePlay() {
    if (!state.currentTrackId) return;
    if (state.isPlaying) pause(); else play();
  }
  // Last track with repeat off: stop the engine, keep the track, position 0, paused.
  function stopAtEnd() {
    playGen++;
    state.position = 0;
    lastSavedPos = 0;
    if (engineHolds(state.currentTrackId)) { try { engine().stop(); } catch (e) {} }
    setPlaying(false);
    emit('timeupdate', 0, state.duration);
    updateMediaPlayback();
    persist();
  }
  // A queue item started while no context exists plays as a single-track context.
  function ensureContextFor(trackId) {
    if (state.context) return;
    var tr = trackOf(trackId);
    state.context = { uri: 'track:' + trackId, name: tr ? tr.title : '', trackIds: [trackId] };
    state.order = [trackId];
    state.index = 0;
    emit('contextchange', cloneContext(state.context));
  }
  function buildOrder(ids, startIdx) {
    if (!state.shuffle) return ids.slice();
    var rest = ids.slice(), first = rest.splice(startIdx, 1)[0];
    return [first].concat(shuffled(rest));
  }
  function addRecent(uri) {
    var L = library();
    if (!L || typeof L.addRecent !== 'function') return;
    if (/^(playlist:|user:|album:|artist:)/.test(uri) || uri === 'liked') { try { L.addRecent(uri); } catch (e) {} }
  }

  /* ------------------------------------------------------------------ public playback API */
  function playContext(opts) {
    if (!opts || typeof opts !== 'object') return;
    var ids = (Array.isArray(opts.trackIds) ? opts.trackIds : []).filter(function (id) { return !!trackOf(id); });
    if (!ids.length) return;
    var startIdx;
    if (opts.startTrackId != null && ids.indexOf(opts.startTrackId) >= 0) startIdx = ids.indexOf(opts.startTrackId);
    else if (opts.startIndex != null && isFinite(Number(opts.startIndex))) startIdx = clamp(Math.floor(Number(opts.startIndex)), 0, ids.length - 1);
    else if (state.shuffle) startIdx = Math.floor(Math.random() * ids.length);
    else startIdx = 0;
    state.context = { uri: String(opts.uri == null ? '' : opts.uri), name: String(opts.name == null ? '' : opts.name), trackIds: ids };
    state.order = buildOrder(ids, startIdx);
    state.index = state.shuffle ? 0 : startIdx;
    emit('contextchange', cloneContext(state.context));
    addRecent(state.context.uri);
    startTrack(ids[startIdx]);
    persist();
  }
  function playTrack(trackId) {
    var C = catalog(), tr = trackOf(trackId);
    if (!tr || !C) return;
    var al = albumOf(tr), ids = [trackId];
    if (al) { try { ids = C.tracksOf(al.id).map(function (t) { return t.id; }); } catch (e) { ids = [trackId]; } }
    playContext({ uri: 'album:' + tr.albumId, name: al ? al.title : tr.title, trackIds: ids, startTrackId: trackId });
  }
  function toggleContext(ctx) {
    if (!ctx || typeof ctx !== 'object') return;
    if (state.context && state.currentTrackId && state.context.uri === ctx.uri) togglePlay();
    else playContext(ctx);
  }
  function next() {
    if (state.queue.length) {
      var item = state.queue.shift();
      emit('queuechange', state.queue.map(function (q) { return { qid: q.qid, trackId: q.trackId }; }));
      ensureContextFor(item.trackId);
      startTrack(item.trackId);
      persist();
      return;
    }
    if (!state.currentTrackId) return;
    if (!state.order.length) { stopAtEnd(); return; }
    var ni = state.index + 1;
    if (ni >= state.order.length) {
      if (state.repeat === 'context') ni = 0;
      else { stopAtEnd(); return; }
    }
    state.index = ni;
    startTrack(state.order[ni]);
  }
  function previous() {
    if (!state.currentTrackId) return;
    if (livePosition() > 3) { seek(0); return; }
    var cursorIsCurrent = state.order[state.index] === state.currentTrackId;
    if (cursorIsCurrent && state.index > 0) {
      var target = state.order[state.index - 1];
      state.index--;
      // the step back retraces the forward step that pushed `target`; drop that history entry
      if (state.history.length && state.history[state.history.length - 1] === target) state.history.pop();
      startTrack(target, true);
      return;
    }
    // at the start of the order, or a queue / history track is playing: walk back through the history
    // (never back into the manual queue)
    var prevId = null;
    while (state.history.length) {
      var id = state.history.pop();
      if (id !== state.currentTrackId && trackOf(id)) { prevId = id; break; }
    }
    if (!prevId) { seek(0); return; }
    var pos = state.order.indexOf(prevId);
    if (pos >= 0 && pos <= state.index) state.index = pos;   // never jump the context cursor forward
    startTrack(prevId, true);
  }
  function seek(seconds) {
    if (!state.currentTrackId) return;
    var s = clamp(num(seconds, 0), 0, state.duration);
    if (engineHolds(state.currentTrackId)) { try { engine().seek(s); } catch (e) {} }
    state.position = s;
    emit('timeupdate', s, state.duration);
    updateMediaPlayback();
    persist();
  }
  function seekRatio(r) { seek(clamp(num(r, 0), 0, 1) * state.duration); }
  function applyVolume() {
    var E = engine();
    if (E) { try { E.setVolume(state.muted ? 0 : state.volume); } catch (e) {} }
  }
  function emitVolume() { emit('volumechange', { volume: state.volume, muted: state.muted }); persist(); }
  function setVolume(v) {
    v = clamp(num(v, state.volume), 0, 1);
    state.volume = v;
    if (v > 0) { lastVolume = v; state.muted = false; }
    applyVolume();
    emitVolume();
  }
  function toggleMute() {
    if (!state.muted && state.volume <= 0) {
      // the slider was dragged to 0: the mute button acts as "unmute" and restores the last audible volume
      state.volume = lastVolume > 0 ? lastVolume : DEFAULT_VOLUME;
    } else {
      state.muted = !state.muted;
      if (!state.muted && state.volume <= 0) state.volume = lastVolume > 0 ? lastVolume : DEFAULT_VOLUME;
    }
    applyVolume();
    emitVolume();
  }
  function emitMode() { emit('modechange', { shuffle: state.shuffle, repeat: state.repeat }); persist(); }
  function toggleShuffle() {
    state.shuffle = !state.shuffle;
    if (state.context) {
      var anchor = state.order[state.index] != null ? state.order[state.index] : state.currentTrackId;
      var ids = state.context.trackIds;
      if (state.shuffle) {
        var ai = ids.indexOf(anchor);
        if (ai < 0) { ai = ids.indexOf(state.currentTrackId); }
        if (ai >= 0) { state.order = buildOrder(ids, ai); }
        else { state.order = [anchor].concat(shuffled(ids)); }
        state.index = 0;
      } else {
        state.order = ids.slice();
        var pos = state.order.indexOf(anchor);
        if (pos < 0) pos = state.order.indexOf(state.currentTrackId);
        state.index = Math.max(0, pos);
      }
    }
    emitMode();
  }
  function cycleRepeat() {
    state.repeat = REPEAT_MODES[(REPEAT_MODES.indexOf(state.repeat) + 1) % REPEAT_MODES.length];
    emitMode();
  }

  /* ------------------------------------------------------------------ queue */
  function queueCopy() { return state.queue.map(function (q) { return { qid: q.qid, trackId: q.trackId }; }); }
  function emitQueue() { emit('queuechange', queueCopy()); persist(); }
  function findQueue(qid) {
    for (var i = 0; i < state.queue.length; i++) if (state.queue[i].qid === qid) return i;
    return -1;
  }
  function addToQueue(trackIdOrIds) {
    var ids = Array.isArray(trackIdOrIds) ? trackIdOrIds : [trackIdOrIds], added = 0;
    ids.forEach(function (id) { if (trackOf(id)) { state.queue.push({ qid: newQid(), trackId: id }); added++; } });
    if (added) emitQueue();
    return added;
  }
  function playNext(trackId) {
    if (!trackOf(trackId)) return false;
    state.queue.unshift({ qid: newQid(), trackId: trackId });
    emitQueue();
    return true;
  }
  function removeFromQueue(qid) {
    var i = findQueue(qid);
    if (i < 0) return false;
    state.queue.splice(i, 1);
    emitQueue();
    return true;
  }
  function clearQueue() {
    if (!state.queue.length) return;
    state.queue = [];
    emitQueue();
  }
  function playQueueItem(qid) {
    var i = findQueue(qid);
    if (i < 0) return;
    var item = state.queue[i];
    state.queue.splice(0, i + 1);
    emit('queuechange', queueCopy());
    ensureContextFor(item.trackId);
    startTrack(item.trackId);
    persist();
  }
  function upcoming(n) {
    n = n == null ? 50 : Math.max(0, Math.floor(num(n, 50)));
    var out = [], i;
    for (i = 0; i < state.queue.length && out.length < n; i++) out.push({ qid: state.queue[i].qid, trackId: state.queue[i].trackId, source: 'queue' });
    var len = state.order.length;
    if (len) {
      var count = state.repeat === 'context' ? len : Math.max(0, len - state.index - 1);
      for (var k = 1; k <= count && out.length < n; k++) out.push({ qid: null, trackId: state.order[(state.index + k) % len], source: 'context' });
    }
    return out;
  }

  /* ------------------------------------------------------------------ queries */
  function getState() {
    return {
      currentTrackId: state.currentTrackId,
      context: cloneContext(state.context),
      index: state.index,
      order: state.order.slice(),
      queue: queueCopy(),
      history: state.history.slice(),
      isPlaying: state.isPlaying,
      position: livePosition(),
      duration: state.duration,
      volume: state.volume,
      muted: state.muted,
      shuffle: state.shuffle,
      repeat: state.repeat
    };
  }
  function currentTrack() { return trackOf(state.currentTrackId); }
  function isCurrentContext(uri) { return !!(state.context && state.context.uri === uri); }
  function isCurrentTrack(trackId) { return !!trackId && state.currentTrackId === trackId; }
  function isLiked(id) {
    var L = library();
    if (!id || !L || typeof L.isLiked !== 'function') return false;
    try { return !!L.isLiked(id); } catch (e) { return false; }
  }
  function likeCurrent() {
    var id = state.currentTrackId, L = library();
    if (!id || !L || typeof L.toggleLike !== 'function') return null;
    var liked;
    try { liked = !!L.toggleLike(id); } catch (e) { return null; }
    toast(liked ? 'Added to Liked Songs' : 'Removed from Liked Songs');
    renderLike();
    return liked;
  }

  /* ------------------------------------------------------------------ audio engine binding */
  function bindEngine() {
    var E = engine();
    if (!E || engineBound || typeof E.on !== 'function') return;
    engineBound = true;
    E.on('timeupdate', function (t) {
      if (!engineHolds(state.currentTrackId)) return;
      state.position = clamp(num(t, state.position), 0, state.duration || num(E.duration, 0));
      emit('timeupdate', state.position, state.duration);
      if (Math.abs(state.position - lastSavedPos) >= PERSIST_EVERY) persist();
    });
    E.on('ended', function () {
      if (!engineHolds(state.currentTrackId)) return;
      if (state.repeat === 'track') {
        state.position = 0;
        lastSavedPos = 0;
        try { E.seek(0); } catch (e) {}
        emit('timeupdate', 0, state.duration);
        play();
      } else {
        next();
      }
    });
    E.on('statechange', function (s) {
      if (!engineHolds(state.currentTrackId)) return;
      if (s === 'playing') {
        // the engine only starts on Player's request; if the user paused while a resume was pending, honour the pause
        if (!state.isPlaying) { try { E.pause(); } catch (e) {} }
      } else if (state.isPlaying) {
        setPlaying(false);
      }
    });
  }

  /* ------------------------------------------------------------------ UI: markup */
  function svg(id, cls, hidden) {
    return '<svg class="icon' + (cls ? ' ' + cls : '') + '" aria-hidden="true"' + (hidden ? ' hidden' : '') + '><use href="#' + id + '"/></svg>';
  }
  function playPauseIcons(cls) { return svg('i-play', cls) + svg('i-pause', cls, true); }
  function likeIcons(cls) { return svg('i-add-circle', cls) + svg('i-check-circle', cls, true); }
  function repeatIcons(cls) { return svg('i-repeat', cls) + svg('i-repeat-one', cls, true); }
  function volumeIcons(cls) { return svg('i-volume-high', cls) + svg('i-volume-mid', cls, true) + svg('i-volume-low', cls, true) + svg('i-volume-off', cls, true); }
  function progressSlider(extra) {
    return '<input type="range" class="slider slider--progress' + (extra ? ' ' + extra : '') + '" min="0" max="1000" step="1" value="0" aria-label="Seek">';
  }
  // Terminal window chrome (DESIGN 2.1 / 3.18): a decorative bar (hairline + "- ×") and the "> /media" prompt title.
  // Both are new aria-hidden elements whose text comes from CSS, so no existing text node changes.
  function winBar(ruleW) {
    return '<div class="win__bar" aria-hidden="true" style="--rule-w:' + ruleW + '"></div>';
  }
  // Stepped 3-bar meter shown beside "> /media" while audio plays (state as shape, never colour; DESIGN 3.0).
  function meterMarkup(cls) {
    return '<span class="equaliser ' + cls + '" aria-hidden="true"><i></i><i></i><i></i></span>';
  }
  function floraReady() {
    return false;   // flower decorations are switched off (see FLORA_ON in app.js); the expanded player shows no sprig
  }
  function barMarkup() {
    return '' +
      winBar('100%') +
      '<div class="win__title pb-win-title" aria-hidden="true" data-path="/media">' + meterMarkup('pb-eq') + '</div>' +
      '<div class="pb-left">' +
        '<div class="pb-cover"><img class="cover" alt="" draggable="false"><button class="pb-cover__expand" type="button" aria-label="Expand">' + svg('i-expand') + '</button></div>' +
        '<div class="pb-text"><div class="pb-title"><a class="pb-title__link" href="#"></a></div><div class="pb-artist"></div></div>' +
        '<button class="icon-btn pb-like" type="button" aria-label="Add to Liked Songs">' + likeIcons('icon--sm') + '</button>' +
      '</div>' +
      '<div class="pb-center">' +
        '<div class="pb-controls">' +
          '<button class="icon-btn icon-btn--dot pb-shuffle" type="button" aria-label="Enable shuffle">' + svg('i-shuffle', 'icon--sm') + '</button>' +
          '<button class="icon-btn pb-prev" type="button" aria-label="Previous">' + svg('i-prev', 'icon--sm') + '</button>' +
          '<button class="play-btn play-btn--white pb-play" type="button" aria-label="Play">' + playPauseIcons() + '</button>' +
          '<button class="icon-btn pb-next" type="button" aria-label="Next">' + svg('i-next', 'icon--sm') + '</button>' +
          '<button class="icon-btn icon-btn--dot pb-repeat" type="button" aria-label="Enable repeat">' + repeatIcons('icon--sm') + '</button>' +
        '</div>' +
        '<div class="pb-progress"><span class="pb-time pb-time--elapsed">0:00</span>' + progressSlider() + '<span class="pb-time pb-time--total">0:00</span></div>' +
      '</div>' +
      '<div class="pb-right">' +
        '<button class="icon-btn icon-btn--dot pb-npv" type="button" aria-label="Now playing view">' + svg('i-now-playing', 'icon--sm') + '</button>' +
        '<button class="icon-btn icon-btn--dot pb-queue" type="button" aria-label="Queue">' + svg('i-queue', 'icon--sm') + '</button>' +
        '<div class="pb-volume"><button class="icon-btn pb-mute" type="button" aria-label="Mute">' + volumeIcons('icon--sm') + '</button>' +
        '<input type="range" class="slider slider--volume" min="0" max="100" step="1" value="70" aria-label="Volume">' +
        '<span class="pb-vol-pct" aria-hidden="true">70%</span></div>' +
      '</div>';
  }
  function miniMarkup() {
    return '' +
      winBar('80%') +
      '<div class="mini-player__inner">' +
        // cover + text form one real button, so keyboard and screen-reader users can open the full-screen player
        '<button class="mini-player__open" type="button" aria-label="Open Now Playing view">' +
          '<img class="cover cover--40" alt="" draggable="false">' +
          '<span class="mini-player__text">' +
            '<span class="marquee mini-player__title"><span class="marquee__inner"><span class="mini-player__title-text"></span></span></span>' +
            '<span class="mini-player__artist"></span>' +
          '</span>' +
        '</button>' +
        '<button class="icon-btn mp-like" type="button" aria-label="Add to Liked Songs">' + likeIcons() + '</button>' +
        '<button class="icon-btn mp-play" type="button" aria-label="Play">' + playPauseIcons() + '</button>' +
      '</div>' +
      '<div class="mini-player__progress" aria-hidden="true"><i style="--fill:0%"></i></div>';
  }
  function expandedMarkup() {
    // the bar is decorative (both "- ×" drawn); the chevron .xp-close stays the only close control (DESIGN 3.21)
    return '' +
      winBar('76%') +
      '<div class="xp__top">' +
        '<button class="icon-btn xp-close" type="button" aria-label="Close">' + svg('i-chevron-down') + '</button>' +
        '<div class="xp__context"><span class="eyebrow xp-eyebrow"></span><span class="xp__context-name xp-ctx-name"></span></div>' +
        '<button class="icon-btn xp-more" type="button" aria-label="More options">' + svg('i-more') + '</button>' +
      '</div>' +
      '<div class="xp__cover"><img class="cover" alt="" draggable="false"></div>' +
      '<div class="xp__title-row"><div class="xp__text"><div class="xp__title"></div><div class="xp__artist"></div></div>' +
        '<button class="icon-btn xp-like" type="button" aria-label="Add to Liked Songs">' + likeIcons() + '</button></div>' +
      '<div class="xp__progress">' + progressSlider('slider--thumb') +
        '<div class="xp__times"><span class="xp-elapsed">0:00</span><span class="xp-remaining">-0:00</span></div></div>' +
      '<div class="xp__controls">' +
        '<button class="icon-btn icon-btn--dot xp-shuffle" type="button" aria-label="Enable shuffle">' + svg('i-shuffle') + '</button>' +
        '<button class="icon-btn xp-prev" type="button" aria-label="Previous">' + svg('i-prev') + '</button>' +
        '<button class="play-btn play-btn--white play-btn--xl xp-play" type="button" aria-label="Play">' + playPauseIcons() + '</button>' +
        '<button class="icon-btn xp-next" type="button" aria-label="Next">' + svg('i-next') + '</button>' +
        '<button class="icon-btn icon-btn--dot xp-repeat" type="button" aria-label="Enable repeat">' + repeatIcons() + '</button>' +
      '</div>' +
      // the window floor: a lazily painted sprig of the album's species grows in from the bottom-left corner
      // (new aria-hidden .flora image, painted when the view opens; not rendered at all without Flora)
      '<div class="xp__bottom">' +
        (floraReady() ? '<img class="flora xp__flora" alt="" aria-hidden="true" width="' + XP_FLORA.w + '" height="' + XP_FLORA.h + '" draggable="false">' : '') +
        '<button class="icon-btn xp-queue" type="button" aria-label="Queue">' + svg('i-queue') + '</button></div>';
  }

  /* ------------------------------------------------------------------ UI: build + wiring */
  function q(root, sel) { return root ? root.querySelector(sel) : null; }
  // SVG elements have no `hidden` IDL property (it lives on HTMLElement), so the attribute is toggled explicitly.
  function setIcon(btn, visibleId) {
    if (!btn) return;
    var icons = btn.querySelectorAll('svg.icon');
    for (var i = 0; i < icons.length; i++) {
      var use = icons[i].querySelector('use'), id = use ? (use.getAttribute('href') || '').slice(1) : '';
      var hide = id !== visibleId;
      if (hide !== icons[i].hasAttribute('hidden')) {
        if (hide) icons[i].setAttribute('hidden', ''); else icons[i].removeAttribute('hidden');
      }
    }
  }
  function setLabel(el, label) { if (el && el.getAttribute('aria-label') !== label) el.setAttribute('aria-label', label); }
  function setText(el, text) { if (el && el.textContent !== text) el.textContent = text; }
  function setImg(img, src) {
    if (!img) return;
    if (!src) { if (img.hasAttribute('src')) img.removeAttribute('src'); return; }
    if (img.getAttribute('src') !== src) img.setAttribute('src', src);
  }
  function setFill(input, pct) { if (input) input.style.setProperty('--fill', pct + '%'); }
  function setDisabled(el, flag) { if (el && el.disabled !== flag) el.disabled = flag; }
  function stop(e) { e.stopPropagation(); }

  function buildUI() {
    var barRoot = document.getElementById('player-bar');
    var miniRoot = document.getElementById('mini-player');
    var xpRoot = document.getElementById('expanded-player');
    ui = { bar: null, mini: null, xp: null };
    if (barRoot) {
      barRoot.innerHTML = barMarkup();
      ui.bar = {
        root: barRoot,
        cover: q(barRoot, '.pb-cover .cover'), expand: q(barRoot, '.pb-cover__expand'),
        title: q(barRoot, '.pb-title__link'), artist: q(barRoot, '.pb-artist'), like: q(barRoot, '.pb-like'),
        shuffle: q(barRoot, '.pb-shuffle'), prev: q(barRoot, '.pb-prev'), play: q(barRoot, '.pb-play'), next: q(barRoot, '.pb-next'), repeat: q(barRoot, '.pb-repeat'),
        elapsed: q(barRoot, '.pb-time--elapsed'), total: q(barRoot, '.pb-time--total'), progress: q(barRoot, '.slider--progress'),
        npv: q(barRoot, '.pb-npv'), queue: q(barRoot, '.pb-queue'), mute: q(barRoot, '.pb-mute'), volume: q(barRoot, '.slider--volume'),
        volPct: q(barRoot, '.pb-vol-pct')
      };
      wireBar(ui.bar);
    }
    if (miniRoot) {
      miniRoot.innerHTML = miniMarkup();
      ui.mini = {
        root: miniRoot, open: q(miniRoot, '.mini-player__open'), cover: q(miniRoot, '.cover'), marquee: q(miniRoot, '.marquee'), marqueeInner: q(miniRoot, '.marquee__inner'),
        title: q(miniRoot, '.mini-player__title-text'), artist: q(miniRoot, '.mini-player__artist'),
        like: q(miniRoot, '.mp-like'), play: q(miniRoot, '.mp-play'), progress: q(miniRoot, '.mini-player__progress i')
      };
      wireMini(ui.mini);
    }
    if (xpRoot) {
      xpRoot.innerHTML = expandedMarkup();
      // a full-screen modal view: announced as a dialog, and the page behind it is made inert while it is open
      xpRoot.setAttribute('role', 'dialog');
      xpRoot.setAttribute('aria-modal', 'true');
      xpRoot.setAttribute('aria-label', 'Now playing');
      ui.xp = {
        root: xpRoot, close: q(xpRoot, '.xp-close'), eyebrow: q(xpRoot, '.xp-eyebrow'), ctxName: q(xpRoot, '.xp-ctx-name'), more: q(xpRoot, '.xp-more'),
        coverWrap: q(xpRoot, '.xp__cover'), cover: q(xpRoot, '.xp__cover .cover'), title: q(xpRoot, '.xp__title'), artist: q(xpRoot, '.xp__artist'), like: q(xpRoot, '.xp-like'),
        progress: q(xpRoot, '.slider--progress'), elapsed: q(xpRoot, '.xp-elapsed'), remaining: q(xpRoot, '.xp-remaining'),
        shuffle: q(xpRoot, '.xp-shuffle'), prev: q(xpRoot, '.xp-prev'), play: q(xpRoot, '.xp-play'), next: q(xpRoot, '.xp-next'), repeat: q(xpRoot, '.xp-repeat'),
        queue: q(xpRoot, '.xp-queue'), flora: q(xpRoot, '.xp__flora')
      };
      wireExpanded(ui.xp);
    }
  }
  function wireProgress(input, previewEl, previewFn) {
    if (!input) return;
    input.addEventListener('pointerdown', function () { dragging = true; });
    input.addEventListener('input', function () {
      dragging = true;
      var ratio = clamp(num(input.value, 0) / 1000, 0, 1);
      setFill(input, ratio * 100);
      if (previewFn) previewFn(ratio * state.duration);
      else if (previewEl) setText(previewEl, fmtTime(ratio * state.duration));
    });
    input.addEventListener('change', function () {
      dragging = false;
      seekRatio(num(input.value, 0) / 1000);
    });
    var release = function () { setTimeout(function () { if (dragging) { dragging = false; renderTime(); } }, 60); };
    input.addEventListener('pointerup', release);
    input.addEventListener('pointercancel', release);
    input.addEventListener('keyup', release);
  }
  function wireNavLinks(container) {
    container.addEventListener('click', function (e) {
      var a = e.target.closest ? e.target.closest('a') : null;
      if (!a || !container.contains(a)) return;
      e.preventDefault();
      if (a.classList.contains('pb-title__link')) {
        var tr = currentTrack();
        if (tr) navigate({ view: 'album', id: tr.albumId });
      } else if (a.hasAttribute('data-artist-id')) {
        closeExpanded();
        navigate({ view: 'artist', id: a.getAttribute('data-artist-id') });
      }
    });
  }
  function wireBar(b) {
    b.play.addEventListener('click', togglePlay);
    b.prev.addEventListener('click', previous);
    b.next.addEventListener('click', next);
    b.shuffle.addEventListener('click', toggleShuffle);
    b.repeat.addEventListener('click', cycleRepeat);
    b.like.addEventListener('click', likeCurrent);
    b.mute.addEventListener('click', toggleMute);
    // "Expand" opens the Now Playing panel; setRightPanel toggles, so skip the call when it is already open
    b.expand.addEventListener('click', function () { if (rightPanelMode() !== 'now-playing') setRightPanel('now-playing'); });
    b.npv.addEventListener('click', function () { setRightPanel('now-playing'); });
    // the right panel only exists at desktop widths; on a tablet the queue opens as the Queue page
    b.queue.addEventListener('click', function () { if (desktopLayout()) setRightPanel('queue'); else navigate({ view: 'queue' }); });
    b.volume.addEventListener('input', function () { setVolume(num(b.volume.value, 70) / 100); });
    wireProgress(b.progress, b.elapsed);
    wireNavLinks(b.root);
  }
  function wireMini(m) {
    m.play.addEventListener('click', function (e) { stop(e); togglePlay(); });
    m.like.addEventListener('click', function (e) { stop(e); likeCurrent(); });
    // keyboard / assistive-technology activation (pointer taps and swipes are handled by swipe() below)
    if (m.open) m.open.addEventListener('click', function (e) { stop(e); openExpanded(); });
    swipe(m.root, {
      filter: function (e) { return !(e.target.closest && e.target.closest('.mp-like, .mp-play')); },
      onLeft: next, onRight: previous, onUp: openExpanded, onTap: openExpanded, minX: 60, minY: 60
    });
  }
  function wireExpanded(x) {
    x.close.addEventListener('click', closeExpanded);
    x.play.addEventListener('click', togglePlay);
    x.prev.addEventListener('click', previous);
    x.next.addEventListener('click', next);
    x.shuffle.addEventListener('click', toggleShuffle);
    x.repeat.addEventListener('click', cycleRepeat);
    x.like.addEventListener('click', likeCurrent);
    x.queue.addEventListener('click', function () { closeExpanded(); navigate({ view: 'queue' }); });
    x.more.addEventListener('click', function () {
      var A = app(), id = state.currentTrackId, tr = trackOf(id);
      if (!A || !id || typeof A.openContextMenu !== 'function' || typeof A.trackMenuItems !== 'function') return;
      // `title` names the menu's "> <target>" head line (DESIGN 3.14); an app that does not know it ignores it
      try { A.openContextMenu(A.trackMenuItems(id), { anchor: x.more, title: tr ? tr.title : '' }); } catch (e) {}
    });
    wireProgress(x.progress, null, function (sec) {
      setText(x.elapsed, fmtTime(sec));
      setText(x.remaining, '-' + fmtTime(Math.ceil(state.duration - sec)));
    });
    wireNavLinks(x.root);
    swipe(x.coverWrap, {
      onLeft: function () { slideCover('left', next); },
      onRight: function () { slideCover('right', previous); },
      onDown: closeExpanded, minX: 60, minY: 80
    });
    // swipe down anywhere on the overlay closes it (touch only; the chevron serves the mouse)
    var tsx = 0, tsy = 0, tsTop = 0;
    x.root.addEventListener('touchstart', function (e) {
      var t = e.touches && e.touches[0]; if (!t) return;
      tsx = t.clientX; tsy = t.clientY; tsTop = x.root.scrollTop;
    }, { passive: true });
    x.root.addEventListener('touchend', function (e) {
      var t = e.changedTouches && e.changedTouches[0]; if (!t) return;
      if (e.target.closest && e.target.closest('.xp__cover, input, button')) return;
      var dx = t.clientX - tsx, dy = t.clientY - tsy;
      if (dy >= 80 && Math.abs(dy) > Math.abs(dx) && tsTop <= 0 && x.root.scrollTop <= 0) closeExpanded();
    }, { passive: true });
  }
  // Pointer-based swipe / tap detection (the element gets touch-action: none from player.css).
  function swipe(el, opts) {
    var sx = 0, sy = 0, active = false, pid = null;
    el.addEventListener('pointerdown', function (e) {
      if (opts.filter && !opts.filter(e)) return;
      if (e.button != null && e.button !== 0) return;
      active = true; sx = e.clientX; sy = e.clientY; pid = e.pointerId;
      try { el.setPointerCapture(pid); } catch (err) {}
    });
    el.addEventListener('pointerup', function (e) {
      if (!active || e.pointerId !== pid) return;
      active = false;
      try { el.releasePointerCapture(pid); } catch (err) {}
      var dx = e.clientX - sx, dy = e.clientY - sy, ax = Math.abs(dx), ay = Math.abs(dy);
      var minX = opts.minX || 60, minY = opts.minY || 60;
      if (ax >= minX && ax > ay) { if (dx < 0) { if (opts.onLeft) opts.onLeft(); } else if (opts.onRight) opts.onRight(); }
      else if (ay >= minY && ay > ax) { if (dy < 0) { if (opts.onUp) opts.onUp(); } else if (opts.onDown) opts.onDown(); }
      else if (ax < 10 && ay < 10 && opts.onTap) opts.onTap(e);
    });
    el.addEventListener('pointercancel', function () { active = false; });
  }
  function slideCover(dir, action) {
    var wrap = ui && ui.xp ? ui.xp.coverWrap : null;
    if (!wrap) { action(); return; }
    var out = dir === 'left' ? 'is-slide-left' : 'is-slide-right', back = dir === 'left' ? 'is-slide-right' : 'is-slide-left';
    wrap.classList.add(out);
    setTimeout(function () {
      action();
      wrap.classList.add('is-static');
      wrap.classList.remove(out);
      wrap.classList.add(back);
      void wrap.offsetWidth;                  // commit the off-screen position without a transition
      wrap.classList.remove('is-static');
      wrap.classList.remove(back);            // slides in from the other side
    }, 200);
  }
  function setRightPanel(mode) {
    var A = app();
    if (A && typeof A.setRightPanel === 'function') { try { A.setRightPanel(mode); } catch (e) {} }
  }
  function rightPanelMode() {
    var A = app();
    if (!A || typeof A.rightPanelMode !== 'function') return null;
    try { return A.rightPanelMode(); } catch (e) { return null; }
  }
  function bindApp() {
    var A = app();
    if (!A) return;
    if (typeof A.on === 'function') { try { A.on('rightpanel', renderPanelToggles); } catch (e) {} }
    renderPanelToggles(rightPanelMode());
  }
  function bindLibrary() {
    var L = library();
    if (!L || typeof L.on !== 'function') return;
    try { L.on('change', function (ch) { if (ch && ch.type === 'like') renderLike(); }); } catch (e) {}
  }
  function bindViewport() {
    var resizeTimer = null;
    var queueMarquee = function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(updateMarquee, 120);
    };
    window.addEventListener('resize', queueMarquee);
    // the mini player only has a width on phone layouts; observe it so the marquee is measured once it appears
    try {
      if (ui && ui.mini && typeof window.ResizeObserver === 'function') new ResizeObserver(queueMarquee).observe(ui.mini.marquee);
    } catch (e) {}
    try {
      phoneMql = window.matchMedia(PHONE_MQ);
      var onChange = function (mq) { if (!mq.matches) closeExpanded(); queueMarquee(); };
      if (typeof phoneMql.addEventListener === 'function') phoneMql.addEventListener('change', onChange);
      else if (typeof phoneMql.addListener === 'function') phoneMql.addListener(onChange);
    } catch (e) { phoneMql = null; }
    // re-measure the marquee when ambient motion is switched off/on (App.setPetals sets html[data-motion])
    // or when the reduced-motion preference changes
    try {
      if (typeof window.MutationObserver === 'function') {
        new MutationObserver(queueMarquee).observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] });
      }
      var rmq = window.matchMedia('(prefers-reduced-motion: reduce)');
      if (typeof rmq.addEventListener === 'function') rmq.addEventListener('change', queueMarquee);
      else if (typeof rmq.addListener === 'function') rmq.addListener(queueMarquee);
    } catch (e) {}
    // keep the stored position exact across reloads (the periodic save only runs every 5 s of playback)
    window.addEventListener('pagehide', persistLive);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') persistLive(); });
  }

  /* ------------------------------------------------------------------ UI: rendering */
  var uiHandlers = {
    trackchange: function () { renderTrack(); },
    statechange: function () { renderPlayState(); },
    timeupdate: function () { renderTime(); },
    modechange: function () { renderModes(); },
    volumechange: function () { renderVolume(); },
    contextchange: function () { renderContext(); },
    queuechange: function () {}
  };
  function renderAll() {
    renderTrack();
    renderModes();
    renderVolume();
  }
  function renderArtistLinks(container, artists) {
    if (!container) return;
    container.textContent = '';
    artists.forEach(function (a, i) {
      if (i) container.appendChild(document.createTextNode(', '));
      var link = document.createElement('a');
      link.href = '#';
      link.setAttribute('data-artist-id', a.id);
      link.textContent = a.name;
      container.appendChild(link);
    });
  }
  function renderTrack() {
    if (!ui) return;
    var tr = currentTrack(), al = albumOf(tr), artists = tr ? artistsOf(tr) : [], cover = tr ? coverOf(tr) : '';
    var names = artists.map(function (a) { return a.name; }).join(', ');
    var color = al && al.color ? al.color : null;
    var b = ui.bar, m = ui.mini, x = ui.xp;
    if (b) {
      b.root.classList.toggle('is-empty', !tr);
      setImg(b.cover, cover);
      setText(b.title, tr ? tr.title : '');
      renderArtistLinks(b.artist, artists);
      [b.shuffle, b.prev, b.play, b.next, b.repeat, b.progress].forEach(function (el) { setDisabled(el, !tr); });
    }
    if (m) {
      m.root.hidden = !tr;
      setImg(m.cover, cover);
      setText(m.title, tr ? tr.title : '');
      setText(m.artist, names);
      setLabel(m.open, tr ? tr.title + (names ? ' • ' + names : '') + ', open Now Playing view' : 'Open Now Playing view');
      var mc = darken(color, 0.55);
      if (mc) m.root.style.setProperty('--mini-color', mc); else m.root.style.removeProperty('--mini-color');
      updateMarquee();
    }
    if (x) {
      setImg(x.cover, cover);
      setText(x.title, tr ? tr.title : '');
      renderArtistLinks(x.artist, artists);
      var xc = darken(color, 0.7);
      if (xc) x.root.style.setProperty('--xp-color', xc); else x.root.style.removeProperty('--xp-color');
      if (!tr) closeExpanded(); else scheduleXpFlora();
    }
    renderContext();
    renderLike();
    renderPlayState();
    renderTime();
  }
  function renderContext() {
    if (!ui || !ui.xp) return;
    var c = state.context;
    setText(ui.xp.eyebrow, c ? eyebrowFor(c.uri) : '');
    setText(ui.xp.ctxName, c ? c.name : '');
  }
  function renderPlayState() {
    if (!ui) return;
    var playing = state.isPlaying, id = playing ? 'i-pause' : 'i-play', label = playing ? 'Pause' : 'Play';
    [ui.bar && ui.bar.play, ui.mini && ui.mini.play, ui.xp && ui.xp.play].forEach(function (btn) {
      if (!btn) return;
      setIcon(btn, id);
      setLabel(btn, label);
    });
    // playback state as an attribute for the CSS (the stepped meter beside "> /media"); never a colour
    var st = !state.currentTrackId ? 'empty' : playing ? 'playing' : 'paused';
    [ui.bar, ui.mini, ui.xp].forEach(function (part) {
      if (part && part.root.getAttribute('data-state') !== st) part.root.setAttribute('data-state', st);
    });
  }
  function renderTime() {
    if (!ui) return;
    var pos = state.position, dur = state.duration, ratio = dur > 0 ? clamp(pos / dur, 0, 1) : 0, pct = ratio * 100;
    var elapsed = fmtTime(pos), total = fmtTime(dur), remaining = '-' + fmtTime(Math.ceil(Math.max(0, dur - pos)));
    if (ui.bar) {
      setText(ui.bar.total, total);
      if (!dragging) {
        setText(ui.bar.elapsed, elapsed);
        ui.bar.progress.value = Math.round(ratio * 1000);
        setFill(ui.bar.progress, pct);
      }
    }
    if (ui.mini) setFill(ui.mini.progress, pct);
    if (ui.xp && !dragging) {
      setText(ui.xp.elapsed, elapsed);
      setText(ui.xp.remaining, remaining);
      ui.xp.progress.value = Math.round(ratio * 1000);
      setFill(ui.xp.progress, pct);
    }
  }
  function renderModes() {
    if (!ui) return;
    var sh = state.shuffle, rp = state.repeat;
    var shLabel = sh ? 'Disable shuffle' : 'Enable shuffle';
    var rpLabel = rp === 'off' ? 'Enable repeat' : rp === 'context' ? 'Enable repeat one' : 'Disable repeat';
    var rpIcon = rp === 'track' ? 'i-repeat-one' : 'i-repeat';
    [ui.bar, ui.xp].forEach(function (part) {
      if (!part) return;
      part.shuffle.classList.toggle('is-active', sh);
      setLabel(part.shuffle, shLabel);
      part.repeat.classList.toggle('is-active', rp !== 'off');
      setLabel(part.repeat, rpLabel);
      setIcon(part.repeat, rpIcon);
    });
  }
  function renderVolume() {
    if (!ui || !ui.bar) return;
    var v = state.muted ? 0 : state.volume;
    var icon = v <= 0 ? 'i-volume-off' : v < 0.33 ? 'i-volume-low' : v < 0.66 ? 'i-volume-mid' : 'i-volume-high';
    setIcon(ui.bar.mute, icon);
    setLabel(ui.bar.mute, state.muted ? 'Unmute' : 'Mute');
    ui.bar.mute.classList.toggle('is-muted', state.muted);
    var pct = Math.round(v * 100);
    if (num(ui.bar.volume.value, -1) !== pct) ui.bar.volume.value = pct;
    setFill(ui.bar.volume, pct);
    // the 10-cell volume bar fills whole cells: --fill-q is the value rounded to the nearest 10% (DESIGN 3.19)
    ui.bar.volume.style.setProperty('--fill-q', Math.round(pct / 10) * 10 + '%');
    setText(ui.bar.volPct, pct + '%');
  }
  function renderLike() {
    if (!ui) return;
    var id = state.currentTrackId, liked = isLiked(id);
    [ui.bar && ui.bar.like, ui.mini && ui.mini.like, ui.xp && ui.xp.like].forEach(function (btn) {
      if (!btn) return;
      setIcon(btn, liked ? 'i-check-circle' : 'i-add-circle');
      btn.classList.toggle('is-active', liked);
      btn.classList.toggle('is-liked', liked);
      setLabel(btn, liked ? 'Remove from Liked Songs' : 'Add to Liked Songs');
      setDisabled(btn, !id);
    });
  }
  function renderPanelToggles(mode) {
    if (!ui || !ui.bar) return;
    ui.bar.npv.classList.toggle('is-active', mode === 'now-playing');
    ui.bar.queue.classList.toggle('is-active', mode === 'queue');
    // expose the open/closed state to assistive technology, not only by colour
    ui.bar.npv.setAttribute('aria-pressed', String(mode === 'now-playing'));
    ui.bar.queue.setAttribute('aria-pressed', String(mode === 'queue'));
  }
  function updateMarquee() {
    if (!ui || !ui.mini) return;
    var m = ui.mini.marquee, inner = ui.mini.marqueeInner;
    m.classList.remove('is-scrolling');
    while (inner.children.length > 1) inner.removeChild(inner.lastChild);
    if (ui.mini.root.hidden || !m.clientWidth) return;
    var still = false;
    try { still = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
    // the petals toggle is the ambient-motion switch: html[data-motion="off"] stops the marquee too (DESIGN 8.3)
    if (document.documentElement.getAttribute('data-motion') === 'off') still = true;
    if (!still && inner.scrollWidth > m.clientWidth + 1) {
      var dup = inner.firstElementChild.cloneNode(true);
      dup.setAttribute('aria-hidden', 'true');
      inner.appendChild(dup);
      m.classList.add('is-scrolling');
    }
  }

  /* ------------------------------------------------------------------ expanded player */
  function isExpanded() { return !!(ui && ui.xp && !ui.xp.root.hidden); }
  // The floor sprig of the expanded view: the current album's cover species, seeded per album. It is painted
  // lazily (next frame, then a task) only while the view is open: one Flora.sprite call, cached by Flora's LRU.
  var xpFloraKey = '', xpFloraTimer = 0;
  function xpFloraOpts() {
    var tr = currentTrack(), C = catalog(), sp = '';
    if (!tr) return null;
    try { if (C && typeof C.coverSpecies === 'function') sp = C.coverSpecies(albumOf(tr) || tr.albumId) || ''; } catch (e) { sp = ''; }
    return { kind: 'sprig', species: sp || 'sakura', seed: 'xp:' + (tr.albumId || tr.id), w: XP_FLORA.w, h: XP_FLORA.h, anchor: 'bottomleft' };
  }
  function paintXpFlora() {
    xpFloraTimer = 0;
    var img = ui && ui.xp ? ui.xp.flora : null;
    if (!img || !isExpanded() || !floraReady()) return;
    var o = xpFloraOpts();
    if (!o) return;
    var key = JSON.stringify(o);
    if (key === xpFloraKey && img.hasAttribute('src')) return;
    var src = '';
    try { src = window.Flora.sprite(o) || ''; } catch (e) { src = ''; }
    xpFloraKey = key;
    if (src) { setImg(img, src); img.hidden = false; } else { setImg(img, ''); img.hidden = true; }
  }
  function scheduleXpFlora() {
    if (xpFloraTimer || !ui || !ui.xp || !ui.xp.flora || !isExpanded()) return;
    xpFloraTimer = -1;
    var run = function () { xpFloraTimer = setTimeout(paintXpFlora, 0); };
    if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(run); else run();
  }
  // The expanded view is the phone now-playing screen: it only opens at phone widths (styles.css hides it above).
  var xpReturnFocus = null;
  // While the overlay is open, the rest of #app (hidden under it) leaves the tab order and the accessibility tree.
  var INERT_BEHIND = ['main', 'mini-player', 'bottom-nav', 'topbar', 'sidebar', 'right-panel', 'player-bar'];
  function setBackgroundInert(flag) {
    INERT_BEHIND.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      if (flag) el.setAttribute('inert', ''); else el.removeAttribute('inert');
    });
  }
  function openExpanded() {
    if (!ui || !ui.xp || !state.currentTrackId || !ui.xp.root.hidden || !phoneLayout()) return;
    xpReturnFocus = document.activeElement;
    ui.xp.root.hidden = false;
    setBackgroundInert(true);
    ui.xp.root.scrollTop = 0;
    renderTime();
    scheduleXpFlora();
    try { ui.xp.close.focus({ preventScroll: true }); } catch (e) {}
  }
  function closeExpanded() {
    if (!ui || !ui.xp || ui.xp.root.hidden) return;
    var hadFocus = ui.xp.root.contains(document.activeElement);
    ui.xp.root.hidden = true;
    setBackgroundInert(false);
    if (hadFocus) {
      var back = xpReturnFocus && xpReturnFocus.isConnected && xpReturnFocus !== document.body ? xpReturnFocus : null;
      try { if (back) back.focus({ preventScroll: true }); else document.activeElement.blur(); } catch (e) {}
    }
    xpReturnFocus = null;
  }

  /* ------------------------------------------------------------------ keyboard (SPEC section 9) */
  function isTypingTarget(t) {
    if (!t || t === document || t === window) return false;
    var tag = (t.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    return !!t.isContentEditable;
  }
  function dialogOpen() {
    var d = document.getElementById('dialog-root');
    return !!(d && d.firstElementChild);
  }
  function bareKeyAllowed() {
    var a = document.activeElement;
    if (!a || a === document.body || a.id === 'main') return true;
    var tag = (a.tagName || '').toLowerCase();
    if (tag === 'button' || tag === 'a' || tag === 'input') return false;
    if (a.getAttribute && a.getAttribute('role') === 'menuitem') return false;
    return true;
  }
  // Escape may close the expanded player even while one of its non-text inputs (the progress slider) has focus.
  function escapeFromExpandedControl(e) {
    var t = e.target;
    return !!(t && t.tagName && t.tagName.toLowerCase() === 'input' && t.type === 'range' && isExpanded() && ui.xp.root.contains(t));
  }
  function onKeydown(e) {
    if (e.defaultPrevented || e.isComposing || e.metaKey) return;
    var key = e.key, lower = typeof key === 'string' && key.length === 1 ? key.toLowerCase() : '';
    var alt = e.altKey, ctrl = e.ctrlKey, shift = e.shiftKey;
    // with Alt held some layouts report a composed character in e.key (e.g. Alt+S), so fall back to e.code
    var codeLetter = typeof e.code === 'string' && /^Key[A-Z]$/.test(e.code) ? e.code.slice(3).toLowerCase() : '';
    var altLetter = alt ? (codeLetter || lower) : '';
    var altCombo = alt && !ctrl && ((altLetter === 's' && !shift) || (altLetter === 'r' && !shift) || (altLetter === 'b' && shift));
    if (alt && !altCombo) return;
    var isEscape = key === 'Escape' || key === 'Esc';
    if (isTypingTarget(e.target) && !(isEscape && escapeFromExpandedControl(e))) return;
    if (dialogOpen()) return;
    var acted = false, toggleKey = !e.repeat;   // held keys never re-toggle (play/pause, modes, like)
    if (isEscape) {
      if (isExpanded()) { closeExpanded(); acted = true; }
    } else if (altCombo) {
      if (toggleKey) { if (altLetter === 's') toggleShuffle(); else if (altLetter === 'r') cycleRepeat(); else likeCurrent(); }
      acted = true;
    } else if (key === 'ArrowRight' || key === 'ArrowLeft') {
      var dir = key === 'ArrowRight' ? 1 : -1;
      if (ctrl && !shift) { if (dir > 0) next(); else previous(); acted = true; }
      else if (!ctrl && (shift || bareKeyAllowed()) && state.currentTrackId) { seek(livePosition() + 5 * dir); acted = true; }
    } else if (key === 'ArrowUp' || key === 'ArrowDown') {
      var up = key === 'ArrowUp';
      if (ctrl && shift) {
        if (up) setVolume(1);
        else if (!state.muted && state.volume > 0) toggleMute();
        acted = true;
      } else if (ctrl || (!shift && bareKeyAllowed())) {
        var base = state.muted ? 0 : state.volume;
        setVolume(Math.round((base + (up ? 0.05 : -0.05)) * 100) / 100);
        acted = true;
      }
    } else if (!ctrl && !shift && (key === ' ' || key === 'Spacebar')) {
      if (bareKeyAllowed()) { if (toggleKey) togglePlay(); acted = true; }
    } else if (!ctrl && !shift && (lower === 'm' || lower === 's' || lower === 'r' || lower === 'l')) {
      if (bareKeyAllowed()) {
        if (toggleKey) { if (lower === 'm') toggleMute(); else if (lower === 's') toggleShuffle(); else if (lower === 'r') cycleRepeat(); else likeCurrent(); }
        acted = true;
      }
    }
    if (acted) e.preventDefault();
  }

  /* ------------------------------------------------------------------ init */
  function init() {
    if (inited) return Player;
    inited = true;
    restore();
    bindEngine();
    try { buildUI(); } catch (e) { ui = null; rethrow(e); }
    bindLibrary();
    bindApp();
    bindViewport();
    bindFlora();
    document.addEventListener('keydown', onKeydown);
    setupMediaSession();
    renderAll();
    updateTitle();
    updateMediaMetadata(currentTrack());
    return Player;
  }
  // Flora composes its sprites from decoration bitmaps (IMAGERY 3): a floor sprig asked for before they had loaded
  // came back empty, so it is painted again once Flora is ready (only while the view is open; opening repaints anyway)
  function bindFlora() {
    if (!floraReady()) return;
    var F = window.Flora;
    var again = function () { if (ui && ui.xp && ui.xp.flora && !ui.xp.flora.hasAttribute('src')) scheduleXpFlora(); };
    try {
      if (typeof F.onReady === 'function') F.onReady(again);
      else if (F.ready && typeof F.ready.then === 'function') F.ready.then(again, again);
      if (typeof F.onLoaded === 'function') F.onLoaded(again);   // per bitmap: the sprig's own file is enough
    } catch (e) { /* a Flora without the loading API draws at once */ }
  }

  /* ------------------------------------------------------------------ public object */
  var Player = {
    init: init,
    playContext: playContext,
    playTrack: playTrack,
    toggleContext: toggleContext,
    play: play,
    pause: pause,
    togglePlay: togglePlay,
    next: next,
    previous: previous,
    seek: seek,
    seekRatio: seekRatio,
    setVolume: setVolume,
    toggleMute: toggleMute,
    toggleShuffle: toggleShuffle,
    cycleRepeat: cycleRepeat,
    addToQueue: addToQueue,
    playNext: playNext,
    removeFromQueue: removeFromQueue,
    clearQueue: clearQueue,
    playQueueItem: playQueueItem,
    upcoming: upcoming,
    getState: getState,
    currentTrack: currentTrack,
    isCurrentContext: isCurrentContext,
    isCurrentTrack: isCurrentTrack,
    on: on,
    off: off,
    openExpanded: openExpanded,
    closeExpanded: closeExpanded,
    // extras (not in the contract)
    isExpanded: isExpanded,
    likeCurrent: likeCurrent
  };
  window.Player = Player;
})();
