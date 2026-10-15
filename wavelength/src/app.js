/* ============================================================================
   Wavelength — app.js
   Owner: app agent. Defines window.Library (persistence + personal
   collection) and window.App (routing, views, sidebar, right panel, menus,
   dialogs, toasts, tooltips, keyboard shortcuts, resizers).
   Both globals exist at script-evaluation time; App.init() runs on
   DOMContentLoaded (or immediately when the document is already loaded).
   ========================================================================== */
(function () {
  'use strict';

  const W = window;
  const D = document;

  // ---------------------------------------------------------------------------
  // Small helpers
  // ---------------------------------------------------------------------------
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC[c]);
  const cat = () => (typeof W.Catalog === 'object' && W.Catalog ? W.Catalog : null);
  const player = () => (typeof W.Player === 'object' && W.Player ? W.Player : null);
  const phoneMQ = typeof W.matchMedia === 'function' ? W.matchMedia('(max-width: 767px)') : { matches: false, addEventListener: function () {} };
  const isPhone = () => !!phoneMQ.matches;
  const desktopMQ = typeof W.matchMedia === 'function' ? W.matchMedia('(min-width: 1024px)') : { matches: true, addEventListener: function () {} };
  const isDesktop = () => !!desktopMQ.matches;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const nowIso = () => new Date().toISOString();
  // A stored ISO timestamp (UTC) as the viewer's local calendar date 'YYYY-MM-DD', the form relativeDate compares
  // against the local today; plain dates pass through unchanged.
  function localIso(at) {
    const s = String(at || '');
    if (!/T\d/.test(s)) return s.slice(0, 10);
    const d = new Date(s);
    if (isNaN(d.getTime())) return s.slice(0, 10);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const arr = (v) => (Array.isArray(v) ? v : []);

  function shade(hex, amount) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
    if (!m) return hex || '#282828';
    const n = parseInt(m[1], 16);
    const f = 1 - amount;
    const r = Math.round(((n >> 16) & 255) * f);
    const g = Math.round(((n >> 8) & 255) * f);
    const b = Math.round((n & 255) * f);
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }
  function icon(id, cls, hidden) {
    return '<svg class="icon' + (cls ? ' ' + cls : '') + '" aria-hidden="true"' + (hidden ? ' hidden' : '') + '><use href="#' + id + '"/></svg>';
  }
  function playIcons(playing, cls) { return icon('i-play', cls, !!playing) + icon('i-pause', cls, !playing); }
  function debounce(fn, ms) {
    let t = 0;
    const d = function () { const a = arguments; clearTimeout(t); t = setTimeout(() => { t = 0; fn.apply(null, a); }, ms); };
    d.cancel = function () { clearTimeout(t); t = 0; };
    return d;
  }
  function normText(s) {
    try { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (e) { return String(s || '').toLowerCase(); }
  }
  function titleClass(title) {
    const n = String(title || '').length;
    return n <= 15 ? 'title-96' : n <= 25 ? 'title-72' : n <= 40 ? 'title-48' : 'title-32';
  }
  function albumType(al) { return al.type === 'single' ? 'Single' : al.type === 'ep' ? 'EP' : 'Album'; }
  function isEditable(el) {
    if (!el || el.nodeType !== 1) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
  }
  function on(el, ev, fn, opts) { el.addEventListener(ev, fn, opts); }

  // ---------------------------------------------------------------------------
  // Library — persistence + personal collection (SPEC §7.1)
  // ---------------------------------------------------------------------------
  const Library = (function () {
    const PREFIX = 'wl:';
    const FIRST_RUN_PLAYLISTS = ['pl_dailymix1', 'pl_chillvibes', 'pl_deepfocus', 'pl_top50global'];
    const listeners = [];
    const st = { liked: [], playlists: [], follows: [], albums: [], savedPlaylists: [], recents: [], recentSearches: [], prefs: {} };

    function read(key) {
      try { const raw = W.localStorage.getItem(PREFIX + key); return raw == null ? null : JSON.parse(raw); } catch (e) { return null; }
    }
    function write(key, value) {
      try { W.localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch (e) { /* storage unavailable: the in-memory state still works */ }
    }
    function emit(type, id) {
      listeners.slice().forEach((fn) => { try { fn({ type: type, id: id }); } catch (e) { setTimeout(() => { throw e; }); } });
    }
    const entries = (v) => arr(v).filter((x) => x && typeof x.id === 'string').map((x) => ({ id: x.id, at: typeof x.at === 'string' ? x.at : nowIso() }));
    const has = (list, id) => list.some((x) => x.id === id);
    function toggleIn(list, id) {
      const i = list.findIndex((x) => x.id === id);
      if (i >= 0) { list.splice(i, 1); return false; }
      list.unshift({ id: id, at: nowIso() });
      return true;
    }
    function normPlaylist(p) {
      return {
        id: p.id,
        name: typeof p.name === 'string' ? p.name : 'My Playlist',
        description: typeof p.description === 'string' ? p.description : '',
        trackIds: arr(p.trackIds).filter((x) => typeof x === 'string'),
        addedAt: p.addedAt && typeof p.addedAt === 'object' ? p.addedAt : {},
        createdAt: typeof p.createdAt === 'string' ? p.createdAt : nowIso(),
      };
    }
    function load() {
      const version = read('version');
      st.liked = entries(read('liked'));
      st.playlists = arr(read('playlists')).filter((p) => p && typeof p.id === 'string').map(normPlaylist);
      st.follows = entries(read('follows'));
      st.albums = entries(read('albums'));
      st.savedPlaylists = entries(read('savedPlaylists'));
      st.recents = arr(read('recents')).filter((x) => typeof x === 'string');
      st.recentSearches = arr(read('recentSearches')).filter((x) => x && typeof x.type === 'string' && typeof x.id === 'string').map((x) => ({ type: x.type, id: x.id }));
      const prefs = read('prefs');
      st.prefs = prefs && typeof prefs === 'object' && !Array.isArray(prefs) ? prefs : {};
      if (version !== 1) {
        const at = nowIso();
        st.savedPlaylists = FIRST_RUN_PLAYLISTS.map((id) => ({ id: id, at: at }));
        write('liked', st.liked); write('playlists', st.playlists); write('follows', st.follows); write('albums', st.albums);
        write('savedPlaylists', st.savedPlaylists); write('recents', st.recents); write('recentSearches', st.recentSearches);
        write('prefs', st.prefs); write('version', 1);
      }
    }
    const pl = (id) => st.playlists.find((p) => p.id === id) || null;
    function savePlaylists(id) { write('playlists', st.playlists); emit('playlist', id); }

    return {
      load: load,
      // liked songs
      isLiked: (trackId) => has(st.liked, trackId),
      toggleLike: function (trackId) { const v = toggleIn(st.liked, trackId); write('liked', st.liked); emit('like', trackId); return v; },
      likedTrackIds: () => st.liked.map((x) => x.id),
      likedAddedAt: function (trackId) { const e = st.liked.find((x) => x.id === trackId); return e ? e.at : null; },
      // user playlists
      playlists: () => st.playlists.slice(),
      playlist: pl,
      createPlaylist: function (name) {
        let title = typeof name === 'string' && name.trim() ? name.trim() : '';
        if (!title) {
          let n = st.playlists.length + 1;
          while (st.playlists.some((p) => p.name === 'My Playlist #' + n)) n++;
          title = 'My Playlist #' + n;
        }
        const p = { id: uid('plu_'), name: title, description: '', trackIds: [], addedAt: {}, createdAt: nowIso() };
        st.playlists.push(p);
        savePlaylists(p.id);
        return p;
      },
      renamePlaylist: function (id, name) { const p = pl(id); if (!p) return false; const n = String(name == null ? '' : name).trim(); if (n) p.name = n; savePlaylists(id); return !!n; },
      describePlaylist: function (id, text) { const p = pl(id); if (!p) return false; p.description = String(text == null ? '' : text).trim(); savePlaylists(id); return true; },
      deletePlaylist: function (id) {
        const i = st.playlists.findIndex((p) => p.id === id);
        if (i < 0) return false;
        st.playlists.splice(i, 1);
        const r = st.recents.indexOf('user:' + id);
        if (r >= 0) { st.recents.splice(r, 1); write('recents', st.recents); }
        savePlaylists(id);
        return true;
      },
      addToPlaylist: function (id, trackId, opts) {
        const p = pl(id);
        if (!p || typeof trackId !== 'string') return false;
        const force = !!(opts && opts.force);
        if (p.trackIds.indexOf(trackId) >= 0 && !force) return false;
        p.trackIds.push(trackId);
        if (!p.addedAt[trackId]) p.addedAt[trackId] = nowIso();
        savePlaylists(id);
        return true;
      },
      removeFromPlaylist: function (id, trackId, index) {
        const p = pl(id);
        if (!p) return false;
        let i = typeof index === 'number' && p.trackIds[index] === trackId ? index : p.trackIds.indexOf(trackId);
        if (i < 0) return false;
        p.trackIds.splice(i, 1);
        if (p.trackIds.indexOf(trackId) < 0) delete p.addedAt[trackId];
        savePlaylists(id);
        return true;
      },
      moveInPlaylist: function (id, from, to) {
        const p = pl(id);
        if (!p || from < 0 || from >= p.trackIds.length) return false;
        const item = p.trackIds.splice(from, 1)[0];
        p.trackIds.splice(clamp(to, 0, p.trackIds.length), 0, item);
        savePlaylists(id);
        return true;
      },
      // artists / albums / editorial playlists
      isFollowing: (artistId) => has(st.follows, artistId),
      toggleFollow: function (artistId) { const v = toggleIn(st.follows, artistId); write('follows', st.follows); emit('follow', artistId); return v; },
      followedArtistIds: () => st.follows.map((x) => x.id),
      isSavedAlbum: (albumId) => has(st.albums, albumId),
      toggleSaveAlbum: function (albumId) { const v = toggleIn(st.albums, albumId); write('albums', st.albums); emit('album', albumId); return v; },
      savedAlbumIds: () => st.albums.map((x) => x.id),
      isSavedPlaylist: (playlistId) => has(st.savedPlaylists, playlistId),
      toggleSavePlaylist: function (playlistId) { const v = toggleIn(st.savedPlaylists, playlistId); write('savedPlaylists', st.savedPlaylists); emit('savedPlaylist', playlistId); return v; },
      savedPlaylistIds: () => st.savedPlaylists.map((x) => x.id),
      savedAt: function (id) {
        const e = st.savedPlaylists.find((x) => x.id === id) || st.albums.find((x) => x.id === id) || st.follows.find((x) => x.id === id);
        if (e) return e.at;
        const p = pl(id);
        return p ? p.createdAt : null;
      },
      // recents (written only by Player.playContext)
      addRecent: function (uri) {
        if (typeof uri !== 'string' || !uri) return;
        const i = st.recents.indexOf(uri);
        if (i >= 0) st.recents.splice(i, 1);
        st.recents.unshift(uri);
        st.recents.length = Math.min(st.recents.length, 12);
        write('recents', st.recents);
        emit('recent', uri);
      },
      recents: () => st.recents.slice(),
      // recent searches
      recentSearches: () => st.recentSearches.map((x) => ({ type: x.type, id: x.id })),
      addRecentSearch: function (item) {
        if (!item || typeof item.type !== 'string' || typeof item.id !== 'string') return;
        st.recentSearches = st.recentSearches.filter((x) => !(x.type === item.type && x.id === item.id));
        st.recentSearches.unshift({ type: item.type, id: item.id });
        st.recentSearches.length = Math.min(st.recentSearches.length, 8);
        write('recentSearches', st.recentSearches);
        emit('recentSearch', item.id);
      },
      removeRecentSearch: function (item) {
        if (!item) return;
        const n = st.recentSearches.length;
        st.recentSearches = st.recentSearches.filter((x) => !(x.type === item.type && x.id === item.id));
        if (st.recentSearches.length !== n) { write('recentSearches', st.recentSearches); emit('recentSearch', item.id); }
      },
      clearRecentSearches: function () { st.recentSearches = []; write('recentSearches', st.recentSearches); emit('recentSearch', null); },
      // player blob (opaque to Library)
      savePlayer: function (obj) { write('player', obj); },
      loadPlayer: function () { const v = read('player'); return v && typeof v === 'object' ? v : null; },
      // prefs
      prefs: () => Object.assign({}, st.prefs),
      setPref: function (key, value) { st.prefs[key] = value; write('prefs', st.prefs); emit('pref', key); },
      // events
      on: function (event, fn) { if (event === 'change' && typeof fn === 'function') listeners.push(fn); return this; },
      off: function (event, fn) { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); return this; },
    };
  })();

  // ---------------------------------------------------------------------------
  // App state
  // ---------------------------------------------------------------------------
  const els = {};
  const appListeners = {};
  const state = {
    initialised: false,
    route: null,
    hist: [],           // [{ route, scrollTop }]
    pos: -1,
    rightMode: null,    // 'now-playing' | 'queue' | null
    sidebarCollapsed: false,
    renderedView: null,
    homeChip: 'all',
    searchTab: 'all',
    viewMode: 'list',   // 'list' | 'compact'
    discoTab: 'popular',
    popularExpanded: {},
    finderQuery: '',
    finderOpen: {},
    recommendSeed: {},
    sb: { filter: null, sort: 'recents', query: '', filterOpen: false },
    heroObserver: null,
    stripHeight: 64,
  };

  function appEmit(event, arg) {
    arr(appListeners[event]).slice().forEach((fn) => { try { fn(arg); } catch (e) { setTimeout(() => { throw e; }); } });
  }
  function playerState() {
    const p = player();
    if (p && typeof p.getState === 'function') { try { return p.getState() || {}; } catch (e) { /* fall through */ } }
    return { currentTrackId: null, context: null, queue: [], isPlaying: false, shuffle: false, repeat: 'off' };
  }
  function isCurrentContext(uri) { const p = player(); return !!(p && typeof p.isCurrentContext === 'function' && p.isCurrentContext(uri)); }
  function isCurrentTrack(id) { const p = player(); return !!(p && typeof p.isCurrentTrack === 'function' && p.isCurrentTrack(id)); }
  function pcall(method) {
    const p = player();
    if (!p || typeof p[method] !== 'function') return undefined;
    const args = Array.prototype.slice.call(arguments, 1);
    try { return p[method].apply(p, args); } catch (e) { setTimeout(() => { throw e; }); return undefined; }
  }

  // ---------------------------------------------------------------------------
  // Entities and contexts
  // ---------------------------------------------------------------------------
  const LIKED_COLOR = '#5038a0';
  const EMPTY_COLOR = '#282828';

  function userPlaylistColor(p) {
    const c = cat();
    if (!c || !p || !p.trackIds.length) return EMPTY_COLOR;
    const t = c.track(p.trackIds[0]);
    const al = t && c.album(t.albumId);
    return al ? al.color : EMPTY_COLOR;
  }
  // Describe any library/catalogue entity in one shape used by cards, tiles, rows and menus.
  // kind: 'playlist' | 'user' | 'album' | 'artist' | 'liked' | 'genre'; subStyle for albums: 'artist' | 'year'
  function ent(kind, id, subStyle) {
    const c = cat();
    if (!c) return null;
    if (kind === 'liked') {
      const n = Library.likedTrackIds().length;
      return { kind: kind, id: 'liked', name: 'Liked Songs', sub: c.pluralize(n, 'song'), uri: 'liked', coverKey: 'liked', route: 'liked', color: LIKED_COLOR, owner: 'You', type: 'playlist' };
    }
    if (kind === 'playlist') {
      const p = c.playlist(id);
      return p && { kind: kind, id: p.id, name: p.name, sub: p.description, uri: 'playlist:' + p.id, coverKey: p.id, route: 'playlist', color: p.color, owner: 'Wavelength', type: 'playlist' };
    }
    if (kind === 'user') {
      const p = Library.playlist(id);
      return p && { kind: kind, id: p.id, name: p.name, sub: 'By You', uri: 'user:' + p.id, coverKey: p.id, route: 'playlist', color: userPlaylistColor(p), owner: 'You', type: 'playlist' };
    }
    if (kind === 'album') {
      const al = c.album(id);
      if (!al) return null;
      const ar = c.artist(al.artistId);
      const sub = subStyle === 'year' ? al.year + ' • ' + albumType(al) : (ar ? ar.name : '');
      return { kind: kind, id: al.id, name: al.title, sub: sub, uri: 'album:' + al.id, coverKey: al.id, route: 'album', color: al.color, owner: ar ? ar.name : '', type: 'album' };
    }
    if (kind === 'artist') {
      const ar = c.artist(id);
      return ar && { kind: kind, id: ar.id, name: ar.name, sub: 'Artist', uri: 'artist:' + ar.id, coverKey: ar.id, round: true, route: 'artist', color: ar.color, owner: ar.name, type: 'artist' };
    }
    if (kind === 'genre') {
      const g = c.genre(id);
      return g && { kind: kind, id: g.id, name: g.name, sub: g.description, uri: 'genre:' + g.id, coverKey: '', route: 'genre', color: g.color, owner: 'Wavelength', type: 'genre' };
    }
    return null;
  }
  function entFromUri(uri) {
    if (typeof uri !== 'string') return null;
    if (uri === 'liked') return ent('liked');
    const i = uri.indexOf(':');
    if (i < 0) return null;
    const kind = uri.slice(0, i), id = uri.slice(i + 1);
    if (kind === 'playlist' || kind === 'user' || kind === 'album' || kind === 'artist' || kind === 'genre') return ent(kind, id);
    return null;
  }
  function entTrackIds(e) {
    const c = cat();
    if (!e || !c) return [];
    switch (e.kind) {
      case 'liked': return Library.likedTrackIds();
      case 'playlist': { const p = c.playlist(e.id); return p ? p.trackIds.slice() : []; }
      case 'user': { const p = Library.playlist(e.id); return p ? p.trackIds.slice() : []; }
      case 'album': return c.tracksOf(e.id).map((t) => t.id);
      case 'artist': return c.topTracks(e.id, 10).map((t) => t.id);
      case 'genre': return c.genreContent(e.id).tracks.map((t) => t.id);
      default: return [];
    }
  }
  function contextOf(e) { return e ? { uri: e.uri, name: e.name, trackIds: entTrackIds(e) } : null; }
  function contextFromUri(uri) { return contextOf(entFromUri(uri)); }
  function entFromSearchType(type, id) {
    if (type === 'track') { const c = cat(); const t = c && c.track(id); return t ? Object.assign(ent('album', t.albumId), { trackId: t.id, name: t.title, sub: 'Song', kind: 'track', route: 'album', id: t.albumId }) : null; }
    return ent(type, id);
  }
  function coverFor(key) {
    const c = cat();
    if (!c || !key) return '';
    try {
      if (key === 'liked') return c.cover('liked') || '';
      if (key.indexOf('plu_') === 0) { const p = Library.playlist(key); return (p ? c.cover(p) : c.playlistMosaic([])) || ''; }
      return c.cover(key) || '';
    } catch (e) { return ''; }
  }
  // Covers are drawn on demand: a cover Catalog already holds is painted at once; the others are drawn when
  // their <img> is near the visible part of the viewport and of its scroll panel, a few per slice, so a render
  // never blocks on drawing covers that are off screen, in clipped shelf rows or in hidden panels. Visibility
  // is measured with getBoundingClientRect from timers (not IntersectionObserver / rAF, which do not run in a
  // hidden tab), so a page loaded in the background still has its visible covers.
  const lazyCovers = { pending: new Set(), timer: 0 };
  function coverReady(key) {
    const c = cat();
    if (!c || typeof c.hasCover !== 'function') return false;
    try {
      if (key.indexOf('plu_') === 0) { const p = Library.playlist(key); return p ? c.hasCover(p) : false; }
      return c.hasCover(key);
    } catch (e) { return false; }
  }
  function paintCover(img) {
    const key = img.getAttribute('data-cover');
    img.removeAttribute('data-cover');
    const src = key ? coverFor(key) : '';
    if (src) img.src = src;
  }
  const COVER_MARGIN = 200;   // px around the viewport / panel that counts as "near"
  function coverNearView(img) {
    const r = img.getBoundingClientRect();
    if (!r.width && !r.height) return false;   // display:none (hidden panel, clipped shelf card) or detached
    const m = COVER_MARGIN;
    if (r.bottom < -m || r.top > W.innerHeight + m || r.right < -m || r.left > W.innerWidth + m) return false;
    const panel = img.closest('#main, #sidebar, #right-panel');
    if (panel) {
      const p = panel.getBoundingClientRect();
      if (r.bottom < p.top - m || r.top > p.bottom + m) return false;
    }
    return true;
  }
  function pumpCovers() {
    const clock = () => (W.performance && W.performance.now ? W.performance.now() : Date.now());
    const budget = D.hidden ? Infinity : 8;   // a hidden tab is not painting: draw everything that is due at once
    const t0 = clock();
    let more = false;
    for (const img of Array.from(lazyCovers.pending)) {
      if (!img.isConnected || !img.hasAttribute('data-cover')) { lazyCovers.pending.delete(img); continue; }
      if (!coverNearView(img)) continue;
      if (clock() - t0 > budget) { more = true; break; }
      lazyCovers.pending.delete(img);
      paintCover(img);
    }
    if (more) scheduleCoverPump();
  }
  // Visible tab: wait for the next frame (so the page paints first), then draw in a task. Hidden tab: a task.
  function scheduleCoverPump() {
    if (lazyCovers.timer || !lazyCovers.pending.size) return;
    const run = () => { lazyCovers.timer = 0; pumpCovers(); };
    if (!D.hidden && typeof W.requestAnimationFrame === 'function') {
      lazyCovers.timer = -1;
      W.requestAnimationFrame(() => { lazyCovers.timer = setTimeout(run, 0); });
    } else lazyCovers.timer = setTimeout(run, 0);
  }
  function fillCovers(root) {
    root.querySelectorAll('img[data-cover]').forEach((img) => {
      const key = img.getAttribute('data-cover');
      if (!key || coverReady(key)) { paintCover(img); return; }
      lazyCovers.pending.add(img);
    });
    // forget images that a re-render has removed
    lazyCovers.pending.forEach((img) => { if (!img.isConnected) lazyCovers.pending.delete(img); });
    scheduleCoverPump();
  }
  function resolveRecents() {
    return Library.recents().map(entFromUri).filter(Boolean);
  }

  // ---------------------------------------------------------------------------
  // Routing + render dispatcher
  // ---------------------------------------------------------------------------
  function normRoute(route) {
    const r = route && typeof route === 'object' ? route : { view: 'home' };
    const out = { view: typeof r.view === 'string' ? r.view : 'home' };
    const idless = { home: 1, liked: 1, queue: 1, library: 1, search: 1 };
    if (r.id != null && !idless[out.view]) out.id = String(r.id);
    if (r.query != null && out.view === 'search') out.query = String(r.query);
    if (out.view === 'search' && out.query == null) out.query = '';
    if (out.view === 'library' && !isPhone()) out.view = 'home';
    return out;
  }
  function sameRoute(a, b) { return !!a && !!b && a.view === b.view && (a.id || '') === (b.id || '') && (a.query || '') === (b.query || ''); }
  function saveScroll() { if (state.pos >= 0 && state.hist[state.pos]) state.hist[state.pos].scrollTop = els.main.scrollTop; }
  function navigate(route, opts) {
    const o = opts || {};
    const r = normRoute(route);
    if (state.initialised) saveScroll();
    const cur = state.pos >= 0 ? state.hist[state.pos] : null;
    if ((o.replace || (cur && sameRoute(cur.route, r))) && state.pos >= 0) state.hist[state.pos] = { route: r, scrollTop: 0 };
    else { state.hist.length = state.pos + 1; state.hist.push({ route: r, scrollTop: 0 }); state.pos = state.hist.length - 1; }
    if (r.view !== 'search') state.searchTab = 'all';
    if (!cur || cur.route.view !== r.view || (cur.route.id || '') !== (r.id || '')) { state.finderQuery = ''; state.discoTab = 'popular'; }
    beforeRoute(r);
    render(r);
    if (!o.keepScroll) els.main.scrollTop = 0;
  }
  function go(delta) {
    const to = state.pos + delta;
    if (to < 0 || to >= state.hist.length) return;
    saveScroll();
    const from = state.hist[state.pos].route;
    state.pos = to;
    const e = state.hist[state.pos];
    if (from.view !== e.route.view || (from.id || '') !== (e.route.id || '')) { state.finderQuery = ''; state.discoTab = 'popular'; }
    beforeRoute(e.route);
    render(e.route, { full: true });
    els.main.scrollTop = e.scrollTop || 0;
    onMainScroll();
  }
  function back() { go(-1); }
  function forward() { go(1); }
  function beforeRoute(r) {
    closeContextMenu();
    pcall('closeExpanded');
    appEmit('route', r);
  }
  const views = {};
  function render(route, opts) {
    const o = opts || {};
    const r = normRoute(route);
    state.route = r;
    els.app.setAttribute('data-view', r.view);
    closeContextMenu();
    hideTooltip();
    if (state.heroObserver) { state.heroObserver.disconnect(); state.heroObserver = null; }
    const fn = views[r.view] || views.home;
    if (r.view === 'search' && state.renderedView === 'search' && !o.full) {
      const box = els.main.querySelector('.search-results');
      if (box) {
        box.innerHTML = searchResultsHTML(r);
        fillCovers(box);
        applyHighlights(box);
        afterRender(r, true);
        return;
      }
    }
    els.main.innerHTML = fn(r);
    state.renderedView = r.view;
    if (r.view !== 'home') els.main.style.removeProperty('--home-tint');
    fillCovers(els.main);
    applyHighlights(els.main);
    afterRender(r, false);
  }
  function syncNavButtons() {
    const b = els.main.querySelector('.nav-btn--back');
    const f = els.main.querySelector('.nav-btn--forward');
    if (b) b.disabled = state.pos <= 0;
    if (f) f.disabled = state.pos >= state.hist.length - 1;
  }
  // One-row shelves (.card-grid--row) clip the cards beyond the first row; hide those cards so they cannot take
  // keyboard focus (focusing a clipped card would also scroll the overflow:hidden grid). Phones scroll shelves
  // horizontally (display:flex), so every card stays visible there.
  function clampShelfRows(root) {
    (root || els.main).querySelectorAll('.card-grid--row').forEach((grid) => {
      const tpl = W.getComputedStyle(grid).gridTemplateColumns || '';
      const cols = /^\d+(\.\d+)?px( \d+(\.\d+)?px)*$/.test(tpl.trim()) ? tpl.trim().split(' ').length : 0;
      Array.prototype.forEach.call(grid.children, (card, i) => {
        if (!card.classList.contains('card')) return;
        const hide = cols > 0 && i >= cols;
        if (card.hidden !== hide) card.hidden = hide;
      });
    });
  }
  let shelfClampTimer = 0;
  function scheduleShelfClamp() {
    if (shelfClampTimer) return;
    shelfClampTimer = setTimeout(() => { shelfClampTimer = 0; clampShelfRows(els.main); scheduleCoverPump(); }, 30);
  }
  function afterRender(r, partial) {
    syncTopbar(r);
    syncBottomNav(r);
    syncNavButtons();
    markSidebarActive();
    syncLibTitleLabel();
    clampShelfRows(els.main);
    if (partial) return;
    state.stripHeight = isPhone() ? 48 : 64;
    const h1 = els.main.querySelector('.hero h1');
    const ctx = els.main.querySelector('.main-header__ctx');
    if (h1 && ctx && typeof W.IntersectionObserver === 'function') {
      state.heroObserver = new W.IntersectionObserver((entries) => {
        entries.forEach((en) => ctx.classList.toggle('is-visible', !en.isIntersecting));
      }, { root: els.main, rootMargin: '-' + state.stripHeight + 'px 0px 0px 0px', threshold: 0 });
      state.heroObserver.observe(h1);
    }
    onMainScroll();
  }
  function onMainScroll() {
    const main = els.main;
    const top = main.scrollTop;
    const strip = main.querySelector('.main-header');
    if (strip) strip.style.setProperty('--strip-opacity', String(clamp(top / 300, 0, 1)));
    const head = main.querySelector('.track-table__head');
    const h1 = main.querySelector('.hero h1');
    const ctx = main.querySelector('.main-header__ctx');
    // The IntersectionObserver of afterRender() drives the strip title; this scroll-time check keeps it
    // right when observer callbacks are delayed (e.g. a restored scroll position before the first frame).
    if (h1 && ctx) {
      const mr = main.getBoundingClientRect();
      ctx.classList.toggle('is-visible', h1.getBoundingClientRect().bottom <= mr.top + state.stripHeight);
    }
    if (head) {
      const mr = main.getBoundingClientRect();
      const hr = head.getBoundingClientRect();
      head.classList.toggle('is-stuck', top > 0 && hr.top - mr.top <= state.stripHeight + 0.5);
    }
    hideTooltip();
  }
  // Re-render #main, #sidebar and #right-panel for the current route, keeping scroll, selection and inline inputs.
  function rerender() {
    if (!state.initialised || !state.route) return;
    const main = els.main;
    const scrollTop = main.scrollTop;
    const sel = main.querySelector('.track-row.is-selected, .song-row.is-selected');
    const selId = sel ? sel.getAttribute('data-track-id') : null;
    const selIdx = sel ? Array.prototype.indexOf.call(main.querySelectorAll('[data-track-id="' + selId + '"]'), sel) : -1;
    const filt = main.querySelector('.inline-filter.is-open input');
    const filtState = filt ? { value: filt.value, focused: D.activeElement === filt } : null;
    const finder = main.querySelector('.finder-search input');
    const finderState = finder ? { focused: D.activeElement === finder, start: finder.selectionStart } : null;
    const libf = main.querySelector('.lib-filter input');
    const libfState = libf ? { value: libf.value, focused: D.activeElement === libf, open: libf.closest('.lib-filter__input').classList.contains('is-open') } : null;
    const sf = main.querySelector('.search-field input');
    const sfState = sf && D.activeElement === sf ? { value: sf.value, start: sf.selectionStart } : null;
    render(state.route, { full: true });
    main.scrollTop = scrollTop;
    if (sfState) {
      const input = main.querySelector('.search-field input');
      if (input) { input.value = sfState.value; input.focus(); try { input.setSelectionRange(sfState.start, sfState.start); } catch (e) { /* ignore */ } }
    }
    if (selId) {
      const rows = main.querySelectorAll('[data-track-id="' + selId + '"]');
      const row = rows[selIdx >= 0 && selIdx < rows.length ? selIdx : 0];
      if (row) row.classList.add('is-selected');
    }
    if (filtState) {
      const box = main.querySelector('.inline-filter');
      if (box) {
        box.classList.add('is-open');
        const input = box.querySelector('input');
        input.value = filtState.value;
        applyInlineFilter(input);
        if (filtState.focused) input.focus();
      }
    }
    if (finderState && finderState.focused) {
      const input = main.querySelector('.finder-search input');
      if (input) { input.focus(); try { input.setSelectionRange(finderState.start, finderState.start); } catch (e) { /* ignore */ } }
    }
    if (libfState) {
      const box = main.querySelector('.lib-filter__input');
      if (box) {
        box.classList.toggle('is-open', libfState.open);
        const input = box.querySelector('input');
        input.value = libfState.value;
        applyLibFilter(main, input.value);
        if (libfState.focused) input.focus();
      }
    }
    renderSidebar();
    renderRightPanel();
    onMainScroll();
  }

  // ---------------------------------------------------------------------------
  // Playing-track / playing-context highlighting (no re-render)
  // ---------------------------------------------------------------------------
  // <svg> elements have no `hidden` IDL property (it lives on HTMLElement), so the attribute is set directly.
  function setSvgHidden(svg, hide) {
    if (!svg || hide === svg.hasAttribute('hidden')) return;
    if (hide) svg.setAttribute('hidden', ''); else svg.removeAttribute('hidden');
  }
  function flipIcons(container, playing) {
    container.querySelectorAll('use').forEach((u) => {
      const href = u.getAttribute('href');
      if (href === '#i-play') setSvgHidden(u.parentNode, !!playing);
      else if (href === '#i-pause') setSvgHidden(u.parentNode, !playing);
    });
  }
  function applyHighlights(root) {
    const st = playerState();
    const playing = !!st.isPlaying;
    root.querySelectorAll('[data-track-id]').forEach((el) => {
      const cur = isCurrentTrack(el.getAttribute('data-track-id'));
      el.classList.toggle('is-current', cur);
      el.classList.toggle('is-playing', cur && playing);
      const btn = el.querySelector('.track-row__play, .song-row__play, .play-btn');
      if (btn) {
        flipIcons(btn, cur && playing);
        if (btn.classList.contains('track-row__play') || btn.classList.contains('song-row__play')) btn.setAttribute('aria-label', cur && playing ? 'Pause' : 'Play');
      }
    });
    root.querySelectorAll('[data-context-uri]').forEach((el) => {
      const cur = isCurrentContext(el.getAttribute('data-context-uri'));
      el.classList.toggle('is-current', cur);
      el.classList.toggle('is-playing', cur && playing);
      const btn = el.classList.contains('play-btn') ? el : el.querySelector('.play-btn, .lib-row__play');
      if (btn) {
        flipIcons(btn, cur && playing);
        const name = btn.getAttribute('data-name');
        if (name != null) btn.setAttribute('aria-label', (cur && playing ? 'Pause ' : 'Play ') + name);
      }
    });
  }
  function applyAllHighlights() {
    applyHighlights(els.main);
    applyHighlights(els.sidebar);
    if (!els.right.hidden) applyHighlights(els.right);
  }
  function syncModeButtons() {
    const st = playerState();
    els.main.querySelectorAll('.actions__shuffle').forEach((b) => {
      b.classList.toggle('is-active', !!st.shuffle);
      b.setAttribute('aria-label', st.shuffle ? 'Disable shuffle' : 'Enable shuffle');
    });
  }

  // ---------------------------------------------------------------------------
  // Shared view fragments
  // ---------------------------------------------------------------------------
  function stripHTML(o) {
    const canBack = state.pos > 0, canFwd = state.pos < state.hist.length - 1;
    let ctx = '';
    if (o.ctx) {
      ctx = '<div class="main-header__ctx"><button class="play-btn" aria-label="Play ' + esc(o.title) + '" data-context-uri="' + esc(o.ctx.uri) + '" data-name="' + esc(o.title) + '">' + playIcons(false) + '</button><span class="main-header__title">' + esc(o.title) + '</span></div>';
    }
    return '<div class="main-header" style="--strip-tint:' + esc(o.tint || 'var(--bg-panel)') + ';--strip-opacity:0">' +
      '<div class="main-header__nav"><button class="nav-btn nav-btn--back" aria-label="Go back"' + (canBack ? '' : ' disabled') + '>' + icon('i-chevron-left', 'icon--sm') + '</button>' +
      '<button class="nav-btn nav-btn--forward" aria-label="Go forward"' + (canFwd ? '' : ' disabled') + '>' + icon('i-chevron-right', 'icon--sm') + '</button></div>' +
      ctx + '<div class="main-header__end"></div></div>';
  }
  function cardHTML(e, opts) {
    const o = opts || {};
    if (!e) return '';
    const kindAttr = e.kind === 'track' ? 'track' : e.kind;
    return '<div class="card' + (e.round ? ' card--round' : '') + '" role="button" tabindex="0"' +
      (e.kind === 'track' ? ' data-track-id="' + esc(e.trackId) + '"' : ' data-context-uri="' + esc(e.uri) + '"') +
      ' data-route="' + esc(e.route) + '" data-id="' + esc(e.id) + '" data-kind="' + esc(kindAttr) + '"' +
      (o.searchType ? ' data-search-type="' + esc(o.searchType) + '" data-search-id="' + esc(o.searchId) + '"' : '') + '>' +
      (o.removable ? '<button class="icon-btn card__close" aria-label="Remove ' + esc(e.name) + ' from recent searches">' + icon('i-close', 'icon--sm') + '</button>' : '') +
      '<div class="card__cover"><img class="cover' + (e.round ? ' cover--round' : '') + '" data-cover="' + esc(e.coverKey) + '" alt="">' +
      '<button class="play-btn" aria-label="Play ' + esc(e.name) + '" data-name="' + esc(e.name) + '" tabindex="-1">' + playIcons(false) + '</button></div>' +
      '<div class="card__text"><div class="card__title">' + esc(e.name) + '</div><div class="card__sub">' + esc(e.sub) + '</div></div></div>';
  }
  function shelfHTML(title, sectionId, cardsHtml, opts) {
    const o = opts || {};
    if (!cardsHtml) return '';
    const head = sectionId
      ? '<a class="shelf__title" href="#" data-route="section" data-id="' + esc(sectionId) + '">' + esc(title) + '</a>' + (o.noAll ? '' : '<a class="shelf__all" href="#" data-route="section" data-id="' + esc(sectionId) + '">Show all</a>')
      : '<h2 class="shelf__title">' + esc(title) + '</h2>' + (o.end || '');
    return '<section class="shelf' + (o.cls ? ' ' + o.cls : '') + '"' + (sectionId ? ' data-shelf="' + esc(sectionId) + '"' : '') + '><div class="shelf__head">' + head + '</div>' +
      (o.between || '') +
      '<div class="card-grid' + (o.all ? '' : ' card-grid--row') + '">' + cardsHtml + '</div></section>';
  }
  function tileHTML(e) {
    return '<button class="quick-tile" data-context-uri="' + esc(e.uri) + '" data-route="' + esc(e.route) + '" data-id="' + esc(e.id) + '" data-color="' + esc(e.kind === 'liked' ? 'var(--liked-hero)' : e.color) + '">' +
      '<img class="cover" data-cover="' + esc(e.coverKey) + '" alt=""><span class="quick-tile__name">' + esc(e.name) + '</span>' +
      '<span class="play-btn" aria-hidden="true">' + playIcons(false) + '</span></button>';
  }
  function artistLinks(t) {
    const c = cat();
    // one wrapper span, so a flex parent (with a gap for the explicit badge) does not split ", " into its own item
    return '<span class="artist-links">' + c.trackArtists(t).map((a) => '<a href="#" data-route="artist" data-id="' + esc(a.id) + '">' + esc(a.name) + '</a>').join(', ') + '</span>';
  }
  function artistNames(t) { return cat().trackArtists(t).map((a) => a.name).join(', '); }

  // Track table (SPEC §8.5). variant: 'playlist' | 'liked' | 'album' | 'popular' | 'songs' | 'queue'
  function trackRowHTML(t, o) {
    const c = cat();
    const al = c.album(t.albumId);
    const liked = Library.isLiked(t.id);
    const links = artistLinks(t);
    const cover = o.showCover ? '<img class="cover track-row__cover" data-cover="' + esc(al.id) + '" alt="">' : '';
    // ARIA table semantics: the table is not a 2-D keyboard grid, so role=table/row/columnheader/cell
    const middle = (o.variant === 'album' || o.variant === 'popular')
      ? '<span class="track-row__plays" role="cell">' + esc(c.formatPlays(t.plays)) + '</span>'
      : '<span class="track-row__album" role="cell"><a href="#" data-route="album" data-id="' + esc(al.id) + '">' + esc(al.title) + '</a></span>';
    const date = o.date != null ? '<span class="track-row__date" role="cell">' + esc(o.date) + '</span>' : '';
    const search = normText(t.title + ' ' + artistNames(t) + ' ' + al.title);
    return '<div class="track-row" role="row" data-track-id="' + esc(t.id) + '"' + (o.qid ? ' data-qid="' + esc(o.qid) + '"' : '') + (o.pos != null ? ' data-pos="' + o.pos + '"' : '') + ' data-search="' + esc(search) + '" tabindex="0">' +
      '<span class="track-row__index" role="cell"><span class="track-row__num">' + o.index + '</span><span class="equaliser" aria-hidden="true"><i></i><i></i><i></i></span>' +
      '<button class="track-row__play" aria-label="Play" tabindex="-1">' + playIcons(false, 'icon--sm') + '</button></span>' +
      '<span class="track-row__main" role="cell">' + cover + '<span class="track-row__text"><span class="track-row__title">' + esc(t.title) + '</span>' +
      '<span class="track-row__artist">' + (t.explicit ? icon('i-explicit', 'icon--sm badge-e') : '') + links + '</span></span></span>' +
      (o.compact ? '<span class="track-row__artist-col" role="cell">' + links + '</span>' : '') +
      middle + date +
      '<span class="track-row__end" role="cell"><button class="track-row__like' + (liked ? ' is-liked' : '') + '" aria-label="' + (liked ? 'Remove from Liked Songs' : 'Add to Liked Songs') + '" tabindex="-1">' + icon(liked ? 'i-check-circle' : 'i-add-circle', 'icon--sm') + '</button>' +
      '<span class="track-row__dur">' + esc(c.formatDuration(t.durationMs)) + '</span>' +
      '<button class="track-row__more" aria-label="More options for ' + esc(t.title) + '" tabindex="-1">' + icon('i-more', 'icon--sm') + '</button></span></div>';
  }
  function trackTableHTML(tracks, o) {
    const variant = o.variant || 'playlist';
    const compact = !!o.compact;
    const hasDate = (variant === 'playlist' || variant === 'liked') && !!o.dates;
    const cls = 'track-table' + (variant === 'playlist' || variant === 'liked' ? '' : ' track-table--' + variant) + (compact ? ' track-table--compact' : '');
    let head = '';
    if (!o.noHead) {
      head = '<div class="track-table__head" role="row"><span class="cell cell--index" role="columnheader">#</span><span class="cell" role="columnheader">Title</span>' +
        (compact ? '<span class="cell" role="columnheader">Artist</span>' : '') +
        (variant === 'album' || variant === 'popular' ? '<span class="cell" role="columnheader"><span class="sr-only">Plays</span></span>' : '<span class="cell" role="columnheader">Album</span>') +
        (hasDate ? '<span class="cell cell--date" role="columnheader">Date added</span>' : '') +
        '<span class="cell cell--dur" role="columnheader">' + icon('i-clock', 'icon--sm') + '<span class="sr-only">Duration</span></span></div>';
    }
    const rows = tracks.map((t, i) => trackRowHTML(t, {
      index: (o.startIndex || 0) + i + 1, variant: variant, compact: compact, showCover: variant !== 'album', pos: i,
      date: hasDate ? o.dates[i] : null, qid: o.qids ? o.qids[i] : null,
    })).join('');
    return '<div class="' + cls + '" role="table" aria-label="' + esc(o.label || '') + '" data-ctx="' + esc(o.ctxUri || '') + '"' + (o.playlistId ? ' data-playlist-id="' + esc(o.playlistId) + '"' : '') + (o.section ? ' data-section="' + o.section + '"' : '') + '>' + head + rows + '</div>';
  }
  // Compact song row (search "Songs" column and the right panel)
  function songRowHTML(t, o) {
    const c = cat();
    const al = c.album(t.albumId);
    const liked = Library.isLiked(t.id);
    const oo = o || {};
    return '<div class="song-row" data-track-id="' + esc(t.id) + '"' + (oo.qid ? ' data-qid="' + esc(oo.qid) + '"' : '') + (oo.pos != null ? ' data-pos="' + oo.pos + '"' : '') + ' tabindex="0">' +
      '<span class="song-row__cover"><img class="cover" data-cover="' + esc(al.id) + '" alt=""><button class="song-row__play" aria-label="Play" tabindex="-1">' + playIcons(false, 'icon--sm') + '</button></span>' +
      '<span class="song-row__text"><span class="song-row__title">' + esc(t.title) + '</span><span class="song-row__artist">' + (t.explicit ? icon('i-explicit', 'icon--sm badge-e') : '') + artistLinks(t) + '</span></span>' +
      '<span class="song-row__end"><button class="icon-btn song-row__like' + (liked ? ' is-liked' : '') + '" aria-label="' + (liked ? 'Remove from Liked Songs' : 'Add to Liked Songs') + '" tabindex="-1">' + icon(liked ? 'i-check-circle' : 'i-add-circle', 'icon--sm') + '</button>' +
      '<span class="song-row__dur">' + esc(c.formatDuration(t.durationMs)) + '</span>' +
      '<button class="icon-btn song-row__more" aria-label="More options for ' + esc(t.title) + '" tabindex="-1">' + icon('i-more', 'icon--sm') + '</button></span></div>';
  }
  function heroHTML(h) {
    const cls = 'hero' + (h.kind === 'artist' ? ' hero--artist' : '') + (h.kind === 'liked' ? ' hero--liked' : '') + (h.kind === 'genre' ? ' hero--genre' : '') + (h.editable ? ' hero--editable' : '');
    const tcls = titleClass(h.title);
    if (h.kind === 'genre') {
      return '<div class="' + cls + '"><div class="hero__info"><h1 class="hero__title ' + tcls + '">' + esc(h.title) + '</h1></div></div><div class="hero-band" aria-hidden="true"></div>';
    }
    const editAttr = h.editable ? ' role="button" tabindex="0"' : '';
    return '<div class="' + cls + '">' +
      '<div class="hero__cover' + (h.round ? ' hero__cover--round' : '') + '"' + (h.editable ? ' role="button" tabindex="0" aria-label="Edit details"' : '') + '><img class="cover" data-cover="' + esc(h.coverKey) + '" alt="">' +
      // hover hint only (the cover itself is the button): it names what the click does, the Edit details dialog
      (h.editable ? '<span class="hero__cover-edit" aria-hidden="true">' + icon('i-edit') + 'Edit details</span>' : '') + '</div>' +
      '<div class="hero__info"><span class="hero__type">' + h.type + '</span>' +
      '<h1 class="hero__title ' + tcls + '"' + editAttr + '>' + esc(h.title) + '</h1>' +
      (h.desc ? '<p class="hero__desc"' + editAttr + '>' + esc(h.desc) + '</p>' : '') +
      '<div class="hero__meta">' + h.meta + '</div></div></div><div class="hero-band" aria-hidden="true"></div>';
  }
  function actionsHTML(a) {
    const st = playerState();
    const playing = isCurrentContext(a.ctx.uri) && !!st.isPlaying;
    const shuffleOn = !!st.shuffle;
    let html = '<div class="actions">' +
      '<button class="play-btn play-btn--lg" aria-label="' + (playing ? 'Pause ' : 'Play ') + esc(a.name) + '" data-context-uri="' + esc(a.ctx.uri) + '" data-name="' + esc(a.name) + '">' + playIcons(playing) + '</button>';
    if (a.shuffle) html += '<button class="icon-btn actions__shuffle' + (shuffleOn ? ' is-active' : '') + '" aria-label="' + (shuffleOn ? 'Disable shuffle' : 'Enable shuffle') + '">' + icon('i-shuffle', 'icon--lg') + '</button>';
    if (a.save) html += '<button class="icon-btn actions__save' + (a.save.saved ? ' is-active' : '') + '" aria-label="' + (a.save.saved ? 'Remove from Your Library' : 'Add to Your Library') + '">' + icon(a.save.saved ? 'i-check-circle' : 'i-add-circle', 'icon--lg') + '</button>';
    if (a.follow) html += '<button class="pill actions__follow">' + (a.follow.following ? 'Following' : 'Follow') + '</button>';
    html += '<button class="icon-btn actions__download" aria-label="Download">' + icon('i-download', 'icon--lg') + '</button>';
    html += '<button class="icon-btn actions__more" aria-label="More options for ' + esc(a.name) + '">' + icon('i-more', 'icon--lg') + '</button>';
    if (a.filter || a.view) {
      html += '<div class="actions__right">';
      if (a.filter) html += '<button class="icon-btn actions__filter-btn" aria-label="' + esc(a.filter) + '">' + icon('i-search', 'icon--sm') + '</button><div class="inline-filter">' + icon('i-search', 'icon--sm') + '<input type="text" placeholder="' + esc(a.filter) + '" aria-label="' + esc(a.filter) + '"></div>';
      if (a.view) html += '<button class="view-toggle" aria-label="View as: ' + (state.viewMode === 'compact' ? 'Compact' : 'List') + '">' + (state.viewMode === 'compact' ? 'Compact' : 'List') + ' ' + icon('i-chevron-down', 'icon--sm') + '</button>';
      html += '</div>';
    }
    return html + '</div>';
  }
  function heroPage(color, inner) {
    return '<section class="page page--hero" style="--hero-color:' + esc(color) + '">' + inner + '</section>';
  }
  // iconId: an optional large icon above the title (only the Liked Songs empty state uses one: i-heart, SPEC §8.7)
  function emptyHTML(title, text, extra, small, iconId) {
    return '<div class="empty' + (small ? ' empty--sm' : '') + '">' + (!small && iconId ? icon(iconId, 'empty__icon') : '') + '<div class="empty__title">' + esc(title) + '</div><div class="empty__text">' + esc(text) + '</div>' + (extra || '') + '</div>';
  }
  function finderRowHTML(t) {
    const c = cat();
    const al = c.album(t.albumId);
    return '<div class="finder-row" data-track-id="' + esc(t.id) + '"><img class="cover cover--40" data-cover="' + esc(al.id) + '" alt="">' +
      '<span class="finder-row__text"><span class="finder-row__title">' + esc(t.title) + '</span><span class="finder-row__artist">' + (t.explicit ? icon('i-explicit', 'icon--sm badge-e') : '') + artistLinks(t) + '</span></span>' +
      '<span class="finder-row__album"><a href="#" data-route="album" data-id="' + esc(al.id) + '">' + esc(al.title) + '</a></span>' +
      '<button class="pill pill--outline finder-row__add">Add</button></div>';
  }
  function finderHTML(p) {
    const q = state.finderQuery;
    return '<div class="playlist-finder" data-playlist-id="' + esc(p.id) + '"><h2 class="playlist-finder__title">Let\'s find something for your playlist</h2>' +
      '<div class="finder-search">' + icon('i-search') + '<input type="text" placeholder="Search for songs" aria-label="Search for songs" value="' + esc(q) + '"><button class="icon-btn finder-search__clear" aria-label="Clear"' + (q ? '' : ' hidden') + '>' + icon('i-close', 'icon--sm') + '</button></div>' +
      '<div class="finder-list">' + finderResultsHTML(p) + '</div></div>';
  }
  function finderResultsHTML(p) {
    const c = cat();
    const q = state.finderQuery.trim();
    if (!q) return '';
    const res = c.search(q).tracks.filter((t) => p.trackIds.indexOf(t.id) < 0).slice(0, 10);
    return res.map(finderRowHTML).join('');
  }
  function recommendedTracks(p) {
    const c = cat();
    const counts = {};
    p.trackIds.forEach((id) => { const t = c.track(id); if (t) counts[t.genreId] = (counts[t.genreId] || 0) + 1; });
    const genres = Object.keys(counts).sort((a, b) => counts[b] - counts[a]).slice(0, 2);
    const inList = {};
    p.trackIds.forEach((id) => { inList[id] = 1; });
    let pool = c.tracks.filter((t) => genres.indexOf(t.genreId) >= 0 && !inList[t.id]);
    if (pool.length < 10) pool = c.tracks.filter((t) => !inList[t.id]);
    const rnd = c.seededRandom(p.id + ':' + (state.recommendSeed[p.id] || 0));
    const out = pool.slice();
    for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const tmp = out[i]; out[i] = out[j]; out[j] = tmp; }
    return out.slice(0, 10);
  }
  function recommendedHTML(p) {
    const rows = recommendedTracks(p).map(finderRowHTML).join('');
    return '<div class="playlist-finder playlist-finder--recommended" data-playlist-id="' + esc(p.id) + '"><h2 class="playlist-finder__title">Recommended</h2><p class="playlist-finder__sub">Based on what\'s in this playlist</p>' +
      '<div class="finder-list">' + rows + '</div>' +
      '<div class="finder-foot"><button class="text-btn finder-refresh">Refresh</button><a class="text-link finder-more" href="#">Find more</a></div></div>';
  }
  function copyrightHTML(al) {
    const c = cat();
    return '<div class="copyright"><div class="copyright__date">' + esc(c.formatLongDate(al.releaseDate)) + '</div><div>© ' + al.year + ' ' + esc(al.label) + '</div><div>℗ ' + al.year + ' ' + esc(al.label) + '</div></div>';
  }
  function chipsHTML(items, attr, active) {
    return '<div class="chips">' + items.map((it) => '<button class="chip" aria-pressed="' + (it.id === active) + '" ' + attr + '="' + esc(it.id) + '">' + esc(it.label) + '</button>').join('') + '</div>';
  }
  function phoneSearchHeader(q) {
    return '<div class="search-header"><h1 class="search-header__title">Search</h1><div class="search-field">' + icon('i-search') +
      '<input type="search" placeholder="What do you want to listen to?" aria-label="Search" value="' + esc(q) + '"><button class="icon-btn search-field__clear" aria-label="Clear search"' + (q ? '' : ' hidden') + '>' + icon('i-close', 'icon--sm') + '</button></div></div>';
  }

  // ---------------------------------------------------------------------------
  // Views
  // ---------------------------------------------------------------------------
  function quickPicks() {
    const seen = {};
    const out = [];
    const push = (e) => { if (e && !seen[e.uri] && out.length < 8) { seen[e.uri] = 1; out.push(e); } };
    push(ent('liked'));
    resolveRecents().forEach(push);
    Library.savedPlaylistIds().forEach((id) => push(ent('playlist', id)));
    Library.playlists().forEach((p) => push(ent('user', p.id)));
    cat().playlists.forEach((p) => push(ent('playlist', p.id)));
    return out;
  }
  function sectionItems(id) {
    const c = cat();
    const seen = {};
    const uniq = (list) => list.filter((e) => e && !seen[e.uri] && (seen[e.uri] = 1));
    switch (id) {
      case 'made-for-you': return { title: 'Made For You', items: uniq(['pl_dailymix1', 'pl_dailymix2', 'pl_dailymix3', 'pl_dailymix4', 'pl_freshfinds', 'pl_newreleases'].map((x) => ent('playlist', x))) };
      case 'recent': return { title: 'Recently played', items: uniq(resolveRecents()) };
      case 'jump-back-in': return { title: 'Jump back in', items: uniq(Library.savedPlaylistIds().map((x) => ent('playlist', x)).concat(Library.playlists().map((p) => ent('user', p.id)), c.popularAlbums(12).map((a) => ent('album', a.id)))) };
      case 'popular-albums': return { title: 'Popular albums', items: uniq(c.popularAlbums(20).map((a) => ent('album', a.id))) };
      case 'popular-artists': return { title: 'Popular artists', items: uniq(c.popularArtists(18).map((a) => ent('artist', a.id))) };
      case 'new-releases': return { title: 'New releases', items: uniq(c.newReleases(20).map((a) => ent('album', a.id))) };
      case 'discover': return { title: 'Discover picks for you', items: uniq(['pl_chillvibes', 'pl_deepfocus', 'pl_latenightdrive', 'pl_morningcoffee', 'pl_workoutpulse', 'pl_rainydayjazz', 'pl_indiegold', 'pl_electronicessentials'].map((x) => ent('playlist', x))) };
      default: return null;
    }
  }
  const HOME_SHELVES = ['made-for-you', 'recent', 'jump-back-in', 'popular-albums', 'popular-artists', 'discover'];

  views.home = function () {
    let html = stripHTML({ tint: 'var(--bg-panel)' }) + '<div class="home-head" aria-hidden="true"></div><div class="page page--home">';
    html += '<div class="chips chips--home"><span class="avatar chips__avatar" aria-hidden="true">N</span>' +
      [['all', 'All'], ['music', 'Music'], ['podcasts', 'Podcasts']].map((x) => '<button class="chip" aria-pressed="' + (state.homeChip === x[0]) + '" data-home-chip="' + x[0] + '">' + x[1] + '</button>').join('') + '</div>';
    html += '<div class="quick-grid">' + quickPicks().map(tileHTML).join('') + '</div>';
    HOME_SHELVES.forEach((id) => {
      const s = sectionItems(id);
      if (!s || !s.items.length) return;
      html += shelfHTML(s.title, id, s.items.slice(0, 10).map((e) => cardHTML(e)).join(''));
    });
    return html + '</div>';
  };
  views.section = function (r) {
    const s = sectionItems(r.id);
    let html = stripHTML({ tint: 'var(--bg-panel)' }) + '<div class="page">';
    if (!s) return html + '<h1 class="page-title page-title--lg">Not found</h1></div>';
    html += '<h1 class="page-title page-title--lg">' + esc(s.title) + '</h1>';
    html += s.items.length ? '<div class="card-grid">' + s.items.map((e) => cardHTML(e)).join('') + '</div>' : emptyHTML('Nothing here yet', 'Play something and it will show up here.', '', true);
    return html + '</div>';
  };
  views.library = function () {
    let html = stripHTML({ tint: 'var(--bg-panel)' }) + '<div class="page page--library">';
    html += '<div class="lib-header lib-header--page"><button class="lib-title" title="Your Library"><span class="avatar">N</span><span>Your Library</span></button>' +
      '<button class="icon-btn lib-add" aria-label="Create playlist">' + icon('i-plus') + '</button></div>';
    html += libChipsHTML() + libFilterHTML() + libListHTML();
    return html + '</div>';
  };
  views.queue = function () {
    const c = cat();
    const st = playerState();
    const cur = st.currentTrackId ? c.track(st.currentTrackId) : null;
    const up = arr(pcall('upcoming', 50));
    const queued = up.filter((u) => u.source === 'queue');
    const fromCtx = up.filter((u) => u.source !== 'queue');
    let html = stripHTML({ tint: 'var(--bg-panel)' }) + '<div class="page page--queue"><h1 class="page-title page-title--lg">Queue</h1>';
    if (!cur && !queued.length) return html + emptyHTML('Add to your queue', 'Tap "Add to queue" from a song\'s menu to see it here.', '', true) + '</div>';
    let n = 0;
    if (cur) {
      html += '<section class="queue-section"><div class="queue-section__head"><h2 class="queue-section__title">Now playing</h2></div>' +
        trackTableHTML([cur], { variant: 'queue', noHead: true, label: 'Now playing', ctxUri: st.context ? st.context.uri : '', section: 'now', startIndex: n }) + '</section>';
      n += 1;
    }
    if (queued.length) {
      const tracks = queued.map((u) => c.track(u.trackId)).filter(Boolean);
      html += '<section class="queue-section"><div class="queue-section__head"><h2 class="queue-section__title">Next in queue</h2><button class="pill queue-clear">Clear queue</button></div>' +
        trackTableHTML(tracks, { variant: 'queue', noHead: true, label: 'Next in queue', ctxUri: '', section: 'queue', startIndex: n, qids: queued.map((u) => u.qid) }) + '</section>';
      n += tracks.length;
    }
    if (fromCtx.length && st.context) {
      const tracks = fromCtx.map((u) => c.track(u.trackId)).filter(Boolean);
      const e = entFromUri(st.context.uri);
      const link = e ? '<a href="#" data-route="' + esc(e.route) + '" data-id="' + esc(e.id) + '">' + esc(st.context.name) + '</a>' : esc(st.context.name);
      html += '<section class="queue-section"><div class="queue-section__head"><h2 class="queue-section__title"><span class="muted">Next from:</span> ' + link + '</h2></div>' +
        trackTableHTML(tracks, { variant: 'queue', noHead: true, label: 'Next from ' + st.context.name, ctxUri: st.context.uri, section: 'context', startIndex: n }) + '</section>';
    }
    return html + '</div>';
  };

  // ---- Search -------------------------------------------------------------
  function searchResultsHTML(r) {
    const c = cat();
    const q = (r.query || '').trim();
    if (!q) {
      let html = '';
      const recent = Library.recentSearches().map((x) => ({ x: x, e: entFromSearchType(x.type, x.id) })).filter((p) => p.e);
      if (recent.length) {
        const cards = recent.map((p) => cardHTML(p.e, { removable: true, searchType: p.x.type, searchId: p.x.id })).join('');
        html += shelfHTML('Recent searches', null, cards, { cls: 'shelf--recent', end: '<button class="pill pill--outline search-clear-recent">Clear recent searches</button>' });
      }
      html += '<h2 class="section-title browse-title">Browse all</h2><div class="browse-grid">' + c.genres.map((g) => {
        const gc = c.genreContent(g.id);
        const first = gc.playlists[0] || gc.albums[0];
        return '<button class="browse-card" style="--browse-color:' + esc(g.color) + '" data-route="genre" data-id="' + esc(g.id) + '">' + esc(g.name) + (first ? '<img class="cover" data-cover="' + esc(first.id) + '" alt="">' : '') + '</button>';
      }).join('') + '</div>';
      return html;
    }
    const res = c.search(q);
    const total = res.tracks.length + res.artists.length + res.albums.length + res.playlists.length;
    let html = '<div class="chips search-chips">' + [['all', 'All'], ['songs', 'Songs'], ['artists', 'Artists'], ['albums', 'Albums'], ['playlists', 'Playlists']].map((x) =>
      '<button class="chip" aria-pressed="' + (state.searchTab === x[0]) + '" data-search-chip="' + x[0] + '">' + x[1] + '</button>').join('') + '</div>';
    if (!total) {
      return html + '<div class="no-results"><div class="no-results__title">No results found for \'' + esc(q) + '\'</div><div class="no-results__text">Please make sure your words are spelled correctly, or use fewer or different keywords.</div></div>';
    }
    const tab = state.searchTab;
    const cards = (list, kind, subStyle) => list.map((x) => cardHTML(ent(kind, x.id, subStyle), { searchType: kind, searchId: x.id })).join('');
    if (tab === 'songs') {
      html += res.tracks.length ? trackTableHTML(res.tracks, { variant: 'songs', label: 'Songs', ctxUri: 'search' }) : emptyHTML('No songs found', 'Try a different search.', '', true);
    } else if (tab === 'artists') {
      html += res.artists.length ? '<div class="card-grid">' + cards(res.artists, 'artist') + '</div>' : emptyHTML('No artists found', 'Try a different search.', '', true);
    } else if (tab === 'albums') {
      html += res.albums.length ? '<div class="card-grid">' + cards(res.albums, 'album', 'year') + '</div>' : emptyHTML('No albums found', 'Try a different search.', '', true);
    } else if (tab === 'playlists') {
      html += res.playlists.length ? '<div class="card-grid">' + cards(res.playlists, 'playlist') + '</div>' : emptyHTML('No playlists found', 'Try a different search.', '', true);
    } else {
      const top = res.top;
      let topHtml = '';
      if (top) {
        const kind = top.type === 'track' ? 'track' : top.type;
        if (kind === 'track') {
          const t = top.item;
          const al = c.album(t.albumId);
          topHtml = '<div class="top-result" role="button" tabindex="0" data-track-id="' + esc(t.id) + '" data-route="album" data-id="' + esc(al.id) + '" data-search-type="track" data-search-id="' + esc(t.id) + '">' +
            '<img class="cover cover--92" data-cover="' + esc(al.id) + '" alt=""><div class="top-result__name">' + esc(t.title) + '</div>' +
            '<div class="top-result__meta">' + (t.explicit ? icon('i-explicit', 'icon--sm badge-e') : '') + artistLinks(t) + '<span class="type-pill">Song</span></div>' +
            '<button class="play-btn" aria-label="Play ' + esc(t.title) + '" tabindex="-1">' + playIcons(false) + '</button></div>';
        } else {
          const e = ent(kind, top.item.id, 'year');
          const label = kind === 'artist' ? 'Artist' : kind === 'album' ? 'Album' : 'Playlist';
          topHtml = '<div class="top-result" role="button" tabindex="0" data-context-uri="' + esc(e.uri) + '" data-route="' + esc(e.route) + '" data-id="' + esc(e.id) + '" data-search-type="' + kind + '" data-search-id="' + esc(e.id) + '">' +
            '<img class="cover cover--92' + (e.round ? ' cover--round' : '') + '" data-cover="' + esc(e.coverKey) + '" alt=""><div class="top-result__name">' + esc(e.name) + '</div>' +
            '<div class="top-result__meta">' + (kind === 'album' ? '<span>' + esc(e.owner) + '</span>' : '') + '<span class="type-pill">' + label + '</span></div>' +
            '<button class="play-btn" aria-label="Play ' + esc(e.name) + '" tabindex="-1">' + playIcons(false) + '</button></div>';
        }
      }
      const songs = res.tracks.slice(0, 4);
      html += '<div class="search-top" data-ctx="search">' +
        (topHtml ? '<div class="search-col"><h2 class="search-col__title">Top result</h2>' + topHtml + '</div>' : '') +
        (songs.length ? '<div class="search-col"><h2 class="search-col__title">Songs</h2><div class="song-list" data-ctx="search">' + songs.map((t, i) => songRowHTML(t, { pos: i })).join('') + '</div></div>' : '') + '</div>';
      if (res.artists.length) html += shelfHTML('Artists', null, cards(res.artists, 'artist'));
      if (res.albums.length) html += shelfHTML('Albums', null, cards(res.albums, 'album', 'year'));
      if (res.playlists.length) html += shelfHTML('Playlists', null, cards(res.playlists, 'playlist'));
    }
    return html;
  }
  views.search = function (r) {
    return stripHTML({ tint: 'var(--bg-panel)' }) + (isPhone() ? phoneSearchHeader(r.query || '') : '') +
      '<div class="page page--search"><div class="search-results">' + searchResultsHTML(r) + '</div></div>';
  };

  // ---- Playlist / user playlist / album / artist / liked / genre ----------
  function metaCount(trackIds) {
    const c = cat();
    const n = trackIds.length;
    return '<span>' + esc(c.pluralize(n, 'song')) + (n ? ',' : '') + '</span>' + (n ? '<span>' + esc(c.formatTotal(c.totalDuration(trackIds))) + '</span>' : '');
  }
  views.playlist = function (r) {
    const c = cat();
    if (r.id && r.id.indexOf('plu_') === 0) return userPlaylistView(r);
    const p = c.playlist(r.id);
    if (!p) return notFound('Playlist');
    const e = ent('playlist', p.id);
    const ctx = contextOf(e);
    const saved = Library.isSavedPlaylist(p.id);
    const meta = '<span class="avatar avatar--24" aria-hidden="true">W</span><b>Wavelength</b><span>•</span><span>' + esc(c.formatPlays(p.saves)) + ' saves</span><span>•</span>' + metaCount(p.trackIds);
    const tracks = p.trackIds.map((id) => c.track(id)).filter(Boolean);
    const dates = p.trackIds.map((id, i) => c.relativeDate(p.addedAt[i] || c.today, c.today));
    return stripHTML({ tint: shade(p.color, 0.3), title: p.name, ctx: ctx }) + heroPage(p.color,
      heroHTML({ kind: 'playlist', coverKey: p.id, type: 'Playlist', title: p.name, desc: p.description, meta: meta }) +
      actionsHTML({ ctx: ctx, name: p.name, shuffle: true, save: { saved: saved }, filter: 'Search in playlist', view: true }) +
      trackTableHTML(tracks, { variant: 'playlist', label: p.name, ctxUri: ctx.uri, dates: dates, compact: state.viewMode === 'compact' }));
  };
  function userPlaylistView(r) {
    const c = cat();
    const p = Library.playlist(r.id);
    if (!p) return notFound('Playlist');
    const e = ent('user', p.id);
    const ctx = contextOf(e);
    const meta = '<span class="avatar avatar--24" aria-hidden="true">N</span><b>You</b><span>•</span>' + metaCount(p.trackIds);
    const tracks = p.trackIds.map((id) => c.track(id)).filter(Boolean);
    const dates = p.trackIds.filter((id) => !!c.track(id)).map((id) => c.relativeDate(localIso(p.addedAt[id] || p.createdAt)));
    let body = heroHTML({ kind: 'user', coverKey: p.id, type: 'Public Playlist', title: p.name, desc: p.description, meta: meta, editable: true }) +
      actionsHTML({ ctx: ctx, name: p.name, shuffle: true, filter: 'Search in playlist', view: true });
    if (!tracks.length) body += finderHTML(p);
    else {
      body += trackTableHTML(tracks, { variant: 'playlist', label: p.name, ctxUri: ctx.uri, dates: dates, compact: state.viewMode === 'compact', playlistId: p.id });
      body += recommendedHTML(p);
      if (state.finderOpen[p.id]) body += finderHTML(p);
    }
    return stripHTML({ tint: shade(e.color, 0.3), title: p.name, ctx: ctx }) + heroPage(e.color, body);
  }
  views.album = function (r) {
    const c = cat();
    const al = c.album(r.id);
    if (!al) return notFound('Album');
    const ar = c.artist(al.artistId);
    const e = ent('album', al.id);
    const ctx = contextOf(e);
    const saved = Library.isSavedAlbum(al.id);
    const meta = '<img class="cover cover--24" data-cover="' + esc(ar.id) + '" alt=""><a href="#" data-route="artist" data-id="' + esc(ar.id) + '">' + esc(ar.name) + '</a><span>•</span><span>' + al.year + '</span><span>•</span>' + metaCount(al.trackIds);
    const tracks = c.tracksOf(al.id);
    const more = c.albumsOf(ar.id).filter((a) => a.id !== al.id).map((a) => cardHTML(ent('album', a.id, 'year'))).join('');
    return stripHTML({ tint: shade(al.color, 0.3), title: al.title, ctx: ctx }) + heroPage(al.color,
      heroHTML({ kind: 'album', coverKey: al.id, type: albumType(al), title: al.title, desc: '', meta: meta }) +
      actionsHTML({ ctx: ctx, name: al.title, shuffle: true, save: { saved: saved } }) +
      trackTableHTML(tracks, { variant: 'album', label: al.title, ctxUri: ctx.uri }) +   // albums have no view toggle
      copyrightHTML(al) +
      (more ? shelfHTML('More by ' + ar.name, null, more, { cls: 'shelf--more' }) : ''));
  };
  views.artist = function (r) {
    const c = cat();
    const ar = c.artist(r.id);
    if (!ar) return notFound('Artist');
    const e = ent('artist', ar.id);
    const ctx = contextOf(e);
    const top = c.topTracks(ar.id, 10);
    const expanded = !!state.popularExpanded[ar.id];
    const shown = expanded ? top : top.slice(0, 5);
    const type = ar.verified ? icon('i-verified', 'badge-verified') + 'Verified Artist' : 'Artist';
    const meta = '<span class="hero__listeners">' + esc(c.formatPlays(ar.monthlyListeners)) + ' monthly listeners</span>';
    const disco = c.discography(ar.id);
    const discoList = state.discoTab === 'albums' ? disco.albums : state.discoTab === 'singles' ? disco.singles : c.albumsOf(ar.id);
    const discoChips = chipsHTML([{ id: 'popular', label: 'Popular releases' }, { id: 'albums', label: 'Albums' }, { id: 'singles', label: 'Singles and EPs' }], 'data-disco-chip', state.discoTab);
    const fans = c.relatedArtists(ar.id, 8).map((a) => cardHTML(ent('artist', a.id))).join('');
    return stripHTML({ tint: shade(ar.color, 0.3), title: ar.name, ctx: ctx }) + heroPage(ar.color,
      heroHTML({ kind: 'artist', coverKey: ar.id, round: true, type: type, title: ar.name, desc: '', meta: meta }) +
      actionsHTML({ ctx: ctx, name: ar.name, shuffle: true, follow: { following: Library.isFollowing(ar.id) } }) +
      '<h2 class="section-title popular-title">Popular</h2>' +
      trackTableHTML(shown, { variant: 'popular', noHead: true, label: 'Popular', ctxUri: ctx.uri }) +
      (top.length > 5 ? '<a class="table-more" href="#" data-popular-toggle="' + esc(ar.id) + '">' + (expanded ? 'Show less' : 'See more') + '</a>' : '') +
      shelfHTML('Discography', null, discoList.map((a) => cardHTML(ent('album', a.id, 'year'))).join('') || '<div class="section-sub disco-empty">No releases of this kind.</div>', { cls: 'shelf--disco', between: '<div class="disco-chips">' + discoChips + '</div>' }) +
      (fans ? shelfHTML('Fans also like', null, fans) : '') +
      '<section class="shelf shelf--about"><div class="shelf__head"><h2 class="shelf__title">About</h2></div>' +
      '<div class="about-card"><img class="cover about-card__img" data-cover="' + esc(ar.id) + '" alt=""><div class="about-card__body"><div class="about-card__listeners">' + esc(c.formatPlays(ar.monthlyListeners)) + ' monthly listeners</div><p class="about-card__bio">' + esc(ar.bio) + '</p></div></div></section>');
  };
  views.liked = function () {
    const c = cat();
    const e = ent('liked');
    const ctx = contextOf(e);
    const ids = Library.likedTrackIds();
    const tracks = ids.map((id) => c.track(id)).filter(Boolean);
    const dates = ids.filter((id) => !!c.track(id)).map((id) => c.relativeDate(localIso(Library.likedAddedAt(id) || c.today)));
    const meta = '<span class="avatar avatar--24" aria-hidden="true">N</span><b>You</b><span>•</span><span>' + esc(c.pluralize(ids.length, 'song')) + '</span>';
    let body = heroHTML({ kind: 'liked', coverKey: 'liked', type: 'Playlist', title: 'Liked Songs', desc: '', meta: meta }) +
      actionsHTML({ ctx: ctx, name: 'Liked Songs', shuffle: true, filter: 'Search in Liked Songs', view: true });
    body += tracks.length
      ? trackTableHTML(tracks, { variant: 'liked', label: 'Liked Songs', ctxUri: 'liked', dates: dates, compact: state.viewMode === 'compact' })
      : emptyHTML('Songs you like will appear here', 'Save songs by tapping the heart icon.', '<button class="pill pill--primary" data-route="search">Find songs</button>', false, 'i-heart');
    return stripHTML({ tint: shade(LIKED_COLOR, 0.3), title: 'Liked Songs', ctx: ctx }) + heroPage(LIKED_COLOR, body);
  };
  views.genre = function (r) {
    const c = cat();
    const g = c.genre(r.id);
    if (!g) return notFound('Genre');
    const e = ent('genre', g.id);
    const gc = c.genreContent(g.id);
    const ctx = { uri: e.uri, name: g.name, trackIds: gc.tracks.map((t) => t.id) };
    const pls = gc.playlists.map((p) => cardHTML(ent('playlist', p.id))).join('');
    const als = gc.albums.slice(0, 10).map((a) => cardHTML(ent('album', a.id))).join('');
    const ars = gc.artists.slice(0, 10).map((a) => cardHTML(ent('artist', a.id))).join('');
    return stripHTML({ tint: shade(g.color, 0.3), title: g.name, ctx: ctx }) + heroPage(g.color,
      heroHTML({ kind: 'genre', title: g.name }) +
      '<div class="genre-body">' +
      (pls ? shelfHTML('Popular playlists', null, pls) : '') + (als ? shelfHTML('Popular albums', null, als) : '') + (ars ? shelfHTML('Popular artists', null, ars) : '') +
      '<h2 class="section-title songs-title">Top songs</h2>' +
      trackTableHTML(gc.tracks, { variant: 'songs', label: 'Top songs', ctxUri: ctx.uri }) + '</div>');
  };
  function notFound(what) {
    return stripHTML({ tint: 'var(--bg-panel)' }) + '<div class="page">' + emptyHTML(what + ' not found', 'It may have been removed.', '<button class="pill pill--primary" data-route="home">Go home</button>') + '</div>';
  }

  // ---------------------------------------------------------------------------
  // Sidebar (Your Library) — also reused by the phone `library` route
  // ---------------------------------------------------------------------------
  const SORT_LABELS = { recents: 'Recents', added: 'Recently added', alpha: 'Alphabetical', creator: 'Creator' };
  function libraryItems() {
    const c = cat();
    const items = [];
    Library.savedPlaylistIds().forEach((id) => { const e = ent('playlist', id); if (e) { e.sub = 'Playlist • Wavelength'; e.at = Library.savedAt(id); e.filterKind = 'playlists'; items.push(e); } });
    Library.playlists().forEach((p) => { const e = ent('user', p.id); if (e) { e.sub = 'Playlist • You'; e.at = p.createdAt; e.filterKind = 'playlists'; items.push(e); } });
    Library.followedArtistIds().forEach((id) => { const e = ent('artist', id); if (e) { e.sub = 'Artist'; e.at = Library.savedAt(id); e.filterKind = 'artists'; items.push(e); } });
    Library.savedAlbumIds().forEach((id) => { const e = ent('album', id); if (e) { const al = c.album(id); const ar = c.artist(al.artistId); e.sub = 'Album • ' + (ar ? ar.name : ''); e.at = Library.savedAt(id); e.filterKind = 'albums'; items.push(e); } });
    const sb = state.sb;
    let list = sb.filter ? items.filter((e) => e.filterKind === sb.filter) : items;
    if (sb.query) { const q = normText(sb.query); list = list.filter((e) => normText(e.name).indexOf(q) >= 0); }
    const recents = Library.recents();
    const byName = (a, b) => a.name.localeCompare(b.name);
    const byAt = (a, b) => String(b.at || '').localeCompare(String(a.at || ''));
    if (sb.sort === 'alpha') list.sort(byName);
    else if (sb.sort === 'creator') list.sort((a, b) => a.owner.localeCompare(b.owner) || byName(a, b));
    else if (sb.sort === 'added') list.sort(byAt);
    else list.sort((a, b) => { const ia = recents.indexOf(a.uri), ib = recents.indexOf(b.uri); if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib); return byAt(a, b); });
    const liked = ent('liked');
    if ((!sb.filter || sb.filter === 'playlists') && (!sb.query || normText('Liked Songs').indexOf(normText(sb.query)) >= 0)) list.unshift(liked);
    return list;
  }
  function libRowHTML(e) {
    const round = e.kind === 'artist';
    const active = isActiveEntity(e);
    const sub = e.kind === 'liked' ? icon('i-pin', 'icon--xs') + 'Playlist • ' + esc(cat().pluralize(Library.likedTrackIds().length, 'song')) : esc(e.sub);
    return '<li><button class="lib-row' + (active ? ' is-active' : '') + '" data-context-uri="' + esc(e.uri) + '" data-route="' + esc(e.route) + '" data-id="' + esc(e.id) + '" data-kind="' + esc(e.kind) + '" title="' + esc(e.name) + '" aria-label="' + esc(e.name) + '">' +
      '<span class="lib-row__cover' + (round ? ' lib-row__cover--round' : '') + '"><img class="cover cover--48' + (round ? ' cover--round' : '') + '" data-cover="' + esc(e.coverKey) + '" alt=""><span class="lib-row__play" aria-hidden="true">' + playIcons(false) + '</span></span>' +
      '<span class="lib-row__text"><span class="name">' + esc(e.name) + '</span><span class="sub">' + sub + '</span></span>' +
      '<span class="lib-row__end">' + icon('i-speaker', 'icon--sm lib-row__speaker') + '</span></button>' +
      (e.kind === 'liked' ? '' : '<button class="icon-btn lib-row__more" aria-label="More options for ' + esc(e.name) + '" data-kind="' + esc(e.kind) + '" data-id="' + esc(e.id) + '">' + icon('i-more', 'icon--sm') + '</button>') + '</li>';
  }
  function isActiveEntity(e) {
    const r = state.route;
    if (!r || !e) return false;
    if (e.kind === 'liked') return r.view === 'liked';
    if (e.kind === 'playlist' || e.kind === 'user') return r.view === 'playlist' && r.id === e.id;
    if (e.kind === 'album') return r.view === 'album' && r.id === e.id;
    if (e.kind === 'artist') return r.view === 'artist' && r.id === e.id;
    return false;
  }
  function libChipsHTML() {
    const f = state.sb.filter;
    const chips = [['playlists', 'Playlists'], ['artists', 'Artists'], ['albums', 'Albums']].filter((x) => !f || x[0] === f);
    return '<div class="lib-chips">' + (f ? '<button class="chip chip--icon lib-chip-clear" aria-label="Clear filters">' + icon('i-close', 'icon--sm') + '</button>' : '') +
      chips.map((x) => '<button class="chip" aria-pressed="' + (f === x[0]) + '" data-lib-chip="' + x[0] + '">' + x[1] + '</button>').join('') + '</div>';
  }
  function libFilterHTML() {
    const sb = state.sb;
    return '<div class="lib-filter"><div class="lib-filter__box"><button class="icon-btn lib-filter__btn" aria-label="Search in Your Library">' + icon('i-search', 'icon--sm') + '</button>' +
      '<div class="lib-filter__input' + (sb.filterOpen ? ' is-open' : '') + '">' + icon('i-search', 'icon--sm') + '<input type="text" placeholder="Search in Your Library" aria-label="Search in Your Library" value="' + esc(sb.query) + '"></div></div>' +
      '<button class="lib-sort" aria-label="Sort by: ' + esc(SORT_LABELS[sb.sort] || 'Recents') + '">' + esc(SORT_LABELS[sb.sort] || 'Recents') + ' ' + icon('i-chevron-down', 'icon--sm') + '</button></div>';
  }
  function libListHTML() {
    const list = libraryItems();
    if (!list.length) {
      if (state.sb.query) return '<div class="lib-empty"><strong>Couldn\'t find "' + esc(state.sb.query) + '"</strong>Try searching again using a different spelling or keyword.</div>';
      const what = { artists: ['Follow your first artist', 'Follow artists you like by tapping the Follow button.'], albums: ['Save your first album', 'Save albums by tapping the add button on an album page.'] }[state.sb.filter] ||
        ['Create your first playlist', 'It\'s easy, we\'ll help you.'];
      return '<div class="lib-empty"><strong>' + esc(what[0]) + '</strong>' + esc(what[1]) + '</div>';
    }
    return '<ul class="lib-list">' + list.map(libRowHTML).join('') + '</ul>';
  }
  function renderSidebar() {
    const sb = els.sidebar;
    const input = sb.querySelector('.lib-filter input');
    const focused = input && D.activeElement === input;
    sb.innerHTML = '<div class="lib-header"><button class="lib-title" aria-label="' + libTitleLabel() + '" title="Your Library">' + icon('i-library-filled') + '<span>Your Library</span></button>' +
      '<button class="icon-btn lib-add" aria-label="Create playlist">' + icon('i-plus') + '</button></div>' +
      libChipsHTML() + libFilterHTML() + libListHTML();
    fillCovers(sb);
    applyHighlights(sb);
    if (focused) { const ni = sb.querySelector('.lib-filter input'); if (ni) { ni.focus(); try { ni.setSelectionRange(ni.value.length, ni.value.length); } catch (e) { /* ignore */ } } }
  }
  function refreshLibList(root) {
    const list = root.querySelector('.lib-list, .lib-empty');
    if (!list) return;
    const wrap = D.createElement('div');
    wrap.innerHTML = libListHTML();
    const next = wrap.firstElementChild;
    list.replaceWith(next);
    fillCovers(next);
    applyHighlights(next);
  }
  function applyLibFilter(root, q) { state.sb.query = q; refreshLibList(root); }
  function markSidebarActive() {
    [els.sidebar, els.main].forEach((root) => {
      root.querySelectorAll('.lib-row').forEach((row) => {
        row.classList.toggle('is-active', isActiveEntity({ kind: row.getAttribute('data-kind'), id: row.getAttribute('data-id') }));
      });
    });
  }
  function setSidebarCollapsed(v) {
    state.sidebarCollapsed = !!v;
    els.app.setAttribute('data-sidebar', v ? 'rail' : 'full');
    Library.setPref('sidebarCollapsed', !!v);
    syncLibTitleLabel();
  }
  function libTitleLabel() {
    if (!isDesktop()) return 'Your Library';
    return state.sidebarCollapsed ? 'Expand Your Library' : 'Collapse Your Library';
  }
  function syncLibTitleLabel() {
    const t = els.sidebar && els.sidebar.querySelector('.lib-title');
    if (t) t.setAttribute('aria-label', libTitleLabel());
  }

  // ---------------------------------------------------------------------------
  // Right panel (Now playing / Queue)
  // ---------------------------------------------------------------------------
  function rightPanelMode() { return state.rightMode; }
  function setRightPanel(mode) {
    const m = mode === 'now-playing' || mode === 'queue' ? mode : null;
    const next = m && m === state.rightMode ? null : m;
    state.rightMode = next;
    els.app.setAttribute('data-right', next || 'none');
    els.right.hidden = !next;
    Library.setPref('rightPanel', next);
    renderRightPanel();
    appEmit('rightpanel', next);
  }
  function rpHeadHTML(st) {
    const e = st.context ? entFromUri(st.context.uri) : null;
    const name = st.context ? st.context.name : (state.rightMode === 'queue' ? 'Queue' : 'Now playing');
    const title = e ? '<a href="#" data-route="' + esc(e.route) + '" data-id="' + esc(e.id) + '">' + esc(name) + '</a>' : esc(name);
    return '<div class="rp__head"><h2 class="rp__title">' + title + '</h2><button class="icon-btn rp__close" aria-label="Close">' + icon('i-close', 'icon--sm') + '</button></div>';
  }
  function renderRightPanel() {
    const rp = els.right;
    if (!state.rightMode) { rp.innerHTML = ''; return; }
    const c = cat();
    const st = playerState();
    const cur = st.currentTrackId && c ? c.track(st.currentTrackId) : null;
    let html = rpHeadHTML(st) + '<div class="rp__body">';
    if (!cur) {
      html += emptyHTML(state.rightMode === 'queue' ? 'Add to your queue' : 'Nothing playing', state.rightMode === 'queue' ? 'Tap "Add to queue" from a song\'s menu to see it here.' : 'Play something and it will show up here.', '', true);
    } else if (state.rightMode === 'now-playing') {
      const al = c.album(cur.albumId);
      const ar = c.artist(cur.artistId);
      const liked = Library.isLiked(cur.id);
      const up = arr(pcall('upcoming', 1));
      const nextT = up.length ? c.track(up[0].trackId) : null;
      html += '<img class="cover rp__cover" data-cover="' + esc(al.id) + '" alt="">' +
        '<div class="rp__track" data-track-id="' + esc(cur.id) + '"><div class="rp__track-text"><div class="rp__track-title"><a href="#" data-route="album" data-id="' + esc(al.id) + '">' + esc(cur.title) + '</a></div><div class="rp__track-artist">' + artistLinks(cur) + '</div></div>' +
        '<button class="icon-btn rp__like' + (liked ? ' is-active' : '') + '" aria-label="' + (liked ? 'Remove from Liked Songs' : 'Add to Liked Songs') + '">' + icon(liked ? 'i-check-circle' : 'i-add-circle') + '</button></div>' +
        '<div class="rp-card rp-card--artist"><div class="rp-card__img"><img class="cover" data-cover="' + esc(ar.id) + '" alt=""><span class="rp-card__img-label">About the artist</span></div>' +
        '<div class="rp-card__body"><div class="rp-card__row"><div><a class="rp-card__name" href="#" data-route="artist" data-id="' + esc(ar.id) + '">' + esc(ar.name) + '</a><div class="rp-card__sub">' + esc(c.formatPlays(ar.monthlyListeners)) + ' monthly listeners</div></div>' +
        '<button class="pill rp__follow" data-id="' + esc(ar.id) + '">' + (Library.isFollowing(ar.id) ? 'Following' : 'Follow') + '</button></div><p class="rp-card__bio">' + esc(ar.bio) + '</p></div></div>';
      html += '<div class="rp-card rp-card--queue"><div class="rp-card__head"><span class="rp-card__name">Next in queue</span><a class="text-link" href="#" data-route="queue">Open queue</a></div>' +
        (nextT ? '<div class="song-list" data-section="next">' + songRowHTML(nextT, { qid: up[0].qid || '', pos: 0 }) + '</div>' : '<div class="rp-card__empty">Nothing queued yet.</div>') + '</div>';
    } else {
      const up = arr(pcall('upcoming', 50));
      const queued = up.filter((u) => u.source === 'queue');
      const fromCtx = up.filter((u) => u.source !== 'queue');
      html += '<section class="queue-section"><div class="queue-section__head"><h2 class="queue-section__title">Now playing</h2></div><div class="song-list" data-section="now">' + songRowHTML(cur) + '</div></section>';
      if (queued.length) html += '<section class="queue-section"><div class="queue-section__head"><h2 class="queue-section__title">Next in queue</h2><button class="pill pill--sm queue-clear">Clear queue</button></div><div class="song-list" data-section="queue">' + queued.map((u, i) => { const t = c.track(u.trackId); return t ? songRowHTML(t, { qid: u.qid, pos: i }) : ''; }).join('') + '</div></section>';
      if (fromCtx.length && st.context) {
        const e = entFromUri(st.context.uri);
        const link = e ? '<a href="#" data-route="' + esc(e.route) + '" data-id="' + esc(e.id) + '">' + esc(st.context.name) + '</a>' : esc(st.context.name);
        html += '<section class="queue-section"><div class="queue-section__head"><h2 class="queue-section__title"><span class="muted">Next from:</span> ' + link + '</h2></div><div class="song-list" data-section="context">' + fromCtx.map((u, i) => { const t = c.track(u.trackId); return t ? songRowHTML(t, { pos: i }) : ''; }).join('') + '</div></section>';
      }
      if (!queued.length && !fromCtx.length) html += emptyHTML('Add to your queue', 'Tap "Add to queue" from a song\'s menu to see it here.', '', true);
    }
    rp.innerHTML = html + '</div>';
    fillCovers(rp);
    applyHighlights(rp);
    closeStaleMenu();
  }
  // A menu opened from an element that a re-render has just replaced acts on stale data (a queue item that
  // already started, a row that moved), so close it.
  function closeStaleMenu() {
    if (menu.open && menu.origin && !menu.origin.isConnected) closeContextMenu();
  }
  function refreshQueueViews() {
    if (state.route && state.route.view === 'queue') { const top = els.main.scrollTop; render(state.route, { full: true }); els.main.scrollTop = top; }
    renderRightPanel();
  }

  // ---------------------------------------------------------------------------
  // Top bar and bottom nav (rendered once, synced per route)
  // ---------------------------------------------------------------------------
  function renderTopbar() {
    els.topbar.innerHTML = '<div class="topbar__left"><button class="topbar__logo" aria-label="Wavelength" data-route="home">' + icon('i-logo') + '</button></div>' +
      '<div class="topbar__center"><button class="round-btn topbar__home" aria-label="Home" data-route="home">' + icon('i-home') + '</button>' +
      '<div class="search-pill">' + icon('i-search') + '<input class="search-pill__input" type="search" placeholder="What do you want to play?" aria-label="Search" autocomplete="off">' +
      '<button class="icon-btn search-pill__clear" aria-label="Clear search" hidden>' + icon('i-close', 'icon--sm') + '</button><span class="search-pill__divider" aria-hidden="true"></span>' +
      '<button class="icon-btn search-pill__browse" aria-label="Browse">' + icon('i-browse') + '</button></div></div>' +
      '<div class="topbar__right"><button class="avatar-btn" aria-label="Account menu"><span class="avatar">N</span></button></div>';
  }
  function setUse(svgParent, id) { const u = svgParent && svgParent.querySelector('use'); if (u && u.getAttribute('href') !== '#' + id) u.setAttribute('href', '#' + id); }
  function syncTopbar(r) {
    const home = els.topbar.querySelector('.topbar__home');
    if (home) { home.classList.toggle('is-active', r.view === 'home'); setUse(home, r.view === 'home' ? 'i-home-filled' : 'i-home'); }
    const input = els.topbar.querySelector('.search-pill__input');
    if (input && D.activeElement !== input) input.value = r.view === 'search' ? (r.query || '') : '';
    const clear = els.topbar.querySelector('.search-pill__clear');
    if (clear && input) clear.hidden = !input.value;
    const browse = els.topbar.querySelector('.search-pill__browse');
    if (browse) browse.classList.toggle('is-active', r.view === 'search');
    const pf = els.main.querySelector('.search-field input');
    if (pf) { if (D.activeElement !== pf) pf.value = r.query || ''; const pc = els.main.querySelector('.search-field__clear'); if (pc) pc.hidden = !pf.value; }
  }
  function renderBottomNav() {
    els.bottomNav.innerHTML = [['home', 'Home', 'i-home'], ['search', 'Search', 'i-search'], ['library', 'Your Library', 'i-library']].map((x) =>
      '<a class="bottom-nav__item" href="#" data-route="' + x[0] + '" data-icon="' + x[2] + '">' + icon(x[2]) + x[1] + '</a>').join('');
  }
  function syncBottomNav(r) {
    const active = r.view === 'library' ? 'library' : r.view === 'search' ? 'search' : 'home';
    els.bottomNav.querySelectorAll('.bottom-nav__item').forEach((a) => {
      const id = a.getAttribute('data-route');
      const base = a.getAttribute('data-icon');
      a.classList.toggle('is-active', id === active);
      if (id === active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
      setUse(a, id === active ? base + '-filled' : base);
    });
  }

  // ---------------------------------------------------------------------------
  // Context menu (SPEC §8.7)
  // ---------------------------------------------------------------------------
  const menu = { open: false, sub: null, subParent: null, listeners: null, anchor: null, origin: null, returnFocus: null };
  function menuItemHTML(it, i) {
    if (!it) return '';
    if (it.type === 'separator') return '<div class="menu-sep" role="separator"></div>';
    if (it.type === 'header') return '<div class="menu-head">' + esc(it.label) + '</div>';
    if (it.type === 'search') return '<div class="menu-search">' + icon('i-search', 'icon--sm') + '<input type="text" placeholder="' + esc(it.placeholder || 'Search') + '" aria-label="' + esc(it.placeholder || 'Search') + '" autocomplete="off"></div>';
    return '<button class="menu-item' + (it.danger ? ' menu-item--danger' : '') + '" role="menuitem" data-idx="' + i + '" tabindex="-1"' +
      (it.submenu ? ' aria-haspopup="true" aria-expanded="false"' : '') + (it.disabled ? ' disabled' : '') + (it.filterable ? ' data-filterable="1"' : '') + '>' +
      (it.icon ? icon(it.icon, 'icon--sm menu-item__icon') : '') + '<span class="menu-item__label">' + esc(it.label) + '</span>' +
      (it.submenu ? icon('i-chevron-right', 'icon--sm menu-item__chev') : '') + (it.checked ? icon('i-check', 'icon--sm menu-item__check') : '') + '</button>' +
      (it.separatorAfter ? '<div class="menu-sep" role="separator"></div>' : '');
  }
  function renderMenuList(el, items) {
    el.innerHTML = '<div class="menu-list">' + items.map(menuItemHTML).join('') + '</div>';
    el._items = items;
  }
  function placeMenu(el, x, y) {
    const vw = W.innerWidth, vh = W.innerHeight;
    el.style.maxHeight = Math.max(120, vh - 16) + 'px';
    const w = el.offsetWidth, h = el.offsetHeight;
    if (x + w > vw - 8) x = Math.max(8, vw - 8 - w);
    if (y + h > vh - 8) y = Math.max(8, vh - 8 - h);
    el.style.left = Math.round(Math.max(8, x)) + 'px';
    el.style.top = Math.round(Math.max(8, y)) + 'px';
  }
  function openContextMenu(items, pos) {
    const o = pos || {};
    const anchor = o.anchor && typeof o.anchor.getBoundingClientRect === 'function' ? o.anchor : null;
    // clicking the control that opened the menu closes it instead of reopening it
    if (menu.open && anchor && menu.anchor === anchor) { closeContextMenu(); return; }
    closeContextMenu();
    const list = arr(items).filter(Boolean);
    if (!list.length) return;
    hideTooltip();
    const el = els.menu;
    renderMenuList(el, list);
    el.hidden = false;
    el.style.left = '0px'; el.style.top = '0px';
    let x = 0, y = 0;
    if (anchor) { const r = anchor.getBoundingClientRect(); x = r.left; y = r.bottom + 4; }
    else { x = Number(o.x) || 0; y = Number(o.y) || 0; }
    placeMenu(el, x, y);
    menu.open = true;
    menu.anchor = anchor;
    // the element the menu belongs to (a row, a card...): a re-render that drops it closes the menu
    menu.origin = anchor || (o.origin && o.origin.nodeType === 1 ? o.origin : null);
    const af = D.activeElement;
    menu.returnFocus = anchor || (af && af !== D.body && !el.contains(af) ? af : null);
    const l = menu.listeners = {
      down: (e) => { if (!el.contains(e.target) && !(menu.sub && menu.sub.contains(e.target)) && !(menu.anchor && menu.anchor.contains(e.target))) closeContextMenu(); },
      key: onMenuKey,
      resize: () => closeContextMenu(),
      scroll: (e) => { if (!el.contains(e.target) && !(menu.sub && menu.sub.contains(e.target))) closeContextMenu(); },
    };
    D.addEventListener('pointerdown', l.down, true);
    D.addEventListener('keydown', l.key, true);
    W.addEventListener('resize', l.resize);
    D.addEventListener('scroll', l.scroll, true);
    const si = el.querySelector('.menu-search input');
    if (si) si.focus();
  }
  function closeSubmenu(focusParent) {
    if (menu.sub) { menu.sub.remove(); menu.sub = null; }
    if (menu.subParent) {
      menu.subParent.classList.remove('is-open');
      menu.subParent.setAttribute('aria-expanded', 'false');
      if (focusParent) setMenuFocus(els.menu, menu.subParent);
      menu.subParent = null;
    }
  }
  function closeContextMenu() {
    if (!menu.open) return;
    const el = els.menu;
    const ae = D.activeElement;
    const focusInMenu = !ae || ae === D.body || el.contains(ae) || !!(menu.sub && menu.sub.contains(ae));
    closeSubmenu(false);
    el.hidden = true;
    el.innerHTML = '';
    el._items = null;
    menu.open = false;
    const rf = menu.returnFocus;
    menu.anchor = null; menu.origin = null; menu.returnFocus = null;
    // give focus back to the control that opened the menu (before any item action runs, so a dialog
    // opened from the menu records it as the element to return to)
    if (focusInMenu && rf && rf.isConnected && typeof rf.focus === 'function') { try { rf.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
    const l = menu.listeners;
    if (l) {
      D.removeEventListener('pointerdown', l.down, true);
      D.removeEventListener('keydown', l.key, true);
      W.removeEventListener('resize', l.resize);
      D.removeEventListener('scroll', l.scroll, true);
      menu.listeners = null;
    }
  }
  function openSubmenu(itemEl, it) {
    if (menu.subParent === itemEl && menu.sub) return;
    closeSubmenu(false);
    const items = arr(typeof it.submenu === 'function' ? it.submenu() : it.submenu).filter(Boolean);
    if (!items.length) return;
    const sub = D.createElement('div');
    sub.className = 'context-menu context-menu--sub';
    sub.setAttribute('role', 'menu');
    renderMenuList(sub, items);
    D.body.appendChild(sub);
    menu.sub = sub;
    menu.subParent = itemEl;
    itemEl.classList.add('is-open');
    itemEl.setAttribute('aria-expanded', 'true');
    const pr = itemEl.getBoundingClientRect();
    const vw = W.innerWidth, vh = W.innerHeight;
    sub.style.maxHeight = Math.max(120, vh - 16) + 'px';
    const w = sub.offsetWidth, h = sub.offsetHeight;
    let x = pr.right + 2, y = pr.top - 4;
    if (x + w > vw - 8) x = Math.max(8, pr.left - w - 2);
    if (y + h > vh - 8) y = Math.max(8, vh - 8 - h);
    sub.style.left = Math.round(x) + 'px';
    sub.style.top = Math.round(y) + 'px';
    const si = sub.querySelector('.menu-search input');
    if (si) si.focus();
  }
  function menuItemsOf(menuEl) { return Array.prototype.filter.call(menuEl.querySelectorAll('.menu-item'), (b) => !b.disabled && !b.hidden); }
  function setMenuFocus(menuEl, itemEl) {
    menuEl.querySelectorAll('.menu-item.is-focused').forEach((b) => b.classList.remove('is-focused'));
    if (itemEl) { itemEl.classList.add('is-focused'); try { itemEl.focus({ preventScroll: true }); } catch (e) { itemEl.focus(); } }
  }
  function activateMenuItem(menuEl, itemEl, ev) {
    const items = menuEl._items || [];
    const it = items[Number(itemEl.getAttribute('data-idx'))];
    if (!it || it.disabled) return;
    if (it.submenu) { openSubmenu(itemEl, it); const first = menu.sub && menuItemsOf(menu.sub)[0]; if (first && ev && ev.type === 'keydown') setMenuFocus(menu.sub, first); return; }
    closeContextMenu();
    if (typeof it.onClick === 'function') it.onClick(it, ev);
  }
  function onMenuKey(e) {
    if (!menu.open) return;
    const active = menu.sub || els.menu;
    const inSearch = isEditable(e.target) && !!e.target.closest('.menu-search');
    const items = menuItemsOf(active);
    const cur = active.querySelector('.menu-item.is-focused');
    const idx = cur ? items.indexOf(cur) : -1;
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        if (menu.sub) closeSubmenu(true); else closeContextMenu();
        return;
      case 'ArrowDown': case 'ArrowUp': {
        e.preventDefault();
        if (!items.length) return;
        const n = e.key === 'ArrowDown' ? (idx + 1) % items.length : (idx <= 0 ? items.length - 1 : idx - 1);
        setMenuFocus(active, items[n]);
        return;
      }
      case 'ArrowRight': {
        if (inSearch) return;
        e.preventDefault();
        // ArrowRight only opens a submenu; it never runs an item's action
        const it = cur && !menu.sub ? (active._items || [])[Number(cur.getAttribute('data-idx'))] : null;
        if (it && it.submenu && !it.disabled) activateMenuItem(active, cur, e);
        return;
      }
      case 'ArrowLeft':
        if (inSearch) return;
        if (menu.sub) { e.preventDefault(); closeSubmenu(true); }
        return;
      case 'Enter': case ' ':
        if (inSearch) return;
        e.preventDefault();
        if (cur) activateMenuItem(active, cur, e);
        return;
      case 'Tab':
        closeContextMenu();
        return;
      default:
        return;
    }
  }
  function onMenuClick(e) {
    const item = e.target.closest('.menu-item');
    if (!item) return;
    const menuEl = item.closest('.context-menu');
    e.preventDefault();
    activateMenuItem(menuEl, item, e);
  }
  function onMenuOver(e) {
    const item = e.target.closest('.menu-item');
    if (!item) return;
    const menuEl = item.closest('.context-menu');
    if (menuEl === els.menu) {
      const it = (menuEl._items || [])[Number(item.getAttribute('data-idx'))];
      if (it && it.submenu && !it.disabled) openSubmenu(item, it);
      else if (menu.sub) closeSubmenu(false);
    }
    setMenuFocus(menuEl, item);
  }
  function onMenuInput(e) {
    const input = e.target;
    if (!input.closest || !input.closest('.menu-search')) return;
    const menuEl = input.closest('.context-menu');
    const q = normText(input.value.trim());
    menuEl.querySelectorAll('.menu-item[data-filterable]').forEach((b) => {
      b.hidden = !!q && normText(b.textContent).indexOf(q) < 0;
    });
  }

  // ---------------------------------------------------------------------------
  // Dialog, toast, tooltip
  // ---------------------------------------------------------------------------
  const dialogState = { prevFocus: null };
  function isDialogOpen() { return !!els.dialogRoot.firstElementChild; }
  function openDialog(o) {
    closeDialog();
    closeContextMenu();
    hideTooltip();
    const opts = o || {};
    const backdrop = D.createElement('div');
    backdrop.className = 'dialog-backdrop';
    const dlg = D.createElement('div');
    dlg.className = 'dialog';
    dlg.setAttribute('role', 'dialog');
    dlg.setAttribute('aria-modal', 'true');
    dlg.setAttribute('aria-labelledby', 'dlg-title');
    if (opts.closeButton) {
      const b = D.createElement('button');
      b.className = 'icon-btn dialog__close';
      b.setAttribute('aria-label', 'Close');
      b.innerHTML = icon('i-close');
      b.addEventListener('click', () => closeDialog());
      dlg.appendChild(b);
    }
    const h = D.createElement('h2');
    h.className = 'dialog__title';
    h.id = 'dlg-title';
    h.textContent = opts.title == null ? '' : String(opts.title);
    dlg.appendChild(h);
    const body = D.createElement('div');
    body.className = 'dialog__body';
    if (opts.body && typeof opts.body === 'object' && opts.body.nodeType) body.appendChild(opts.body);
    else body.textContent = opts.body == null ? '' : String(opts.body);
    dlg.appendChild(body);
    const actions = arr(opts.actions).filter(Boolean);
    if (actions.length) {
      const row = D.createElement('div');
      row.className = 'dialog__actions';
      actions.forEach((a) => {
        const b = D.createElement('button');
        b.className = a.primary ? 'pill pill--primary' : 'text-btn';
        b.textContent = a.label == null ? '' : String(a.label);
        b.addEventListener('click', (ev) => {
          if (typeof a.onClick === 'function') a.onClick(ev);
          if (els.dialogRoot.firstElementChild === backdrop) closeDialog();
        });
        row.appendChild(b);
      });
      dlg.appendChild(row);
    }
    backdrop.appendChild(dlg);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeDialog(); });
    backdrop.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const f = Array.prototype.filter.call(dlg.querySelectorAll('button, input, textarea, select, a[href], [tabindex]:not([tabindex="-1"])'), (x) => !x.disabled && !x.hidden);
      if (!f.length) { e.preventDefault(); return; }
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (D.activeElement === first || !dlg.contains(D.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && D.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    dialogState.prevFocus = D.activeElement;
    els.dialogRoot.appendChild(backdrop);
    const focusTarget = dlg.querySelector('.dialog__body input, .dialog__body textarea') || dlg.querySelector('.dialog__actions .pill--primary') || dlg.querySelector('button');
    if (focusTarget) { focusTarget.focus(); if (focusTarget.select && focusTarget.tagName === 'INPUT') { try { focusTarget.select(); } catch (e) { /* ignore */ } } }
    return dlg;
  }
  function closeDialog() {
    if (!els.dialogRoot.firstElementChild) return;
    els.dialogRoot.innerHTML = '';
    const pf = dialogState.prevFocus;
    dialogState.prevFocus = null;
    if (pf && pf.focus && D.contains(pf)) { try { pf.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  }
  const toastState = { timer: 0 };
  function toast(message, opts) {
    const root = els.toastRoot;
    root.querySelectorAll('.toast').forEach((t) => t.remove());
    clearTimeout(toastState.timer);
    const el = D.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.textContent = message == null ? '' : String(message);
    const action = opts && opts.action;
    if (action && action.label) {
      const b = D.createElement('button');
      b.className = 'toast__action';
      b.textContent = String(action.label);
      b.addEventListener('click', () => { el.remove(); if (typeof action.onClick === 'function') action.onClick(); });
      el.appendChild(b);
    }
    root.appendChild(el);
    toastState.timer = setTimeout(() => {
      el.classList.add('is-leaving');
      setTimeout(() => el.remove(), 160);
    }, 3000);
    return el;
  }
  const tip = { el: null, timer: 0, anchor: null };
  function iconOnlyButton(el) {
    const b = el && el.closest ? el.closest('button[aria-label]') : null;
    if (!b || b.closest('#context-menu, .context-menu') || b.disabled) return null;
    if (b.textContent.trim() !== '') return null;
    return b;
  }
  function showTooltip(b) {
    if (!D.contains(b)) return;
    let el = tip.el;
    if (!el) {
      el = tip.el = D.createElement('div');
      el.className = 'tooltip';
      el.setAttribute('aria-hidden', 'true');
      els.toastRoot.appendChild(el);
    }
    el.textContent = b.getAttribute('aria-label') || '';
    el.style.left = '0px'; el.style.top = '0px';
    el.classList.add('is-visible');
    const r = b.getBoundingClientRect();
    const w = el.offsetWidth, h = el.offsetHeight;
    const x = clamp(r.left + r.width / 2 - w / 2, 8, Math.max(8, W.innerWidth - 8 - w));
    let y = r.top - h - 8;
    if (y < 4) y = r.bottom + 8;
    el.style.left = Math.round(x) + 'px';
    el.style.top = Math.round(y) + 'px';
  }
  function hideTooltip() {
    clearTimeout(tip.timer);
    tip.timer = 0;
    tip.anchor = null;
    if (tip.el) tip.el.classList.remove('is-visible');
  }
  function onTipEnter(e) {
    const b = iconOnlyButton(e.target);
    if (!b) { if (tip.anchor && !(e.target.closest && e.target.closest('button[aria-label]') === tip.anchor)) hideTooltip(); return; }
    if (b === tip.anchor) return;
    hideTooltip();
    tip.anchor = b;
    tip.timer = setTimeout(() => { if (tip.anchor === b) showTooltip(b); }, 300);
  }
  function onTipLeave(e) {
    if (!tip.anchor) return;
    const to = e.relatedTarget;
    if (to && tip.anchor.contains(to)) return;
    const b = e.target.closest ? e.target.closest('button[aria-label]') : null;
    if (b === tip.anchor || !b) hideTooltip();
  }

  // ---------------------------------------------------------------------------
  // Actions shared by menus, buttons and rows
  // ---------------------------------------------------------------------------
  function likeToggle(trackId) {
    const v = Library.toggleLike(trackId);
    toast(v ? 'Added to Liked Songs' : 'Removed from Liked Songs');
    return v;
  }
  function saveToggle(e) {
    if (!e) return;
    let v;
    if (e.kind === 'playlist') v = Library.toggleSavePlaylist(e.id);
    else if (e.kind === 'album') v = Library.toggleSaveAlbum(e.id);
    else if (e.kind === 'artist') v = Library.toggleFollow(e.id);
    else return;
    toast(v ? 'Added to Your Library' : 'Removed from Your Library');
  }
  function addToQueue(ids) {
    const list = arr(ids).length ? arr(ids) : (typeof ids === 'string' ? [ids] : []);
    if (!list.length) return;
    pcall('addToQueue', list.length === 1 ? list[0] : list);
    toast('Added to queue');
  }
  function copyText(text) {
    try { if (W.navigator && W.navigator.clipboard && W.navigator.clipboard.writeText) W.navigator.clipboard.writeText(text).catch(() => {}); } catch (e) { /* ignore */ }
    toast('Link copied to clipboard');
  }
  function shareItems(type, id) {
    const url = 'https://wavelength.example/' + type + '/' + id;
    return [
      { label: 'Copy link to ' + type, onClick: () => copyText(url) },
      { label: 'Embed ' + type, onClick: () => toast('Not available in this demo') },
    ];
  }
  function shareType(e) { return e.kind === 'user' || e.kind === 'liked' || e.kind === 'playlist' ? 'playlist' : e.kind; }
  function addTracksToPlaylist(plId, trackIds) {
    const p = Library.playlist(plId);
    if (!p) return;
    const ids = arr(trackIds);
    if (!ids.length) return;
    let n = 0;
    if (ids.length === 1) { if (Library.addToPlaylist(plId, ids[0])) n = 1; }
    else ids.forEach((id) => { if (Library.addToPlaylist(plId, id)) n++; });
    if (n) { toast('Added to ' + p.name); return; }
    // nothing new: the fixed "Already added" dialog (SPEC §8.7); "Add anyway" adds every track again
    openDialog({
      title: 'Already added',
      body: "This is already in your '" + p.name + "' playlist.",
      actions: [
        { label: "Don't add" },
        { label: 'Add anyway', primary: true, onClick: () => { ids.forEach((id) => Library.addToPlaylist(plId, id, { force: true })); toast('Added to ' + p.name); } },
      ],
    });
  }
  function addToPlaylistItems(trackIds, newName) {
    const ids = arr(trackIds);
    const items = [
      { type: 'search', placeholder: 'Find a playlist' },
      { label: 'New playlist', icon: 'i-plus', separatorAfter: true, onClick: () => {
        const p = Library.createPlaylist(newName);
        ids.forEach((id) => Library.addToPlaylist(p.id, id));
        toast('Added to ' + p.name);
        navigate({ view: 'playlist', id: p.id });
      } },
    ];
    Library.playlists().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).forEach((p) => {
      items.push({ label: p.name, filterable: true, onClick: () => addTracksToPlaylist(p.id, ids) });
    });
    return items;
  }
  function trackMenuItems(trackId, opts) {
    const c = cat();
    const t = c && c.track(trackId);
    if (!t) return [];
    const o = opts || {};
    const liked = Library.isLiked(trackId);
    const userPl = o.playlistId ? Library.playlist(o.playlistId) : null;
    const items = [
      { label: 'Add to playlist', icon: 'i-plus', submenu: () => addToPlaylistItems([trackId], t.title) },
      { label: liked ? 'Remove from your Liked Songs' : 'Save to your Liked Songs', icon: liked ? 'i-check-circle' : 'i-add-circle', onClick: () => likeToggle(trackId) },
      { label: 'Add to queue', icon: 'i-queue', onClick: () => addToQueue(trackId) },
    ];
    if (userPl) items.push({ label: 'Remove from this playlist', icon: 'i-trash', onClick: () => { Library.removeFromPlaylist(userPl.id, trackId, o.index); toast('Removed from ' + userPl.name); } });
    items.push({ label: 'Go to artist', onClick: () => navigate({ view: 'artist', id: t.artistId }) });
    items.push({ label: 'Go to album', onClick: () => navigate({ view: 'album', id: t.albumId }) });
    items.push({ label: 'Share', icon: 'i-share', submenu: shareItems('song', trackId) });
    return items;
  }
  function entityMenuItems(e) {
    if (!e) return [];
    const items = [{ label: 'Add to queue', icon: 'i-queue', onClick: () => addToQueue(entTrackIds(e)) }];
    if (e.kind === 'playlist' || e.kind === 'album') {
      const saved = e.kind === 'playlist' ? Library.isSavedPlaylist(e.id) : Library.isSavedAlbum(e.id);
      items.push({ label: saved ? 'Remove from Your Library' : 'Add to Your Library', icon: saved ? 'i-check-circle' : 'i-add-circle', onClick: () => saveToggle(e) });
    }
    if (e.kind === 'artist') {
      const f = Library.isFollowing(e.id);
      items.push({ label: f ? 'Unfollow' : 'Follow', icon: f ? 'i-check-circle' : 'i-add-circle', onClick: () => saveToggle(e) });
    }
    if (e.kind !== 'artist') items.push({ label: 'Add to playlist', icon: 'i-plus', submenu: () => addToPlaylistItems(entTrackIds(e), e.name) });
    if (e.kind === 'album') { const al = cat().album(e.id); if (al) items.push({ label: 'Go to artist', onClick: () => navigate({ view: 'artist', id: al.artistId }) }); }
    if (e.kind === 'user') {
      items.push({ label: 'Edit details', icon: 'i-edit', onClick: () => openEditDetails(e.id) });
      items.push({ label: 'Delete playlist', icon: 'i-trash', onClick: () => confirmDelete(e.id) });
    }
    items.push({ label: 'Share', icon: 'i-share', submenu: shareItems(shareType(e), e.id) });
    return items;
  }
  function sidebarRowMenuItems(e) {
    if (!e) return [];
    const items = [{ label: 'Add to queue', icon: 'i-queue', onClick: () => addToQueue(entTrackIds(e)) }];
    if (e.kind === 'user') {
      items.push({ label: 'Edit details', icon: 'i-edit', onClick: () => openEditDetails(e.id) });
      items.push({ label: 'Delete', icon: 'i-trash', onClick: () => confirmDelete(e.id) });
    } else if (e.kind !== 'liked') {
      items.push({ label: 'Remove from Your Library', icon: 'i-check-circle', onClick: () => saveToggle(e) });
    }
    items.push({ label: 'Share', icon: 'i-share', submenu: shareItems(shareType(e), e.id) });
    return items;
  }
  function openEditDetails(plId) {
    const p = Library.playlist(plId);
    if (!p) return;
    const body = D.createElement('div');
    body.className = 'edit-details';
    body.innerHTML = '<div class="edit-details__cover"><img class="cover" alt=""></div><div class="edit-details__fields">' +
      '<label class="field"><span class="field__label">Name</span><input class="field__input edit-details__name" type="text" placeholder="Add a name" maxlength="100" autocomplete="off"></label>' +
      '<label class="field"><span class="field__label">Description</span><textarea class="field__input edit-details__desc" placeholder="Add an optional description" maxlength="300"></textarea></label></div>';
    const img = body.querySelector('img');
    const src = coverFor(p.id);
    if (src) img.src = src;
    const name = body.querySelector('.edit-details__name');
    const desc = body.querySelector('.edit-details__desc');
    name.value = p.name;
    desc.value = p.description;
    const save = () => {
      const n = name.value.trim();
      Library.renamePlaylist(plId, n || p.name);
      Library.describePlaylist(plId, desc.value);
    };
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); closeDialog(); } });
    openDialog({ title: 'Edit details', body: body, closeButton: true, actions: [{ label: 'Save', primary: true, onClick: save }] });
  }
  function confirmDelete(plId) {
    const p = Library.playlist(plId);
    if (!p) return;
    const body = D.createElement('span');
    body.appendChild(D.createTextNode('This will delete '));
    const b = D.createElement('b');
    b.textContent = p.name;
    body.appendChild(b);
    body.appendChild(D.createTextNode(' from Your Library.'));
    openDialog({
      title: 'Delete from Your Library?',
      body: body,
      actions: [
        { label: 'Cancel' },
        { label: 'Delete', primary: true, onClick: () => {
          const onIt = state.route && state.route.view === 'playlist' && state.route.id === plId;
          if (onIt) navigate({ view: 'home' });
          Library.deletePlaylist(plId);
          toast('Playlist deleted');
        } },
      ],
    });
  }
  function createPlaylistAndGo() {
    const p = Library.createPlaylist();
    navigate({ view: 'playlist', id: p.id });
  }
  function pageEntity() {
    const r = state.route;
    if (!r) return null;
    if (r.view === 'playlist') return r.id && r.id.indexOf('plu_') === 0 ? ent('user', r.id) : ent('playlist', r.id);
    if (r.view === 'album') return ent('album', r.id);
    if (r.view === 'artist') return ent('artist', r.id);
    if (r.view === 'liked') return ent('liked');
    if (r.view === 'genre') return ent('genre', r.id);
    return null;
  }
  // rowPos: the row's data-pos (its index in the page's resolved track list). When the track occurs more
  // than once in the context (a user playlist with "Add anyway" duplicates) the position decides which copy
  // starts, because Player resolves startTrackId to the first copy.
  function playContextUri(uri, startTrackId, rowPos) {
    const ctx = contextFromUri(uri);
    if (!ctx || !ctx.trackIds.length) return;
    if (startTrackId) {
      const c = cat();
      const ids = c ? ctx.trackIds.filter((id) => !!c.track(id)) : ctx.trackIds;
      const p = rowPos != null && rowPos !== '' ? Number(rowPos) : -1;
      if (p >= 0 && ids[p] === startTrackId && ids.indexOf(startTrackId) !== ids.lastIndexOf(startTrackId)) ctx.startIndex = p;
      else ctx.startTrackId = startTrackId;
    }
    pcall('playContext', ctx);
  }
  function toggleContextUri(uri) {
    const ctx = contextFromUri(uri);
    if (ctx && ctx.trackIds.length) pcall('toggleContext', ctx);
  }
  function noteSearchHit(el) {
    const type = el.getAttribute('data-search-type');
    const id = el.getAttribute('data-search-id');
    if (type && id) Library.addRecentSearch({ type: type, id: id });
  }
  // Every search surface passes the same track list for the 'search' context (SPEC 6.1).
  function searchTrackIds() {
    const c = cat();
    const q = state.route && state.route.view === 'search' ? (state.route.query || '').trim() : '';
    return c && q ? c.search(q).tracks.map((t) => t.id) : [];
  }
  function playFromRow(row, opts) {
    if (!row) return;
    const o = opts || {};
    const trackId = row.getAttribute('data-track-id');
    if (o.toggleIfCurrent && isCurrentTrack(trackId)) { pcall('togglePlay'); return; }
    const qid = row.getAttribute('data-qid');
    const list = row.closest('[data-section], [data-ctx]');
    const section = list ? list.getAttribute('data-section') : null;
    const ctxUri = list ? list.getAttribute('data-ctx') : '';
    if (section === 'now') { pcall('togglePlay'); return; }
    if (section === 'queue' && qid) { pcall('playQueueItem', qid); return; }
    if (section === 'next') { if (qid) pcall('playQueueItem', qid); else pcall('next'); return; }
    if (section === 'context') {
      const st = playerState();
      if (st.context && st.context.trackIds) pcall('playContext', { uri: st.context.uri, name: st.context.name, trackIds: st.context.trackIds.slice(), startTrackId: trackId });
      else pcall('playTrack', trackId);
      return;
    }
    if (ctxUri === 'search') {
      let ids = searchTrackIds();
      if (ids.indexOf(trackId) < 0) ids = Array.prototype.map.call(list.querySelectorAll('[data-track-id]'), (r) => r.getAttribute('data-track-id'));
      pcall('playContext', { uri: 'search', name: 'Search', trackIds: ids, startTrackId: trackId });
      Library.addRecentSearch({ type: 'track', id: trackId });
      return;
    }
    if (ctxUri) { playContextUri(ctxUri, trackId, row.getAttribute('data-pos')); return; }
    pcall('playTrack', trackId);
  }
  function selectRow(row) {
    // one selection across #main and #right-panel
    [els.main, els.right].forEach((root) => root.querySelectorAll('.is-selected').forEach((r) => { if (r !== row) r.classList.remove('is-selected'); }));
    row.classList.add('is-selected');
    try { row.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }
  function openRowMenu(row, pos) {
    const trackId = row.getAttribute('data-track-id');
    const qid = row.getAttribute('data-qid');
    const list = row.closest('[data-playlist-id]');
    const plId = list ? list.getAttribute('data-playlist-id') : null;
    const posAttr = row.getAttribute('data-pos');
    const items = trackMenuItems(trackId, { playlistId: plId || undefined, index: posAttr != null ? Number(posAttr) : undefined });
    if (qid) items.unshift({ label: 'Remove from queue', icon: 'i-close', onClick: () => { if (pcall('removeFromQueue', qid) !== false) toast('Removed from queue'); } });
    if (!isPhone() && row.classList.contains('track-row')) selectRow(row);
    openContextMenu(items, Object.assign({ origin: row }, pos));
  }
  function setViewMode(mode) {
    if (state.viewMode === mode) return;
    state.viewMode = mode;
    rerender();
  }
  function openInlineFilter() {
    const box = els.main.querySelector('.inline-filter');
    if (!box) return;
    box.classList.add('is-open');
    const input = box.querySelector('input');
    if (input) input.focus();
  }
  function closeInlineFilter() {
    const box = els.main.querySelector('.inline-filter');
    if (!box) return;
    const input = box.querySelector('input');
    if (input) { input.value = ''; applyInlineFilter(input); }
    box.classList.remove('is-open');
    els.main.focus();
  }
  function applyInlineFilter(input) {
    const q = normText(input.value.trim());
    els.main.querySelectorAll('.track-table .track-row').forEach((row) => {
      row.hidden = !!q && (row.getAttribute('data-search') || '').indexOf(q) < 0;
    });
  }
  function refreshFinder() {
    const box = els.main.querySelector('.playlist-finder:not(.playlist-finder--recommended)');
    if (!box) return;
    const p = Library.playlist(box.getAttribute('data-playlist-id'));
    if (!p) return;
    const list = box.querySelector('.finder-list');
    list.innerHTML = finderResultsHTML(p);
    fillCovers(list);
    const clear = box.querySelector('.finder-search__clear');
    if (clear) clear.hidden = !state.finderQuery;
  }
  const finderTyped = debounce(() => refreshFinder(), 150);
  function refreshRecommended() {
    const box = els.main.querySelector('.playlist-finder--recommended');
    if (!box) return;
    const p = Library.playlist(box.getAttribute('data-playlist-id'));
    if (!p) return;
    const list = box.querySelector('.finder-list');
    list.innerHTML = recommendedTracks(p).map(finderRowHTML).join('');
    fillCovers(list);
  }
  function refreshLibraryUI() {
    renderSidebar();
    if (state.route && state.route.view === 'library') { const top = els.main.scrollTop; render(state.route, { full: true }); els.main.scrollTop = top; }
  }
  function setLibFilter(v) {
    state.sb.filter = v;
    Library.setPref('sidebarFilter', v);
    refreshLibraryUI();
  }
  function openSortMenu(anchor) {
    const items = [{ type: 'header', label: 'Sort by' }];
    Object.keys(SORT_LABELS).forEach((k) => {
      items.push({ label: SORT_LABELS[k], checked: state.sb.sort === k, onClick: () => { state.sb.sort = k; Library.setPref('sidebarSort', k); refreshLibraryUI(); } });
    });
    openContextMenu(items, { anchor: anchor });
  }
  function toggleLibFilterInput(filterEl) {
    const box = filterEl.querySelector('.lib-filter__input');
    const input = box.querySelector('input');
    const open = !box.classList.contains('is-open');
    state.sb.filterOpen = open;
    box.classList.toggle('is-open', open);
    if (open) input.focus();
    else { input.value = ''; applyLibFilter(filterEl.closest('#sidebar') || els.main, ''); }
  }
  function refreshHomeShelves() {
    const main = els.main;
    const grid = main.querySelector('.quick-grid');
    if (grid) { grid.innerHTML = quickPicks().map(tileHTML).join(''); fillCovers(grid); applyHighlights(grid); }
    const s = sectionItems('recent');
    const html = s && s.items.length ? shelfHTML(s.title, 'recent', s.items.slice(0, 10).map((e) => cardHTML(e)).join('')) : '';
    const old = main.querySelector('.shelf[data-shelf="recent"]');
    const tmp = D.createElement('div');
    tmp.innerHTML = html;
    const next = tmp.firstElementChild;
    if (old) { if (next) old.replaceWith(next); else old.remove(); }
    else if (next) { const anchor = main.querySelector('.shelf[data-shelf="made-for-you"]'); const page = main.querySelector('.page--home'); if (anchor) anchor.after(next); else if (page) page.appendChild(next); }
    if (next && next.isConnected) { clampShelfRows(next.parentNode || els.main); fillCovers(next); applyHighlights(next); }
  }
  function focusSearch() {
    if (isPhone()) {
      if (!state.route || state.route.view !== 'search') navigate({ view: 'search', query: '' });
      const f = els.main.querySelector('.search-field input');
      if (f) f.focus();
      return;
    }
    const i = els.topbar.querySelector('.search-pill__input');
    if (i) { i.focus(); try { i.select(); } catch (e) { /* ignore */ } }
  }
  const searchTyped = debounce((value) => {
    const q = String(value).trim();
    const onSearch = state.route && state.route.view === 'search';
    if (onSearch && (state.route.query || '') === q) return;
    navigate({ view: 'search', query: q }, { replace: onSearch });
  }, 150);
  function clearSearch() {
    searchTyped.cancel();
    const i = els.topbar.querySelector('.search-pill__input');
    if (i) i.value = '';
    const pf = els.main.querySelector('.search-field input');
    if (pf) pf.value = '';
    if (state.route && state.route.view === 'search' && state.route.query) navigate({ view: 'search', query: '' }, { replace: true });
    else syncTopbar(state.route || { view: 'home' });
  }

  // ---------------------------------------------------------------------------
  // Delegated events
  // ---------------------------------------------------------------------------
  function onPanelClick(e) {
    const t = e.target;
    if (!t || !t.closest) return;
    let el;
    if (t.closest('.nav-btn--back')) { back(); return; }
    if (t.closest('.nav-btn--forward')) { forward(); return; }
    if ((el = t.closest('.play-btn'))) {
      const holder = el.closest('[data-context-uri], [data-track-id]');
      if (holder) {
        e.preventDefault(); e.stopPropagation();
        noteSearchHit(holder);
        if (holder.hasAttribute('data-context-uri')) toggleContextUri(holder.getAttribute('data-context-uri'));
        else playFromRow(holder, { toggleIfCurrent: true });
        return;
      }
    }
    // the cover's play overlay is a hover affordance; touch screens (phone) have no hover, so a tap on the cover opens the item
    if (!isPhone() && (el = t.closest('.lib-row__play'))) { e.stopPropagation(); toggleContextUri(el.closest('.lib-row').getAttribute('data-context-uri')); return; }
    if ((el = t.closest('.lib-row__more'))) { openContextMenu(sidebarRowMenuItems(ent(el.getAttribute('data-kind'), el.getAttribute('data-id'))), { anchor: el }); return; }
    if ((el = t.closest('.card__close'))) {
      e.stopPropagation();
      const card = el.closest('.card');
      Library.removeRecentSearch({ type: card.getAttribute('data-search-type'), id: card.getAttribute('data-search-id') });
      return;
    }
    if (t.closest('.search-clear-recent')) { Library.clearRecentSearches(); return; }
    // a link inside a card or the top result (a song's artist name) goes to its own target, not the container's
    if ((el = t.closest('a[data-route]')) && el.closest('.card, .top-result')) {
      e.preventDefault(); e.stopPropagation();
      navigate({ view: el.getAttribute('data-route'), id: el.getAttribute('data-id') || undefined });
      return;
    }
    if ((el = t.closest('.card, .quick-tile, .browse-card, .top-result, .lib-row'))) {
      e.preventDefault();
      noteSearchHit(el);
      if (el.classList.contains('top-result') && !el.hasAttribute('data-route')) { playFromRow(el, { toggleIfCurrent: true }); return; }
      const route = el.getAttribute('data-route');
      if (route) navigate({ view: route, id: el.getAttribute('data-id') || undefined });
      return;
    }
    if ((el = t.closest('.track-row__play, .song-row__play'))) { e.stopPropagation(); playFromRow(el.closest('[data-track-id]'), { toggleIfCurrent: true }); return; }
    if ((el = t.closest('.track-row__like, .song-row__like, .rp__like'))) { e.stopPropagation(); likeToggle(el.closest('[data-track-id]').getAttribute('data-track-id')); return; }
    if ((el = t.closest('.track-row__more, .song-row__more'))) { e.stopPropagation(); openRowMenu(el.closest('[data-track-id]'), { anchor: el }); return; }
    if (isPhone() && (el = t.closest('.track-row, .song-row')) && !t.closest('.track-row__more, .song-row__more')) { e.preventDefault(); playFromRow(el); return; }
    if ((el = t.closest('[data-route]'))) {
      e.preventDefault(); e.stopPropagation();
      navigate({ view: el.getAttribute('data-route'), id: el.getAttribute('data-id') || undefined });
      return;
    }
    if ((el = t.closest('.track-row, .song-row'))) {
      if (isPhone()) playFromRow(el);
      else selectRow(el);
      return;
    }
    if (t.closest('.actions__shuffle')) { pcall('toggleShuffle'); syncModeButtons(); return; }
    if (t.closest('.actions__save')) { saveToggle(pageEntity()); return; }
    if ((el = t.closest('.actions__follow, .rp__follow'))) {
      const id = el.getAttribute('data-id') || (pageEntity() || {}).id;
      if (id) saveToggle(ent('artist', id));
      return;
    }
    if (t.closest('.actions__download')) { toast("Downloads aren't available in this demo"); return; }
    if ((el = t.closest('.actions__more'))) { openContextMenu(entityMenuItems(pageEntity()), { anchor: el }); return; }
    if (t.closest('.actions__filter-btn')) { openInlineFilter(); return; }
    if ((el = t.closest('.view-toggle'))) {
      openContextMenu([
        { type: 'header', label: 'View as' },
        { label: 'Compact', icon: 'i-list', checked: state.viewMode === 'compact', onClick: () => setViewMode('compact') },
        { label: 'List', icon: 'i-list', checked: state.viewMode === 'list', onClick: () => setViewMode('list') },
      ], { anchor: el });
      return;
    }
    if (t.closest('.hero--editable .hero__cover, .hero--editable .hero__title, .hero--editable .hero__desc')) { if (state.route) openEditDetails(state.route.id); return; }
    if ((el = t.closest('[data-home-chip]'))) {
      const v = el.getAttribute('data-home-chip');
      if (v === 'podcasts') { toast("Podcasts aren't available in this demo"); return; }
      state.homeChip = v;
      els.main.querySelectorAll('[data-home-chip]').forEach((c) => c.setAttribute('aria-pressed', String(c.getAttribute('data-home-chip') === v)));
      return;
    }
    if ((el = t.closest('[data-search-chip]'))) { state.searchTab = el.getAttribute('data-search-chip'); render(state.route); return; }
    if ((el = t.closest('[data-disco-chip]'))) { state.discoTab = el.getAttribute('data-disco-chip'); const top = els.main.scrollTop; render(state.route, { full: true }); els.main.scrollTop = top; return; }
    if ((el = t.closest('[data-popular-toggle]'))) {
      e.preventDefault();
      const id = el.getAttribute('data-popular-toggle');
      state.popularExpanded[id] = !state.popularExpanded[id];
      const top = els.main.scrollTop; render(state.route, { full: true }); els.main.scrollTop = top;
      return;
    }
    if ((el = t.closest('.finder-row__add'))) {
      const row = el.closest('.finder-row');
      const box = row.closest('[data-playlist-id]');
      const p = box && Library.playlist(box.getAttribute('data-playlist-id'));
      if (!p) return;
      if (!box.classList.contains('playlist-finder--recommended')) state.finderOpen[p.id] = true;
      if (Library.addToPlaylist(p.id, row.getAttribute('data-track-id'))) toast('Added to ' + p.name);
      return;
    }
    if (t.closest('.finder-search__clear')) { state.finderQuery = ''; const i = els.main.querySelector('.finder-search input'); if (i) { i.value = ''; i.focus(); } refreshFinder(); return; }
    if ((el = t.closest('.finder-refresh'))) {
      const box = el.closest('[data-playlist-id]');
      const id = box.getAttribute('data-playlist-id');
      state.recommendSeed[id] = (state.recommendSeed[id] || 0) + 1;
      refreshRecommended();
      return;
    }
    if ((el = t.closest('.finder-more'))) {
      e.preventDefault();
      const box = el.closest('[data-playlist-id]');
      state.finderOpen[box.getAttribute('data-playlist-id')] = true;
      const top = els.main.scrollTop; render(state.route, { full: true }); els.main.scrollTop = top;
      const i = els.main.querySelector('.finder-search input');
      if (i) { i.focus(); i.scrollIntoView({ block: 'center' }); }
      return;
    }
    if (t.closest('.queue-clear')) { pcall('clearQueue'); return; }
    // the tablet rail is CSS only, so the collapse toggle (a desktop preference) only acts at desktop widths
    if ((el = t.closest('.lib-title'))) { if (el.closest('#sidebar') && isDesktop()) setSidebarCollapsed(!state.sidebarCollapsed); return; }
    if ((el = t.closest('.lib-add'))) { openContextMenu([{ label: 'Create a new playlist', icon: 'i-plus', onClick: createPlaylistAndGo }], { anchor: el }); return; }
    if (t.closest('.lib-chip-clear')) { setLibFilter(null); return; }
    if ((el = t.closest('[data-lib-chip]'))) { const v = el.getAttribute('data-lib-chip'); setLibFilter(v === state.sb.filter ? null : v); return; }
    if ((el = t.closest('.lib-filter__btn'))) { toggleLibFilterInput(el.closest('.lib-filter')); return; }
    if ((el = t.closest('.lib-sort'))) { openSortMenu(el); return; }
    if (t.closest('.search-pill__clear, .search-field__clear')) { clearSearch(); focusSearch(); return; }
    if (t.closest('.search-pill__browse')) { navigate({ view: 'search', query: '' }); return; }
    if ((el = t.closest('.avatar-btn'))) {
      openContextMenu(['Account', 'Settings', 'Log out'].map((label) => ({ label: label, onClick: () => toast('Not available in this demo') })), { anchor: el });
      return;
    }
    if (t.closest('.rp__close')) { setRightPanel(null); return; }
  }
  function onPanelDblClick(e) {
    if (isPhone()) return;
    const t = e.target;
    if (!t || !t.closest || t.closest('a, button')) return;
    const row = t.closest('.track-row, .song-row');
    if (row) { e.preventDefault(); playFromRow(row); }
  }
  function onPanelContextMenu(e) {
    const t = e.target;
    if (!t || !t.closest) return;
    let el;
    if ((el = t.closest('.track-row, .song-row'))) { e.preventDefault(); openRowMenu(el, { x: e.clientX, y: e.clientY }); return; }
    if ((el = t.closest('.lib-row'))) { e.preventDefault(); openContextMenu(sidebarRowMenuItems(ent(el.getAttribute('data-kind'), el.getAttribute('data-id'))), { x: e.clientX, y: e.clientY }); return; }
    if ((el = t.closest('.card, .quick-tile, .top-result'))) {
      e.preventDefault();
      if (el.hasAttribute('data-track-id')) openContextMenu(trackMenuItems(el.getAttribute('data-track-id')), { x: e.clientX, y: e.clientY });
      else openContextMenu(entityMenuItems(entFromUri(el.getAttribute('data-context-uri'))), { x: e.clientX, y: e.clientY });
      return;
    }
    if (t.closest('.hero__cover')) { e.preventDefault(); openContextMenu(entityMenuItems(pageEntity()), { x: e.clientX, y: e.clientY }); }
  }
  function onPanelKeydown(e) {
    const t = e.target;
    if (!t || !t.closest) return;
    if (e.key === 'Escape') {
      if (t.closest('.inline-filter')) { e.preventDefault(); closeInlineFilter(); return; }
      if (t.closest('.finder-search')) { e.preventDefault(); state.finderQuery = ''; t.value = ''; refreshFinder(); return; }
      if (t.closest('.lib-filter__input')) { e.preventDefault(); toggleLibFilterInput(t.closest('.lib-filter')); return; }
      return;
    }
    if (e.key === 'Enter' || (e.key === ' ' && !isEditable(t))) {
      // Enter plays a focused row; Space falls through to player.js, which owns play/pause (SPEC §9)
      if (t.classList.contains('track-row') || t.classList.contains('song-row')) { if (e.key === 'Enter') { e.preventDefault(); playFromRow(t); } return; }
      if (t.classList.contains('card') || t.classList.contains('top-result') || t.classList.contains('hero__cover') || t.classList.contains('hero__title') || t.classList.contains('hero__desc')) { e.preventDefault(); t.click(); return; }
      if (e.key === 'Enter' && t.classList.contains('search-pill__input')) { e.preventDefault(); searchTyped(t.value); return; }
      if (e.key === 'Enter' && t.closest('.search-field')) { e.preventDefault(); searchTyped(t.value); return; }
    }
  }
  function onPanelInput(e) {
    const t = e.target;
    if (!t || !t.closest) return;
    if (t.closest('.inline-filter')) { applyInlineFilter(t); return; }
    if (t.closest('.finder-search')) { state.finderQuery = t.value; finderTyped(); return; }
    if (t.classList.contains('search-pill__input')) { const c = els.topbar.querySelector('.search-pill__clear'); if (c) c.hidden = !t.value; searchTyped(t.value); return; }
    if (t.closest('.search-field')) { const c = els.main.querySelector('.search-field__clear'); if (c) c.hidden = !t.value; searchTyped(t.value); return; }
    if (t.closest('.lib-filter__input')) { applyLibFilter(t.closest('#sidebar') || els.main, t.value); }
  }
  function onMainOver(e) {
    const tile = e.target.closest && e.target.closest('.quick-tile');
    if (tile) els.main.style.setProperty('--home-tint', tile.getAttribute('data-color') || '');
  }
  function onMainOut(e) {
    const grid = e.target.closest && e.target.closest('.quick-grid');
    if (grid && !(e.relatedTarget && grid.contains(e.relatedTarget))) els.main.style.removeProperty('--home-tint');
  }

  // ---------------------------------------------------------------------------
  // Keyboard shortcuts owned by app.js (SPEC §9)
  // ---------------------------------------------------------------------------
  function bareKeyAllowed() {
    const a = D.activeElement;
    if (!a || a === D.body || a === els.main) return true;
    const tag = a.tagName;
    return !(tag === 'BUTTON' || tag === 'A' || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || a.getAttribute('role') === 'menuitem');
  }
  function onKeydown(e) {
    if (e.defaultPrevented || e.isComposing || e.metaKey) return;
    const t = e.target;
    const dialogOpen = isDialogOpen();
    if (e.key === 'Escape') {
      if (menu.open) { closeContextMenu(); e.preventDefault(); return; }
      if (dialogOpen) { closeDialog(); e.preventDefault(); return; }
      if (t && t.closest && (t.classList.contains('search-pill__input') || t.closest('.search-field'))) {
        e.preventDefault();
        clearSearch();
        t.blur();
        return;
      }
      return;
    }
    if (dialogOpen || menu.open || isEditable(t)) return;
    if (e.altKey) {
      // macOS reports Option+Shift+Q as e.key 'Œ', so match the physical key too
      if (e.shiftKey && !e.ctrlKey && (e.code === 'KeyQ' || e.key === 'Q' || e.key === 'q')) { e.preventDefault(); toggleQueuePanel(); return; }
      if (!e.shiftKey && !e.ctrlKey && e.key === 'ArrowLeft') { e.preventDefault(); back(); return; }
      if (!e.shiftKey && !e.ctrlKey && e.key === 'ArrowRight') { e.preventDefault(); forward(); return; }
      return;
    }
    if (e.ctrlKey && !e.shiftKey && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); focusSearch(); return; }
    if (e.ctrlKey) return;
    if (e.key === '/') { e.preventDefault(); focusSearch(); return; }
    if (!e.shiftKey && (e.key === 'q' || e.key === 'Q') && bareKeyAllowed()) { e.preventDefault(); toggleQueuePanel(); }
  }
  // The right panel only exists at desktop widths (styles.css hides it below 1024px), so the queue opens as a page there.
  function toggleQueuePanel() {
    if (!isDesktop()) { navigate({ view: 'queue' }); return; }
    setRightPanel('queue');
  }

  // ---------------------------------------------------------------------------
  // Resizers (desktop)
  // ---------------------------------------------------------------------------
  function initResizers() {
    const setup = (el, side) => {
      if (!el) return;
      let dragging = false;
      on(el, 'pointerdown', (e) => { if (e.button !== 0) return; dragging = true; el.classList.add('is-dragging'); try { el.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } e.preventDefault(); });
      on(el, 'pointermove', (e) => {
        if (!dragging) return;
        if (side === 'left') {
          const r = els.sidebar.getBoundingClientRect();
          const w = e.clientX - r.left;
          if (w < 200) { if (!state.sidebarCollapsed) setSidebarCollapsed(true); }
          else { if (state.sidebarCollapsed) setSidebarCollapsed(false); els.app.style.setProperty('--sidebar-w', Math.round(clamp(w, 280, 420)) + 'px'); }
        } else {
          const r = els.right.getBoundingClientRect();
          els.app.style.setProperty('--right-w', Math.round(clamp(r.right - e.clientX, 280, 420)) + 'px');
        }
      });
      const end = (e) => {
        if (!dragging) return;
        dragging = false;
        el.classList.remove('is-dragging');
        try { el.releasePointerCapture(e.pointerId); } catch (x) { /* ignore */ }
        const v = parseInt(els.app.style.getPropertyValue(side === 'left' ? '--sidebar-w' : '--right-w'), 10);
        if (v) Library.setPref(side === 'left' ? 'sidebarWidth' : 'rightWidth', v);
      };
      on(el, 'pointerup', end);
      on(el, 'pointercancel', end);
    };
    setup(els.resL, 'left');
    setup(els.resR, 'right');
  }

  // ---------------------------------------------------------------------------
  // Subscriptions and init
  // ---------------------------------------------------------------------------
  function subscribePlayer() {
    const p = player();
    if (!p || typeof p.on !== 'function') return;
    p.on('trackchange', () => { applyAllHighlights(); refreshQueueViews(); });
    p.on('statechange', () => { applyAllHighlights(); });
    p.on('contextchange', () => { applyAllHighlights(); refreshQueueViews(); });
    p.on('queuechange', () => { refreshQueueViews(); });
    // shuffle / repeat change what upcoming() returns, so the queue lists follow them too
    p.on('modechange', () => { syncModeButtons(); refreshQueueViews(); });
  }
  function onLibraryChange(ev) {
    if (!state.initialised || !ev) return;
    if (ev.type === 'pref') return;
    if (ev.type === 'recent') { renderSidebar(); if (state.route && state.route.view === 'home') refreshHomeShelves(); return; }
    if (ev.type === 'recentSearch') { if (state.route && state.route.view === 'search' && !(state.route.query || '').trim()) render(state.route); return; }
    rerender();
  }
  function init() {
    if (state.initialised) return;
    els.app = D.getElementById('app');
    els.topbar = D.getElementById('topbar');
    els.sidebar = D.getElementById('sidebar');
    els.main = D.getElementById('main');
    els.right = D.getElementById('right-panel');
    els.bottomNav = D.getElementById('bottom-nav');
    els.menu = D.getElementById('context-menu');
    els.dialogRoot = D.getElementById('dialog-root');
    els.toastRoot = D.getElementById('toast-root');
    els.resL = D.getElementById('resizer-left');
    els.resR = D.getElementById('resizer-right');
    if (!els.app || !els.main || !els.sidebar || !els.topbar || !els.right || !els.menu || !els.dialogRoot || !els.toastRoot || !els.bottomNav) return;
    // 1. storage
    Library.load();
    // 2. prefs + data attributes
    const prefs = Library.prefs();
    state.rightMode = prefs.rightPanel === 'now-playing' || prefs.rightPanel === 'queue' ? prefs.rightPanel : null;
    state.sidebarCollapsed = !!prefs.sidebarCollapsed;
    state.sb.filter = ['playlists', 'artists', 'albums'].indexOf(prefs.sidebarFilter) >= 0 ? prefs.sidebarFilter : null;
    state.sb.sort = SORT_LABELS[prefs.sidebarSort] ? prefs.sidebarSort : 'recents';
    if (prefs.sidebarWidth) els.app.style.setProperty('--sidebar-w', Math.round(clamp(Number(prefs.sidebarWidth) || 300, 280, 420)) + 'px');
    if (prefs.rightWidth) els.app.style.setProperty('--right-w', Math.round(clamp(Number(prefs.rightWidth) || 300, 280, 420)) + 'px');
    els.app.setAttribute('data-view', 'home');
    els.app.setAttribute('data-right', state.rightMode || 'none');
    els.app.setAttribute('data-sidebar', state.sidebarCollapsed ? 'rail' : 'full');
    els.right.hidden = !state.rightMode;
    // 3. subscriptions + keyboard
    subscribePlayer();
    Library.on('change', onLibraryChange);
    on(D, 'keydown', onKeydown);
    // 4. player UI
    const p = player();
    if (p && typeof p.init === 'function') { try { p.init(); } catch (e) { setTimeout(() => { throw e; }); } }
    // 5. shell + first route
    state.initialised = true;
    renderTopbar();
    renderBottomNav();
    [els.main, els.sidebar, els.right, els.topbar, els.bottomNav].forEach((root) => {
      on(root, 'click', onPanelClick);
      on(root, 'dblclick', onPanelDblClick);
      on(root, 'contextmenu', onPanelContextMenu);
      on(root, 'keydown', onPanelKeydown);
      on(root, 'input', onPanelInput);
    });
    on(els.main, 'mouseover', onMainOver);
    on(els.main, 'mouseout', onMainOut);
    on(els.main, 'scroll', onMainScroll, { passive: true });
    // shelf rows hold as many cards as there are columns, which follows the width of #main (panels, resizers)
    if (typeof W.ResizeObserver === 'function') { try { new W.ResizeObserver(scheduleShelfClamp).observe(els.main); } catch (e) { /* ignore */ } }
    on(W, 'resize', scheduleShelfClamp);
    // lazily drawn covers: re-check what has come into view
    on(D, 'scroll', scheduleCoverPump, { capture: true, passive: true });
    on(D, 'visibilitychange', () => { if (lazyCovers.timer === -1) lazyCovers.timer = 0; scheduleCoverPump(); });
    on(els.menu, 'click', onMenuClick);
    on(els.menu, 'mouseover', onMenuOver);
    on(els.menu, 'input', onMenuInput);
    on(D.body, 'click', (e) => { if (menu.sub && menu.sub.contains(e.target)) onMenuClick(e); });
    on(D.body, 'mouseover', (e) => { if (menu.sub && menu.sub.contains(e.target)) { const item = e.target.closest('.menu-item'); if (item) setMenuFocus(menu.sub, item); } });
    on(D.body, 'input', (e) => { if (menu.sub && menu.sub.contains(e.target)) onMenuInput(e); });
    on(D, 'mouseover', onTipEnter);
    on(D, 'mouseout', onTipLeave);
    // keyboard focus only: focus moved back by script after a mouse interaction (menu close, dialog close) shows no tooltip
    const focusVisible = (el) => { try { return el.matches(':focus-visible'); } catch (x) { return true; } };
    on(D, 'focusin', (e) => { const b = iconOnlyButton(e.target); if (b && e.target === b && focusVisible(b)) { hideTooltip(); tip.anchor = b; tip.timer = setTimeout(() => { if (tip.anchor === b) showTooltip(b); }, 300); } });
    on(D, 'focusout', () => hideTooltip());
    on(D, 'pointerdown', () => hideTooltip(), true);
    // the media-query change event drives breakpoint re-renders; resize is a fallback for engines that
    // report the change late. onBreakpointChange() only acts when the phone/wider state really flipped.
    on(W, 'resize', () => { hideTooltip(); onBreakpointChange(); });
    if (typeof phoneMQ.addEventListener === 'function') phoneMQ.addEventListener('change', onBreakpointChange);
    else if (typeof phoneMQ.addListener === 'function') phoneMQ.addListener(onBreakpointChange);
    if (typeof desktopMQ.addEventListener === 'function') desktopMQ.addEventListener('change', syncLibTitleLabel);
    else if (typeof desktopMQ.addListener === 'function') desktopMQ.addListener(syncLibTitleLabel);
    state.wasPhone = isPhone();
    initResizers();
    renderSidebar();
    renderRightPanel();
    navigate({ view: 'home' }, { replace: true });
  }
  function onBreakpointChange() {
    const phone = isPhone();
    if (!state.route || phone === state.wasPhone) return;
    state.wasPhone = phone;
    if (state.route.view === 'library' && !isPhone()) navigate({ view: 'home' }, { replace: true });
    else rerender();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------
  const App = {
    init: init,
    navigate: navigate,
    back: back,
    forward: forward,
    currentRoute: () => (state.route ? Object.assign({}, state.route) : null),
    toast: toast,
    openContextMenu: openContextMenu,
    closeContextMenu: closeContextMenu,
    openDialog: openDialog,
    closeDialog: closeDialog,
    setRightPanel: setRightPanel,
    rightPanelMode: rightPanelMode,
    rerender: rerender,
    trackMenuItems: trackMenuItems,
    entityMenuItems: entityMenuItems,
    on: function (event, fn) { if (typeof fn === 'function') (appListeners[event] = appListeners[event] || []).push(fn); return this; },
    off: function (event, fn) { const l = appListeners[event]; if (l) { const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); } return this; },
  };

  W.Library = Library;
  W.App = App;
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', () => App.init());
  else App.init();
})();
