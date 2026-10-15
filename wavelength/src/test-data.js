/* test-data.js — Node unit tests for data.js. Run: node src/test-data.js (exit code 1 on failure). */
'use strict';
const path = require('path');
const fs = require('fs');

const dataPath = path.join(__dirname, 'data.js');
const Catalog = require(dataPath);

let failures = 0, passes = 0;
function check(cond, msg) {
  if (cond) { passes++; return; }
  failures++;
  console.error('FAIL: ' + msg);
}
function eq(actual, expected, msg) {
  check(actual === expected, msg + ' (expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual) + ')');
}
const HEX = /^#[0-9a-f]{6}$/;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

// --- globals ------------------------------------------------------------------------
check(globalThis.Catalog === Catalog, 'data.js attaches Catalog to globalThis in Node');
check(typeof Catalog.get === 'function', 'Catalog.get exists');

// --- counts --------------------------------------------------------------------------
const { genres, artists, albums, tracks, playlists } = Catalog;
eq(genres.length, 16, 'sixteen genre/browse entries');
eq(artists.length, 18, 'eighteen artists');
check(albums.length >= 32 && albums.length <= 42, 'about 36 albums (got ' + albums.length + ')');
check(tracks.length >= 300 && tracks.length <= 360, '300-360 tracks (got ' + tracks.length + ')');
eq(playlists.length, 15, 'fifteen playlists');

// --- unique ids ----------------------------------------------------------------------
const all = [].concat(genres, artists, albums, tracks, playlists);
const ids = new Set(all.map((e) => e.id));
eq(ids.size, all.length, 'every id is unique across all entity types');
all.forEach((e) => check(Catalog.get(e.id) === e, 'get() resolves ' + e.id));
check(Catalog.get('nope') === undefined, 'get() of an unknown id is undefined');

// --- genres ---------------------------------------------------------------------------
const styleKeys = ['pop', 'hiphop', 'rock', 'indie', 'electronic', 'lofi', 'jazz', 'classical', 'ambient', 'rnb', 'folk', 'latin', 'funk', 'metal'];
styleKeys.forEach((k) => {
  const g = Catalog.genre('ge_' + k);
  check(g && g.styleKey === k && g.name && g.description, 'genre ge_' + k + ' exists with styleKey, name and description');
});
check(Catalog.genre('ge_newreleases') && Catalog.genre('ge_newreleases').styleKey === null && Catalog.genre('ge_newreleases').name === 'New Releases', 'ge_newreleases browse entry');
check(Catalog.genre('ge_charts') && Catalog.genre('ge_charts').styleKey === null && Catalog.genre('ge_charts').name === 'Charts', 'ge_charts browse entry');
eq(new Set(genres.map((g) => g.color)).size, 16, 'every genre colour is distinct');
genres.forEach((g) => check(HEX.test(g.color), 'genre colour is lowercase 6-digit hex: ' + g.id));

// --- artists --------------------------------------------------------------------------
artists.forEach((a) => {
  check(a.id.startsWith('ar_'), 'artist id prefix ' + a.id);
  check(typeof a.name === 'string' && a.name.length > 1, 'artist has a name ' + a.id);
  check(Array.isArray(a.genreIds) && a.genreIds.length >= 1, 'artist has genres ' + a.id);
  a.genreIds.forEach((g) => check(Catalog.genre(g) && Catalog.genre(g).styleKey, 'artist genre resolves to a real genre: ' + a.id + ' ' + g));
  const sentences = (a.bio.match(/[.!?](\s|$)/g) || []).length;
  check(sentences >= 2 && sentences <= 3, 'bio has 2-3 sentences: ' + a.id + ' (' + sentences + ')');
  check(Number.isInteger(a.monthlyListeners) && a.monthlyListeners > 0, 'monthlyListeners ' + a.id);
  check(Number.isInteger(a.followers) && a.followers > 0 && a.followers < a.monthlyListeners, 'followers ' + a.id);
  check(typeof a.verified === 'boolean', 'verified is boolean ' + a.id);
  check(Number.isInteger(a.imageSeed), 'imageSeed is an int ' + a.id);
  check(HEX.test(a.color), 'artist colour hex ' + a.id);
  const own = albums.filter((al) => al.artistId === a.id);
  check(own.length >= 2 && own.length <= 3, 'artist has 2-3 releases: ' + a.id + ' (' + own.length + ')');
});
check(artists.some((a) => !a.verified), 'at least one artist is not verified');
const typesUsed = new Set(albums.map((a) => a.type));
check(typesUsed.has('album') && typesUsed.has('ep') && typesUsed.has('single'), 'album, ep and single types are all used');

