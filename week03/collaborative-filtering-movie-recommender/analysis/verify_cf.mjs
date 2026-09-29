// Deterministic verification of the working copy; does not change the data.
// Run: node week03/collaborative-filtering-movie-recommender/analysis/verify_cf.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const context = vm.createContext({ window: {}, console, fetch: async name =>
    new Response(fs.readFileSync(path.join(project, name))) });
for (const filename of ['data.js', 'script.js']) {
    vm.runInContext(fs.readFileSync(path.join(project, filename), 'utf8'), context, { filename });
}
const evaluate = expression => vm.runInContext(expression, context);
const closeTo = (actual, expected) => assert.ok(
    Math.abs(actual - expected) < 1e-12, `${actual} should equal ${expected}`
);

// Four cosine cases whose answers can be checked without a recommender.
closeTo(context.cosineSimilarity([3, 4, 0], [4, 3, 5]), 24 / 25);
assert.equal(context.cosineSimilarityDetails([3, 4, 0], [4, 3, 5]).coRatedCount, 2);
closeTo(context.cosineSimilarity([3, 0, 4], [3, 0, 4]), 1);
assert.equal(context.cosineSimilarity([5, 0], [0, 4]), 0);
assert.equal(context.cosineSimilarityDetails([5, 0], [0, 4]).coRatedCount, 0);
closeTo(context.cosineSimilarity([5, 0], [1, 4]), 1);
assert.equal(context.cosineSimilarityDetails([5, 0], [1, 4]).coRatedCount, 1);
assert.equal(context.cosineSimilarity([0, 0], [0, 0]), 0);

// A hand-checkable 4-user, 4-movie matrix. User 1 rated movies 1 and 2.
// User CF: sim(1,2)=1, sim(1,3)=5/13, sim(1,4)=1 on one shared movie.
// For movie 3, (1*4 + (5/13)*2)/(1+5/13) = 31/9.
// Item CF: sim(3,1)=22/sqrt(520), sim(3,2)=14/sqrt(520),
// so (22*5+14*1)/(22+14) = 31/9.
evaluate(`numUsers = 4; numMovies = 4;
    movies = [1,2,3,4].map(id => ({id, title: 'Movie ' + id}));
    ratings = [
        [1,1,5], [1,2,1],
        [2,1,5], [2,2,1], [2,3,4],
        [3,1,1], [3,2,5], [3,3,2],
        [4,2,1], [4,4,5]
    ].map(([userId,itemId,rating]) => ({userId,itemId,rating}));
    buildRatingMatrix();`);
assert.equal(evaluate('ratingMatrix.length'), 5);
assert.equal(evaluate('ratingMatrix[1].length'), 5);
assert.equal(evaluate('ratingMatrix[1][3]'), 0);
assert.equal(evaluate('ratingMatrix[2][3]'), 4);
const toyUser = context.getUserBasedRecommendations(1);
const toyItem = context.getItemBasedRecommendations(1);
assert.deepEqual(Array.from(toyUser, x => x.title), ['Movie 4', 'Movie 3']);
assert.deepEqual(Array.from(toyItem, x => x.title), ['Movie 3', 'Movie 4']);
closeTo(toyUser[0].score, 5);
closeTo(toyUser[1].score, 31 / 9);
closeTo(toyItem[0].score, 31 / 9);
closeTo(toyItem[1].score, 1);
for (const list of [toyUser, toyItem]) {
    assert.ok(list.length <= 5);
    assert.ok(list.every(x => !['Movie 1', 'Movie 2'].includes(x.title)));
    assert.ok(list.every(x => Number.isFinite(x.score)));
}

// Reload the unchanged MovieLens files through the application's own loader.
evaluate('movies = []; ratings = [];');
await context.loadData();
assert.equal(evaluate('numUsers'), 943);
assert.equal(evaluate('numMovies'), 1682);
assert.equal(evaluate('ratings.length'), 100000);
assert.equal(evaluate('ratingMatrix.length'), 944);
assert.equal(evaluate('ratingMatrix[1].length'), 1683);
const matrix = evaluate('ratingMatrix');
assert.equal(matrix.flat().filter(rating => rating !== 0).length, 100000);
const movies = evaluate('movies');
assert.deepEqual(Array.from(movies[0].genres), ['Animation', "Children's", 'Comedy']);
const westernMovies = movies.filter(movie => movie.genres.includes('Western'));
assert.equal(westernMovies.length, 27);
assert.ok(westernMovies.some(movie => movie.id === 51));

const activeUserId = 2;
const userBased = context.getUserBasedRecommendations(activeUserId);
const itemBased = context.getItemBasedRecommendations(activeUserId);
const titleToId = new Map(movies.map(movie => [movie.title, movie.id]));
for (const list of [userBased, itemBased]) {
    assert.ok(list.length > 0 && list.length <= 5);
    assert.ok(list.every((entry, i) => i === 0 || list[i-1].score >= entry.score));
    assert.ok(list.every(entry => Number.isFinite(entry.score) && entry.score >= 1 - 1e-12 && entry.score <= 5 + 1e-12),
        `Unexpected score: ${JSON.stringify(list)}`);
    assert.ok(list.every(entry => matrix[activeUserId][titleToId.get(entry.title)] === 0));
}

const result = {
    source: 'Unmodified MovieLens files in the Week 3 working copy',
    activeUserId,
    activeUserObservedRatings: matrix[activeUserId].filter(rating => rating !== 0).length,
    missingValueStrategy: 'co-rated entries only',
    nearestUserLimit: 20,
    userBased,
    itemBased
};
const output = path.join(project, 'results', 'user-2-top5.json');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ checks: 'passed', output, ...result }, null, 2));
