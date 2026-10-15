/* audio.js — Wavelength generative audio engine. Defines window.AudioEngine (section 5 of SPEC.md).
   Every track is synthesised with the Web Audio API from a deterministic seed: the Song model (tempo, key,
   mode, chord progression, motif, drum and bass patterns, section arrangement) is pure data derived from
   track.audioSeed + track.styleKey, and a lookahead scheduler renders it with per-note oscillators and noise.
   Also loads in Node (no AudioContext there) so the song model can be unit-tested. */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;

  /* ------------------------------------------------------------------ utilities */
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) {
    var h = 2166136261;
    s = String(s);
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  // Stateless per-step randomness: deterministic for (seed, step, salt) so a seek replays the same hits.
  function hrand(seed, step, salt) {
    var h = (seed ^ Math.imul(step + 1, 0x9E3779B1) ^ Math.imul(salt + 1, 0x85EBCA77)) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x7FEB352D);
    h = Math.imul(h ^ (h >>> 15), 0x846CA68B);
    h = (h ^ (h >>> 16)) >>> 0;
    return h / 4294967296;
  }
  function pick(rng, arr) { return arr[Math.floor(rng() * arr.length) % arr.length]; }
  function weighted(rng, table) {
    var keys = Object.keys(table), total = 0, i;
    for (i = 0; i < keys.length; i++) total += table[keys[i]];
    var x = rng() * total;
    for (i = 0; i < keys.length; i++) { x -= table[keys[i]]; if (x <= 0) return keys[i]; }
    return keys[keys.length - 1];
  }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function mod(n, m) { return ((n % m) + m) % m; }
  function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  /* ------------------------------------------------------------------ music theory tables */
  var SCALES = {
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10],
    dorian: [0, 2, 3, 5, 7, 9, 10],
    mixolydian: [0, 2, 4, 5, 7, 9, 10]
  };
  // Progressions as 1-based scale degrees; the mode decides each chord's quality.
  var PROGS = {
    'I-V-vi-IV': [1, 5, 6, 4], 'vi-IV-I-V': [6, 4, 1, 5], 'ii-V-I-vi': [2, 5, 1, 6], 'I-vi-IV-V': [1, 6, 4, 5],
    'i-VII-VI-VII': [1, 7, 6, 7], 'i-iv-v-i': [1, 4, 5, 1], 'I-IV-vi-V': [1, 4, 6, 5], 'I-iii-vi-IV': [1, 3, 6, 4],
    'vi-V-IV-V': [6, 5, 4, 5], 'I-IV-I-V': [1, 4, 1, 5], 'I-vi-ii-V': [1, 6, 2, 5], 'IV-V-iii-vi': [4, 5, 3, 6],
    'I-VII-IV-I': [1, 7, 4, 1], 'i-VI-III-VII': [1, 6, 3, 7], 'I-IV': [1, 4, 1, 4], 'i-VI': [1, 6, 1, 6], 'ii-V': [2, 5, 2, 5]
  };

  /* Per-style recipe: tempo range, mode weights, progression pool, instrument types, octaves, swing, EQ.
     oct = { bass, chord, lead } octave numbers; eq = [type, frequency, gain]; lv = level multipliers. */
  var STYLES = {
    pop: { bpm: [100, 125], modes: { major: 0.65, minor: 0.35 }, progs: ['I-V-vi-IV', 'vi-IV-I-V', 'I-vi-IV-V', 'I-IV-vi-V', 'IV-V-iii-vi'],
      chord: 'saw', lead: 'vibrato', bass: 'pop', drums: 'pop', swing: 0, eq: ['peaking', 2800, 1.5], oct: { bass: 2, chord: 4, lead: 5 },
      density: 'medium', lv: { drums: 0.95, bass: 0.9, chord: 0.8, lead: 0.9 }, instruments: ['kick', 'snare', 'clap', 'hat', 'bass', 'synth', 'lead'] },
    hiphop: { bpm: [80, 100], modes: { minor: 0.6, dorian: 0.25, major: 0.15 }, progs: ['i-VII-VI-VII', 'i-iv-v-i', 'ii-V-I-vi', 'I-iii-vi-IV'],
      chord: 'epiano', lead: 'bell', bass: 'sub', drums: 'hiphop', swing: 0.08, eq: ['lowshelf', 120, 2.5], oct: { bass: 1, chord: 4, lead: 5 },
      density: 'sparse', lv: { drums: 0.95, bass: 0.85, chord: 0.8, lead: 0.7 }, instruments: ['kick', 'snare', 'clap', 'hat', 'openhat', 'sub', 'epiano', 'bell'] },
    rock: { bpm: [110, 150], modes: { major: 0.45, mixolydian: 0.35, minor: 0.2 }, progs: ['I-V-vi-IV', 'I-IV-vi-V', 'I-IV-I-V', 'vi-V-IV-V', 'I-VII-IV-I'],
      chord: 'saw', lead: 'sawlead', bass: 'eighths', drums: 'rock', swing: 0, eq: ['peaking', 1800, 2], oct: { bass: 2, chord: 3, lead: 5 },
      density: 'medium', lv: { drums: 1, bass: 0.9, chord: 0.9, lead: 0.8 }, instruments: ['kick', 'snare', 'hat', 'openhat', 'bass', 'guitar', 'lead'] },
    indie: { bpm: [110, 150], modes: { major: 0.5, mixolydian: 0.2, dorian: 0.15, minor: 0.15 }, progs: ['I-V-vi-IV', 'vi-IV-I-V', 'I-IV-vi-V', 'I-iii-vi-IV', 'vi-V-IV-V'],
      chord: 'jangle', lead: 'vibrato', bass: 'indie', drums: 'indie', swing: 0, eq: ['highshelf', 4000, 1.5], oct: { bass: 2, chord: 4, lead: 5 },
      density: 'medium', lv: { drums: 0.85, bass: 0.85, chord: 0.85, lead: 0.8 }, instruments: ['kick', 'snare', 'hat', 'bass', 'jangle', 'lead'] },
    electronic: { bpm: [120, 132], modes: { minor: 0.5, major: 0.3, dorian: 0.2 }, progs: ['vi-IV-I-V', 'i-VII-VI-VII', 'vi-V-IV-V', 'I-V-vi-IV', 'i-VI-III-VII'],
      chord: 'saw', lead: 'square', bass: 'pulse', drums: 'electronic', swing: 0, eq: ['lowshelf', 100, 2.5], oct: { bass: 1, chord: 4, lead: 5 },
      density: 'arp', lv: { drums: 1, bass: 1, chord: 0.75, lead: 0.7 }, instruments: ['kick', 'clap', 'hat', 'openhat', 'bass', 'synth', 'arp'] },
    lofi: { bpm: [70, 85], modes: { minor: 0.5, dorian: 0.35, major: 0.15 }, progs: ['ii-V-I-vi', 'I-vi-ii-V', 'I-iii-vi-IV', 'i-VII-VI-VII', 'ii-V'],
      chord: 'epiano', lead: 'piano', bass: 'lofi', drums: 'lofi', swing: 0.12, eq: ['lowpass', 6500, 0], oct: { bass: 2, chord: 4, lead: 5 },
      density: 'sparse', lv: { drums: 0.95, bass: 1, chord: 1.15, lead: 0.9 }, instruments: ['kick', 'snare', 'hat', 'bass', 'epiano', 'piano', 'vinyl'] },
    jazz: { bpm: [100, 140], modes: { dorian: 0.35, major: 0.35, minor: 0.3 }, progs: ['ii-V-I-vi', 'I-vi-ii-V', 'IV-V-iii-vi', 'ii-V'],
      chord: 'epiano', lead: 'sax', bass: 'walking', drums: 'jazz', swing: 0.3, eq: ['peaking', 1200, 1], oct: { bass: 2, chord: 4, lead: 4 },
      density: 'medium', lv: { drums: 0.7, bass: 0.95, chord: 0.8, lead: 0.8 }, instruments: ['kick', 'ride', 'hat', 'brush', 'bass', 'epiano', 'sax'] },
    classical: { bpm: [60, 90], modes: { major: 0.55, minor: 0.45 }, progs: ['I-V-vi-IV', 'I-IV-I-V', 'I-vi-ii-V', 'ii-V-I-vi', 'i-iv-v-i'],
      chord: 'strings', lead: 'piano', bass: 'cello', drums: 'pizz', swing: 0, eq: ['peaking', 800, 1], oct: { bass: 2, chord: 4, lead: 5 },
      density: 'medium', lv: { drums: 0.7, bass: 0.9, chord: 1.15, lead: 1.05 }, instruments: ['pizzicato', 'cello', 'strings', 'piano'] },
    ambient: { bpm: [60, 75], modes: { minor: 0.4, dorian: 0.3, major: 0.3 }, progs: ['I-IV', 'i-VI', 'I-vi-IV-V', 'ii-V'],
      chord: 'pad', lead: 'bellpad', bass: 'drone', drums: 'none', swing: 0, eq: ['lowpass', 5000, 0], oct: { bass: 1, chord: 4, lead: 5 },
      density: 'sparse', lv: { drums: 0, bass: 1.1, chord: 1.5, lead: 0.9 }, instruments: ['drone', 'pad', 'bell', 'reverb'], chordBars: 2 },
    rnb: { bpm: [85, 105], modes: { major: 0.4, minor: 0.35, dorian: 0.25 }, progs: ['ii-V-I-vi', 'I-vi-ii-V', 'I-iii-vi-IV', 'vi-IV-I-V', 'IV-V-iii-vi'],
      chord: 'epiano', lead: 'vibrato', bass: 'rnb', drums: 'rnb', swing: 0.05, eq: ['lowshelf', 150, 1.5], oct: { bass: 1, chord: 4, lead: 5 },
      density: 'medium', lv: { drums: 0.9, bass: 1, chord: 0.85, lead: 0.85 }, instruments: ['kick', 'snare', 'clap', 'hat', 'bass', 'epiano', 'lead'] },
    folk: { bpm: [90, 120], modes: { major: 0.6, mixolydian: 0.25, dorian: 0.15 }, progs: ['I-IV-I-V', 'I-V-vi-IV', 'I-IV-vi-V', 'I-VII-IV-I'],
      chord: 'pluck', lead: 'flute', bass: 'folk', drums: 'folk', swing: 0, eq: ['peaking', 2500, 1], oct: { bass: 2, chord: 3, lead: 5 },
      density: 'medium', lv: { drums: 0.7, bass: 0.85, chord: 0.95, lead: 0.8 }, instruments: ['kick', 'shaker', 'rim', 'bass', 'guitar', 'flute'] },
    latin: { bpm: [95, 120], modes: { minor: 0.4, major: 0.4, dorian: 0.2 }, progs: ['i-iv-v-i', 'i-VII-VI-VII', 'I-V-vi-IV', 'vi-IV-I-V', 'i-VI-III-VII'],
      chord: 'pluck', lead: 'trumpet', bass: 'tumbao', drums: 'latin', swing: 0, eq: ['peaking', 3500, 1.5], oct: { bass: 2, chord: 4, lead: 5 },
      density: 'busy', lv: { drums: 0.9, bass: 0.95, chord: 0.9, lead: 0.8 }, instruments: ['kick', 'rim', 'shaker', 'conga', 'bass', 'guitar', 'trumpet'] },
    funk: { bpm: [100, 115], modes: { dorian: 0.5, mixolydian: 0.4, minor: 0.1 }, progs: ['I-IV', 'ii-V', 'I-IV-I-V', 'i-iv-v-i'],
      chord: 'wah', lead: 'clav', bass: 'funk', drums: 'funk', swing: 0.06, eq: ['peaking', 900, 1.5], oct: { bass: 2, chord: 4, lead: 5 },
      density: 'busy', lv: { drums: 1, bass: 1, chord: 0.8, lead: 0.75 }, instruments: ['kick', 'snare', 'hat', 'openhat', 'bass', 'wah', 'clav'] },
    metal: { bpm: [140, 170], modes: { minor: 0.7, dorian: 0.3 }, progs: ['i-VII-VI-VII', 'i-iv-v-i', 'vi-V-IV-V', 'i-VI-III-VII'],
      chord: 'power', lead: 'sawlead', bass: 'chug', drums: 'metal', swing: 0, eq: ['peaking', 3000, 3], oct: { bass: 1, chord: 2, lead: 5 },
      density: 'busy', lv: { drums: 0.95, bass: 0.9, chord: 0.9, lead: 0.75 }, instruments: ['kick', 'snare', 'hat', 'bass', 'distguitar', 'lead'] }
  };
  var STYLE_KEYS = Object.keys(STYLES);

  /* Drum patterns: per style, 16th-step positions inside one bar. 'h8' / 'h16' are hat grids. */
  var DRUMS = {
    pop: { kick: [0, 8, 10], snare: [4, 12], clap: [4, 12], hat: 'h8', openhat: [14], chorusKick: [0, 7, 8, 10] },
    hiphop: { kick: [0, 7, 10], snare: [4, 12], clap: [12], hat: 'h8', openhat: [14], chorusKick: [0, 3, 7, 10, 11] },
    rock: { kick: [0, 6, 8], snare: [4, 12], hat: 'h8', openhat: [0], chorusKick: [0, 3, 6, 8, 11] },
    indie: { kick: [0, 5, 8], snare: [4, 12], hat: 'h8', chorusKick: [0, 5, 8, 10] },
    electronic: { kick: [0, 4, 8, 12], clap: [4, 12], hat: 'h16', openhat: [2, 6, 10, 14], chorusKick: [0, 4, 8, 12] },
    lofi: { kick: [0, 10], snare: [4, 12], hat: 'h8', chorusKick: [0, 7, 10] },
    jazz: { kick: [0], ride: [0, 4, 6, 8, 12, 14], hat: [4, 12], brush: [2, 10], chorusKick: [0, 8] },
    classical: {}, ambient: {},
    rnb: { kick: [0, 6, 10], snare: [4, 12], clap: [4, 12], hat: 'h16', chorusKick: [0, 6, 8, 10] },
    folk: { kick: [0, 8], rim: [4, 12], shaker: 'h8', chorusKick: [0, 6, 8] },
    latin: { kick: [0, 6, 8, 14], rim: [0, 3, 6, 10, 12], shaker: 'h8', conga: [2, 4, 10, 12, 14], chorusKick: [0, 6, 8, 11, 14] },
    funk: { kick: [0, 3, 6, 10], snare: [4, 12], hat: 'h16', openhat: [14], chorusKick: [0, 3, 6, 10, 11] },
    metal: { kick: [0, 2, 4, 6, 8, 10, 12, 14], snare: [4, 12], hat: 'h8', chorusKick: 'h16' }
  };

  /* Bass patterns: [step, tone, lengthInSteps]; tone r = root, 5 = fifth, 3 = third, o = octave, a = approach note. */
  var BASS = {
    pop: [[0, 'r', 3], [3, 'r', 1], [6, '5', 2], [8, 'r', 3], [11, 'r', 1], [14, '5', 2]],
    sub: [[0, 'r', 6], [10, 'r', 5]],
    eighths: [[0, 'r', 2], [2, 'r', 2], [4, 'r', 2], [6, 'r', 2], [8, 'r', 2], [10, 'r', 2], [12, 'r', 2], [14, '5', 2]],
    indie: [[0, 'r', 4], [4, 'r', 2], [6, '5', 2], [8, 'r', 4], [12, 'r', 2], [14, '5', 2]],
    pulse: [[0, 'r', 2], [2, 'r', 2], [4, 'r', 2], [6, 'o', 2], [8, 'r', 2], [10, 'r', 2], [12, 'r', 2], [14, 'o', 2]],
    lofi: [[0, 'r', 8], [10, '5', 4]],
    walking: [[0, 'r', 4], [4, '3', 4], [8, '5', 4], [12, 'a', 4]],
    cello: [[0, 'r', 16]],
    drone: [[0, 'r', 32]],
    rnb: [[0, 'r', 5], [6, 'r', 2], [10, '5', 4]],
    folk: [[0, 'r', 4], [4, '5', 4], [8, 'r', 4], [12, '5', 4]],
    tumbao: [[0, 'r', 2], [6, '5', 4], [12, 'r', 4]],
    funk: [[0, 'r', 1], [3, 'r', 1], [6, '5', 1], [8, 'r', 1], [10, 'o', 1], [11, 'r', 1], [14, '5', 1]],
    chug: [[0, 'r', 2], [2, 'r', 2], [4, 'r', 2], [6, 'r', 2], [8, 'r', 2], [10, 'r', 2], [12, 'r', 2], [14, 'r', 2]]
  };

  /* Chord rhythms: [step, lengthInSteps] per bar; 'chorus' variants push a little harder. */
  var CHORDS = {
    saw: { verse: [[0, 8], [8, 8]], chorus: [[0, 6], [6, 2], [8, 8]] },
    epiano: { verse: [[0, 10], [10, 6]], chorus: [[0, 6], [6, 4], [10, 6]] },
    jangle: { verse: [[0, 3], [3, 3], [6, 2], [8, 3], [11, 3], [14, 2]], chorus: [[0, 2], [2, 2], [4, 2], [6, 2], [8, 2], [10, 2], [12, 2], [14, 2]] },
    pluck: { verse: [[0, 4], [4, 2], [6, 2], [8, 4], [12, 2], [14, 2]], chorus: [[0, 2], [3, 3], [6, 2], [8, 2], [11, 3], [14, 2]] },
    strings: { verse: [[0, 16]], chorus: [[0, 8], [8, 8]] },
    pad: { verse: [[0, 32]], chorus: [[0, 32]] },
    wah: { verse: [[0, 1], [3, 1], [6, 1], [8, 1], [10, 1], [11, 1], [14, 1]], chorus: [[0, 1], [2, 1], [3, 1], [6, 1], [8, 1], [10, 1], [11, 1], [13, 1], [14, 1]] },
    power: { verse: [[0, 2], [2, 2], [4, 2], [6, 2], [8, 2], [10, 2], [12, 2], [14, 2]], chorus: [[0, 8], [8, 8]] }
  };
  // Style-level overrides of the chord rhythm (the rock 'saw' strums, electronic offbeat stabs).
  var CHORD_RHYTHM_BY_STYLE = {
    rock: { verse: [[0, 2], [2, 2], [4, 2], [6, 2], [8, 2], [10, 2], [12, 2], [14, 2]], chorus: [[0, 16]] },
    electronic: { verse: [[2, 1], [6, 1], [10, 1], [14, 1]], chorus: [[0, 1], [2, 1], [4, 1], [6, 1], [8, 1], [10, 1], [12, 1], [14, 1]] },
    lofi: { verse: [[0, 16]], chorus: [[0, 10], [10, 6]] },
    jazz: { verse: [[0, 3], [3, 5], [8, 2], [11, 5]], chorus: [[0, 2], [3, 3], [6, 2], [8, 3], [11, 2], [14, 2]] },
    latin: { verse: [[0, 2], [3, 2], [6, 2], [8, 2], [11, 2], [14, 2]], chorus: [[0, 1], [2, 2], [4, 1], [6, 2], [8, 1], [10, 2], [12, 1], [14, 2]] }
  };

  /* Melodic rhythm pools (16th-step onsets inside one bar) by density. */
  var RHYTHMS = {
    sparse: [[0, 6, 12], [0, 8, 12], [0, 4, 10], [2, 8, 14], [0, 10], [0, 6, 8, 14]],
    medium: [[0, 2, 4, 8, 10, 12], [0, 3, 6, 8, 11, 14], [0, 4, 6, 8, 12, 14], [0, 2, 6, 8, 10, 14], [0, 4, 7, 8, 12, 15]],
    busy: [[0, 2, 4, 6, 8, 10, 12, 14], [0, 1, 2, 4, 6, 8, 10, 12, 14], [0, 2, 3, 4, 6, 8, 10, 11, 12, 14], [0, 3, 4, 6, 7, 8, 10, 12, 14]],
    arp: [[0, 2, 4, 6, 8, 10, 12, 14], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], [0, 3, 6, 8, 11, 14]]
  };

  /* ------------------------------------------------------------------ song model (pure data) */
  // Section plan in bars, scaled to the track length so every track has a start, a middle and an end.
  function arrange(totalBars) {
    var plan, i;
    if (totalBars >= 8) plan = [['intro', 4], ['verse', 8], ['chorus', 8], ['verse', 8], ['chorus', 8], ['bridge', 4], ['chorus', 8], ['outro', 4]];
    else if (totalBars >= 4) plan = [['intro', 1], ['verse', 2], ['chorus', 3], ['outro', 1]];
    else if (totalBars === 3) plan = [['intro', 1], ['chorus', 1], ['outro', 1]];
    else plan = [['chorus', totalBars]];
    var planTotal = 0;
    for (i = 0; i < plan.length; i++) planTotal += plan[i][1];
    // SPEC §5: the intro is 4 bars (pads/keys only) whatever the track length; the other sections share the
    // rest in proportion. Very short tracks (under 20 bars) scale everything, the intro included.
    var pinIntro = totalBars >= 20 && plan[0][0] === 'intro';
    var restPlan = pinIntro ? planTotal - plan[0][1] : planTotal, restBars = pinIntro ? totalBars - plan[0][1] : totalBars;
    var secs = plan.map(function (p, k) {
      if (pinIntro && k === 0) return { name: p[0], bars: p[1], fixed: true };
      return { name: p[0], bars: Math.max(1, Math.round(p[1] * restBars / restPlan)) };
    });
    function sum() { var s = 0; for (var k = 0; k < secs.length; k++) s += secs[k].bars; return s; }
    var guard = 0;
    while (sum() > totalBars && guard++ < 1000) {
      var big = null;
      for (i = 0; i < secs.length; i++) if (!secs[i].fixed && secs[i].bars > 1 && (!big || secs[i].bars > big.bars)) big = secs[i];
      if (!big) break;
      big.bars--;
    }
    var grow = secs[0];
    for (i = 0; i < secs.length; i++) if (secs[i].name === 'chorus') grow = secs[i];
    while (sum() < totalBars) grow.bars++;
    var start = 0;
    for (i = 0; i < secs.length; i++) { delete secs[i].fixed; secs[i].startBar = start; start += secs[i].bars; }
    secs = secs.filter(function (s) { return s.startBar < totalBars; });
    var last = secs[secs.length - 1];
    last.bars = Math.min(last.bars, totalBars - last.startBar);
    return secs;
  }

  // Chord tones (semitone offsets from the key) for a 1-based degree, stacked in thirds.
  function chordTones(scale, degree, count) {
    var idx = degree - 1, out = [];
    for (var k = 0; k < count; k++) { var i = idx + 2 * k; out.push(scale[i % 7] + 12 * Math.floor(i / 7)); }
    return out;
  }
  // Close voicing inside one octave window above base (smooth voice leading between chords).
  function voice(tones, base) {
    var notes = tones.map(function (t) { return base + mod(t, 12); });
    notes.sort(function (a, b) { return a - b; });
    return notes;
  }

  function buildMotif(rng, density) {
    var pool = RHYTHMS[density] || RHYTHMS.medium;
    var bars = [pick(rng, pool), pick(rng, pool)];
    var notes = [], prev = 0;
    for (var b = 0; b < 2; b++) {
      var onsets = bars[b];
      for (var i = 0; i < onsets.length; i++) {
        var step = onsets[i] + 16 * b;
        var nextOnset = i + 1 < onsets.length ? onsets[i + 1] + 16 * b : 16 * (b + 1);
        var strong = onsets[i] % 4 === 0;
        var rel;
        if (strong || rng() < 0.35) rel = pick(rng, [0, 2, 4, 4, 7, 2, 0]);
        else rel = prev + (rng() < 0.5 ? 1 : -1) * (rng() < 0.75 ? 1 : 2);
        rel = clamp(rel, -3, 9);
        var phraseEnd = b === 1 && i === onsets.length - 1;
        if (phraseEnd) rel = pick(rng, [0, 2, 4, 7]);
        var gap = nextOnset - step;
        var len = phraseEnd ? Math.max(gap, 4) : (rng() < 0.3 ? Math.max(1, gap - 1) : gap);
        notes.push({ step: step, rel: rel, len: len, vel: strong ? 1 : 0.8 });
        prev = rel;
      }
    }
    return notes;
  }

  // Seeded variations of the motif per 2-bar phrase; the bridge keeps only held strong-beat notes.
  function phraseNotes(song, phrase, secName) {
    var v = secName === 'verse' ? phrase % 2 : phrase % 4;
    var notes = song.motif, out = [];
    for (var i = 0; i < notes.length; i++) {
      var n = notes[i], rel = n.rel, len = n.len, skip = false;
      if (v === 1 && i >= notes.length - 2) rel += (i === notes.length - 1 ? -1 : 2);
      if (v === 2 && n.step < 16) rel += 2;
      if (v === 3 && i % 3 === 2) skip = true;
      if (secName === 'bridge') { if (n.step % 4 !== 0) skip = true; len = Math.max(len, 4); }
      if (!skip) out.push({ step: n.step, rel: rel, len: len, vel: n.vel });
    }
    return out;
  }

  function buildSong(track) {
    var styleKey = STYLES[track.styleKey] ? track.styleKey : 'pop';
    var st = STYLES[styleKey];
    var seed = (Number(track.audioSeed) >>> 0) || hashStr(track.id || 'track');
    var rng = mulberry32(seed ^ hashStr(styleKey));
    var durationMs = Number(track.durationMs) > 0 ? Number(track.durationMs) : 180000;
    var duration = durationMs / 1000;
    var bpm = Math.round(st.bpm[0] + rng() * (st.bpm[1] - st.bpm[0]));
    var key = Math.floor(rng() * 12);
    var mode = weighted(rng, st.modes);
    var scale = SCALES[mode];
    var progName = pick(rng, st.progs);
    var progression = PROGS[progName].slice();
    var bridgePool = st.progs.filter(function (n) { return n !== progName; });
    if (!bridgePool.length) bridgePool = ['IV-V-iii-vi', 'vi-IV-I-V', 'i-VI-III-VII'];
    var bridgeName = pick(rng, bridgePool);
    var bridgeProgression = PROGS[bridgeName].slice();
    var stepDuration = 60 / bpm / 4;
    var barDuration = stepDuration * 16;
    var totalBars = Math.max(1, Math.ceil(duration / barDuration));
    var sections = arrange(totalBars);
    var chordBars = st.chordBars || 1;
    var motif = buildMotif(rng, st.density);
    var swing = st.swing * (0.8 + rng() * 0.4);
    var leadWave = rng();
    // Per-bar lookup: section + chord.
    var bars = new Array(totalBars), chords = new Array(totalBars), b, s;
    for (s = 0; s < sections.length; s++) {
      var sec = sections[s];
      for (b = sec.startBar; b < sec.startBar + sec.bars && b < totalBars; b++) {
        bars[b] = { name: sec.name, idx: b - sec.startBar, bars: sec.bars, first: b === sec.startBar, last: b === sec.startBar + sec.bars - 1, section: sec };
      }
    }
    var chordBase = 12 * (st.oct.chord + 1) + key;
    var bassBase = 12 * (st.oct.bass + 1) + key;
    var chorusMode = rng() < 0.5 ? 'octave' : 'double';
    // Bass pitches stay within a tritone of the key so the bass never wanders into the chord register.
    function low(pc) { return bassBase + (pc > 6 ? pc - 12 : pc); }
    for (b = 0; b < totalBars; b++) {
      var info = bars[b] || bars[totalBars - 1];
      var prog = info.name === 'bridge' ? bridgeProgression : progression;
      var rel = info.name === 'bridge' ? info.idx : b;
      var degree = prog[Math.floor(rel / chordBars) % prog.length];
      var nextDegree = prog[(Math.floor(rel / chordBars) + 1) % prog.length];
      var t3 = chordTones(scale, degree, 3), t4 = chordTones(scale, degree, 4);
      var rootPc = mod(scale[degree - 1], 12), nextPc = mod(scale[nextDegree - 1], 12);
      var pr = low(rootPc);
      chords[b] = {
        degree: degree,
        triad: voice(t3, chordBase),
        seventh: voice(t4, chordBase),
        power: [pr + 12, pr + 19, pr + 24],
        root: pr,
        third: low(mod(t3[1], 12)),
        fifth: low(mod(t3[2], 12)),
        nextRoot: low(nextPc)
      };
    }
    return {
      styleKey: styleKey, bpm: bpm, key: key, mode: mode, progression: progression,
      instruments: st.instruments.slice(), sections: sections,
      // extras used by the renderer
      progressionName: progName, bridgeProgression: bridgeProgression, bridgeName: bridgeName, scale: scale, seed: seed,
      stepDuration: stepDuration, barDuration: barDuration, totalBars: totalBars, duration: duration,
      swing: swing, motif: motif, bars: bars, chords: chords, style: st, chordBars: chordBars, leadWave: leadWave,
      chorusMode: chorusMode, leadBase: 12 * (st.oct.lead + 1) + key
    };
  }

  /* ------------------------------------------------------------------ engine state */
  var ctx = null, master = null, noiseBuffer = null;
  var track = null, song = null, rig = null;
  var state = 'idle';
  var position = 0;                        // seconds; the resume point while not playing
  var playStartCtx = 0, playOffset = 0;    // while playing: currentTime = ctx.currentTime - playStartCtx + playOffset
  var volume = 0.7;
  var timer = null, tickCount = 0, nextStep = 0, nextStepTime = 0, sweepPending = false;
  var gen = 0;                             // bumped on every transition so stale async work can bail out
  var fadeOutUntil = 0;                    // ctx time at which the last pause / track-change fade-out has finished
  var pendingPlay = null;
  var active = new Set();                  // every scheduled source node (oscillators, noise, LFOs)
  var listeners = {};
  var LOOKAHEAD = 0.12, TICK_MS = 25, OUTRO_SECONDS = 6;

  function emit(ev, arg) {
    var l = listeners[ev];
    if (!l || !l.length) return;
    l = l.slice();
    for (var i = 0; i < l.length; i++) {
      try { l[i](arg); } catch (err) { setTimeout(function () { throw err; }, 0); }
    }
  }

  function makeNoise(seconds, seed) {
    var n = Math.floor(ctx.sampleRate * seconds), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0), r = mulberry32(seed);
    for (var i = 0; i < n; i++) d[i] = r() * 2 - 1;
    return buf;
  }
  function makeCrackle(seed) {
    var n = Math.floor(ctx.sampleRate * 3), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0), r = mulberry32(seed), i;
    for (i = 0; i < n; i++) d[i] = (r() * 2 - 1) * 0.035;
    for (var p = 0; p < 90; p++) {
      var at = Math.floor(r() * (n - 200)), amp = 0.25 + r() * 0.7, len = 20 + Math.floor(r() * 60);
      for (i = 0; i < len; i++) d[at + i] += (r() * 2 - 1) * amp * (1 - i / len);
    }
    return buf;
  }
  function makeImpulse(seconds, seed) {
    var n = Math.floor(ctx.sampleRate * seconds), buf = ctx.createBuffer(2, n, ctx.sampleRate), r = mulberry32(seed);
    for (var c = 0; c < 2; c++) {
      var d = buf.getChannelData(c);
      for (var i = 0; i < n; i++) d[i] = (r() * 2 - 1) * Math.exp(-6.9 * i / n);
    }
    return buf;
  }

  function buildMaster() {
    var bus = ctx.createGain(); bus.gain.value = 0.45;   // keeps the compressed master peak near -6 dBFS at full volume
    var eq = ctx.createBiquadFilter(); eq.type = 'peaking'; eq.frequency.value = 1000; eq.gain.value = 0;
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12; comp.ratio.value = 4; comp.knee.value = 8; comp.attack.value = 0.004; comp.release.value = 0.18;
    var gain = ctx.createGain(); gain.gain.value = volume * volume;
    var fade = ctx.createGain(); fade.gain.value = 0;
    var analyser = ctx.createAnalyser(); analyser.fftSize = 256; analyser.smoothingTimeConstant = 0.6;
    bus.connect(eq); eq.connect(comp); comp.connect(gain); gain.connect(fade); fade.connect(analyser); analyser.connect(ctx.destination);
    master = { bus: bus, eq: eq, comp: comp, gain: gain, fade: fade, analyser: analyser };
    noiseBuffer = makeNoise(2, 1234567);
  }

  function init() {
    if (!ctx) {
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { try { ctx = new AC(); } catch (e2) { ctx = null; return null; } }
      buildMaster();
    }
    if (ctx.state === 'suspended') { try { var p = ctx.resume(); if (p && p.catch) p.catch(function () {}); } catch (e) {} }
    return ctx;
  }

  /* --- node tracking: every source is tracked until it ends; stopAll() untracks synchronously. */
  function trackNode(src, cleanup) {
    active.add(src);
    src.onended = function () {
      active.delete(src);
      try { src.disconnect(); } catch (e) {}
      if (cleanup) for (var i = 0; i < cleanup.length; i++) { try { cleanup[i].disconnect(); } catch (e) {} }
    };
    return src;
  }
  function stopAll(at) {
    active.forEach(function (n) { try { n.stop(at); } catch (e) {} });
    active.clear();
  }

  /* --- envelope: attack a, decay d to sustain s (fraction of peak), hold until t+dur, release r. Returns the end time. */
  function adsr(param, t, peak, a, d, s, dur, r) {
    var end = t + Math.max(dur, a + 0.005), sus = Math.max(peak * s, 0.0001);
    param.setValueAtTime(0.0001, t);
    param.linearRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    if (end > t + a + d) { param.exponentialRampToValueAtTime(sus, t + a + d); param.setValueAtTime(sus, end); }
    param.exponentialRampToValueAtTime(0.0001, end + r);
    return end + r;
  }
  function osc(type, freq, detune) {
    var o = ctx.createOscillator(); o.type = type; o.frequency.value = freq; if (detune) o.detune.value = detune; return o;
  }
  function noiseSrc(t, seedStep) {
    var n = ctx.createBufferSource(); n.buffer = noiseBuffer; n.loop = true;
    n.start(t, hrand(1, seedStep, 7) * 1.5);
    return n;
  }

  /* --- per-song rig: one gain per instrument group into the master bus, plus style colour (lowpass for lofi
     drums, wah for funk stabs, distortion for metal, convolver reverb for ambient, vinyl bed for lofi). */
  var CHORD_FILTER_BASE = { saw: 900, epiano: 2600, jangle: 3200, pluck: 2600, strings: 1000, pad: 1200, wah: 6000, power: 2600 };
  var SWEEPS = { intro: [0.6, 1.0], verse: [1.0, 1.6], chorus: [1.6, 2.6], bridge: [0.7, 1.2], outro: [1.4, 0.8] };

  function distortionCurve(k) {
    var n = 2048, c = new Float32Array(n);
    for (var i = 0; i < n; i++) { var x = (i * 2) / n - 1; c[i] = ((1 + k) * x) / (1 + k * Math.abs(x)); }
    return c;
  }
  function buildRig(s) {
    var st = s.style, r = { song: s, nodes: [] };
    function g(v, dest) { var n = ctx.createGain(); n.gain.value = v; n.connect(dest || master.bus); r.nodes.push(n); return n; }
    function filt(type, f, q, dest) { var n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; n.connect(dest || master.bus); r.nodes.push(n); return n; }
    master.eq.type = st.eq[0]; master.eq.frequency.value = st.eq[1]; master.eq.gain.value = st.eq[2];
    master.eq.Q.value = st.eq[0] === 'lowpass' ? 0.7 : 1;
    var drumDest = master.bus;
    if (s.styleKey === 'lofi') drumDest = filt('lowpass', 3000, 0.8);
    r.drums = g(0.9 * st.lv.drums, drumDest);
    r.bass = g(0.4 * st.lv.bass, s.styleKey === 'metal' ? filt('lowpass', 1800, 0.7) : null);
    var chordOut = master.bus;
    if (st.chord === 'power') {
      var lp = filt('lowpass', 3800, 0.8, g(0.22));           // the shaper saturates near full scale, so pad it down after
      var sh = ctx.createWaveShaper(); sh.curve = distortionCurve(60); sh.oversample = '2x'; sh.connect(lp); r.nodes.push(sh);
      chordOut = g(0.5, sh);
    } else if (st.chord === 'wah') {
      r.wah = filt('bandpass', 800, 4); chordOut = r.wah;
    }
    r.chordFilter = filt('lowpass', CHORD_FILTER_BASE[st.chord] || 2000, 0.9, chordOut);
    r.chords = g(0.24 * st.lv.chord, r.chordFilter);
    var leadOut = master.bus;
    if (s.styleKey === 'metal') {
      var llp = filt('lowpass', 4200, 0.8, g(0.35));
      var lsh = ctx.createWaveShaper(); lsh.curve = distortionCurve(30); lsh.oversample = '2x'; lsh.connect(llp); r.nodes.push(lsh);
      leadOut = g(0.5, lsh);
    }
    r.lead = g(0.26 * st.lv.lead, leadOut);
    if (s.styleKey === 'ambient') {
      var conv = ctx.createConvolver(); conv.buffer = makeImpulse(2.5, s.seed); r.nodes.push(conv);
      var rv = g(0.55); conv.connect(rv);
      r.send = g(0.6, conv);
      r.chords.connect(r.send); r.lead.connect(r.send);
    }
    if (s.styleKey === 'lofi') { r.crackleBuffer = makeCrackle(s.seed); r.crackle = g(0.08); }
    return r;
  }
  function teardownRig() {
    if (!rig) return;
    for (var i = 0; i < rig.nodes.length; i++) { try { rig.nodes[i].disconnect(); } catch (e) {} }
    rig = null;
  }
  // Track change while sounding: disconnecting the old rig at once would cut every voice (and the reverb tail)
  // from full level to zero, an audible click. Ramp the old rig's own gains to zero on the audio clock and
  // disconnect it once that ramp is over; the new song gets a fresh rig.
  function retireRig() {
    if (!rig) return;
    var old = rig, now = ctx.currentTime;
    rig = null;
    for (var i = 0; i < old.nodes.length; i++) {
      var g = old.nodes[i].gain;
      if (g && typeof g.linearRampToValueAtTime === 'function') {
        try { g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(0, now + 0.03); } catch (e) {}
      }
    }
    setTimeout(function () {
      for (var k = 0; k < old.nodes.length; k++) { try { old.nodes[k].disconnect(); } catch (e) {} }
    }, 150);
  }
  function ensureRig() {
    if (!ctx || !song) return null;
    if (!rig || rig.song !== song) { teardownRig(); rig = buildRig(song); }
    return rig;
  }
  /* ------------------------------------------------------------------ instruments */
  // Starts every source at t, stops it at end and tracks it; `cleanup` nodes are disconnected when the first source ends.
  function fire(srcs, t, end, cleanup) {
    for (var i = 0; i < srcs.length; i++) {
      var src = srcs[i];
      try { src.start(t, src._offset || 0); src.stop(end + 0.02); } catch (e) {}
      trackNode(src, i === 0 ? cleanup : null);
    }
  }
  function noise(step, salt) { var n = ctx.createBufferSource(); n.buffer = noiseBuffer; n.loop = true; n._offset = hrand(7, step, salt) * 1.5; return n; }
  function gainTo(dest, v) { var g = ctx.createGain(); g.gain.value = v == null ? 1 : v; g.connect(dest); return g; }
  function filter(type, f, q, dest) { var n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; n.connect(dest); return n; }
  function decayEnv(param, t, peak, hold, dur) {
    param.setValueAtTime(0.0001, t); param.linearRampToValueAtTime(peak, t + hold); param.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  /* --- drums */
  function drumKick(t, vel, step) {
    var o = osc('sine', 150), g = gainTo(rig.drums, 1);
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.11);
    decayEnv(g.gain, t, vel, 0.004, 0.3);
    o.connect(g); fire([o], t, t + 0.3, [g]);
    if (song.styleKey === 'electronic' || song.styleKey === 'metal') {
      var n = noise(step, 1), hp = filter('highpass', 2500, 0.7, rig.drums), cg = gainTo(hp, 1);
      decayEnv(cg.gain, t, vel * 0.35, 0.001, 0.025); n.connect(cg); fire([n], t, t + 0.03, [cg, hp]);
    }
  }
  function drumSnare(t, vel, step, brushy) {
    var dur = brushy ? 0.26 : 0.18;
    var n = noise(step, 2), bp = filter('bandpass', brushy ? 2800 : 1800, 0.9, rig.drums), g = gainTo(bp, 1);
    decayEnv(g.gain, t, vel * (brushy ? 0.45 : 0.75), 0.003, dur);
    n.connect(g); fire([n], t, t + dur, [g, bp]);
    if (!brushy) {
      var o = osc('triangle', 180), tg = gainTo(rig.drums, 1);
      o.frequency.setValueAtTime(190, t); o.frequency.exponentialRampToValueAtTime(130, t + 0.08);
      decayEnv(tg.gain, t, vel * 0.5, 0.002, 0.1); o.connect(tg); fire([o], t, t + 0.1, [tg]);
    }
  }
  function drumHat(t, vel, step, open) {
    var dur = open ? 0.25 : 0.05;
    var n = noise(step, open ? 4 : 3), hp = filter('highpass', 6000, 0.7, rig.drums), g = gainTo(hp, 1);
    decayEnv(g.gain, t, vel * (open ? 0.35 : 0.4), 0.002, dur);
    n.connect(g); fire([n], t, t + dur, [g, hp]);
  }
  function drumClap(t, vel, step) {
    var bp = filter('bandpass', 1300, 1, rig.drums), srcs = [], cleanup = [bp];
    for (var i = 0; i < 3; i++) {
      var at = t + i * 0.011, n = noise(step, 10 + i), g = gainTo(bp, 1);
      decayEnv(g.gain, at, vel * 0.55, 0.001, i === 2 ? 0.12 : 0.03);
      n.connect(g); srcs.push(n); cleanup.push(g);
      try { n.start(at, n._offset); n.stop(at + 0.15); } catch (e) {}
      trackNode(n, i === 0 ? cleanup : null);
    }
  }
  function drumRim(t, vel, step) {
    var o = osc('sine', 900), g = gainTo(rig.drums, 1);
    decayEnv(g.gain, t, vel * 0.45, 0.001, 0.035); o.connect(g); fire([o], t, t + 0.04, [g]);
    var n = noise(step, 5), hp = filter('highpass', 3000, 0.7, rig.drums), ng = gainTo(hp, 1);
    decayEnv(ng.gain, t, vel * 0.3, 0.001, 0.02); n.connect(ng); fire([n], t, t + 0.025, [ng, hp]);
  }
  function drumShaker(t, vel, step) {
    var n = noise(step, 6), hp = filter('highpass', 8000, 0.7, rig.drums), g = gainTo(hp, 1);
    decayEnv(g.gain, t, vel * 0.3, 0.01, 0.07); n.connect(g); fire([n], t, t + 0.08, [g, hp]);
  }
  function drumRide(t, vel, step) {
    var n = noise(step, 8), bp = filter('bandpass', 7500, 2.5, rig.drums), g = gainTo(bp, 1);
    decayEnv(g.gain, t, vel * 0.4, 0.003, 0.4); n.connect(g); fire([n], t, t + 0.4, [g, bp]);
    var o = osc('sine', 5100), og = gainTo(rig.drums, 1);
    decayEnv(og.gain, t, vel * 0.06, 0.002, 0.25); o.connect(og); fire([o], t, t + 0.25, [og]);
  }
  function drumConga(t, vel, step, high) {
    var f = high ? 260 : 190, o = osc('sine', f), g = gainTo(rig.drums, 1);
    o.frequency.setValueAtTime(f * 1.3, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.03);
    decayEnv(g.gain, t, vel * 0.55, 0.002, 0.14); o.connect(g); fire([o], t, t + 0.15, [g]);
  }
  function drumPizz(t, midi, vel) {
    var o = osc('triangle', midiToFreq(midi)), lp = filter('lowpass', 2200, 0.7, rig.drums), g = gainTo(lp, 1);
    decayEnv(g.gain, t, vel * 0.5, 0.003, 0.18); o.connect(g); fire([o], t, t + 0.2, [g, lp]);
  }

  /* --- bass */
  function bassNote(t, midi, dur, vel, step) {
    var kind = song.style.bass, f = midiToFreq(midi), g = gainTo(rig.bass, 1), srcs, end;
    if (kind === 'sub') {
      var o = osc('sine', f), tr = osc('triangle', f), tg = gainTo(g, 0.3);
      o.frequency.setValueAtTime(f * 1.5, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
      end = adsr(g.gain, t, vel, 0.01, 0.25, 0.6, dur, 0.12);
      o.connect(g); tr.connect(tg); fire([o, tr], t, end, [g, tg]);
      return;
    }
    if (kind === 'drone' || kind === 'cello') {
      var a = osc('triangle', f), b = osc('sawtooth', f, 4), lp = filter('lowpass', kind === 'cello' ? 900 : 700, 0.8, g), bg = gainTo(lp, 0.3);
      end = adsr(g.gain, t, vel * 0.9, kind === 'cello' ? 0.12 : 0.8, 0.3, 0.9, dur, kind === 'cello' ? 0.15 : 0.5);
      a.connect(lp); b.connect(bg); fire([a, b], t, end, [g, lp, bg]);
      return;
    }
    var tri = osc('triangle', f), saw = osc('sawtooth', f), lpf = filter('lowpass', 1600, 1.2, g), sg = gainTo(lpf, kind === 'chug' ? 0.6 : 0.35);
    var open = kind === 'funk' ? 2600 : kind === 'chug' ? 1100 : 1600, close = kind === 'funk' ? 380 : 320;
    lpf.frequency.setValueAtTime(open, t); lpf.frequency.exponentialRampToValueAtTime(close, t + (kind === 'funk' ? 0.08 : 0.2));
    var rel = kind === 'chug' ? 0.03 : 0.05;
    end = adsr(g.gain, t, vel, 0.006, 0.12, 0.7, dur, rel);
    tri.connect(lpf); saw.connect(sg); fire([tri, saw], t, end, [g, lpf, sg]);
  }
  /* --- chords / pads: one gain per chord hit; every voice has an attack and a release so nothing clicks. */
  function vibratoLfo(target, rate, cents, srcs, cleanup, t, delay) {
    var lfo = osc('sine', rate), lg = gainTo(target, cents);
    if (delay) { lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(cents, t + delay); }
    lfo.connect(lg); srcs.push(lfo); cleanup.push(lg);
  }
  function chordHit(t, notes, dur, vel, step) {
    var kind = song.style.chord, sk = song.styleKey, g = gainTo(rig.chords, 1), srcs = [], cleanup = [g], end, i, f, a, b, c, sub;
    var lofiDetune = sk === 'lofi' ? (hrand(song.seed, step, 21) - 0.5) * 14 : 0;
    switch (kind) {
      case 'saw': {
        var spread = sk === 'electronic' ? 12 : 7, stab = sk === 'electronic' || dur < 0.2;
        end = adsr(g.gain, t, vel * 0.5, stab ? 0.005 : 0.012, 0.15, 0.7, dur, stab ? 0.05 : 0.09);
        for (i = 0; i < notes.length; i++) {
          f = midiToFreq(notes[i]); a = osc('sawtooth', f, spread); b = osc('sawtooth', f, -spread);
          a.connect(g); b.connect(g); srcs.push(a, b);
        }
        break;
      }
      case 'epiano': {
        end = adsr(g.gain, t, vel * 0.6, 0.008, 0.45, 0.35, dur, 0.25);
        for (i = 0; i < notes.length; i++) {
          f = midiToFreq(notes[i]); a = osc('sine', f, lofiDetune); b = osc('triangle', f, lofiDetune); c = osc('sine', f * 2, lofiDetune);
          sub = gainTo(g, 0.4); var hg = gainTo(g, 1); decayEnv(hg.gain, t, 0.25, 0.005, 0.35);
          a.connect(g); b.connect(sub); c.connect(hg); srcs.push(a, b, c); cleanup.push(sub, hg);
        }
        if (sk === 'lofi') {   // one slow wobble LFO shared by every oscillator of the chord (tape-style pitch drift)
          var lfo = osc('sine', 0.45), lg = gainTo(srcs[0].detune, 6), nsrc = srcs.length;
          for (i = 1; i < nsrc; i++) lg.connect(srcs[i].detune);
          lfo.connect(lg); srcs.push(lfo); cleanup.push(lg);
        }
        break;
      }
      case 'jangle': {
        end = adsr(g.gain, t, vel * 0.55, 0.004, 0.25, 0.4, dur, 0.12);
        for (i = 0; i < notes.length; i++) {
          f = midiToFreq(notes[i]); a = osc('sawtooth', f, 5); b = osc('triangle', f); sub = gainTo(g, 0.5);
          a.connect(sub); b.connect(g); srcs.push(a, b); cleanup.push(sub);
        }
        break;
      }
      case 'pluck': {
        end = adsr(g.gain, t, vel * 0.7, 0.003, 0.5, 0.05, Math.min(dur, 0.9), 0.08);
        for (i = 0; i < notes.length; i++) {
          f = midiToFreq(notes[i]); var at = t + i * 0.016;
          a = osc('sine', f); b = osc('triangle', f); sub = gainTo(g, 0.5);
          a.connect(g); b.connect(sub); cleanup.push(sub);
          try { a.start(at); b.start(at); a.stop(end + 0.02); b.stop(end + 0.02); } catch (e) {}
          trackNode(a, i === 0 ? cleanup : null); trackNode(b, null);
        }
        var n = noise(step, 30), bp = filter('bandpass', 2600, 1.5, g), ng = gainTo(bp, 1);
        decayEnv(ng.gain, t, vel * 0.18, 0.001, 0.03); n.connect(ng); cleanup.push(bp, ng);
        fire([n], t, t + 0.04, null);
        return;
      }
      case 'strings': case 'pad': {
        var pad = kind === 'pad';
        end = adsr(g.gain, t, vel * (pad ? 0.7 : 0.5), pad ? 1.2 : 0.15, 0.4, 0.85, dur, pad ? 1.5 : 0.3);
        for (i = 0; i < notes.length; i++) {
          f = midiToFreq(notes[i]); a = osc('sawtooth', f, 6); b = osc('sawtooth', f, -6); c = osc('triangle', f); sub = gainTo(g, 0.6);
          a.connect(sub); b.connect(sub); c.connect(g); srcs.push(a, b, c); cleanup.push(sub);
        }
        vibratoLfo(srcs[0].detune, 4.5, 4, srcs, cleanup, t, 0.5);
        break;
      }
      case 'wah': {
        end = adsr(g.gain, t, vel * 0.6, 0.003, 0.08, 0.3, dur, 0.04);
        var up = step % 2 === 0;
        rig.wah.frequency.cancelScheduledValues(t);
        rig.wah.frequency.setValueAtTime(up ? 350 : 2000, t);
        rig.wah.frequency.exponentialRampToValueAtTime(up ? 2000 : 350, t + Math.max(dur, 0.08));
        for (i = 0; i < notes.length; i++) {
          f = midiToFreq(notes[i]); a = osc('sawtooth', f, 6); b = osc('sawtooth', f, -6); a.connect(g); b.connect(g); srcs.push(a, b);
        }
        break;
      }
      case 'power': {
        var muted = dur < 0.2;
        end = adsr(g.gain, t, vel * 0.55, 0.005, 0.1, muted ? 0.5 : 0.8, dur, muted ? 0.03 : 0.06);
        for (i = 0; i < notes.length; i++) {
          f = midiToFreq(notes[i]); a = osc('sawtooth', f, 8); b = osc('sawtooth', f, -8); a.connect(g); b.connect(g); srcs.push(a, b);
        }
        break;
      }
      default: {
        end = adsr(g.gain, t, vel * 0.5, 0.01, 0.2, 0.6, dur, 0.1);
        for (i = 0; i < notes.length; i++) { a = osc('triangle', midiToFreq(notes[i])); a.connect(g); srcs.push(a); }
      }
    }
    fire(srcs, t, end, cleanup);
  }

  /* --- lead melody */
  function leadNote(t, midi, dur, vel, step, doubled) {
    var kind = song.style.lead, f = midiToFreq(midi), g = gainTo(rig.lead, 1), srcs = [], cleanup = [g], end, a, b, c, lp, sub;
    switch (kind) {
      case 'vibrato': {
        a = osc(song.leadWave < 0.5 ? 'sine' : 'triangle', f); a.connect(g); srcs.push(a);
        if (doubled) { b = osc('triangle', f * 2); sub = gainTo(g, 0.35); b.connect(sub); srcs.push(b); cleanup.push(sub); }
        vibratoLfo(a.detune, 5.5, 7, srcs, cleanup, t, 0.12);
        end = adsr(g.gain, t, vel * 0.8, 0.02, 0.1, 0.8, dur, 0.12);
        break;
      }
      case 'bell': {
        a = osc('sine', f); b = osc('sine', f * 3); c = osc('sine', f * 2);
        var bg = gainTo(g, 1), cg = gainTo(g, 1); decayEnv(bg.gain, t, 0.18, 0.002, 0.25); decayEnv(cg.gain, t, 0.1, 0.002, 0.5);
        a.connect(g); b.connect(bg); c.connect(cg); srcs.push(a, b, c); cleanup.push(bg, cg);
        end = adsr(g.gain, t, vel * 0.8, 0.004, 0.6, 0.15, dur, 0.3);
        break;
      }
      case 'sawlead': {
        lp = filter('lowpass', 2800, 1, g); a = osc('sawtooth', f); a.connect(lp); srcs.push(a); cleanup.push(lp);
        if (doubled) { b = osc('sawtooth', f, 10); b.connect(lp); srcs.push(b); }
        vibratoLfo(a.detune, 5, 10, srcs, cleanup, t, 0.2);
        end = adsr(g.gain, t, vel * 0.6, 0.01, 0.15, 0.75, dur, 0.1);
        break;
      }
      case 'square': {
        lp = filter('lowpass', 2200, 1.5, g); a = osc('square', f); a.connect(lp); srcs.push(a); cleanup.push(lp);
        if (doubled) { b = osc('square', f, -8); b.connect(lp); srcs.push(b); }
        end = adsr(g.gain, t, vel * 0.5, 0.003, 0.08, 0.6, dur, 0.05);
        break;
      }
      case 'piano': {
        a = osc('sine', f); b = osc('sine', f * 2); c = osc('sine', f * 3);
        var g2 = gainTo(g, 1), g3 = gainTo(g, 1); decayEnv(g2.gain, t, 0.35, 0.002, 0.4); decayEnv(g3.gain, t, 0.15, 0.002, 0.2);
        a.connect(g); b.connect(g2); c.connect(g3); srcs.push(a, b, c); cleanup.push(g2, g3);
        if (doubled) { var d = osc('sine', f * 2); var dg = gainTo(g, 0.4); d.connect(dg); srcs.push(d); cleanup.push(dg); }
        end = adsr(g.gain, t, vel * 0.9, 0.003, 0.5, 0.25, dur, 0.2);
        break;
      }
      case 'sax': {
        lp = filter('lowpass', 1800, 1.2, g); a = osc('sawtooth', f); b = osc('triangle', f); sub = gainTo(lp, 0.6);
        a.connect(sub); b.connect(lp); srcs.push(a, b); cleanup.push(lp, sub);
        vibratoLfo(a.detune, 5, 9, srcs, cleanup, t, 0.15); vibratoLfo(b.detune, 5, 9, srcs, cleanup, t, 0.15);
        end = adsr(g.gain, t, vel * 0.6, 0.04, 0.2, 0.7, dur, 0.12);
        break;
      }
      case 'bellpad': {
        a = osc('sine', f); b = osc('sine', f * 2); sub = gainTo(g, 0.3); a.connect(g); b.connect(sub); srcs.push(a, b); cleanup.push(sub);
        end = adsr(g.gain, t, vel * 0.7, 0.4, 0.5, 0.8, dur, 1.0);
        break;
      }
      case 'flute': {
        a = osc('sine', f); b = osc('triangle', f); sub = gainTo(g, 0.25); a.connect(g); b.connect(sub); srcs.push(a, b); cleanup.push(sub);
        var n = noise(step, 40), bp = filter('bandpass', 2500, 1, g), ng = gainTo(bp, 0.05); n.connect(ng); srcs.push(n); cleanup.push(bp, ng);
        vibratoLfo(a.detune, 4.5, 6, srcs, cleanup, t, 0.2);
        end = adsr(g.gain, t, vel * 0.8, 0.06, 0.1, 0.85, dur, 0.15);
        break;
      }
      case 'trumpet': {
        lp = filter('lowpass', 2600, 1, g); a = osc('sawtooth', f); a.connect(lp); srcs.push(a); cleanup.push(lp);
        lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(2800, t + 0.06);
        vibratoLfo(a.detune, 6, 7, srcs, cleanup, t, 0.15);
        end = adsr(g.gain, t, vel * 0.55, 0.03, 0.1, 0.8, dur, 0.08);
        break;
      }
      case 'clav': {
        lp = filter('lowpass', 3500, 2, g); a = osc('square', f); b = osc('sawtooth', f, 4); sub = gainTo(lp, 0.5);
        a.connect(sub); b.connect(lp); srcs.push(a, b); cleanup.push(lp, sub);
        end = adsr(g.gain, t, vel * 0.45, 0.002, 0.12, 0.3, Math.min(dur, 0.35), 0.05);
        break;
      }
      default: {
        a = osc('triangle', f); a.connect(g); srcs.push(a);
        end = adsr(g.gain, t, vel * 0.7, 0.01, 0.1, 0.7, dur, 0.1);
      }
    }
    fire(srcs, t, end, cleanup);
  }

  /* --- style beds: the looped vinyl crackle of lofi, started with playback and tracked like any source. */
  function startBeds(t) {
    if (!rig || !rig.crackle) return;
    var n = ctx.createBufferSource(); n.buffer = rig.crackleBuffer; n.loop = true;
    var bp = filter('bandpass', 4000, 0.6, rig.crackle); n.connect(bp);
    try { n.start(t); } catch (e) {}
    trackNode(n, [bp]);
  }
  /* ------------------------------------------------------------------ step rendering (song model -> notes) */
  function songToCtx(sec) { return playStartCtx + (sec - playOffset); }
  function currentTimeNow() {
    if (state === 'playing' && ctx && song) return clamp(ctx.currentTime - playStartCtx + playOffset, 0, song.duration);
    return position;
  }
  function has(arr, v) { return Array.isArray(arr) && arr.indexOf(v) >= 0; }
  function onGrid(spec, s16) { if (spec === 'h8') return s16 % 2 === 0; if (spec === 'h16') return true; return has(spec, s16); }

  function scheduleDrums(step, s16, bar, info, t) {
    var pat = DRUMS[song.styleKey], sk = song.styleKey, sec = info.name;
    if (!pat || sec === 'ambient') return;
    var h = hrand(song.seed, step, 50), vel = 0.85 + 0.15 * h, lvl = 1;
    var fillBar = info.last && info.bars >= 2 && (sec === 'intro' || sec === 'verse' || sec === 'chorus' || sec === 'bridge');
    if (sec === 'intro' && !(fillBar && s16 >= 12)) return;          // intro: pads and keys only (a fill leads into the verse)
    if (sec === 'outro' && info.last) lvl = 0.6;
    if (sk === 'classical') {                                        // soft pizzicato pulse instead of drums
      if (s16 % 4 === 0 && sec !== 'bridge') drumPizz(t, (s16 === 4 || s16 === 12 ? song.chords[bar].fifth : song.chords[bar].root) + 12, 0.7 * lvl);
      return;
    }
    var chorus = sec === 'chorus', sparse = sec === 'bridge';
    var kicks = chorus && pat.chorusKick ? pat.chorusKick : pat.kick;
    var kickHit = kicks === 'h16' ? true : has(kicks, s16);
    if (sparse) kickHit = s16 === 0 || s16 === 8;
    if (kickHit) drumKick(t, vel * lvl, step);
    var snareHit = has(pat.snare, s16);
    if (sparse) snareHit = s16 === 12;
    if (fillBar && s16 >= 12 && (pat.snare || pat.brush)) { snareHit = true; vel = 0.55 + 0.12 * (s16 - 12); }
    if (snareHit) drumSnare(t, vel * lvl, step, sk === 'jazz');
    if (has(pat.clap, s16) && !sparse) drumClap(t, vel * 0.9 * lvl, step);
    if (has(pat.brush, s16) || (sk === 'jazz' && h < 0.25 && s16 % 2 === 1)) drumSnare(t, 0.45 * lvl, step, true);
    if (has(pat.rim, s16)) drumRim(t, vel * lvl, step);
    if (has(pat.conga, s16)) drumConga(t, vel * lvl, step, s16 === 4 || s16 === 12 || s16 === 14);
    var hatSpec = pat.hat;
    if (chorus && hatSpec === 'h8') hatSpec = 'h16';
    if (sparse && hatSpec === 'h16') hatSpec = 'h8';
    var hatVel = (s16 % 4 === 0 ? 0.9 : s16 % 2 === 0 ? 0.7 : 0.5) * lvl;
    if (onGrid(hatSpec, s16)) drumHat(t, hatVel, step, false);
    if (has(pat.openhat, s16) && !sparse) drumHat(t, 0.8 * lvl, step, true);
    if (onGrid(pat.shaker, s16)) drumShaker(t, (s16 % 4 === 0 ? 0.9 : 0.6) * lvl, step);
    if (has(pat.ride, s16)) drumRide(t, (s16 % 4 === 0 ? 0.9 : 0.65) * lvl, step);
  }

  function scheduleBass(step, s16, bar, info, t) {
    var kind = song.style.bass, pat = BASS[kind];
    if (!pat || info.name === 'intro') return;
    if (kind === 'drone' && bar % 2 === 1) return;
    var ch = song.chords[bar], sparse = info.name === 'bridge', held = kind === 'drone' || kind === 'cello' || kind === 'walking';
    for (var i = 0; i < pat.length; i++) {
      var ev = pat[i];
      if (ev[0] !== s16) continue;
      if (sparse && !held && s16 !== 0) continue;                      // bridge: one held root per bar
      var tone = ev[1], midi = ch.root;
      if (tone === '5') midi = ch.fifth; else if (tone === '3') midi = ch.third; else if (tone === 'o') midi = ch.root + 12;
      else if (tone === 'a') midi = ch.nextRoot + (ch.nextRoot > ch.root ? -1 : 1);
      var steps = sparse && !held ? 14 : ev[2];
      var vel = (0.8 + 0.2 * hrand(song.seed, step, 60)) * (info.name === 'chorus' ? 1.05 : 1);
      bassNote(t, midi, steps * song.stepDuration * 0.9, vel, step);
    }
  }

  function scheduleChords(step, s16, bar, info, t) {
    var st = song.style, kind = st.chord;
    var rhythm = CHORD_RHYTHM_BY_STYLE[song.styleKey] || CHORDS[kind] || CHORDS.saw;
    var list = info.name === 'chorus' ? rhythm.chorus : rhythm.verse;
    var ch = song.chords[bar], padLike = kind === 'pad' || kind === 'strings';
    var sparse = (info.name === 'bridge' || info.name === 'intro') && !padLike;
    if (song.chordBars === 2 && bar % 2 === 1) return;
    // The sparse comping keeps only the hits on beats 1 and 3. A rhythm with no hit there (the electronic
    // offbeat stabs) would leave the intro and the bridge with no chords at all, and the intro has nothing
    // else, so such a rhythm comps on 1 and 3 instead.
    if (sparse) {
      var anchored = false;
      for (var a = 0; a < list.length; a++) if (list[a][0] === 0 || list[a][0] === 8) { anchored = true; break; }
      if (!anchored) list = [[0, 8], [8, 8]];
    }
    for (var i = 0; i < list.length; i++) {
      var ev = list[i];
      if (ev[0] !== s16) continue;
      if (sparse && s16 !== 0 && s16 !== 8) continue;                   // thinner comping in the intro and the bridge
      var notes = kind === 'power' ? ch.power : (info.name === 'chorus' || info.name === 'bridge') ? ch.seventh : ch.triad;
      var steps = sparse ? 8 : ev[1];
      var vel = (s16 % 4 === 0 ? 0.9 : 0.7) * (0.9 + 0.2 * hrand(song.seed, step, 70)) * (info.name === 'intro' ? 0.8 : 1);
      chordHit(t, notes, steps * song.stepDuration * 0.95, vel, step);
    }
  }

  function scheduleLead(step, s16, bar, info, t) {
    var sec = info.name;
    if (sec === 'intro') return;
    if (sec === 'outro' && info.idx >= Math.ceil(info.bars / 2)) return;   // the melody leaves half-way through the outro
    var phraseIdx = Math.floor(info.idx / 2), inPhrase = (info.idx % 2) * 16 + s16;
    var notes = phraseNotes(song, phraseIdx, sec), ch = song.chords[bar];
    for (var i = 0; i < notes.length; i++) {
      var n = notes[i];
      if (n.step !== inPhrase) continue;
      var idx = (ch.degree - 1) + n.rel;
      var midi = song.leadBase + song.scale[mod(idx, 7)] + 12 * Math.floor(idx / 7);
      if (midi > song.leadBase + 19) midi -= 12;
      if (midi < song.leadBase - 5) midi += 12;
      var doubled = false;
      if (sec === 'chorus') { if (song.chorusMode === 'octave') midi += 12; else doubled = true; }
      var vel = n.vel * (sec === 'chorus' ? 1 : sec === 'bridge' ? 0.6 : 0.8) * (0.9 + 0.2 * hrand(song.seed, step, 80));
      leadNote(t, midi, n.len * song.stepDuration * (sec === 'bridge' ? 1 : 0.9), vel, step, doubled);
    }
  }

  // Gentle lowpass sweep on the chord bus across each section (re-anchored when playback (re)starts mid-section).
  function scheduleSweep(info, t, songTime) {
    var st = song.style, base = CHORD_FILTER_BASE[st.chord] || 2000, sw = SWEEPS[info.name] || [1, 1];
    var secStart = info.section.startBar * song.barDuration, secEnd = (info.section.startBar + info.section.bars) * song.barDuration;
    var frac = clamp((songTime - secStart) / Math.max(secEnd - secStart, 0.001), 0, 1);
    var f0 = clamp(base * (sw[0] + (sw[1] - sw[0]) * frac), 80, 18000), f1 = clamp(base * sw[1], 80, 18000);
    var p = rig.chordFilter.frequency;
    p.cancelScheduledValues(t); p.setValueAtTime(f0, t); p.linearRampToValueAtTime(f1, Math.max(t + 0.01, songToCtx(secEnd)));
  }

  function scheduleStep(step, t) {
    var bar = Math.floor(step / 16), s16 = step % 16;
    if (bar >= song.totalBars) return;
    var info = song.bars[bar];
    if (s16 % 2 === 1) t += song.swing * song.stepDuration;
    if (sweepPending || (s16 === 0 && info.first)) { scheduleSweep(info, t, step * song.stepDuration); sweepPending = false; }
    scheduleDrums(step, s16, bar, info, t);
    scheduleBass(step, s16, bar, info, t);
    scheduleChords(step, s16, bar, info, t);
    scheduleLead(step, s16, bar, info, t);
  }

  /* ------------------------------------------------------------------ lookahead scheduler + transport */
  function clearTimer() { if (timer) { clearInterval(timer); timer = null; } }
  function scheduleAhead(now) {
    var hidden = root.document && root.document.hidden;
    var horizon = now + (hidden ? 1.6 : LOOKAHEAD);       // background tabs throttle timers; look further ahead there
    // A main-thread stall longer than the lookahead leaves steps in the past. Scheduling them all "now" would
    // fire them in one loud burst, so skip them: the grid resumes on time and held voices are re-triggered.
    if (now > playStartCtx && nextStepTime < now - 0.02) {
      var skip = Math.ceil((now - 0.02 - nextStepTime) / song.stepDuration);
      nextStep += skip; nextStepTime += skip * song.stepDuration;
      sweepPending = true;
      var resumePos = nextStep * song.stepDuration;
      if (resumePos < song.duration) catchUpSustained(Math.max(nextStepTime, now + 0.003), resumePos);
    }
    while (nextStepTime < horizon) {
      var songT = nextStep * song.stepDuration;
      if (songT >= song.duration) break;
      // never before the playback start: after a seek the first (partial) step would otherwise sound under the
      // seek's own fade-out and be chopped by it
      scheduleStep(nextStep, Math.max(nextStepTime, playStartCtx, now + 0.003));
      nextStep++; nextStepTime += song.stepDuration;
    }
  }
  function tick() {
    if (state !== 'playing' || !ctx || !song) return;
    var now = ctx.currentTime;
    scheduleAhead(now);
    var ct = now - playStartCtx + playOffset;
    if (++tickCount % 10 === 0) emit('timeupdate', clamp(ct, 0, song.duration));
    if (ct >= song.duration) finish();
  }
  // When playback (re)starts in the middle of a long sustained note (ambient pads, classical strings and cello,
  // the ambient drone), re-trigger it with its remaining length so a seek or resume is never silent until the next onset.
  function catchUpSustained(at, pos) {
    var step = Math.floor(pos / song.stepDuration + 1e-6), bar = Math.floor(step / 16);
    if (bar >= song.totalBars) return;
    var info = song.bars[bar], st = song.style, kind = st.chord, i;
    if (kind === 'pad' || kind === 'strings') {
      var onsetBar = song.chordBars === 2 ? bar - (bar % 2) : bar;
      var rhythm = CHORD_RHYTHM_BY_STYLE[song.styleKey] || CHORDS[kind], list = info.name === 'chorus' ? rhythm.chorus : rhythm.verse;
      for (i = 0; i < list.length; i++) {
        var onset = onsetBar * 16 + list[i][0], endStep = onset + list[i][1];
        if (step > onset && step < endStep) {
          var ch = song.chords[onsetBar], notes = (info.name === 'chorus' || info.name === 'bridge') ? ch.seventh : ch.triad;
          chordHit(at, notes, (endStep * song.stepDuration - pos) * 0.95, info.name === 'intro' ? 0.7 : 0.85, onset);
        }
      }
    }
    if ((st.bass === 'drone' || st.bass === 'cello') && info.name !== 'intro') {
      var bOnsetBar = st.bass === 'drone' ? bar - (bar % 2) : bar, len = st.bass === 'drone' ? 32 : 16;
      var bOnset = bOnsetBar * 16, bEnd = bOnset + len;
      if (step > bOnset && step < bEnd && song.bars[bOnsetBar].name !== 'intro') bassNote(at, song.chords[bOnsetBar].root, (bEnd * song.stepDuration - pos) * 0.9, 0.85, bOnset);
    }
  }
  // Starts the scheduler at ctx time `at` from song position `pos`; the fade gain ramps up from `fadeFrom` at `at`.
  function startPlayback(at, pos, fadeFrom) {
    ensureRig();
    playStartCtx = at; playOffset = pos;
    nextStep = Math.floor(pos / song.stepDuration + 1e-6);
    nextStepTime = at + (nextStep * song.stepDuration - pos);
    sweepPending = true; tickCount = 0;
    catchUpSustained(at, pos);
    var f = master.fade.gain, outroStart = song.duration - OUTRO_SECONDS;
    var level = pos < outroStart ? 1 : clamp((song.duration - pos) / OUTRO_SECONDS, 0, 1);
    var rampEnd = at + 0.03, tEnd = songToCtx(song.duration);
    f.cancelScheduledValues(at);
    f.setValueAtTime(clamp(fadeFrom, 0, 1), at);
    f.linearRampToValueAtTime(level, rampEnd);
    if (tEnd > rampEnd) {
      var tO = songToCtx(outroStart);
      if (pos < outroStart && tO > rampEnd) f.setValueAtTime(1, tO);
      f.linearRampToValueAtTime(0, tEnd);
    } else f.setValueAtTime(0, rampEnd);
    startBeds(at);
    state = 'playing';
    scheduleAhead(ctx.currentTime);
    clearTimer(); timer = setInterval(tick, TICK_MS);
  }
  // Stops scheduling and every sounding node after a 30ms fade; keeps `position` at the current time.
  function pausePlayback() {
    var now = ctx.currentTime, f = master.fade.gain;
    position = clamp(now - playStartCtx + playOffset, 0, song.duration);
    clearTimer();
    f.cancelScheduledValues(now); f.setValueAtTime(f.value, now); f.linearRampToValueAtTime(0, now + 0.03);
    stopAll(now + 0.04);
    fadeOutUntil = now + 0.04;   // a play() before this time starts after the fade-out instead of cancelling it
  }
  // Seamless jump while playing: fade out, stop the old nodes, restart the grid from `pos`, fade back in.
  function restartAt(pos) {
    var now = ctx.currentTime, f = master.fade.gain, at = now + 0.03;
    clearTimer();
    f.cancelScheduledValues(now); f.setValueAtTime(f.value, now); f.linearRampToValueAtTime(0, now + 0.025);
    stopAll(at);
    startPlayback(at, pos, 0);
  }
  function begin() {
    var now = ctx.currentTime;
    // Right after a pause or a track change the fade-out to zero is still running and the old nodes still
    // sound until fadeOutUntil: start after it from silence, so the ramp is not cancelled at full level.
    if (fadeOutUntil > now + 0.01) startPlayback(fadeOutUntil, position, 0);
    else startPlayback(now + 0.01, position, master.fade.gain.value);
    emit('statechange', 'playing');
  }
  function finish() {
    var myGen = ++gen, now = ctx.currentTime;
    clearTimer();
    stopAll(now);
    master.fade.gain.cancelScheduledValues(now); master.fade.gain.setValueAtTime(0, now);
    position = song.duration; state = 'idle';
    emit('ended');
    if (gen === myGen && state === 'idle') emit('statechange', 'idle');
  }

  /* ------------------------------------------------------------------ public API */
  var engine = {
    init: function () { return init(); },
    load: function (tr) {
      gen++; pendingPlay = null;
      if (state === 'playing') { pausePlayback(); retireRig(); }
      else { if (ctx && active.size) stopAll(ctx.currentTime); teardownRig(); }
      if (!tr || typeof tr !== 'object') { track = null; song = null; position = 0; state = 'idle'; emit('loaded', null); return; }
      track = tr; song = buildSong(tr); position = 0; state = 'paused';
      emit('loaded', tr);
    },
    play: function () {
      if (!track || !song) return Promise.resolve(false);
      var c = init();
      if (!c) return Promise.resolve(false);
      if (state === 'playing') return Promise.resolve(true);
      if (pendingPlay) return pendingPlay;
      if (state === 'idle') position = 0;
      var myGen = ++gen;
      function go() { if (state === 'playing') return true; if (gen !== myGen || !song) return false; begin(); return true; }
      if (c.state === 'running') return Promise.resolve(go());
      var p = new Promise(function (resolve) {
        var settled = false;
        function done() {
          if (settled) return;
          settled = true; pendingPlay = null;
          resolve(c.state === 'running' && gen === myGen ? go() : false);
        }
        try { c.resume().then(done, done); } catch (e) { done(); }
        setTimeout(done, 1200);
      });
      pendingPlay = p;
      return p;
    },
    pause: function () {
      if (!track || state !== 'playing') return;
      gen++; pausePlayback(); state = 'paused';
      emit('statechange', 'paused');
    },
    seek: function (seconds) {
      if (!track || !song) return;
      var s = clamp(Number(seconds) || 0, 0, song.duration);
      // Only a seek while playing is a transition. Not playing, it just moves the resume point, which a
      // pending play() (context still resuming) picks up, so it must not invalidate that play().
      if (state === 'playing') { gen++; restartAt(s); }
      else { position = s; if (state === 'idle') state = 'paused'; }
    },
    stop: function () {
      if (!track) return;
      gen++; pendingPlay = null;
      if (state === 'playing') pausePlayback(); else if (ctx) stopAll(ctx.currentTime);
      position = 0;
      var prev = state; state = 'idle';
      if (prev !== 'idle') emit('statechange', 'idle');
    },
    setVolume: function (v) {
      volume = clamp(Number(v) || 0, 0, 1);
      if (master) { var now = ctx.currentTime; master.gain.gain.cancelScheduledValues(now); master.gain.gain.setTargetAtTime(volume * volume, now, 0.015); }
    },
    getVolume: function () { return volume; },
    activeNodeCount: function () { return active.size; },
    on: function (ev, fn) { if (typeof fn === 'function') (listeners[ev] = listeners[ev] || []).push(fn); return engine; },
    off: function (ev, fn) { var l = listeners[ev]; if (l) { var i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); } return engine; },
    // Extras (not in the contract): average analyser level 0..1 for visualisers, the style list, the pure song builder.
    level: function () {
      if (!master) return 0;
      var a = master.analyser, data = new Uint8Array(a.frequencyBinCount), sum = 0;
      a.getByteFrequencyData(data);
      for (var i = 0; i < data.length; i++) sum += data[i];
      return sum / data.length / 255;
    },
    styleKeys: STYLE_KEYS.slice(),
    buildSong: buildSong
  };
  Object.defineProperties(engine, {
    currentTime: { get: currentTimeNow, enumerable: true },
    duration: { get: function () { return song ? song.duration : 0; }, enumerable: true },
    state: { get: function () { return state; }, enumerable: true },
    track: { get: function () { return track; }, enumerable: true },
    song: { get: function () { return song; }, enumerable: true },
    analyser: { get: function () { return master ? master.analyser : null; }, enumerable: true },
    context: { get: function () { return ctx; }, enumerable: true }
  });

  root.AudioEngine = engine;
  if (typeof module !== 'undefined' && module.exports) module.exports = engine;
})();
