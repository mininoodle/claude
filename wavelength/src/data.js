/* data.js — window.Catalog
 * The fictional Wavelength catalogue: genres, artists, albums, tracks and editorial playlists,
 * deterministic Canvas cover art, search and the shared formatters.
 * Loads in the browser (window.Catalog) and in Node (globalThis.Catalog / module.exports).
 * Everything is seeded, so the catalogue is identical on every load.
 */
(function () {
  'use strict';

  const S = 300;                 // cover size in px
  const TAU = Math.PI * 2;
  const TODAY = '2026-10-10';    // the catalogue's "now" (playlist dates are relative to it)

  // ---------------------------------------------------------------------------
  // Seeded randomness
  // ---------------------------------------------------------------------------
  function hashString(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  // mulberry32
  function seededRandom(seed) {
    let a = typeof seed === 'string' ? hashString(seed) : (Number(seed) >>> 0);
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
  const rint = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  function shuffle(r, arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // ---------------------------------------------------------------------------
  // Colour helpers
  // ---------------------------------------------------------------------------
  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbToHex(r, g, b) {
    const c = (v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
    return '#' + c(r) + c(g) + c(b);
  }
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return [h, s, l];
  }
  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s = clamp(s, 0, 1); l = clamp(l, 0, 1);
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
    return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
  }
  const hexToHsl = (hex) => rgbToHsl.apply(null, hexToRgb(hex));
  const hslHex = (h, s, l) => rgbToHex.apply(null, hslToRgb(h, s, l));
  function rgba(hex, a) {
    const [r, g, b] = hexToRgb(hex);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }

  // A palette derived from one dominant colour; every cover is built from it.
  function palette(hex) {
    const [h, s, l] = hexToHsl(hex);
    return {
      base: hex,
      dark: hslHex(h, s * 0.9, l * 0.33),
      deep: hslHex(h, Math.min(1, s * 1.05), l * 0.62),
      light: hslHex(h, Math.min(1, s * 1.02), l + (1 - l) * 0.34),
      pale: hslHex(h, s * 0.7, l + (1 - l) * 0.72),
      warm: hslHex(h + 38, Math.min(1, s * 1.12), Math.min(0.64, l + 0.14)),
      cool: hslHex(h - 38, Math.min(1, s * 1.08), Math.max(0.3, l - 0.06)),
      comp: hslHex(h + 180, Math.max(0.45, s * 0.85), 0.56),
      cream: '#f5eee1',
      ink: '#121212',
      h: h, s: s, l: l,
    };
  }

  // ---------------------------------------------------------------------------
  // Dates and text
  // ---------------------------------------------------------------------------
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function parseIso(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    if (!m) return null;
    return { y: +m[1], m: +m[2], d: +m[3] };
  }
  function isoOf(y, m, d) {
    return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }
  function isoAddDays(iso, days) {
    const p = parseIso(iso);
    const t = Date.UTC(p.y, p.m - 1, p.d) + days * 86400000;
    const dt = new Date(t);
    return isoOf(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }
  function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }

  function norm(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  }
  const wordsOf = (s) => norm(s).replace(/[^a-z0-9]+/g, ' ').trim();
  const slug = (s) => norm(s).replace(/[^a-z0-9]+/g, '');

  // ---------------------------------------------------------------------------
  // Genres
  // ---------------------------------------------------------------------------
  const GENRE_DEFS = [
    ['pop', 'Pop', '#e13300', 'Big hooks and bigger feelings: the songs everyone is singing this week.'],
    ['hiphop', 'Hip-Hop', '#ba5d07', 'Bars, beats and the stories behind them, from the block to the charts.'],
    ['rock', 'Rock', '#e91429', 'Loud guitars, louder choruses and songs built for the front row.'],
    ['indie', 'Indie', '#f037a5', 'Bedroom recordings, small venues and the anthems that grew out of them.'],
    ['electronic', 'Electronic', '#0d73ec', 'From peak-time club tracks to late-night drift, all of it synthesised.'],
    ['lofi', 'Lo-Fi', '#8d67ab', 'Dusty drums and warm chords for reading, studying and rainy afternoons.'],
    ['jazz', 'Jazz', '#1e3264', 'Swing, ballads and brass, from basement clubs to rooftop sessions.'],
    ['classical', 'Classical', '#777777', 'Strings, keys and quiet rooms: chamber music old and new.'],
    ['ambient', 'Ambient', '#27856a', 'Slow, spacious music that fills a room without asking for attention.'],
    ['rnb', 'R&B', '#dc148c', 'Velvet vocals and slow grooves for the hours after midnight.'],
    ['folk', 'Folk', '#148a08', 'Wooden instruments, close harmonies and songs about home.'],
    ['latin', 'Latin', '#d84000', 'Cumbia, reggaeton and bolero: rhythms that move like the tide.'],
    ['funk', 'Funk', '#e8115b', 'Tight horns, fat bass and grooves that refuse to sit still.'],
    ['metal', 'Metal', '#503750', 'Heavy riffs, double kicks and melodies forged in the long dark.'],
  ];
  const genres = GENRE_DEFS.map(([key, name, color, description]) => ({
    id: 'ge_' + key, name: name, color: color, description: description, styleKey: key,
  }));
  genres.push({ id: 'ge_newreleases', name: 'New Releases', color: '#8c1932', description: 'The newest albums, EPs and singles on Wavelength.', styleKey: null });
  genres.push({ id: 'ge_charts', name: 'Charts', color: '#006450', description: 'The most played tracks and artists right now.', styleKey: null });

  // ---------------------------------------------------------------------------
  // Artists and their releases (hand-written)
  // ---------------------------------------------------------------------------
  const ARTIST_DEFS = [
    {
      id: 'ar_marlowvane', name: 'Marlow Vane', genres: ['indie', 'pop'], listeners: 8420000, followers: 2140000, verified: true, color: '#a5522b', label: 'Lantern Records',
      bio: 'Marlow Vane writes bruised, hook-laden pop songs from a converted boathouse on the Severn estuary. His third record traded bedroom synths for a live band and a string quartet, and it is the sound of someone finally letting other people into the room.',
      releases: [
        { title: 'Boathouse', type: 'album', year: 2025, n: 11, g: 0 },
        { title: 'Every Harbour', type: 'album', year: 2021, n: 10, g: 1 },
      ],
    },
    {
      id: 'ar_hollowlights', name: 'The Hollow Lights', genres: ['indie', 'rock'], listeners: 3150000, followers: 980000, verified: true, color: '#2f4f7a', label: 'Northwall',
      bio: 'Four school friends from Leeds who learned their instruments in the same rehearsal cellar they still use. Their songs are built for last trains and small venues: fuzzed guitars, sibling harmonies and choruses you can shout before you know the words.',
      releases: [
        { title: 'Last Train Home', type: 'album', year: 2024, n: 11, g: 1 },
        { title: 'Cellar Tapes', type: 'ep', year: 2019, n: 5, g: 0 },
      ],
    },
    {
      id: 'ar_niasolace', name: 'Nia Solace', genres: ['rnb', 'pop'], listeners: 14800000, followers: 5300000, verified: true, color: '#7a2e5a', label: 'Velvet Hour',
      bio: 'Nia Solace sings like she is telling you a secret. Raised between Cardiff and Lagos, she makes late-night R&B about long-distance love, group chats and the quiet after a party ends.',
      releases: [
        { title: 'After the Party', type: 'album', year: 2025, n: 12, g: 0 },
        { title: 'Group Chat', type: 'ep', year: 2022, n: 5, g: 0 },
        { title: 'Low Light', type: 'single', year: 2026, n: 1, g: 1 },
      ],
    },
    {
      id: 'ar_kestrelfinch', name: 'Kestrel & Finch', genres: ['folk', 'indie'], listeners: 1240000, followers: 410000, verified: true, color: '#4f6b3a', label: 'Saltmarsh Records',
      bio: 'A duo of fiddle and nylon-string guitar who met busking on the Royal Mile in Edinburgh. They record live in rented chapels, and the room is always the third member of the band.',
      releases: [
        { title: 'Chapel Sessions', type: 'album', year: 2023, n: 10, g: 0 },
        { title: 'Hedgerow', type: 'album', year: 2018, n: 9, g: 0 },
      ],
    },
    {
      id: 'ar_djorrery', name: 'DJ Orrery', genres: ['electronic'], listeners: 6730000, followers: 1620000, verified: true, color: '#1f3f8f', label: 'Orbit Line',
      bio: 'DJ Orrery builds club music out of orbit: long, patient builds, planetary basslines and melodies that rotate instead of resolve. His residencies in Berlin and Lisbon are known for sets that start at dawn.',
      releases: [
        { title: 'Orbital Mechanics', type: 'album', year: 2026, n: 10, g: 0 },
        { title: 'Perihelion', type: 'ep', year: 2020, n: 4, g: 0 },
      ],
    },
    {
      id: 'ar_ivymarchetti', name: 'Ivy Marchetti', genres: ['pop'], listeners: 31500000, followers: 12800000, verified: true, color: '#c23a5c', label: 'Copperfield',
      bio: 'Ivy Marchetti grew up singing in her parents’ pizzeria in Hoboken and wrote her first hit on the walk home from a shift. Her pop is bright, direct and a little bit dramatic, and she would not have it any other way.',
      releases: [
        { title: 'Front Row', type: 'album', year: 2025, n: 11, g: 0 },
        { title: 'Hoboken Nights', type: 'album', year: 2022, n: 10, g: 0 },
        { title: 'Loud Heart', type: 'single', year: 2026, n: 2, g: 0 },
      ],
    },
    {
      id: 'ar_saintlumen', name: 'Saint Lumen', genres: ['ambient', 'electronic'], listeners: 9900000, followers: 1450000, verified: true, color: '#2e6b6e', label: 'Half Moon Recordings',
      bio: 'Saint Lumen makes slow music for fast lives: tape loops, hymnal synths and field recordings from motorway bridges. The project began as sleep aids for a friend and quietly became one of the most streamed ambient catalogues around.',
      releases: [
        { title: 'Slow Hours', type: 'album', year: 2024, n: 9, g: 0 },
        { title: 'Motorway Hymns', type: 'album', year: 2020, n: 8, g: 1 },
      ],
    },
    {
      id: 'ar_orielquartet', name: 'Oriel Quartet', genres: ['classical'], listeners: 860000, followers: 240000, verified: false, color: '#5a4a3a', label: 'Meridian Classics',
      bio: 'Formed at the Royal Northern College of Music, the Oriel Quartet pairs the string repertoire with commissions from living composers. Their recordings favour close microphones and the sound of bows catching the rosin.',
      releases: [
        { title: 'Rosin', type: 'album', year: 2025, n: 10, g: 0 },
        { title: 'Winter Commissions', type: 'album', year: 2019, n: 8, g: 0 },
      ],
    },
    {
      id: 'ar_tomasreyes', name: 'Tomas Reyes', genres: ['latin', 'pop'], listeners: 22100000, followers: 7900000, verified: true, color: '#d1672b', label: 'Casa Marea',
      bio: 'Tomas Reyes grew up on the beaches of Cartagena and writes songs that move like the tide. Cumbia, reggaeton and bolero all pass through his band, usually in the same song.',
      releases: [
        { title: 'Marea Alta', type: 'album', year: 2026, n: 11, g: 0 },
        { title: 'Cartagena', type: 'ep', year: 2021, n: 5, g: 0 },
      ],
    },
    {
      id: 'ar_lunenoire', name: 'Lune Noire', genres: ['lofi', 'ambient'], listeners: 11400000, followers: 2300000, verified: true, color: '#4a3c78', label: 'Night Bus Tapes',
      bio: 'Lune Noire is a Montreal producer who records at night, after the radiator stops knocking. Dusty drums, Rhodes chords and rain against the window: music to read, study and drift to.',
      releases: [
        { title: 'Radiator Songs', type: 'album', year: 2024, n: 12, g: 0 },
        { title: 'Night Window', type: 'album', year: 2022, n: 11, g: 0 },
      ],
    },
    {
      id: 'ar_harborstreet', name: 'Harbor Street', genres: ['jazz'], listeners: 1980000, followers: 520000, verified: true, color: '#8a5a1e', label: 'Bluebird Hall',
      bio: 'Harbor Street is a six-piece from the Bay Area whose brass section grew up playing second line and whose rhythm section grew up on hip-hop. The result is jazz that swings hard and never stops smiling.',
      releases: [
        { title: 'Second Line Swing', type: 'album', year: 2023, n: 10, g: 0 },
        { title: 'Bay Lights', type: 'album', year: 2017, n: 9, g: 0 },
      ],
    },
    {
      id: 'ar_vesperray', name: 'Vesper Ray', genres: ['rnb', 'hiphop'], listeners: 18600000, followers: 6100000, verified: true, color: '#6b2a8f', label: 'Ninth Floor Records',
      bio: 'Vesper Ray raps like she is thinking out loud and sings like she has decided. Her mixtapes from Atlanta sketched a world of night shifts and neon; the albums filled it in.',
      releases: [
        { title: 'Night Shift', type: 'album', year: 2025, n: 12, g: 0 },
        { title: 'Neon Diaries', type: 'album', year: 2021, n: 11, g: 1 },
      ],
    },
    {
      id: 'ar_cassridley', name: 'Cass Ridley', genres: ['rock', 'metal'], listeners: 4420000, followers: 1310000, verified: true, color: '#8f2a2a', label: 'Ironwood',
      bio: 'Cass Ridley plays guitar the way other people slam doors. Raised on her uncle’s record collection in Glasgow, she turned a love of seventies riffs into songs about rent, rage and getting home safe.',
      releases: [
        { title: 'Rent Day', type: 'album', year: 2024, n: 10, g: 0 },
        { title: 'Door Slam', type: 'ep', year: 2020, n: 5, g: 1 },
      ],
    },
    {
      id: 'ar_amaraoyelaran', name: 'Amara Oyelaran', genres: ['funk', 'rnb'], listeners: 2760000, followers: 870000, verified: true, color: '#c2407a', label: 'Paper Kite',
      bio: 'Amara Oyelaran leads a nine-piece band from Peckham who treat every show like a block party. Horn stabs, clavinet and a voice that can go from a whisper to a riot in one bar.',
      releases: [
        { title: 'Block Party', type: 'album', year: 2026, n: 11, g: 0 },
        { title: 'Peckham Nine', type: 'album', year: 2019, n: 10, g: 0 },
      ],
    },
    {
      id: 'ar_ghostparade', name: 'Ghost Parade', genres: ['metal', 'rock'], listeners: 3880000, followers: 1540000, verified: true, color: '#3a3f4f', label: 'Grey Harbour',
      bio: 'Ghost Parade are a five-piece from Gothenburg who write melodic metal about the sea, the cold and the long Scandinavian dark. Their live show involves two drummers and a surprising amount of candlelight.',
      releases: [
        { title: 'Long Dark', type: 'album', year: 2025, n: 9, g: 0 },
        { title: 'Candlelight', type: 'album', year: 2021, n: 9, g: 0 },
      ],
    },
    {
      id: 'ar_deltavale', name: 'Delta Vale', genres: ['hiphop'], listeners: 9150000, followers: 3400000, verified: true, color: '#7a4a1f', label: 'Tidewater Music',
      bio: 'Delta Vale came up in the Memphis battle scene and never lost the taste for a punchline. His records are warm, soulful and unhurried, with samples dug from his grandmother’s gospel collection.',
      releases: [
        { title: 'Gospel Crates', type: 'album', year: 2024, n: 12, g: 0 },
        { title: 'Punchline', type: 'ep', year: 2022, n: 6, g: 0 },
      ],
    },
    {
      id: 'ar_juniperhale', name: 'Juniper Hale', genres: ['folk', 'pop'], listeners: 5600000, followers: 1720000, verified: true, color: '#6b8a3a', label: 'Palisade',
      bio: 'Juniper Hale writes small songs about big things: a kitchen table, a missed call, the way a town looks when you have decided to leave it. Her voice has been compared to a porch light.',
      releases: [
        { title: 'Porch Light', type: 'album', year: 2026, n: 10, g: 0 },
        { title: 'Kitchen Table', type: 'album', year: 2020, n: 9, g: 1 },
      ],
    },
    {
      id: 'ar_rookmendoza', name: 'Rook Mendoza', genres: ['funk', 'hiphop'], listeners: 1520000, followers: 460000, verified: false, color: '#2a7a6b', label: 'Self-released',
      bio: 'Rook Mendoza is a bassist, producer and reluctant frontman from East LA whose grooves have anchored a decade of other people’s records. On his own albums the bass finally gets to sing.',
      releases: [
        { title: 'Bass Lines', type: 'album', year: 2023, n: 10, g: 0 },
        { title: 'East Side Groove', type: 'ep', year: 2015, n: 5, g: 1 },
      ],
    },
  ];

  // Saturated album-art colours, dealt to albums from one seeded shuffle (never the same twice in the catalogue).
  const ALBUM_COLORS = [
    '#c0392b', '#e74c3c', '#d35400', '#e67e22', '#f39c12', '#b7950b', '#1e8449', '#27ae60', '#16a085', '#1abc9c',
    '#2e86c1', '#2874a6', '#1b4f72', '#5b2c6f', '#8e44ad', '#9b59b6', '#6c3483', '#a93226', '#784212', '#9c640c',
    '#145a32', '#0e6655', '#154360', '#4a235a', '#b03a2e', '#ca6f1e', '#d4ac0d', '#239b56', '#117a65', '#2471a3',
    '#7b241c', '#6e2c00', '#1d8348', '#0b5345', '#21618c', '#512e5f', '#d98880', '#bb8fce', '#5dade2', '#f0b27a',
  ];

  // ---------------------------------------------------------------------------
  // Track title generator: curated per-genre word lists
  // ---------------------------------------------------------------------------
  const SHARED = {
    adj: ['Glass', 'Paper', 'Silver', 'Hollow', 'Golden', 'Quiet', 'Midnight', 'Static', 'Violet', 'Northern', 'Crooked', 'Lonely', 'Honest', 'Slow', 'Wild', 'Borrowed', 'Faded', 'Electric', 'Tender', 'Little', 'Second', 'Open'],
    noun: ['Houses', 'Tram', 'Bloom', 'Rooftop', 'Harbour', 'Signal', 'Window', 'Mirror', 'Ocean', 'Satellite', 'Fever', 'Smoke', 'Salt', 'Honey', 'Tide', 'Shadow', 'Lantern', 'Echo', 'Marble', 'Velvet', 'Comet', 'Wire', 'Garden', 'Letter', 'Engine', 'Compass', 'Season', 'Weather', 'Postcard', 'Rivers', 'Lighthouse', 'Ferry', 'Sunday', 'Ghost'],
  };
  const GENRE_WORDS = {
    pop: {
      adj: ['Golden', 'Electric', 'Neon', 'Sweet', 'Loud', 'Brighter', 'Wild', 'Honest', 'Forever', 'Perfect', 'Summer', 'Midnight', 'Teenage', 'Reckless'],
      noun: ['Heart', 'Lights', 'Dancefloor', 'Weekend', 'Kiss', 'Crush', 'Confetti', 'Radio', 'Sunglasses', 'Fireworks', 'Taxi', 'Hotel', 'Polaroid', 'Afterglow', 'Lipstick', 'Jukebox', 'Runway', 'Swimming Pool'],
    },
    hiphop: {
      adj: ['Real', 'Cold', 'Heavy', 'Late', 'Loud', 'Gold', 'Downtown', 'Hungry', 'Southern', 'Backseat', 'Brand New', 'Grown'],
      noun: ['Crown', 'Corner', 'Receipts', 'Verdict', 'Block', 'Hustle', 'Dinner', 'Trophies', 'Sirens', 'Chrome', 'Lobby', 'Pressure', 'Rent', 'Ledger', 'Sermon', 'Flex', 'Landlord', 'Penthouse', 'Payday', 'Cousins'],
    },
    rock: {
      adj: ['Broken', 'Loud', 'Hollow', 'Burning', 'Restless', 'Wasted', 'Iron', 'Northern', 'Stolen', 'Bitter', 'Dead End', 'Feral'],
      noun: ['Engine', 'Highway', 'Static', 'Wreck', 'Thunder', 'Basement', 'Fuse', 'Vandals', 'Teeth', 'Amplifier', 'Motorbike', 'Riot', 'Anthem', 'Scars', 'Overpass', 'Kerosene', 'Dynamite', 'Gasoline', 'Sirens'],
    },
    indie: {
      adj: ['Pale', 'Quiet', 'Minor', 'Paper', 'Borrowed', 'Faded', 'Suburban', 'Analogue', 'Second-hand', 'Sunlit', 'Wintry', 'Half'],
      noun: ['Houses', 'Tram', 'Bloom', 'Postcard', 'Bedroom', 'Bicycle', 'Cassette', 'Allotment', 'Lido', 'Clementine', 'Librarian', 'Pavement', 'Orchard', 'Seaside', 'Terrace', 'Attic', 'Greenhouse', 'Rowboat', 'Balcony'],
    },
    electronic: {
      adj: ['Binary', 'Neon', 'Infinite', 'Modular', 'Chrome', 'Liquid', 'Kinetic', 'Hyper', 'Lunar', 'Parallel', 'Velocity', 'Ultraviolet'],
      noun: ['Orbit', 'Pulse', 'Circuit', 'Voltage', 'Satellite', 'Strobe', 'Frequency', 'Horizon', 'Vector', 'Nebula', 'Afterhours', 'Terminal', 'Flux', 'Prism', 'Reactor', 'Loop', 'Gravity', 'Telemetry', 'Aurora', 'Machines'],
    },
    lofi: {
      adj: ['Dusty', 'Sleepy', 'Warm', 'Soft', 'Rainy', 'Late', 'Faded', 'Slow', 'Hazy', 'Quiet', 'Drowsy', 'Cosy'],
      noun: ['Radiator', 'Window', 'Teacup', 'Raincoat', 'Bookshelf', 'Cassette', 'Lamplight', 'Coffee', 'Pillow', 'Sunday', 'Tape Hiss', 'Street Lamp', 'Study', 'Drizzle', 'Porch', 'Blanket', 'Snow Day', 'Doorway', 'Kettle'],
    },
    jazz: {
      adj: ['Blue', 'Smoky', 'Midnight', 'Uptown', 'Velvet', 'Minor', 'Late', 'Easy', 'Crooked', 'Sunday', 'Downtown', 'Lazy'],
      noun: ['Swing', 'Ballad', 'Cellar', 'Trumpet', 'Corner', 'Stroll', 'Waltz', 'Hat', 'Moon', 'Cocktail', 'Streetcar', 'Second Line', 'Rooftop', 'Brass', 'Sidewalk', 'Lullaby', 'Shuffle', 'Fog', 'Bridge', 'Rain'],
    },
    classical: {
      adj: ['Winter', 'Evening', 'Northern', 'Pale', 'Slow', 'Last', 'First', 'Quiet', 'Morning', 'Autumn'],
      noun: ['Nocturne', 'Prelude', 'Elegy', 'Pavane', 'Sarabande', 'Lament', 'Fantasia', 'Canticle', 'Aubade', 'Berceuse', 'Intermezzo', 'Rhapsody', 'Cadenza', 'Study', 'Chorale', 'Arabesque', 'Romance', 'Serenade'],
    },
    ambient: {
      adj: ['Slow', 'Vast', 'Hollow', 'Distant', 'Glacial', 'Still', 'Soft', 'Endless', 'Grey', 'Lower', 'Submerged', 'Pale'],
      noun: ['Hours', 'Tide', 'Fog', 'Altitude', 'Drift', 'Horizon', 'Weather', 'Breath', 'Lighthouse', 'Shoreline', 'Field', 'Snowfall', 'Cloudbank', 'Meridian', 'Estuary', 'Dawn', 'Stillness', 'Glacier', 'Tundra', 'Hymn'],
    },
    rnb: {
      adj: ['Velvet', 'Slow', 'Honest', 'Late', 'Sweet', 'Tender', 'Low', 'Golden', 'Patient', 'Private', 'Blue', 'Soft'],
      noun: ['Light', 'Touch', 'Secret', 'Lace', 'Satin', 'Bathwater', 'Candle', 'Message', 'Honey', 'Balcony', 'Silk', 'Voicemail', 'Skyline', 'Bedroom', 'Perfume', 'Taxi', 'Sunrise', 'Heartbeat', 'Favour', 'Weekend'],
    },
    folk: {
      adj: ['Wooden', 'Hollow', 'Northern', 'Little', 'Green', 'Quiet', 'Old', 'Wild', 'Early', 'Low', 'Borrowed', 'Crooked'],
      noun: ['River', 'Hedgerow', 'Lantern', 'Chapel', 'Kitchen', 'Orchard', 'Harvest', 'Sparrow', 'Fiddle', 'Meadow', 'Porch', 'Ferry', 'Mill', 'Valley', 'Thistle', 'Wren', 'Firewood', 'Quilt', 'Brother', 'Heather'],
    },
    latin: {
      adj: ['Golden', 'Slow', 'Wild', 'Sweet', 'Late', 'Summer', 'Electric', 'Midnight'],
      noun: ['Marea', 'Luna', 'Fuego', 'Playa', 'Calle', 'Sol', 'Noche', 'Corazón', 'Ritmo', 'Sal', 'Brisa', 'Verano', 'Caribe', 'Camino', 'Cumbia', 'Bahía', 'Mango', 'Azul', 'Sirena', 'Café'],
      en: ['Tide', 'Harbour', 'Heatwave', 'Dancefloor', 'Beach House', 'Sunburn', 'Salt', 'Kiss', 'Rooftop', 'Fever'],
    },
    funk: {
      adj: ['Fresh', 'Hot', 'Big', 'Sweet', 'Electric', 'Loose', 'Tight', 'Greasy', 'Sunday', 'Downtown', 'Uptown', 'Late'],
      noun: ['Groove', 'Strut', 'Clavinet', 'Horns', 'Block Party', 'Bassline', 'Boogie', 'Sidewalk', 'Shuffle', 'Jam', 'Pocket', 'Rhythm', 'Feet', 'Payday', 'Platform', 'Stomp', 'Soul Food', 'Wah', 'Bounce', 'Sunglasses'],
    },
    metal: {
      adj: ['Black', 'Iron', 'Frozen', 'Hollow', 'Burning', 'Endless', 'Ashen', 'Northern', 'Fallen', 'Silent', 'Crimson', 'Last'],
      noun: ['Tide', 'Pyre', 'Gallows', 'Winter', 'Wolves', 'Thrones', 'Ember', 'Frost', 'Abyss', 'Harbinger', 'Sermon', 'Requiem', 'Crown', 'Storm', 'Fjord', 'Bones', 'Sentinel', 'Cathedral', 'Ruin', 'Dusk'],
    },
  };
  GENRE_WORDS.latin_en = { adj: GENRE_WORDS.latin.adj, noun: GENRE_WORDS.latin.en };
  // "<place>, <time>" titles ("Rooftop, 3am") only read naturally with a place and a clock time or day
  const TIME_PLACES = ['Rooftop', 'Coffee', 'Tram', 'Kitchen', 'Taxi', 'Ferry', 'Balcony', 'Porch', 'Highway', 'Corner', 'Lobby', 'Streetcar', 'Platform', 'Diner', 'Motel', 'Laundromat', 'Car Park', 'Night Bus'];
  const TIMES = ['3am', '4am', 'Midnight', 'Tonight', 'Sunday', '1999'];
  const TAGS = {
    default: ['Reprise', 'Interlude', 'Demo', 'Acoustic', 'Live'],
    electronic: ['Remix', 'Edit', 'Dub', 'Reprise', 'Interlude'],
    ambient: ['Reprise', 'Interlude', 'Edit'],
    lofi: ['Interlude', 'Edit', 'Reprise', 'Loop'],
    hiphop: ['Remix', 'Interlude', 'Freestyle', 'Live'],
    metal: ['Reprise', 'Interlude', 'Live'],
  };
  const VERBS = ['Chasing', 'Leaving', 'Calling', 'Burning', 'Losing', 'Keeping', 'Holding', 'Waiting for', 'Dreaming of', 'Running from', 'Under', 'After', 'Beyond', 'Inside'];
  const OF_HEADS = ['Weight', 'House', 'Colour', 'Shape', 'Kingdom', 'Heart', 'Edge', 'City', 'Sound', 'Queen', 'Church', 'Taste', 'Map', 'Year', 'Bones', 'Flowers', 'Daughters', 'King', 'Ghost', 'Garden', 'Season', 'Fear', 'Theory', 'Language'];
  const OF_TAILS = ['Glass', 'Smoke', 'Salt', 'Honey', 'Water', 'Gold', 'Light', 'Rain', 'Winter', 'Summer', 'Snow', 'Fire', 'Dust', 'Stone', 'Silver', 'Thunder', 'Static', 'Velvet', 'Neon', 'Chrome', 'Nothing', 'Mirrors', 'Lightning', 'Wolves'];
  const IN_THE = ['Dark', 'Rain', 'Morning', 'Harbour', 'Headlights', 'Afterglow', 'Static', 'Shallows', 'Attic', 'Basement', 'Garden', 'Kitchen', 'Snow', 'Water', 'Wires', 'Lobby', 'Heat', 'Echo', 'Window', 'Long Grass', 'Cold', 'Rearview'];
  const KEYS = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'E flat', 'B flat', 'F sharp'];

  function wordPool(styleKey, kind) {
    const own = (GENRE_WORDS[styleKey] || {})[kind] || [];
    return own.concat(SHARED[kind] || []);
  }
  function pickWord(r, styleKey, kind) {
    const own = (GENRE_WORDS[styleKey] || {})[kind] || [];
    const shared = SHARED[kind] || [];
    if (own.length && (r() < 0.72 || !shared.length)) return pick(r, own);
    return pick(r, shared.length ? shared : own);
  }
  function singleNoun(r, styleKey) {
    let n = pickWord(r, styleKey, 'noun'), tries = 0;
    while (n.indexOf(' ') >= 0 && tries++ < 6) n = pickWord(r, styleKey, 'noun');
    return n;
  }
  function makeTitle(r, styleKey) {
    let x = r();
    if (styleKey === 'classical') {
      if (x < 0.3) return pickWord(r, 'classical', 'adj') + ' ' + pick(r, GENRE_WORDS.classical.noun);
      if (x < 0.6) return pick(r, GENRE_WORDS.classical.noun) + ' in ' + pick(r, KEYS) + (r() < 0.5 ? ' minor' : ' major');
      if (x < 0.75) return pick(r, GENRE_WORDS.classical.noun) + ' for Strings';
      if (x < 0.88) return pick(r, GENRE_WORDS.classical.noun) + ' No. ' + rint(r, 1, 9);
      return pick(r, GENRE_WORDS.classical.noun);
    }
    if (styleKey === 'latin') {
      if (x < 0.5) {
        const y = r();
        const n = GENRE_WORDS.latin.noun;
        const a = pick(r, n);
        let b = pick(r, n);
        if (b === a) b = pick(r, n);
        if (y < 0.35) return a;
        if (y < 0.65) return a + ' de ' + b;
        if (y < 0.85) return a + ' y ' + b;
        return a + ' (' + pick(r, ['Remix', 'Versión Acústica', 'En Vivo']) + ')';
      }
      styleKey = 'latin_en';
      x = r();
    }
    // (bare noun pairs such as "Terrace Marble" or "Raincoat & Kettle" read as random words, so none are generated)
    const tags = TAGS[styleKey] || TAGS.default;
    if (x < 0.36) return pickWord(r, styleKey, 'adj') + ' ' + pickWord(r, styleKey, 'noun');
    if (x < 0.56) return pickWord(r, styleKey, 'noun');
    if (x < 0.62) return pick(r, TIME_PLACES) + ', ' + pick(r, TIMES);
    if (x < 0.71) return pick(r, VERBS) + ' the ' + singleNoun(r, styleKey);
    if (x < 0.79) return pick(r, OF_HEADS) + ' of ' + (r() < 0.6 ? pick(r, OF_TAILS) : singleNoun(r, styleKey));
    if (x < 0.85) return pickWord(r, styleKey, 'adj') + ' ' + singleNoun(r, styleKey) + ' (' + pick(r, tags) + ')';
    if (x < 0.93) return 'The ' + pickWord(r, styleKey, 'noun');
    return singleNoun(r, styleKey) + ' in the ' + pick(r, IN_THE);
  }
  // Words that may repeat inside one album (articles, prepositions, keys, version tags).
  const TITLE_STOP = new Set(['the', 'of', 'in', 'for', 'an', 'and', 'to', 'on', 'at', 'no', 'minor', 'major', 'flat', 'sharp',
    'de', 'y', 'la', 'el', 'pt', 'ii', 'remix', 'edit', 'dub', 'reprise', 'interlude', 'demo', 'acoustic', 'live', 'loop',
    'freestyle', 'version', 'acustica', 'en', 'vivo', 'from', 'under', 'after', 'beyond', 'inside']);
  function titleWords(title) {
    return wordsOf(title).split(' ').filter((w) => w.length > 1 && !/^\d/.test(w) && !TITLE_STOP.has(w));
  }

  // ---------------------------------------------------------------------------
  // Build artists, albums and tracks
  // ---------------------------------------------------------------------------
  const DURATION = {
    pop: [150, 232], hiphop: [140, 240], rock: [170, 270], indie: [160, 250], electronic: [190, 280], lofi: [130, 200],
    jazz: [200, 280], classical: [180, 280], ambient: [210, 280], rnb: [160, 250], folk: [160, 250], latin: [160, 232],
    funk: [170, 260], metal: [200, 280],
  };
  const EXPLICIT_P = { hiphop: 0.42, rnb: 0.2, rock: 0.14, metal: 0.14, indie: 0.1, pop: 0.1, funk: 0.08, electronic: 0.06, latin: 0.08, lofi: 0.02 };

  const artists = [];
  const albums = [];
  const tracks = [];
  const usedTitles = new Set();

  ARTIST_DEFS.forEach((def) => {
    artists.push({
      id: def.id, name: def.name, genreIds: def.genres.map((g) => 'ge_' + g), bio: def.bio,
      monthlyListeners: def.listeners, followers: def.followers, verified: def.verified,
      imageSeed: hashString('image:' + def.id), color: def.color,
    });
  });

  // Album colours are dealt from one seeded shuffle of the palette (40 colours for ~38 albums), so no two albums
  // share a colour. Cover styles come from a balanced sequence (each of the 6 styles once per block of 6, in a
  // seeded order), and an artist's consecutive releases never repeat a style, so similar covers stay apart.
  const ALBUM_COLOR_ORDER = shuffle(seededRandom('album-colors'), ALBUM_COLORS);
  const ALBUM_STYLE_COUNT = 6;   // = ALBUM_STYLES.length (the drawing functions are defined further down)
  const styleRandom = seededRandom('album-styles');
  const ALBUM_STYLE_ORDER = [];
  for (let k = 0; k < 10; k++) {
    const block = [];
    for (let s = 0; s < ALBUM_STYLE_COUNT; s++) block.push(s);
    Array.prototype.push.apply(ALBUM_STYLE_ORDER, shuffle(styleRandom, block));
  }
  let albumCount = 0;

  ARTIST_DEFS.forEach((def) => {
    let prevStyle = -1;
    def.releases.forEach((rel) => {
      const id = 'al_' + slug(rel.title);
      const r = seededRandom('album:' + id);
      const styleKey = def.genres[Math.min(rel.g || 0, def.genres.length - 1)];
      const color = ALBUM_COLOR_ORDER[albumCount % ALBUM_COLOR_ORDER.length];
      let si = albumCount % ALBUM_STYLE_ORDER.length;
      if (ALBUM_STYLE_ORDER[si] === prevStyle) {
        const sj = (si + 1) % ALBUM_STYLE_ORDER.length;
        const tmp = ALBUM_STYLE_ORDER[si]; ALBUM_STYLE_ORDER[si] = ALBUM_STYLE_ORDER[sj]; ALBUM_STYLE_ORDER[sj] = tmp;
      }
      const coverStyle = ALBUM_STYLE_ORDER[si];
      prevStyle = coverStyle;
      albumCount++;
      let month = rint(r, 1, 12);
      if (rel.year === 2026) month = rint(r, 1, 9);
      const day = rint(r, 1, daysInMonth(rel.year, month));
      const album = {
        id: id, title: rel.title, artistId: def.id, year: rel.year, releaseDate: isoOf(rel.year, month, day),
        type: rel.type, trackIds: [], coverSeed: hashString('cover:' + id), color: color,
        label: def.label === 'Self-released' ? def.name : def.label,
        coverStyle: coverStyle,   // extra: index into ALBUM_STYLES (see drawAlbum)
      };
      albums.push(album);

      const albumTitles = new Set();
      const albumWords = new Set();   // content words already used by a track title on this album
      const age = 2026 - rel.year;
      const ageF = 0.45 + Math.min(age, 5) * 0.16;
      for (let n = 1; n <= rel.n; n++) {
        const tid = 'tr_' + slug(rel.title) + '_' + String(n).padStart(2, '0');
        const tr = seededRandom('track:' + tid);
        // genre: mostly the album's, sometimes the artist's other genre
        let gKey = styleKey;
        if (def.genres.length > 1 && tr() < 0.18) gKey = def.genres.find((g) => g !== styleKey) || styleKey;
        let title = rel.type === 'single' && n === 1 ? rel.title : makeTitle(tr, gKey);
        // never the same title twice on an album, and no word repeated across an album's titles
        // ("River", "Wild River", "River in the Dark"); prefer titles unused anywhere in the catalogue
        const sharesWord = (tt) => titleWords(tt).some((w) => albumWords.has(w));
        let tries = 0;
        while (tries < 80 && (albumTitles.has(title) || (tries < 60 && sharesWord(title)) || (tries < 12 && usedTitles.has(title)))) {
          title = makeTitle(tr, gKey); tries++;
        }
        if (albumTitles.has(title)) title += ' (Reprise)';
        albumTitles.add(title); usedTitles.add(title);
        titleWords(title).forEach((w) => albumWords.add(w));
        const range = DURATION[gKey] || [150, 250];
        const durationMs = rint(tr, range[0], range[1] - 1) * 1000 + rint(tr, 0, 999);
        const skew = Math.pow(tr(), 2.2);
        let plays = def.listeners * (0.08 + skew * 9) * ageF * (rel.type === 'single' ? 1.6 : 1);
        if (n === 1) plays *= 1.8; else if (n === 2) plays *= 1.3;
        plays = clamp(Math.round(plays), 10000, 900000000);
        const lp = (Math.log10(plays) - 4) / 4.954;
        const recency = age <= 1 ? 10 : age <= 3 ? 4 : 0;
        const popularity = clamp(Math.round(8 + lp * 78 + recency + (tr() * 14 - 7)), 1, 100);
        const explicit = tr() < (EXPLICIT_P[gKey] || 0);
        const featuringIds = [];
        if (tr() < 0.06) {
          const others = ARTIST_DEFS.filter((o) => o.id !== def.id && o.genres.some((g) => def.genres.indexOf(g) >= 0));
          if (others.length) featuringIds.push(pick(tr, others).id);
        }
        const track = {
          id: tid, title: title, albumId: id, artistId: def.id, featuringIds: featuringIds, durationMs: durationMs,
          explicit: explicit, plays: plays, popularity: popularity, genreId: 'ge_' + gKey, trackNumber: n,
          audioSeed: hashString('audio:' + tid), styleKey: gKey,
        };
        tracks.push(track);
        album.trackIds.push(tid);
      }
    });
  });

  // This year's releases come out in the weeks before TODAY (one a week, in a seeded order), so "New Releases"
  // really is new.
  shuffle(seededRandom('release-weeks'), albums.filter((al) => al.year === 2026)).forEach((al, k) => {
    al.releaseDate = isoAddDays(TODAY, -Math.min(3 + 7 * k, 270));   // stays inside 2026
  });

  // ---------------------------------------------------------------------------
  // Indexes
  // ---------------------------------------------------------------------------
  const byId = Object.create(null);
  function index(list) { list.forEach((e) => { byId[e.id] = e; }); }
  index(genres); index(artists); index(albums); index(tracks);

  const albumPlays = Object.create(null);
  tracks.forEach((t) => { albumPlays[t.albumId] = (albumPlays[t.albumId] || 0) + t.plays; });
  const byPopularity = (a, b) => (b.popularity - a.popularity) || (b.plays - a.plays) || a.id.localeCompare(b.id);
  const byPlays = (a, b) => (b.plays - a.plays) || a.id.localeCompare(b.id);
  const newestFirst = (a, b) => (a.releaseDate < b.releaseDate ? 1 : a.releaseDate > b.releaseDate ? -1 : a.id.localeCompare(b.id));

  // ---------------------------------------------------------------------------
  // Playlists
  // ---------------------------------------------------------------------------
  // startCounts (optional): songs per artist already picked elsewhere, counted against maxPerArtist
  function weightedPick(r, pool, count, weightFn, maxPerArtist, startCounts) {
    const items = pool.slice();
    const weights = items.map(weightFn);
    const out = [];
    const perArtist = Object.assign(Object.create(null), startCounts || {});
    while (out.length < count && items.length) {
      let total = 0;
      for (let i = 0; i < weights.length; i++) total += weights[i];
      if (total <= 0) break;
      let x = r() * total, i = 0;
      while (i < items.length - 1 && x >= weights[i]) { x -= weights[i]; i++; }
      const t = items[i];
      items.splice(i, 1); weights.splice(i, 1);
      if (maxPerArtist && (perArtist[t.artistId] || 0) >= maxPerArtist) continue;
      perArtist[t.artistId] = (perArtist[t.artistId] || 0) + 1;
      out.push(t);
    }
    return out;
  }
  function datesFor(r, n, maxDaysAgo) {
    const out = [];
    for (let i = 0; i < n; i++) out.push(isoAddDays(TODAY, -rint(r, 0, maxDaysAgo)));
    return out;
  }
  // "A, B, C and more": the three artists with the most songs in the mix (ties: more monthly listeners);
  // "and more" only when the mix has more than three artists.
  function genreMixDescription(list) {
    const counts = Object.create(null);
    list.forEach((t) => { counts[t.artistId] = (counts[t.artistId] || 0) + 1; });
    const ids = Object.keys(counts).filter((id) => byId[id]);
    ids.sort((a, b) => (counts[b] - counts[a]) || (byId[b].monthlyListeners - byId[a].monthlyListeners) || a.localeCompare(b));
    const names = ids.slice(0, 3).map((id) => byId[id].name);
    if (ids.length > 3) return names.join(', ') + ' and more';
    if (names.length <= 1) return names.join('');
    return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
  }
  function moodPool(weights) {
    return tracks.filter((t) => weights[t.styleKey]);
  }
  const moodWeight = (weights) => (t) => (weights[t.styleKey] || 0) * (0.35 + t.popularity / 100);

  const playlists = [];
  function addPlaylist(p) {
    p.coverSeed = hashString('cover:' + p.id);
    p.owner = 'Wavelength';
    p.trackIds = p.tracks.map((t) => t.id);
    delete p.tracks;
    if (!p.addedAt) p.addedAt = datesFor(seededRandom('dates:' + p.id), p.trackIds.length, 95);
    playlists.push(p);
  }

  const MIXES = [
    { id: 'pl_dailymix1', name: 'Daily Mix 1', weights: { pop: 1, indie: 1 }, color: '#3f6fb6', genre: 'ge_pop', saves: 2400000 },
    { id: 'pl_dailymix2', name: 'Daily Mix 2', weights: { hiphop: 1, rnb: 1 }, color: '#b64d3f', genre: 'ge_hiphop', saves: 1900000 },
    { id: 'pl_dailymix3', name: 'Daily Mix 3', weights: { rock: 1, metal: 1 }, color: '#4a8a4a', genre: 'ge_rock', saves: 1300000 },
    { id: 'pl_dailymix4', name: 'Daily Mix 4', weights: { latin: 1, funk: 1 }, color: '#8a4ab0', genre: 'ge_latin', saves: 980000 },
  ];
  MIXES.forEach((m) => {
    const r = seededRandom('mix:' + m.id);
    const list = weightedPick(r, moodPool(m.weights), rint(r, 40, 50), moodWeight(m.weights), 9);
    addPlaylist({ id: m.id, name: m.name, description: genreMixDescription(list), kind: 'mix', tracks: list, color: m.color, genreId: m.genre, saves: m.saves });
  });

  (function freshFinds() {
    const r = seededRandom('pl_freshfinds');
    const pool = tracks.filter((t) => {
      const a = byId[t.artistId], al = byId[t.albumId];
      return a.monthlyListeners < 7000000 && al.year >= 2023;
    });
    const list = weightedPick(r, pool, 30, () => 1, 4);
    addPlaylist({
      id: 'pl_freshfinds', name: 'Fresh Finds', kind: 'editorial', tracks: list, color: '#2a9d8f', saves: 1650000,
      description: 'The freshest finds from tomorrow’s favourites. Updated every Wednesday.',
    });
  })();

  (function newReleasesList() {
    // releases of the last ~6 months (up to 4 songs each), topped up with the next newest until there are 20 songs
    const cutoff = isoAddDays(TODAY, -183);
    const list = [];
    albums.slice().sort(newestFirst).forEach((al) => {
      if (al.releaseDate < cutoff && list.length >= 20) return;
      al.trackIds.slice(0, 4).forEach((id) => { if (list.length < 50) list.push(byId[id]); });
    });
    const addedAt = list.map((t) => byId[t.albumId].releaseDate);
    addPlaylist({
      id: 'pl_newreleases', name: 'New Releases', kind: 'editorial', tracks: list, color: '#c0392b', saves: 3100000,
      description: 'The best new songs of the week, all in one place.', addedAt: addedAt,
    });
  })();

  // Mood playlists: `primary` genres fill at least `share` of the list (the per-artist cap is lifted there, since
  // some genres have a single artist), the other weighted genres fill the rest, and the two are interleaved with
  // the primary genre first, so each list sounds like its title. `clean` lists leave explicit songs out.
  const MOODS = [
    { id: 'pl_chillvibes', name: 'Chill Vibes', color: '#5b8fb9', genre: 'ge_lofi', saves: 12300000, n: 32, max: 6, primary: ['lofi'], share: 0.6, clean: true,
      weights: { lofi: 3, ambient: 1.4, rnb: 1, indie: 0.6 },
      description: 'Chill beats, lo-fi vibes, new tracks every week. Kick back and let the day go.' },
    { id: 'pl_deepfocus', name: 'Deep Focus', color: '#2e4a62', genre: 'ge_ambient', saves: 9800000, n: 36, max: 8, primary: ['ambient', 'classical'], share: 0.7, clean: true,
      weights: { ambient: 3, classical: 2.2, lofi: 1.2, electronic: 0.3 },
      description: 'Ambient, modern classical and slow electronics to help you think.' },
    { id: 'pl_latenightdrive', name: 'Late Night Drive', color: '#4a1d6a', genre: 'ge_electronic', saves: 6400000, n: 40, max: 8, primary: ['electronic', 'rnb'], share: 0.6,
      weights: { electronic: 2, rnb: 1.6, indie: 1, pop: 0.6, hiphop: 0.6 },
      description: 'Windows down, city lights on. Synths and slow jams for the long way home.' },
    { id: 'pl_morningcoffee', name: 'Morning Coffee', color: '#b8762b', genre: 'ge_folk', saves: 7200000, n: 40, max: 7, primary: ['folk'], share: 0.55, clean: true,
      weights: { folk: 3, jazz: 1.5, indie: 1, pop: 0.5, classical: 0.4 },
      description: 'Gentle folk, soft jazz and warm acoustic songs to start the day right.' },
    { id: 'pl_workoutpulse', name: 'Workout Pulse', color: '#d93a2b', genre: 'ge_hiphop', saves: 8900000, n: 45, max: 8, primary: ['electronic', 'hiphop'], share: 0.6,
      weights: { electronic: 2, hiphop: 2, metal: 1.2, funk: 1, pop: 1, latin: 0.8 },
      description: 'High-energy beats to push you through the last rep.' },
    { id: 'pl_rainydayjazz', name: 'Rainy Day Jazz', color: '#35506e', genre: 'ge_jazz', saves: 4100000, n: 28, max: 6, primary: ['jazz'], share: 0.65, clean: true,
      weights: { jazz: 3, lofi: 0.7, classical: 0.5 },
      description: 'Smoky horns, brushed drums and a window to watch the rain through.' },
    { id: 'pl_indiegold', name: 'Indie Gold', color: '#c9962b', genre: 'ge_indie', saves: 5600000, n: 40, max: 8, primary: ['indie'], share: 0.55,
      weights: { indie: 3, rock: 1.2, folk: 0.8, pop: 0.4 },
      description: 'The indie anthems you know every word to, plus a few you’ll learn.' },
    { id: 'pl_electronicessentials', name: 'Electronic Essentials', color: '#1f6fd1', genre: 'ge_electronic', saves: 7700000, n: 34, max: 6, primary: ['electronic'], share: 0.65,
      weights: { electronic: 3, ambient: 0.8, lofi: 0.5, pop: 0.3 },
      description: 'The tracks that define electronic music right now, from peak-time bangers to after-hours drift.' },
  ];
  function moodList(m) {
    const r = seededRandom('mood:' + m.id);
    const pool = moodPool(m.weights).filter((t) => !(m.clean && t.explicit));
    const isPrimary = (t) => m.primary.indexOf(t.styleKey) >= 0;
    const primaryPool = pool.filter(isPrimary);
    const nPrimary = Math.min(primaryPool.length, Math.round(m.n * m.share));
    const primaryArtists = new Set(primaryPool.map((t) => t.artistId)).size;
    const primaryCap = primaryArtists > 1 ? Math.max(m.max, Math.ceil(nPrimary * 0.6)) : 0;   // 0 = no cap
    const primary = weightedPick(r, primaryPool, nPrimary, moodWeight(m.weights), primaryCap);
    // the rest: other genres, with the per-artist cap counting the songs already picked
    const taken = new Set(primary.map((t) => t.id));
    const perArtist = Object.create(null);
    primary.forEach((t) => { perArtist[t.artistId] = (perArtist[t.artistId] || 0) + 1; });
    const restPool = pool.filter((t) => !taken.has(t.id) && !isPrimary(t));
    const rest = weightedPick(r, restPool, m.n - primary.length, moodWeight(m.weights), m.max, perArtist);
    // interleave, primary first: P P S P S P P S ...
    const ratio = primary.length / Math.max(1, primary.length + rest.length);
    const out = [];
    let a = 0, b = 0;
    while (a < primary.length || b < rest.length) {
      const takePrimary = b >= rest.length || (a < primary.length && Math.ceil((out.length + 1) * ratio) > a);
      out.push(takePrimary ? primary[a++] : rest[b++]);
    }
    return out;
  }
  MOODS.forEach((m) => {
    addPlaylist({ id: m.id, name: m.name, description: m.description, kind: 'editorial', tracks: moodList(m), color: m.color, genreId: m.genre, saves: m.saves });
  });

  (function top50() {
    const list = tracks.slice().sort(byPlays).slice(0, 50);
    addPlaylist({
      id: 'pl_top50global', name: 'Top 50 Global', kind: 'chart', tracks: list, color: '#1d3a5f', saves: 38500000,
      description: 'Your daily update of the most played tracks right now.', addedAt: list.map(() => isoAddDays(TODAY, -1)),
    });
  })();

  // fixed order: mixes, fresh finds, new releases, moods, chart
  const PLAYLIST_ORDER = ['pl_dailymix1', 'pl_dailymix2', 'pl_dailymix3', 'pl_dailymix4', 'pl_freshfinds', 'pl_newreleases',
    'pl_chillvibes', 'pl_deepfocus', 'pl_latenightdrive', 'pl_morningcoffee', 'pl_workoutpulse', 'pl_rainydayjazz', 'pl_indiegold',
    'pl_electronicessentials', 'pl_top50global'];
  playlists.sort((a, b) => PLAYLIST_ORDER.indexOf(a.id) - PLAYLIST_ORDER.indexOf(b.id));
  index(playlists);

  // genre share per playlist (for genreContent)
  const playlistGenreShare = Object.create(null);
  playlists.forEach((p) => {
    const counts = Object.create(null);
    p.trackIds.forEach((id) => { const g = byId[id].genreId; counts[g] = (counts[g] || 0) + 1; });
    Object.keys(counts).forEach((g) => { counts[g] /= p.trackIds.length; });
    playlistGenreShare[p.id] = counts;
  });

  // ---------------------------------------------------------------------------
  // Query API
  // ---------------------------------------------------------------------------
  const get = (id) => byId[id];
  const typed = (prefix) => (id) => { const e = byId[id]; return e && e.id.startsWith(prefix) ? e : undefined; };

  function tracksOf(albumId) {
    const al = byId[albumId];
    if (!al) return [];
    return al.trackIds.map((id) => byId[id]).sort((a, b) => a.trackNumber - b.trackNumber);
  }
  function albumsOf(artistId) {
    const own = albums.filter((a) => a.artistId === artistId).sort(newestFirst);
    return own.filter((a) => a.type === 'album').concat(own.filter((a) => a.type !== 'album'));
  }
  function discography(artistId) {
    const own = albums.filter((a) => a.artistId === artistId).sort(newestFirst);
    return { albums: own.filter((a) => a.type === 'album'), singles: own.filter((a) => a.type !== 'album') };
  }
  function topTracks(artistId, n) {
    if (n == null) n = 10;
    return tracks.filter((t) => t.artistId === artistId || t.featuringIds.indexOf(artistId) >= 0).sort(byPopularity).slice(0, n);
  }
  function relatedArtists(artistId, n) {
    if (n == null) n = 8;
    const me = byId[artistId];
    if (!me) return [];
    const shared = (a) => a.genreIds.filter((g) => me.genreIds.indexOf(g) >= 0).length;
    return artists.filter((a) => a.id !== artistId)
      .sort((a, b) => (shared(b) - shared(a)) || (b.monthlyListeners - a.monthlyListeners))
      .slice(0, n);
  }
  function popularAlbums(n) {
    const list = albums.slice().sort((a, b) => (albumPlays[b.id] - albumPlays[a.id]) || a.id.localeCompare(b.id));
    return n == null ? list : list.slice(0, n);
  }
  function popularArtists(n) {
    const list = artists.slice().sort((a, b) => (b.monthlyListeners - a.monthlyListeners) || a.id.localeCompare(b.id));
    return n == null ? list : list.slice(0, n);
  }
  function newReleases(n) {
    const list = albums.slice().sort(newestFirst);
    return n == null ? list : list.slice(0, n);
  }
  function uniqueArtistsOf(list) {
    const seen = Object.create(null), out = [];
    list.forEach((al) => { if (!seen[al.artistId]) { seen[al.artistId] = 1; out.push(byId[al.artistId]); } });
    return out;
  }
  function genreContent(genreId) {
    if (genreId === 'ge_newreleases') {
      const als = newReleases(12);
      const ids = Object.create(null);
      als.forEach((a) => { ids[a.id] = 1; });
      return {
        playlists: [byId.pl_newreleases, byId.pl_freshfinds],
        albums: als,
        tracks: tracks.filter((t) => ids[t.albumId]).sort(byPopularity).slice(0, 20),
        artists: uniqueArtistsOf(als),
      };
    }
    if (genreId === 'ge_charts') {
      return {
        playlists: [byId.pl_top50global],
        albums: popularAlbums(12),
        tracks: tracks.slice().sort(byPlays).slice(0, 20),
        artists: popularArtists(8),
      };
    }
    const g = byId[genreId];
    if (!g || !g.id.startsWith('ge_')) return { playlists: [], albums: [], tracks: [], artists: [] };
    const inGenre = tracks.filter((t) => t.genreId === genreId);
    const albumIds = Object.create(null);
    inGenre.forEach((t) => { albumIds[t.albumId] = 1; });
    const pls = playlists
      .map((p) => ({ p: p, share: (playlistGenreShare[p.id][genreId] || 0) + (p.genreId === genreId ? 1 : 0) }))
      .filter((x) => x.share >= 0.25)
      .sort((a, b) => (b.share - a.share) || (b.p.saves - a.p.saves))
      .map((x) => x.p);
    return {
      playlists: pls,
      albums: albums.filter((a) => albumIds[a.id]).sort((a, b) => (albumPlays[b.id] - albumPlays[a.id]) || a.id.localeCompare(b.id)),
      tracks: inGenre.sort(byPopularity).slice(0, 20),
      artists: artists.filter((a) => a.genreIds.indexOf(genreId) >= 0).sort((a, b) => b.monthlyListeners - a.monthlyListeners),
    };
  }

  // ---------------------------------------------------------------------------
  // Search
  // ---------------------------------------------------------------------------
  const searchIndex = { tracks: [], artists: [], albums: [], playlists: [] };
  function entry(item, primary, secondary) {
    return { item: item, name: norm(primary), words: wordsOf(primary), secondary: (secondary || []).map((s) => ({ name: norm(s), words: wordsOf(s) })) };
  }
  artists.forEach((a) => searchIndex.artists.push(entry(a, a.name)));
  albums.forEach((a) => searchIndex.albums.push(entry(a, a.title, [byId[a.artistId].name])));
  playlists.forEach((p) => searchIndex.playlists.push(entry(p, p.name)));
  tracks.forEach((t) => {
    const names = [byId[t.artistId].name, byId[t.albumId].title].concat(t.featuringIds.map((id) => byId[id].name));
    searchIndex.tracks.push(entry(t, t.title, names));
  });
  // The query tokens start consecutive words of `words` ("midn tra" finds "Midnight Tram").
  function tokensStartWords(words, tokens) {
    const ws = words.split(' ');
    for (let i = 0; i + tokens.length <= ws.length; i++) {
      let k = 0;
      while (k < tokens.length && ws[i + k].startsWith(tokens[k])) k++;
      if (k === tokens.length) return true;
    }
    return false;
  }
  function tierOf(e, q, qw) {
    if (e.name === q || e.words === qw) return 4;
    if (e.name.startsWith(q) || (qw && e.words.startsWith(qw))) return 3;
    if (qw && (' ' + e.words + ' ').indexOf(' ' + qw) >= 0) return 2;
    if (e.name.indexOf(q) >= 0) return 1;
    if (qw) {
      // one token: any substring; several tokens: each must start a word, so "r b" (from "r&b") no longer
      // matches across a word boundary as in "winte[r b]ones"
      if (qw.indexOf(' ') < 0) { if (e.words.indexOf(qw) >= 0) return 1; }
      else if (tokensStartWords(e.words, qw.split(' '))) return 1;
    }
    return 0;
  }
  function scoreOf(e, q, qw) {
    let best = tierOf(e, q, qw);
    for (let i = 0; i < e.secondary.length; i++) {
      const t = tierOf(e.secondary[i], q, qw);
      if (t > 0) best = Math.max(best, Math.max(1, t - 1));
    }
    return best;
  }
  const weightOf = {
    tracks: (t) => t.popularity * 1e7 + t.plays / 100,
    artists: (a) => a.monthlyListeners,
    albums: (a) => albumPlays[a.id],
    playlists: (p) => p.saves,
  };
  function search(query) {
    const q = norm(query), qw = wordsOf(query);
    const out = { tracks: [], artists: [], albums: [], playlists: [], top: null };
    if (!q) return out;
    let top = null;
    const priority = { artists: 4, tracks: 3, albums: 2, playlists: 1 };
    const typeName = { tracks: 'track', artists: 'artist', albums: 'album', playlists: 'playlist' };
    ['artists', 'tracks', 'albums', 'playlists'].forEach((type) => {
      const hits = [];
      searchIndex[type].forEach((e) => {
        const s = scoreOf(e, q, qw);
        if (s > 0) hits.push({ item: e.item, score: s, w: weightOf[type](e.item) });
      });
      hits.sort((a, b) => (b.score - a.score) || (b.w - a.w) || a.item.id.localeCompare(b.item.id));
      out[type] = hits.slice(0, 20).map((h) => h.item);
      if (hits.length) {
        const h = hits[0];
        if (!top || h.score > top.score || (h.score === top.score && priority[type] > priority[top.type])) {
          top = { type: type, score: h.score, item: h.item };
        }
      }
    });
    if (top) out.top = { type: typeName[top.type], item: top.item };
    return out;
  }

  // ---------------------------------------------------------------------------
  // Formatters
  // ---------------------------------------------------------------------------
  function formatDuration(ms) {
    const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
    const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
    const ss = String(s).padStart(2, '0');
    return h > 0 ? h + ':' + String(m).padStart(2, '0') + ':' + ss : m + ':' + ss;
  }
  function formatTotal(ms) {
    const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
    const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
    if (h > 0) return 'about ' + h + ' hr' + (m > 0 ? ' ' + m + ' min' : '');
    if (m > 0) return m + ' min ' + s + ' sec';
    return s + ' sec';
  }
  function formatPlays(n) {
    const v = Math.round(Number(n) || 0);
    return String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ',').replace(/^/, v < 0 ? '-' : '');
  }
  function formatCount(n) {
    const v = Math.round(Number(n) || 0);
    if (v >= 1e6) {
      const m = v / 1e6;
      return (m < 10 ? m.toFixed(1).replace(/\.0$/, '') : String(Math.round(m))) + 'M';
    }
    if (v >= 1e4) return Math.round(v / 1e3) + 'K';
    return formatPlays(v);
  }
  function formatDate(iso) {
    const p = parseIso(iso);
    if (!p) return '';
    return MONTHS[p.m - 1].slice(0, 3) + ' ' + p.d + ', ' + p.y;
  }
  function formatLongDate(iso) {
    const p = parseIso(iso);
    if (!p) return '';
    return MONTHS[p.m - 1] + ' ' + p.d + ', ' + p.y;
  }
  function relativeDate(iso, now) {
    const p = parseIso(iso);
    if (!p) return '';
    let n = parseIso(now);
    if (!n) {
      const d = new Date();
      n = { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() };
    }
    const days = Math.round((Date.UTC(n.y, n.m - 1, n.d) - Date.UTC(p.y, p.m - 1, p.d)) / 86400000);
    if (days < 0) return formatDate(iso);
    if (days === 0) return 'Today';
    if (days === 1) return '1 day ago';
    if (days < 7) return days + ' days ago';
    if (days <= 28) { const w = Math.floor(days / 7); return w + (w === 1 ? ' week ago' : ' weeks ago'); }
    return formatDate(iso);
  }
  function pluralize(n, word) {
    const v = Number(n) || 0;
    return formatPlays(v) + ' ' + word + (v === 1 ? '' : 's');
  }

  // ---------------------------------------------------------------------------
  // Cover art (Canvas, lazy, cached)
  // ---------------------------------------------------------------------------
  let canvas = null, ctx = null, grainPattern = null, ctxFailed = false;
  const coverCache = Object.create(null);
  const mosaicCache = Object.create(null);
  let mosaicCount = 0;
  const FONT = '"Figtree", "Helvetica Neue", Arial, sans-serif';
  const TITLE_FONT = 'bold 34px ' + FONT;
  const fontPending = new Set();   // cache keys drawn with text before Figtree was available

  function hasDom() {
    return typeof document !== 'undefined' && document && typeof document.createElement === 'function';
  }
  function getCtx() {
    if (ctx) return ctx;
    if (ctxFailed || !hasDom()) return null;
    try {
      canvas = document.createElement('canvas');
      canvas.width = S; canvas.height = S;
      ctx = canvas.getContext('2d');
      if (!ctx) ctxFailed = true;
    } catch (e) { ctxFailed = true; ctx = null; }
    return ctx;
  }
  // Film grain: one cached noise tile (built once, 96x96 random cells scaled to 2x2 px blocks) drawn as a
  // repeating pattern, so a cover costs a single fillRect. The 2px cells keep the exported PNGs small.
  function getGrain(c) {
    if (grainPattern) return grainPattern;
    try {
      const n = 96;
      const t = document.createElement('canvas');
      t.width = t.height = n;
      const tc = t.getContext('2d');
      const img = tc.createImageData(n, n);
      const d = img.data;
      const r = seededRandom(7777);
      for (let i = 0; i < d.length; i += 4) {
        const v = 96 + Math.floor(r() * 64);
        d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
      }
      tc.putImageData(img, 0, 0);
      const big = document.createElement('canvas');
      big.width = big.height = n * 2;
      const bc = big.getContext('2d');
      bc.imageSmoothingEnabled = false;
      bc.drawImage(t, 0, 0, n * 2, n * 2);
      grainPattern = c.createPattern(big, 'repeat');
    } catch (e) { grainPattern = null; }
    return grainPattern;
  }
  function grain(c, alpha) {
    const p = getGrain(c);
    if (!p) return;
    c.save();
    c.globalAlpha = alpha;
    c.globalCompositeOperation = 'overlay';
    c.fillStyle = p;
    c.fillRect(0, 0, S, S);
    c.restore();
  }
  // True once the Figtree face exists and is loaded. Covers with text drawn before that are cached anyway
  // (the fallback typeface is fine) and simply get redrawn on their next request after the font arrives.
  function fontReady() {
    try {
      if (!hasDom() || !document.fonts || typeof document.fonts.check !== 'function') return true;
      let has = false;
      document.fonts.forEach((f) => { if (/figtree/i.test(f.family)) has = true; });
      return has && document.fonts.check(TITLE_FONT);
    } catch (e) { return true; }
  }
  function watchFonts() {
    try {
      if (!hasDom() || !document.fonts) return;
      const flush = function () {
        if (!fontPending.size || !fontReady()) return;
        fontPending.forEach((key) => { delete coverCache[key]; });
        fontPending.clear();
      };
      if (document.fonts.ready && typeof document.fonts.ready.then === 'function') document.fonts.ready.then(flush, () => {});
      if (typeof document.fonts.addEventListener === 'function') document.fonts.addEventListener('loadingdone', flush);
    } catch (e) { /* no font events: covers keep the fallback typeface */ }
  }

  // --- album styles -------------------------------------------------------------
  function fillBg(c, style) { c.fillStyle = style; c.fillRect(0, 0, S, S); }
  function softCircle(c, x, y, rad, col, a0, a1) {
    const g = c.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, rgba(col, a0));
    g.addColorStop(0.55, rgba(col, a1));
    g.addColorStop(1, rgba(col, 0));
    c.fillStyle = g;
    c.beginPath(); c.arc(x, y, rad, 0, TAU); c.fill();
  }
  function linear(c, ang, a, b) {
    const dx = Math.cos(ang) * S / 2, dy = Math.sin(ang) * S / 2;
    const g = c.createLinearGradient(S / 2 - dx, S / 2 - dy, S / 2 + dx, S / 2 + dy);
    g.addColorStop(0, a); g.addColorStop(1, b);
    return g;
  }

  function styleDuotone(c, p, r) {
    const second = r() < 0.5 ? p.warm : p.cool;
    fillBg(c, linear(c, r() * TAU, p.dark, second));
    c.globalCompositeOperation = 'screen';
    const n = 2 + Math.floor(r() * 2);
    const cols = [p.light, p.pale, second, p.base];
    for (let i = 0; i < n; i++) {
      softCircle(c, S * (0.15 + r() * 0.7), S * (0.15 + r() * 0.7), S * (0.22 + r() * 0.3), cols[i % cols.length], 0.95, 0.4);
    }
    c.globalCompositeOperation = 'source-over';
    // one crisp element so the composition has a focal point
    const ex = S * (0.25 + r() * 0.5), ey = S * (0.25 + r() * 0.5), v = r();
    if (v < 0.4) {
      c.fillStyle = r() < 0.5 ? p.cream : p.ink;
      c.beginPath(); c.arc(ex, ey, S * (0.06 + r() * 0.08), 0, TAU); c.fill();
    } else if (v < 0.75) {
      c.strokeStyle = rgba(p.cream, 0.9); c.lineWidth = 6 + r() * 8;
      c.beginPath(); c.arc(ex, ey, S * (0.14 + r() * 0.14), 0, TAU); c.stroke();
    } else {
      c.fillStyle = rgba(p.cream, 0.9);
      c.fillRect(S * 0.12, ey, S * 0.76, 5);
    }
    grain(c, 0.14, true);
  }

  function styleBands(c, p, r) {
    fillBg(c, p.dark);
    const sets = [[p.base, p.light, p.cream, p.deep], [p.base, p.warm, p.dark, p.pale], [p.deep, p.comp, p.base, p.cream], [p.light, p.base, p.ink, p.warm]];
    const cols = sets[Math.floor(r() * sets.length)];
    const angle = (r() < 0.5 ? -1 : 1) * (0.3 + r() * 0.55);
    const n = 5 + Math.floor(r() * 5);
    const widths = [];
    let sum = 0;
    for (let i = 0; i < n; i++) { const w = 0.35 + r() * 1.6; widths.push(w); sum += w; }
    c.save();
    c.translate(S / 2, S / 2); c.rotate(angle); c.translate(-S / 2, -S / 2);
    let y = -S * 0.6;
    const total = S * 2.2;
    const shift = Math.floor(r() * cols.length);
    for (let i = 0; i < n; i++) {
      const w = total * widths[i] / sum;
      c.fillStyle = cols[(i + shift) % cols.length];
      c.fillRect(-S, y, S * 3, w + 1);
      y += w;
    }
    c.restore();
    if (r() < 0.5) {
      c.fillStyle = r() < 0.5 ? p.cream : p.ink;
      c.beginPath(); c.arc(S * (0.2 + r() * 0.6), S * (0.2 + r() * 0.6), S * 0.07, 0, TAU); c.fill();
    }
    grain(c, 0.08, true);
  }

  function styleRings(c, p, r) {
    fillBg(c, r() < 0.5 ? p.dark : p.deep);
    const pairs = [[p.light, p.dark], [p.cream, p.base], [p.warm, p.deep], [p.comp, p.dark], [p.pale, p.base]];
    const pair = pairs[Math.floor(r() * pairs.length)];
    const cx = S * (0.3 + r() * 0.4), cy = S * (0.3 + r() * 0.4);
    const n = 6 + Math.floor(r() * 6);
    const maxR = S * (0.55 + r() * 0.35);
    const curve = 0.7 + r() * 0.7;
    for (let i = n - 1; i >= 0; i--) {
      const rad = maxR * Math.pow((i + 1) / n, curve);
      c.fillStyle = i % 2 ? pair[0] : pair[1];
      c.beginPath(); c.arc(cx, cy, rad, 0, TAU); c.fill();
    }
    grain(c, 0.08, true);
  }

  function styleFields(c, p, r) {
    fillBg(c, linear(c, Math.PI / 2 + (r() - 0.5), p.deep, p.base));
    const cols = [p.light, p.warm, p.pale, p.comp, p.cool, p.light, p.warm];
    const n = 3 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const col = cols[Math.floor(r() * cols.length)];
      const x = r() * S, y = r() * S, rad = S * (0.3 + r() * 0.45);
      const g = c.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, rgba(col, 0.95)); g.addColorStop(0.5, rgba(col, 0.55)); g.addColorStop(1, rgba(col, 0));
      c.fillStyle = g; c.fillRect(0, 0, S, S);
    }
    if (r() < 0.65) {
      const h = S * (0.55 + r() * 0.25);
      c.fillStyle = rgba(p.dark, 0.72); c.fillRect(0, h, S, S - h);
      c.fillStyle = rgba(p.cream, 0.6); c.fillRect(0, h, S, 2);
    } else {
      c.fillStyle = rgba(p.ink, 0.85);
      c.beginPath(); c.arc(S * (0.25 + r() * 0.5), S * (0.3 + r() * 0.4), S * (0.08 + r() * 0.08), 0, TAU); c.fill();
    }
    grain(c, 0.22);
  }

  function styleGrid(c, p, r) {
    fillBg(c, p.dark);
    const n = 4 + Math.floor(r() * 4);
    const gap = S * 0.028, pad = S * 0.08;
    const cell = (S - 2 * pad - (n - 1) * gap) / n;
    const hi = Math.floor(r() * n * n);
    const shape = Math.floor(r() * 3);   // 0 squares, 1 rounded, 2 circles
    const hiCol = r() < 0.5 ? p.cream : p.comp;
    for (let i = 0; i < n * n; i++) {
      const x = pad + (i % n) * (cell + gap), y = pad + Math.floor(i / n) * (cell + gap);
      const t = r();
      c.fillStyle = i === hi ? hiCol : hslHex(p.h, p.s, clamp(p.l * (0.5 + t * 0.95), 0.08, 0.82));
      if (shape === 2) { c.beginPath(); c.arc(x + cell / 2, y + cell / 2, cell / 2, 0, TAU); c.fill(); }
      else if (shape === 1) { roundRect(c, x, y, cell, cell, cell * 0.22); c.fill(); }
      else c.fillRect(x, y, cell, cell);
    }
    grain(c, 0.08, true);
  }

  function styleInitial(c, p, r, letter) {
    fillBg(c, p.base);
    const v = r();
    if (v < 0.4) { c.fillStyle = p.deep; c.beginPath(); c.moveTo(0, S); c.lineTo(S, 0); c.lineTo(S, S); c.closePath(); c.fill(); }
    else if (v < 0.7) { c.fillStyle = p.dark; c.fillRect(0, S * 0.62, S, S * 0.38); }
    else { c.fillStyle = p.warm; c.fillRect(0, 0, S * 0.5, S); }
    c.fillStyle = rgba(r() < 0.5 ? p.light : p.pale, 0.55);
    c.beginPath(); c.arc(S * (0.4 + r() * 0.2), S * (0.42 + r() * 0.16), S * (0.26 + r() * 0.12), 0, TAU); c.fill();
    const size = S * (0.62 + r() * 0.2);
    c.font = 'bold ' + Math.round(size) + 'px ' + FONT;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = r() < 0.72 ? p.cream : p.ink;
    c.fillText(letter, S * 0.5 + (r() - 0.5) * S * 0.08, S * 0.54);
    grain(c, 0.08, true);
  }

  function roundRect(c, x, y, w, h, rad) {
    c.beginPath();
    c.moveTo(x + rad, y);
    c.lineTo(x + w - rad, y); c.quadraticCurveTo(x + w, y, x + w, y + rad);
    c.lineTo(x + w, y + h - rad); c.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
    c.lineTo(x + rad, y + h); c.quadraticCurveTo(x, y + h, x, y + h - rad);
    c.lineTo(x, y + rad); c.quadraticCurveTo(x, y, x + rad, y);
    c.closePath();
  }
  function finish(c, p, r) {
    const v = r();
    if (v < 0.22) {
      c.strokeStyle = rgba(p.cream, 0.7); c.lineWidth = 3;
      c.strokeRect(12, 12, S - 24, S - 24);
    } else if (v < 0.38) {
      c.fillStyle = rgba(p.cream, 0.85); c.fillRect(S * 0.08, S * 0.86, S * 0.22, 6);
    }
  }

  const ALBUM_STYLES = [styleDuotone, styleBands, styleRings, styleFields, styleGrid, styleInitial];

  function drawAlbum(c, album) {
    const r = seededRandom(album.coverSeed);
    const p = palette(album.color);
    const roll = r();   // still drawn, so the rest of the seeded sequence (shapes, grain) is unchanged
    const style = ALBUM_STYLES[(album.coverStyle != null ? album.coverStyle : Math.floor(roll * ALBUM_STYLES.length)) % ALBUM_STYLES.length];
    const letter = (String(album.title).match(/[A-Za-z0-9]/) || ['W'])[0].toUpperCase();
    style(c, p, r, letter);
    finish(c, p, r);
    return style === styleInitial;
  }

  // --- artists --------------------------------------------------------------------
  // Backlit silhouettes: head, neck and shoulders in front of an off-centre warm spotlight, with a dark vignette.
  const ARTIST_FIGURES = { ar_hollowlights: 4, ar_kestrelfinch: 2, ar_orielquartet: 4, ar_harborstreet: 3, ar_ghostparade: 3, ar_amaraoyelaran: 3 };
  function figure(c, x, hy, hr, col, hair) {
    c.fillStyle = col;
    c.beginPath(); c.arc(x, hy, hr, 0, TAU); c.fill();
    if (hair) { c.beginPath(); c.arc(x + hair * hr * 0.35, hy - hr * 0.3, hr * 0.95, 0, TAU); c.fill(); }
    c.beginPath();
    c.moveTo(x - hr * 0.42, hy + hr * 0.7);
    c.lineTo(x + hr * 0.42, hy + hr * 0.7);
    c.lineTo(x + hr * 0.55, hy + hr * 1.55);
    c.bezierCurveTo(x + hr * 2.3, hy + hr * 1.8, x + hr * 3.1, hy + hr * 2.6, x + hr * 3.4, S * 1.3);
    c.lineTo(x - hr * 3.4, S * 1.3);
    c.bezierCurveTo(x - hr * 3.1, hy + hr * 2.6, x - hr * 2.3, hy + hr * 1.8, x - hr * 0.55, hy + hr * 1.55);
    c.closePath(); c.fill();
  }
  function drawArtist(c, artist) {
    const r = seededRandom(artist.imageSeed);
    const p = palette(artist.color);
    const warmLight = hslHex(p.h + 24, Math.min(1, p.s * 1.15), 0.72);
    const glow = hslHex(p.h + 10, Math.min(1, p.s * 1.1), 0.5);
    fillBg(c, linear(c, Math.PI / 2 + (r() - 0.5) * 0.8, p.deep, p.dark));
    if (r() < 0.35) {   // a hard two-tone backdrop for some acts
      c.fillStyle = p.base;
      c.beginPath(); c.moveTo(S * (0.3 + r() * 0.5), 0); c.lineTo(S, 0); c.lineTo(S, S); c.lineTo(S * (0.1 + r() * 0.4), S); c.closePath(); c.fill();
    }
    const n = ARTIST_FIGURES[artist.id] || 1;
    const mainX = n === 1 ? S * (0.38 + r() * 0.24) : S * 0.5;
    const sx = mainX + (r() < 0.5 ? -1 : 1) * S * (0.18 + r() * 0.14), sy = S * (0.18 + r() * 0.2);
    const g = c.createRadialGradient(sx, sy, 0, sx, sy, S * (0.42 + r() * 0.4));
    g.addColorStop(0, rgba(warmLight, 0.98));
    g.addColorStop(0.35, rgba(glow, 0.7));
    g.addColorStop(1, rgba(glow, 0));
    c.fillStyle = g; c.fillRect(0, 0, S, S);
    if (r() < 0.5) { c.fillStyle = rgba(p.light, 0.25); c.fillRect(0, S * (0.55 + r() * 0.2), S, S); }
    const ink = hslHex(p.h, Math.min(1, p.s * 0.9), 0.07);
    const far = hslHex(p.h, Math.min(1, p.s * 0.8), 0.16);
    if (n === 1) {
      const hr = S * (0.1 + r() * 0.035);
      figure(c, mainX, S * (0.44 + r() * 0.06), hr, ink, r() < 0.4 ? (r() < 0.5 ? -1 : 1) : 0);
    } else {
      const spread = S * (0.2 + 0.05 * n);
      const order = [];
      for (let i = 0; i < n; i++) order.push(i);
      const mid = (n - 1) / 2;
      order.sort((a, b) => Math.abs(b - mid) - Math.abs(a - mid));   // outer figures first, the centre in front
      order.forEach((i) => {
        const back = Math.abs(i - mid) / Math.max(1, mid);
        const x = S * 0.5 + (i - mid) * spread / Math.max(1, mid);
        const hr = S * (0.1 - back * 0.02);
        figure(c, x, S * (0.48 + back * 0.05 + (r() - 0.5) * 0.04), hr, back > 0.5 ? far : ink, r() < 0.35 ? 1 : 0);
      });
    }
    // rim light on the lit edge of the main figure
    c.save();
    c.globalCompositeOperation = 'screen';
    c.strokeStyle = rgba(warmLight, 0.5); c.lineWidth = 2.5;
    const side = sx < mainX ? -1 : 1;
    c.beginPath(); c.arc(mainX, S * 0.47, S * 0.112, side > 0 ? -1.3 : Math.PI - 0.2, side > 0 ? 0.2 : Math.PI + 1.3); c.stroke();
    c.restore();
    const vg = c.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S * 0.8);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.6)');
    c.fillStyle = vg; c.fillRect(0, 0, S, S);
    grain(c, 0.2);
  }

  // --- playlists ------------------------------------------------------------------
  function wrapLines(c, text, maxW) {
    const words = String(text).split(' ');
    const lines = [];
    let cur = '';
    words.forEach((w) => {
      const t = cur ? cur + ' ' + w : w;
      if (cur && c.measureText(t).width > maxW) { lines.push(cur); cur = w; } else cur = t;
    });
    if (cur) lines.push(cur);
    return lines;
  }
  function drawTitle(c, text, opts) {
    const o = opts || {};
    const x = o.x == null ? 24 : o.x, bottom = o.bottom == null ? S - 24 : o.bottom, maxW = o.maxW || S - 48;
    c.font = TITLE_FONT;
    c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    const lines = wrapLines(c, text, maxW);
    const lh = 37;
    c.fillStyle = o.color || '#ffffff';
    lines.forEach((line, i) => { c.fillText(line, x, bottom - (lines.length - 1 - i) * lh); });
    return lines.length;
  }
  function scrim(c, from, alpha) {
    const g = c.createLinearGradient(0, S * from, 0, S);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,' + alpha + ')');
    c.fillStyle = g; c.fillRect(0, S * from, S, S * (1 - from));
  }
  function brandMark(c, x, y, col) {
    const hs = [10, 20, 14, 24];
    c.fillStyle = col || 'rgba(255,255,255,0.9)';
    hs.forEach((h, i) => { c.fillRect(x + i * 7, y + 24 - h, 4, h); });
  }

  const PLAYLIST_ART = {
    pl_freshfinds: 0, pl_newreleases: 2, pl_chillvibes: 5, pl_deepfocus: 1, pl_latenightdrive: 4,
    pl_morningcoffee: 6, pl_workoutpulse: 3, pl_rainydayjazz: 0, pl_indiegold: 2, pl_electronicessentials: 6,
  };
  function drawPlaylist(c, pl) {
    const r = seededRandom(pl.coverSeed);
    const p = palette(pl.color);
    if (pl.kind === 'mix') {
      fillBg(c, linear(c, Math.PI * 0.25 + r() * 0.5, p.dark, p.warm));
      c.globalCompositeOperation = 'screen';
      for (let i = 0; i < 3; i++) softCircle(c, r() * S, r() * S * 0.7, S * (0.25 + r() * 0.3), [p.light, p.base, p.pale][i], 0.9, 0.35);
      c.globalCompositeOperation = 'source-over';
      const num = (String(pl.name).match(/\d+/) || [''])[0];
      c.font = 'bold 150px ' + FONT; c.textAlign = 'right'; c.textBaseline = 'alphabetic';
      c.fillStyle = 'rgba(255,255,255,0.28)';
      c.fillText(num, S - 18, S * 0.62);
      c.fillStyle = rgba(p.dark, 0.94); c.fillRect(0, S * 0.68, S, S * 0.32);
      brandMark(c, 24, 18);
      drawTitle(c, pl.name, { bottom: S - 30 });
      grain(c, 0.1, true);
      return;
    }
    if (pl.kind === 'chart') {
      fillBg(c, linear(c, Math.PI * 0.5, p.deep, p.dark));
      softCircle(c, S * 0.72, S * 0.2, S * 0.5, p.light, 0.5, 0.2);
      c.fillStyle = '#e9c46a';
      c.beginPath(); c.arc(S * 0.72, S * 0.32, S * 0.17, 0, TAU); c.fill();
      c.font = 'bold 150px ' + FONT; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
      c.fillStyle = '#ffffff';
      c.fillText('50', 20, S * 0.6);
      c.font = 'bold 20px ' + FONT;
      c.fillStyle = 'rgba(255,255,255,0.8)';
      c.fillText('T O P', 24, S * 0.2);
      scrim(c, 0.55, 0.55);
      brandMark(c, S - 52, 18);
      drawTitle(c, pl.name);
      grain(c, 0.1, true);
      return;
    }
    // editorial: a fixed composition per list so the shelf shows variety; unknown ids pick one by seed
    const variant = PLAYLIST_ART[pl.id] != null ? PLAYLIST_ART[pl.id] : Math.floor(r() * 7);
    if (variant === 5) {
      fillBg(c, p.deep);
      c.fillStyle = p.light;
      c.beginPath(); c.arc(S * 0.5, S * 0.78, S * 0.42, Math.PI, 0); c.closePath(); c.fill();
      c.fillStyle = rgba(p.cream, 0.9); c.fillRect(S * 0.08, S * 0.3, S * 0.84, 3);
      c.fillStyle = p.warm; c.beginPath(); c.arc(S * 0.5, S * 0.78, S * 0.2, Math.PI, 0); c.closePath(); c.fill();
    } else if (variant === 6) {
      fillBg(c, p.base);
      c.save();
      c.translate(S * 0.95, S * 0.05); c.rotate(Math.PI / 4);
      [p.warm, p.light, p.cream].forEach((col, i) => { c.fillStyle = col; c.fillRect(-S, i * S * 0.13, S * 2, S * 0.09); });
      c.restore();
      c.fillStyle = p.dark; c.beginPath(); c.arc(S * 0.22, S * 0.3, S * 0.1, 0, TAU); c.fill();
    } else if (variant === 0) {
      fillBg(c, p.base);
      c.fillStyle = p.light;
      c.beginPath(); c.arc(S * (0.75 + r() * 0.15), S * (0.2 + r() * 0.2), S * (0.3 + r() * 0.15), 0, TAU); c.fill();
      c.fillStyle = p.dark;
      c.beginPath(); c.arc(S * (0.2 + r() * 0.2), S * (0.55 + r() * 0.2), S * 0.1, 0, TAU); c.fill();
    } else if (variant === 1) {
      fillBg(c, p.base);
      c.fillStyle = p.deep; c.fillRect(0, S * 0.5, S, S * 0.5);
      c.strokeStyle = rgba(p.cream, 0.85); c.lineWidth = 14;
      c.beginPath(); c.arc(S * (0.65 + r() * 0.15), S * 0.5, S * 0.2, 0, TAU); c.stroke();
    } else if (variant === 2) {
      fillBg(c, p.deep);
      c.fillStyle = p.warm; c.beginPath(); c.moveTo(0, 0); c.lineTo(S, 0); c.lineTo(0, S); c.closePath(); c.fill();
      c.fillStyle = rgba(p.cream, 0.9);
      for (let i = 0; i < 5; i++) { c.beginPath(); c.arc(S * 0.72 + i * 10, S * 0.16 + i * 14, 5, 0, TAU); c.fill(); }
    } else if (variant === 3) {
      fillBg(c, p.dark);
      const cols = [p.base, p.light, p.cream, p.warm];
      for (let i = 0; i < 4; i++) { c.fillStyle = cols[i]; c.fillRect(0, S * (0.08 + i * 0.1), S, S * 0.075); }
    } else {
      fillBg(c, linear(c, Math.PI * 0.3, p.base, p.warm));
      c.globalCompositeOperation = 'screen';
      softCircle(c, S * 0.7, S * 0.3, S * 0.45, p.pale, 0.8, 0.3);
      c.globalCompositeOperation = 'source-over';
      c.fillStyle = p.dark; c.fillRect(S * 0.1, S * 0.1, S * 0.16, S * 0.16);
    }
    scrim(c, 0.45, 0.6);
    brandMark(c, S - 52, 18);
    drawTitle(c, pl.name);
    grain(c, 0.1, true);
  }

  // --- liked songs, empty mosaic ----------------------------------------------------
  function heartPath(c, cx, cy, w) {
    const h = w * 0.92, x = cx - w / 2, t = cy - h / 2, b = t + h;
    c.beginPath();
    c.moveTo(cx, b);
    c.bezierCurveTo(cx, b - h * 0.32, x, b - h * 0.48, x, t + h * 0.3);
    c.bezierCurveTo(x, t - h * 0.04, x + w * 0.5, t - h * 0.04, cx, t + h * 0.26);
    c.bezierCurveTo(cx, t - h * 0.04, x + w, t - h * 0.04, x + w, t + h * 0.3);
    c.bezierCurveTo(x + w, b - h * 0.48, cx, b - h * 0.32, cx, b);
    c.closePath();
  }
  function drawLiked(c) {
    fillBg(c, linear(c, Math.PI * 0.25, '#450af5', '#c4efd9'));
    c.fillStyle = '#ffffff';
    heartPath(c, S / 2, S * 0.5, S * 0.42);
    c.fill();
  }
  function drawEmptyMosaic(c) {
    fillBg(c, '#282828');
    c.fillStyle = '#b3b3b3';
    // eighth note
    c.save();
    c.translate(S * 0.42, S * 0.62); c.rotate(-0.35);
    c.beginPath(); c.scale(1, 0.72); c.arc(0, 0, S * 0.09, 0, TAU); c.fill();
    c.restore();
    c.fillRect(S * 0.42 + S * 0.075, S * 0.3, S * 0.035, S * 0.33);
    c.beginPath();
    c.moveTo(S * 0.42 + S * 0.075, S * 0.3);
    c.bezierCurveTo(S * 0.6, S * 0.34, S * 0.64, S * 0.42, S * 0.58, S * 0.52);
    c.bezierCurveTo(S * 0.62, S * 0.42, S * 0.56, S * 0.38, S * 0.42 + S * 0.075 + S * 0.035, S * 0.36);
    c.closePath(); c.fill();
  }

  // --- rendering and cache -----------------------------------------------------------
  function resetCtx(c) {
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    c.clearRect(0, 0, S, S);
  }
  function exportPng() {
    try { return canvas.toDataURL('image/png'); } catch (e) { return ''; }
  }
  function drawInto(c, x, y, size, fn) {
    c.save();
    c.translate(x, y); c.scale(size / S, size / S);
    c.beginPath(); c.rect(0, 0, S, S); c.clip();
    fn(c);
    c.restore();
  }
  function kindOf(entity) {
    if (!entity) return null;
    if (entity.kind === 'liked' || entity.id === 'liked') return 'liked';
    const id = String(entity.id || '');
    if (id.startsWith('tr_')) return 'track';
    if (id.startsWith('al_')) return 'album';
    if (id.startsWith('ar_')) return 'artist';
    if (id.startsWith('pl_')) return 'playlist';
    if (id.startsWith('plu_') || Array.isArray(entity.trackIds)) return 'user';
    return null;
  }

  function cover(entity) {
    if (typeof entity === 'string') entity = entity === 'liked' ? { kind: 'liked' } : byId[entity];
    let kind = kindOf(entity);
    if (kind === 'track') { entity = byId[entity.albumId]; kind = entity ? 'album' : null; }
    if (!kind) return '';
    if (kind === 'user') return playlistMosaic(entity.trackIds || []);
    const key = kind === 'liked' ? 'liked' : entity.id;
    if (coverCache[key] != null) return coverCache[key];
    const c = getCtx();
    if (!c) return '';
    let usesText = false;
    c.save();
    try {
      resetCtx(c);
      if (kind === 'liked') drawLiked(c);
      else if (kind === 'album') usesText = drawAlbum(c, entity);
      else if (kind === 'artist') drawArtist(c, entity);
      else { drawPlaylist(c, entity); usesText = true; }
    } catch (e) { /* a drawing failure leaves an empty cover rather than breaking the caller */ }
    c.restore();
    const url = exportPng();
    coverCache[key] = url;
    if (usesText && !fontReady()) fontPending.add(key);
    return url;
  }
  function artistImage(artist) { return cover(artist); }
  // Extra (not in the contract): true when cover(entity) would return a cached image without drawing, so
  // callers can paint cached covers at once and defer the rest (app.js draws off-screen covers lazily).
  function hasCover(entity) {
    if (typeof entity === 'string') entity = entity === 'liked' ? { kind: 'liked' } : byId[entity];
    let kind = kindOf(entity);
    if (kind === 'track') { entity = byId[entity.albumId]; kind = entity ? 'album' : null; }
    if (!kind) return true;   // nothing to draw: cover() returns '' at once
    if (kind === 'user') return mosaicCache[mosaicAlbums(entity.trackIds || []).map((a) => a.id).join(',')] != null;
    return coverCache[kind === 'liked' ? 'liked' : entity.id] != null;
  }
  function mosaicAlbums(trackIds) {
    const seen = Object.create(null), als = [];
    (trackIds || []).some((tid) => {
      const t = byId[tid];
      if (t && !seen[t.albumId] && byId[t.albumId]) { seen[t.albumId] = 1; als.push(byId[t.albumId]); }
      return als.length >= 4;
    });
    return als;
  }

  function playlistMosaic(trackIds) {
    const c = getCtx();
    if (!c) return '';
    const als = mosaicAlbums(trackIds);
    const key = als.map((a) => a.id).join(',');
    if (mosaicCache[key] != null) return mosaicCache[key];
    c.save();
    try {
      resetCtx(c);
      if (als.length === 0) drawEmptyMosaic(c);
      else if (als.length < 4) drawAlbum(c, als[0]);
      else {
        const half = S / 2;
        als.forEach((al, i) => { drawInto(c, (i % 2) * half, Math.floor(i / 2) * half, half, (cc) => { drawAlbum(cc, al); }); });
      }
    } catch (e) { /* see cover() */ }
    c.restore();
    const url = exportPng();
    if (mosaicCount > 60) { Object.keys(mosaicCache).forEach((k) => { delete mosaicCache[k]; }); mosaicCount = 0; }
    mosaicCache[key] = url; mosaicCount++;
    return url;
  }

  watchFonts();

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------
  const Catalog = {
    genres: genres, artists: artists, albums: albums, tracks: tracks, playlists: playlists,
    get: get,
    track: typed('tr_'), album: typed('al_'), artist: typed('ar_'), playlist: typed('pl_'), genre: typed('ge_'),
    tracksOf: tracksOf, albumsOf: albumsOf, discography: discography, topTracks: topTracks, relatedArtists: relatedArtists,
    genreContent: genreContent, popularAlbums: popularAlbums, popularArtists: popularArtists, newReleases: newReleases,
    search: search,
    cover: cover, artistImage: artistImage, playlistMosaic: playlistMosaic,
    formatDuration: formatDuration, formatTotal: formatTotal, formatPlays: formatPlays, formatCount: formatCount,
    formatDate: formatDate, formatLongDate: formatLongDate, relativeDate: relativeDate,
    seededRandom: seededRandom, pluralize: pluralize,
    // extras (not in the contract, safe to ignore)
    hashString: hashString, hasCover: hasCover,
    trackArtists: function (track) {
      const t = typeof track === 'string' ? byId[track] : track;
      if (!t) return [];
      return [byId[t.artistId]].concat((t.featuringIds || []).map((id) => byId[id])).filter(Boolean);
    },
    totalDuration: function (trackIds) {
      return (trackIds || []).reduce((sum, id) => sum + ((byId[id] && byId[id].durationMs) || 0), 0);
    },
    today: TODAY,
  };

  const root = typeof window !== 'undefined' ? window : globalThis;
  root.Catalog = Catalog;
  if (typeof module !== 'undefined' && module.exports) module.exports = Catalog;
})();
