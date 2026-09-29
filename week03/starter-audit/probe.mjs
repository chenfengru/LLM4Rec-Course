// Read-only audit of the untouched starter. No homework functions are replaced.
// Run: node week03/starter-audit/probe.mjs > week03/starter-audit/evidence.json
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const week = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseline = path.join(week, 'teacher-baseline');
const copy = path.join(week, 'collaborative-filtering-movie-recommender');
const files = fs.readdirSync(baseline).sort();
assert.deepEqual(fs.readdirSync(copy).sort(), files);
const hashes = Object.fromEntries(files.map(name => {
  const bytes = fs.readFileSync(path.join(baseline, name));
  assert.deepEqual(fs.readFileSync(path.join(copy, name)), bytes);
  return [name, createHash('sha256').update(bytes).digest('hex')];
}));
const itemBytes = fs.readFileSync(path.join(baseline, 'u.item'));
const itemRows = itemBytes.toString('latin1').trimEnd().split('\n').map(x => x.split('|'));
const ratingRows = fs.readFileSync(path.join(baseline, 'u.data'), 'utf8')
  .trimEnd().split('\n').map(x => x.split('\t').map(Number));
const counts = values => Object.fromEntries([...new Set(values)].sort((a,b) => a-b)
  .map(value => [value, values.filter(x => x === value).length]));
assert(itemRows.every(r => r.length === 24));
assert(ratingRows.every(r => r.length === 4 && r.every(Number.isInteger)));
assert(ratingRows.every(r => r[0] >= 1 && r[0] <= 943 && r[1] >= 1 && r[1] <= 1682 && r[2] >= 1 && r[2] <= 5));
assert(itemRows.every((r,i) => Number(r[0]) === i+1 && r.slice(5).every(x => x === '0' || x === '1')));

function harness(failFile = null) {
  const nodes = {
    'user-based-result': {innerHTML: ''},
    'item-based-result': {innerHTML: ''},
    'user-select': {
      value: '', options: [{}],
      remove(i) { this.options.splice(i,1); },
      appendChild(option) { this.options.push(option); },
    },
  };
  const errors = [];
  const context = vm.createContext({
    window: {},
    document: {getElementById: id => nodes[id], createElement: () => ({})},
    console: {error: (...args) => errors.push(args.map(String).join(' '))},
    fetch: async name => name === failFile
      ? new Response('Not found', {status: 404})
      : new Response(fs.readFileSync(path.join(baseline, name))),
  });
  for (const name of ['data.js', 'script.js']) {
    vm.runInContext(fs.readFileSync(path.join(baseline, name), 'utf8'), context, {filename: name});
  }
  return {context, nodes, errors, evaluate: expr => vm.runInContext(expr, context)};
}

const app = harness();
await app.context.window.onload();
const parsed = app.evaluate('movies');
const canonicalNames = ['unknown', 'Action', 'Adventure', 'Animation', "Children's", 'Comedy',
  'Crime', 'Documentary', 'Drama', 'Fantasy', 'Film-Noir', 'Horror', 'Musical', 'Mystery',
  'Romance', 'Sci-Fi', 'Thriller', 'War', 'Western'];
const expectedGenres = row => canonicalNames.filter((_,i) => row[5+i] === '1');
const mismatches = itemRows.filter((row,i) => JSON.stringify(parsed[i].genres) !== JSON.stringify(expectedGenres(row)));
const readyState = Object.fromEntries(Object.entries(app.nodes).filter(([id]) => id !== 'user-select').map(([id,node]) => [id,node.innerHTML]));
app.context.getRecommendations();
const unselected = app.nodes['user-based-result'].innerHTML;
app.nodes['user-select'].value = '1';
app.context.getRecommendations();
const selected = app.nodes['user-based-result'].innerHTML;
const failures = {};
for (const name of ['u.item', 'u.data']) {
  const failed = harness(name);
  await failed.context.window.onload();
  failures[name] = {user: failed.nodes['user-based-result'].innerHTML,
    item: failed.nodes['item-based-result'].innerHTML, errors: failed.errors};
}
const changedTitles = itemRows.filter((row,i) => row[1] !== parsed[i].title);
const users = new Set(ratingRows.map(r => r[0]));
const perUser = [...users].map(id => ratingRows.filter(r => r[0] === id).length);
console.log(JSON.stringify({
  method: 'Node vm executes unmodified baseline JS with minimal DOM doubles and native Response byte decoding. No real browser layout or network test.',
  node: process.version,
  identicalCopy: true, sha256: hashes,
  dataset: {
    movieRows: itemRows.length, movieFieldCounts: counts(itemRows.map(r => r.length)),
    ratingRows: ratingRows.length, ratingFieldCounts: counts(ratingRows.map(r => r.length)),
    users: users.size, usersContiguous: [...Array(943)].every((_,i) => users.has(i+1)),
    movieIdsContiguousInOrder: true, allRatingFieldsValidIntegers: true,
    ratedItems: new Set(ratingRows.map(r => r[1])).size,
    duplicateUserItemPairs: ratingRows.length - new Set(ratingRows.map(r => `${r[0]}:${r[1]}`)).size,
    ratingCounts: counts(ratingRows.map(r => r[2])),
    ratingsPerUserMinMax: [Math.min(...perUser), Math.max(...perUser)],
    observedDensity: ratingRows.length / (users.size * itemRows.length),
    byteIdenticalToWeek02: Object.fromEntries(['u.item', 'u.data'].map(name => [name,
      fs.readFileSync(path.join(baseline,name)).equals(fs.readFileSync(path.join(week,'../week02/teacher-baseline',name)))])),
  },
  startup: {state: app.evaluate('({numUsers,numMovies,ratingMatrix,ratings:ratings.length})'),
    dropdownOptionsIncludingPlaceholder: app.nodes['user-select'].options.length, readyState,
    noSelectionMessage: unselected, selectedUser1Message: selected,
    identicalVectorSimilarity: app.context.cosineSimilarity([5,4],[5,4]),
    userCF: app.context.getUserBasedRecommendations(1), itemCF: app.context.getItemBasedRecommendations(1)},
  genreMapping: {mismatchedMovies: mismatches.length, westernFlagMovies: itemRows.filter(r => r[23] === '1').length,
    examples: [1,2,267].map(id => ({id, title: parsed[id-1].title,
      rawFlags: itemRows[id-1].slice(5), actual: parsed[id-1].genres, expected: expectedGenres(itemRows[id-1])}))},
  decoding: {changedTitles: changedTitles.length, examples: changedTitles.map(r => ({id:Number(r[0]),
    bytePreservingLatin1: r[1], actual: parsed[Number(r[0])-1].title}))},
  loadFailures: failures,
}, null, 2));
