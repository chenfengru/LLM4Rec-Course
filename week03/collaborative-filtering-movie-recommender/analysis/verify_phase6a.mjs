// Reproduce Phase 6A verification without changing the application or saved evidence.
// Run: node analysis/verify_phase6a.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const teacher = path.resolve(project, '../teacher-baseline');
const readJson = name => JSON.parse(fs.readFileSync(path.join(project, 'results', name), 'utf8'));
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const previousTop5 = readJson('user-2-top5.json');
const savedPhase6a = readJson('phase6a_verification.json');

const datasetHashes = {};
for (const name of ['u.data', 'u.item']) {
    const current = hash(path.join(project, name));
    assert.equal(current, hash(path.join(teacher, name)), `${name} changed from teacher baseline`);
    datasetHashes[name] = current;
}

const html = fs.readFileSync(path.join(project, 'index.html'), 'utf8');
for (const marker of [
    'id="user-select"', 'id="movie-select"', 'Predict Rating',
    'Get Top-5 Recommendations', 'id="user-prediction-result"',
    'id="item-prediction-result"', 'id="user-based-result"',
    'id="item-based-result"', 'Only co-rated entries are used'
]) {
    assert.ok(html.includes(marker), `Missing UI marker: ${marker}`);
}
assert.ok(html.indexOf('src="data.js"') < html.indexOf('src="script.js"'));

const context = vm.createContext({
    window: {},
    console,
    fetch: async name => new Response(fs.readFileSync(path.join(project, name)))
});
for (const name of ['data.js', 'script.js']) {
    vm.runInContext(fs.readFileSync(path.join(project, name), 'utf8'), context, { filename: name });
}
const evaluate = expression => vm.runInContext(expression, context);
await context.loadData();

const users = evaluate('numUsers');
const movieCount = evaluate('numMovies');
const observedRatings = evaluate('ratings.length');
const matrix = evaluate('ratingMatrix');
const movies = evaluate('movies');
assert.equal(users, 943);
assert.equal(movieCount, 1682);
assert.equal(observedRatings, 100000);
assert.equal(matrix.flat().filter(value => value !== 0).length, 100000);
const toyStoryGenres = Array.from(movies[0].genres);
assert.deepEqual(toyStoryGenres, ['Animation', "Children's", 'Comedy']);
const movieIdByTitle = new Map(movies.map(movie => [movie.title, movie.id]));

const user2Top5 = {
    userBased: context.getUserBasedRecommendations(2),
    itemBased: context.getItemBasedRecommendations(2)
};
const nearestUsers = context.getClosestNeighbors(2);
const ratedMovieIds = context.getRatedMovieIds(2);
const itemVectors = context.buildItemVectors();

for (const method of ['userBased', 'itemBased']) {
    const list = user2Top5[method];
    assert.equal(list.length, previousTop5[method].length);
    assert.ok(list.length <= 5);
    for (let rank = 0; rank < list.length; rank++) {
        const item = list[rank];
        const movieId = movieIdByTitle.get(item.title);
        assert.ok(movieId, `${method} has an unknown title`);
        assert.equal(movieId, movieIdByTitle.get(previousTop5[method][rank].title));
        assert.equal(item.score, previousTop5[method][rank].score);
        assert.equal(matrix[2][movieId], 0, `${method} recommended an already-rated movie`);
        assert.ok(Number.isFinite(item.score), `${method} score is not finite`);
        assert.ok(Number.isInteger(item.supportCount) && item.supportCount > 0);

        const predicted = method === 'userBased'
            ? context.predictUserBasedRating(2, movieId, nearestUsers)
            : context.predictItemBasedRating(2, movieId, itemVectors, ratedMovieIds);
        assert.equal(predicted.score, item.score, `${method} selected-movie score differs`);
        assert.equal(predicted.supportCount, item.supportCount);

        const countedSupport = method === 'userBased'
            ? nearestUsers.filter(neighbor => matrix[neighbor.userId][movieId] !== 0).length
            : ratedMovieIds.filter(ratedMovieId =>
                context.cosineSimilarity(itemVectors[movieId], itemVectors[ratedMovieId]) > 0
            ).length;
        assert.equal(item.supportCount, countedSupport, `${method} support count differs`);
    }
}

const checkedUsers = [1, 2, 3, 405, 943];
for (const userId of checkedUsers) {
    for (const list of [context.getUserBasedRecommendations(userId), context.getItemBasedRecommendations(userId)]) {
        assert.ok(list.length <= 5);
        for (const item of list) {
            assert.equal(matrix[userId][movieIdByTitle.get(item.title)], 0);
            assert.ok(Number.isFinite(item.score));
            assert.ok(Number.isInteger(item.supportCount) && item.supportCount > 0);
        }
    }
}

const sampleMovieId = movieIdByTitle.get(user2Top5.userBased[0].title);
const selectedMovieExample = {
    userId: 2,
    movieId: sampleMovieId,
    title: movies[sampleMovieId - 1].title,
    observedRating: matrix[2][sampleMovieId],
    userBased: context.predictUserBasedRating(2, sampleMovieId),
    itemBased: context.predictItemBasedRating(2, sampleMovieId)
};
assert.equal(selectedMovieExample.observedRating, 0);
assert.ok(Number.isFinite(selectedMovieExample.userBased.score));
assert.ok(Number.isFinite(selectedMovieExample.itemBased.score));

const reproduced = JSON.parse(JSON.stringify({
    check: 'passed',
    datasetHashes,
    users,
    movies: movieCount,
    observedRatings,
    toyStoryGenres,
    user2Top5: Object.fromEntries(Object.entries(user2Top5).map(([method, list]) => [method,
        list.map(item => ({ movieId: movieIdByTitle.get(item.title), ...item }))
    ])),
    selectedMovieExample,
    checkedUsers
}));

assert.deepEqual(reproduced, savedPhase6a, 'Rerun differs from saved Phase 6A verification JSON');
console.log(JSON.stringify({
    check: 'passed',
    matchesExistingPhase6aJson: true,
    users,
    movies: movieCount,
    observedRatings,
    user2UserBasedIds: reproduced.user2Top5.userBased.map(item => item.movieId),
    user2ItemBasedIds: reproduced.user2Top5.itemBased.map(item => item.movieId)
}, null, 2));