// --- albums ---------------------------------------------------------------------------
albums.forEach((al) => {
  check(al.id.startsWith('al_'), 'album id prefix ' + al.id);
  check(Catalog.artist(al.artistId), 'album artist resolves ' + al.id);
  check(al.year >= 2015 && al.year <= 2026, 'album year in range ' + al.id);
  check(ISO.test(al.releaseDate) && al.releaseDate.startsWith(String(al.year)), 'releaseDate matches year ' + al.id);
  check(['album', 'single', 'ep'].indexOf(al.type) >= 0, 'album type ' + al.id);
  check(al.trackIds.length >= 1, 'album has tracks ' + al.id);
  al.trackIds.forEach((tid) => {
    const t = Catalog.track(tid);
    check(t && t.albumId === al.id, 'album.trackIds <-> track.albumId: ' + al.id + ' ' + tid);
  });
  check(Number.isInteger(al.coverSeed), 'coverSeed int ' + al.id);
  check(HEX.test(al.color), 'album colour hex ' + al.id);
  check(typeof al.label === 'string' && al.label.length > 1, 'album label ' + al.id);
  const titles = al.trackIds.map((id) => Catalog.track(id).title);
  eq(new Set(titles).size, titles.length, 'no duplicate track titles inside ' + al.id);
  const ordered = Catalog.tracksOf(al.id);
  eq(ordered.length, al.trackIds.length, 'tracksOf returns every track of ' + al.id);
  ordered.forEach((t, i) => check(t.trackNumber === i + 1, 'tracksOf is in trackNumber order and numbers are 1-based: ' + al.id));
  if (al.type === 'album') check(al.trackIds.length >= 8, 'full albums have at least 8 tracks ' + al.id);
  if (al.type === 'single') check(al.trackIds.length <= 3, 'singles have at most 3 tracks ' + al.id);
});

// --- tracks ---------------------------------------------------------------------------
let explicitCount = 0;
tracks.forEach((t) => {
  check(t.id.startsWith('tr_'), 'track id prefix ' + t.id);
  check(typeof t.title === 'string' && t.title.length >= 2 && /^[A-Z0-9]/.test(t.title), 'track title is capitalised ' + t.id + ' ' + JSON.stringify(t.title));
  check(Catalog.album(t.albumId) && Catalog.album(t.albumId).trackIds.indexOf(t.id) >= 0, 'track.albumId <-> album.trackIds ' + t.id);
  check(Catalog.artist(t.artistId), 'track artist exists ' + t.id);
  check(Array.isArray(t.featuringIds), 'featuringIds array ' + t.id);
  t.featuringIds.forEach((f) => check(Catalog.artist(f) && f !== t.artistId, 'featuring artist resolves ' + t.id));
  check(t.durationMs >= 130000 && t.durationMs <= 280000, 'duration within 130000-280000 ' + t.id + ' ' + t.durationMs);
  check(typeof t.explicit === 'boolean', 'explicit boolean ' + t.id);
  if (t.explicit) explicitCount++;
  check(t.plays >= 10000 && t.plays <= 900000000 && Number.isInteger(t.plays), 'plays in range ' + t.id);
  check(t.popularity >= 0 && t.popularity <= 100 && Number.isInteger(t.popularity), 'popularity 0-100 ' + t.id);
  const g = Catalog.genre(t.genreId);
  check(g && g.styleKey === t.styleKey, 'track genreId/styleKey agree ' + t.id);
  check(Number.isInteger(t.audioSeed), 'audioSeed int ' + t.id);
});
const explicitRatio = explicitCount / tracks.length;
check(explicitRatio > 0.07 && explicitRatio < 0.2, 'about 1 in 8 tracks is explicit (ratio ' + explicitRatio.toFixed(3) + ')');
check(tracks.some((t) => t.featuringIds.length), 'some tracks have featured artists');
check(tracks.filter((t) => t.featuringIds.length).length < tracks.length / 4, 'featuring is unusual');
// loose correlation between plays and popularity
const sortedByPlays = tracks.slice().sort((a, b) => b.plays - a.plays);
const topPop = sortedByPlays.slice(0, 40).reduce((s, t) => s + t.popularity, 0) / 40;
const bottomPop = sortedByPlays.slice(-40).reduce((s, t) => s + t.popularity, 0) / 40;
check(topPop > bottomPop + 20, 'popularity correlates with plays (' + topPop.toFixed(1) + ' vs ' + bottomPop.toFixed(1) + ')');
// every genre has music
styleKeys.forEach((k) => check(tracks.some((t) => t.genreId === 'ge_' + k), 'genre ge_' + k + ' has tracks'));
// titles are varied
const allTitles = tracks.map((t) => t.title);
check(new Set(allTitles).size > allTitles.length * 0.9, 'track titles are mostly unique across the catalogue');

// --- playlists ------------------------------------------------------------------------
const FIXED = {
  pl_dailymix1: 'Daily Mix 1', pl_dailymix2: 'Daily Mix 2', pl_dailymix3: 'Daily Mix 3', pl_dailymix4: 'Daily Mix 4',
  pl_freshfinds: 'Fresh Finds', pl_newreleases: 'New Releases', pl_chillvibes: 'Chill Vibes', pl_deepfocus: 'Deep Focus',
  pl_latenightdrive: 'Late Night Drive', pl_morningcoffee: 'Morning Coffee', pl_workoutpulse: 'Workout Pulse',
  pl_rainydayjazz: 'Rainy Day Jazz', pl_indiegold: 'Indie Gold', pl_electronicessentials: 'Electronic Essentials', pl_top50global: 'Top 50 Global',
};
Object.keys(FIXED).forEach((id) => {
  const p = Catalog.playlist(id);
  check(p && p.name === FIXED[id], 'fixed playlist ' + id + ' = ' + FIXED[id]);
});
playlists.forEach((p) => {
  check(p.owner === 'Wavelength', 'playlist owner ' + p.id);
  check(['editorial', 'mix', 'chart'].indexOf(p.kind) >= 0, 'playlist kind ' + p.id);
  check(p.trackIds.length >= 20 && p.trackIds.length <= 50, 'playlist has 20-50 tracks ' + p.id + ' (' + p.trackIds.length + ')');
  eq(new Set(p.trackIds).size, p.trackIds.length, 'playlist tracks unique ' + p.id);
  p.trackIds.forEach((tid) => check(Catalog.track(tid), 'playlist track resolves ' + p.id + ' ' + tid));
  eq(p.addedAt.length, p.trackIds.length, 'addedAt parallel to trackIds ' + p.id);
  p.addedAt.forEach((d) => check(ISO.test(d), 'addedAt is an ISO date ' + p.id));
  check(Number.isInteger(p.coverSeed), 'playlist coverSeed ' + p.id);
  check(HEX.test(p.color), 'playlist colour ' + p.id);
  check(p.saves >= 50000 && p.saves <= 40000000, 'playlist saves range ' + p.id);
  check(typeof p.description === 'string' && p.description.length > 10, 'playlist description ' + p.id);
  if (p.genreId) check(Catalog.genre(p.genreId), 'playlist genreId resolves ' + p.id);
});
['pl_dailymix1', 'pl_dailymix2', 'pl_dailymix3', 'pl_dailymix4'].forEach((id) => eq(Catalog.playlist(id).kind, 'mix', id + ' is a mix'));
eq(Catalog.playlist('pl_top50global').kind, 'chart', 'Top 50 is a chart');
eq(Catalog.playlist('pl_freshfinds').kind, 'editorial', 'Fresh Finds is editorial');
eq(Catalog.playlist('pl_top50global').trackIds.length, 50, 'Top 50 has 50 tracks');
const top50 = Catalog.playlist('pl_top50global').trackIds.map((id) => Catalog.track(id));
check(top50.every((t, i) => i === 0 || top50[i - 1].plays >= t.plays), 'Top 50 is sorted by plays');

// --- query API ------------------------------------------------------------------------
artists.forEach((a) => {
  const own = Catalog.albumsOf(a.id);
  check(own.length >= 2, 'albumsOf ' + a.id);
  const firstSingle = own.findIndex((al) => al.type !== 'album');
  const lastAlbum = own.map((al) => al.type).lastIndexOf('album');
  check(firstSingle < 0 || lastAlbum < firstSingle, 'albumsOf: albums before singles/EPs ' + a.id);
  const d = Catalog.discography(a.id);
  eq(d.albums.length + d.singles.length, own.length, 'discography covers every release ' + a.id);
  check(d.albums.every((al) => al.type === 'album') && d.singles.every((al) => al.type !== 'album'), 'discography split ' + a.id);
  check(d.albums.every((al, i) => i === 0 || d.albums[i - 1].releaseDate >= al.releaseDate), 'discography newest first ' + a.id);
  const top = Catalog.topTracks(a.id);
  check(top.length > 0 && top.length <= 10, 'topTracks default 10 ' + a.id);
  check(top.every((t, i) => i === 0 || top[i - 1].popularity >= t.popularity), 'topTracks by popularity ' + a.id);
  eq(Catalog.topTracks(a.id, 3).length, 3, 'topTracks(n) ' + a.id);
  const rel = Catalog.relatedArtists(a.id);
  check(rel.length === 8 && rel.every((x) => x.id !== a.id), 'relatedArtists 8 others ' + a.id);
  const shared = (x) => x.genreIds.filter((g) => a.genreIds.indexOf(g) >= 0).length;
  check(rel.every((x, i) => i === 0 || shared(rel[i - 1]) >= shared(x)), 'relatedArtists shared genres first ' + a.id);
});
styleKeys.forEach((k) => {
  const c = Catalog.genreContent('ge_' + k);
  check(c.tracks.length > 0 && c.tracks.length <= 20, 'genreContent tracks ' + k);
  check(c.tracks.every((t) => t.genreId === 'ge_' + k), 'genreContent tracks are in the genre ' + k);
  check(c.albums.length > 0, 'genreContent albums ' + k);
  check(c.artists.length > 0 && c.artists.every((a) => a.genreIds.indexOf('ge_' + k) >= 0), 'genreContent artists ' + k);
  check(c.playlists.length > 0, 'genreContent has at least one playlist for ' + k);
});
const nr = Catalog.genreContent('ge_newreleases');
check(nr.playlists[0].id === 'pl_newreleases' && nr.playlists[1].id === 'pl_freshfinds', 'ge_newreleases playlists');
eq(nr.albums.length, 12, 'ge_newreleases albums = newReleases(12)');
check(nr.tracks.length === 20 && nr.tracks.every((t) => nr.albums.some((al) => al.id === t.albumId)), 'ge_newreleases tracks from those albums');
check(nr.artists.length > 0 && nr.artists.every((a) => nr.albums.some((al) => al.artistId === a.id)), 'ge_newreleases artists');
const ch = Catalog.genreContent('ge_charts');
check(ch.playlists.length === 1 && ch.playlists[0].id === 'pl_top50global', 'ge_charts playlist');
eq(ch.albums.length, 12, 'ge_charts albums');
check(ch.tracks.length === 20 && ch.tracks.every((t, i) => i === 0 || ch.tracks[i - 1].plays >= t.plays), 'ge_charts tracks by plays');
eq(ch.artists.length, 8, 'ge_charts artists = popularArtists(8)');
const unknown = Catalog.genreContent('ge_nothing');
check(unknown.playlists.length === 0 && unknown.albums.length === 0 && unknown.tracks.length === 0 && unknown.artists.length === 0, 'genreContent of an unknown id is empty');

const pa = Catalog.popularAlbums(5);
const sumPlays = (al) => al.trackIds.reduce((s, id) => s + Catalog.track(id).plays, 0);
check(pa.length === 5 && pa.every((al, i) => i === 0 || sumPlays(pa[i - 1]) >= sumPlays(al)), 'popularAlbums by summed plays');
const pArt = Catalog.popularArtists(4);
check(pArt.length === 4 && pArt.every((a, i) => i === 0 || pArt[i - 1].monthlyListeners >= a.monthlyListeners), 'popularArtists by listeners');
const newest = Catalog.newReleases(6);
check(newest.length === 6 && newest.every((al, i) => i === 0 || newest[i - 1].releaseDate >= al.releaseDate), 'newReleases by releaseDate desc');

// --- search -----------------------------------------------------------------------------
const sa = Catalog.search('a');
check(sa.tracks.length > 0 && sa.artists.length > 0 && sa.albums.length > 0 && sa.playlists.length > 0, "search('a') returns results in each type");
check(sa.tracks.length <= 20 && sa.artists.length <= 20 && sa.albums.length <= 20 && sa.playlists.length <= 20, 'search caps at 20 per type');
check(sa.top && sa.top.item, "search('a') has a top result");
const se = Catalog.search('');
check(se.tracks.length === 0 && se.artists.length === 0 && se.albums.length === 0 && se.playlists.length === 0 && se.top === null, "search('') is empty with null top");
const sw = Catalog.search('   ');
check(sw.top === null && sw.tracks.length === 0, 'whitespace query is empty');
const sArtist = Catalog.search('nia solace');
check(sArtist.top && sArtist.top.type === 'artist' && sArtist.top.item.id === 'ar_niasolace', 'exact artist name is the top result');
check(sArtist.tracks.length > 0 && sArtist.tracks.every((t) => t.artistId === 'ar_niasolace' || t.featuringIds.indexOf('ar_niasolace') >= 0), 'tracks match by artist name');
const sCase = Catalog.search('NIA SOLACE');
check(sCase.top && sCase.top.item.id === 'ar_niasolace', 'search is case-insensitive');
const sAlbum = Catalog.search('boathouse');
check(sAlbum.albums[0] && sAlbum.albums[0].id === 'al_boathouse', 'exact album title ranks first among albums');
check(sAlbum.tracks.length > 0 && sAlbum.tracks.every((t) => t.albumId === 'al_boathouse' || /boathouse/i.test(t.title)), 'tracks match by album title');
const someTrack = tracks.find((t) => t.title.length > 6 && !/[(,&]/.test(t.title));
const sTrack = Catalog.search(someTrack.title);
check(sTrack.tracks[0] && sTrack.tracks[0].title === someTrack.title, 'exact track title ranks first');
const sPl = Catalog.search('daily mix');
check(sPl.playlists.length === 4 && sPl.top && sPl.top.type === 'playlist', 'playlist prefix search');
const accented = tracks.find((t) => /[À-ſ]/.test(t.title));
if (accented) {
  const plain = accented.title.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const sd = Catalog.search(plain.toLowerCase());
  check(sd.tracks.some((t) => t.id === accented.id), 'search is diacritic-insensitive (' + accented.title + ')');
} else {
  check(false, 'catalogue contains at least one accented title for the diacritics test');
}
const sWord = Catalog.search('lights');
check(sWord.artists.some((a) => a.id === 'ar_hollowlights'), 'word-startsWith matches inside names');
const sRank = Catalog.search('ma');
check(sRank.artists.every((a, i) => i === 0 || Catalog.search('ma').artists[i - 1].name.toLowerCase().startsWith('ma') || !a.name.toLowerCase().startsWith('ma')), 'startsWith results before includes results');

// --- formatters ---------------------------------------------------------------------------
eq(Catalog.formatDuration(185000), '3:05', 'formatDuration 3:05');
eq(Catalog.formatDuration(3753000), '1:02:33', 'formatDuration with hours');
eq(Catalog.formatDuration(0), '0:00', 'formatDuration zero');
eq(Catalog.formatTotal(8040000), 'about 2 hr 14 min', 'formatTotal hours');
eq(Catalog.formatTotal(2832000), '47 min 12 sec', 'formatTotal minutes');
eq(Catalog.formatTotal(7200000), 'about 2 hr', 'formatTotal exact hours');
eq(Catalog.formatPlays(12345678), '12,345,678', 'formatPlays');
eq(Catalog.formatPlays(999), '999', 'formatPlays small');
eq(Catalog.formatCount(1200000), '1.2M', 'formatCount M');
eq(Catalog.formatCount(340000), '340K', 'formatCount K');
eq(Catalog.formatCount(2340), '2,340', 'formatCount small');
eq(Catalog.formatCount(31500000), '32M', 'formatCount big M');
eq(Catalog.formatDate('2025-03-04'), 'Mar 4, 2025', 'formatDate');
eq(Catalog.formatLongDate('2025-03-04'), 'March 4, 2025', 'formatLongDate');
eq(Catalog.relativeDate('2025-03-01', '2025-03-04'), '3 days ago', 'relativeDate days');
eq(Catalog.relativeDate('2025-02-18', '2025-03-04'), '2 weeks ago', 'relativeDate weeks');
eq(Catalog.relativeDate('2025-03-04', '2025-05-01'), 'Mar 4, 2025', 'relativeDate older than 4 weeks');
eq(Catalog.relativeDate('2025-03-04', '2025-03-04'), 'Today', 'relativeDate today');
eq(Catalog.relativeDate('2025-03-03', '2025-03-04'), '1 day ago', 'relativeDate one day');
eq(Catalog.relativeDate('2025-02-25', '2025-03-04'), '1 week ago', 'relativeDate one week');
check(typeof Catalog.relativeDate('2020-01-01') === 'string', 'relativeDate without now uses the current date');
eq(Catalog.pluralize(1, 'song'), '1 song', 'pluralize singular');
eq(Catalog.pluralize(12, 'song'), '12 songs', 'pluralize plural');
eq(Catalog.pluralize(0, 'song'), '0 songs', 'pluralize zero');

// --- seeded random ------------------------------------------------------------------------
const r1 = Catalog.seededRandom(42), r2 = Catalog.seededRandom(42);
const a1 = [r1(), r1(), r1()], a2 = [r2(), r2(), r2()];
check(a1.join() === a2.join(), 'seededRandom(42) is stable across two instances');
check(a1.every((v) => v >= 0 && v < 1), 'seededRandom values in [0,1)');
check(Catalog.seededRandom(1)() !== Catalog.seededRandom(2)(), 'different seeds differ');

// --- covers in Node -----------------------------------------------------------------------
let coverErr = null;
try {
  eq(Catalog.cover(albums[0]), '', 'cover(album) is empty in Node');
  eq(Catalog.cover(artists[0]), '', 'cover(artist) is empty in Node');
  eq(Catalog.cover(playlists[0]), '', 'cover(playlist) is empty in Node');
  eq(Catalog.cover(tracks[0]), '', 'cover(track) is empty in Node');
  eq(Catalog.cover({ kind: 'liked' }), '', 'cover(liked) is empty in Node');
  eq(Catalog.artistImage(artists[0]), '', 'artistImage is empty in Node');
  eq(Catalog.playlistMosaic(playlists[0].trackIds), '', 'playlistMosaic is empty in Node');
  eq(Catalog.playlistMosaic([]), '', 'playlistMosaic([]) is empty in Node');
} catch (e) { coverErr = e; }
check(coverErr === null, 'cover functions do not throw in Node: ' + (coverErr && coverErr.message));

// --- determinism ----------------------------------------------------------------------------
delete require.cache[require.resolve(dataPath)];
const again = require(dataPath);
eq(JSON.stringify(again.tracks.map((t) => [t.id, t.title, t.plays, t.popularity, t.durationMs])),
  JSON.stringify(tracks.map((t) => [t.id, t.title, t.plays, t.popularity, t.durationMs])), 'the catalogue is identical on a second load');
eq(JSON.stringify(again.playlists.map((p) => p.trackIds)), JSON.stringify(playlists.map((p) => p.trackIds)), 'playlists are identical on a second load');

// --- forbidden word ----------------------------------------------------------------------------
const forbidden = 'Spot' + 'ify';
const src = fs.readFileSync(dataPath, 'utf8');
check(src.toLowerCase().indexOf(forbidden.toLowerCase()) < 0, 'data.js never mentions the forbidden brand word');
check(fs.readFileSync(__filename, 'utf8').toLowerCase().indexOf(forbidden.toLowerCase()) < 0, 'test-data.js never mentions the forbidden brand word');
const everything = JSON.stringify(all);
check(everything.toLowerCase().indexOf(forbidden.toLowerCase()) < 0, 'no entity text mentions the forbidden brand word');

// --- report ------------------------------------------------------------------------------------
console.log((failures ? 'FAILED' : 'OK') + ': ' + passes + ' checks passed, ' + failures + ' failed. ' +
  artists.length + ' artists, ' + albums.length + ' albums, ' + tracks.length + ' tracks, ' + playlists.length + ' playlists, explicit ' + (explicitRatio * 100).toFixed(1) + '%.');
process.exit(failures ? 1 : 0);
