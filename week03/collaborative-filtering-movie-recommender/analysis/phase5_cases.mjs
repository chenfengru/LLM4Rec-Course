// Evidence for three representative aligned Week 2 / Week 3 cases.
// Run: node week03/collaborative-filtering-movie-recommender/analysis/phase5_cases.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const resultsDir = path.join(project, 'results');
const aligned = JSON.parse(fs.readFileSync(path.join(resultsDir, 'phase5_aligned_comparison.json')));
const context = vm.createContext({ window: {}, console,
    fetch: async filename => new Response(fs.readFileSync(path.join(project, filename))) });
for (const filename of ['data.js', 'script.js']) {
    vm.runInContext(fs.readFileSync(path.join(project, filename), 'utf8'), context, { filename });
}
await context.loadData();
const evaluate = expression => vm.runInContext(expression, context);
const matrix = evaluate('ratingMatrix');
const movies = evaluate('movies');
const ratings = evaluate('ratings');
const genreNames = evaluate('genreNames');
const median = values => {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const describe = movieId => ({ movieId, title: movies[movieId - 1].title,
    genres: Array.from(movies[movieId - 1].genres) });
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-10, `${a} differs from ${b}`);

function userSupport(userId, movieId, neighbors) {
    const contributors = neighbors.filter(x => matrix[x.userId][movieId] !== 0)
        .map(x => ({ userId: x.userId, rating: matrix[x.userId][movieId],
            similarity: x.similarity, coRatedCount: x.coRatedCount }));
    const weightSum = contributors.reduce((s, x) => s + x.similarity, 0);
    return { contributorCount: contributors.length, weightSum,
        predictedScore: weightSum > 0 ? contributors.reduce((s, x) =>
            s + x.similarity * x.rating, 0) / weightSum : null,
        medianCoRatedCount: median(contributors.map(x => x.coRatedCount)),
        contributors };
}
function itemSupport(userId, movieId, ratedIds) {
    const column = id => matrix.map(row => row[id]);
    const candidate = column(movieId);
    const contributors = [];
    for (const ratedMovieId of ratedIds) {
        const detail = context.cosineSimilarityDetails(candidate, column(ratedMovieId));
        if (detail.similarity <= 0) continue;
        contributors.push({ ratedMovieId, rating: matrix[userId][ratedMovieId],
            similarity: detail.similarity, coRatedCount: detail.coRatedCount });
    }
    const weightSum = contributors.reduce((s, x) => s + x.similarity, 0);
    return { contributorCount: contributors.length, weightSum,
        predictedScore: weightSum > 0 ? contributors.reduce((s, x) =>
            s + x.similarity * x.rating, 0) / weightSum : null,
        medianCoRatedCount: median(contributors.map(x => x.coRatedCount)),
        oneCoRatingContributors: contributors.filter(x => x.coRatedCount === 1).length,
        observedRatingsOtherUsers: candidate.filter(x => x !== 0).length,
        contributors };
}

const cases = [];
for (const selected of aligned.selectedCases) {
    if (selected.userId === null) continue;
    const record = aligned.perUser.find(x => x.userId === selected.userId);
    assert.ok(record);
    const userId = record.userId;
    const prior = ratings.filter(x => x.userId === userId && x.timestamp < record.heldOutTimestamp);
    const removed = ratings.filter(x => x.userId === userId && x.timestamp >= record.heldOutTimestamp);
    for (const x of removed) matrix[userId][x.itemId] = 0;
    try {
        assert.equal(matrix[userId][record.heldOutMovieId], 0);
        const ratedIds = prior.map(x => x.itemId).sort((a, b) => a - b);
        const neighbors = [];
        for (let otherId = 1; otherId <= 943; otherId++) {
            if (otherId === userId) continue;
            const detail = context.cosineSimilarityDetails(matrix[userId], matrix[otherId]);
            if (detail.similarity > 0) neighbors.push({ userId: otherId,
                similarity: detail.similarity, coRatedCount: detail.coRatedCount });
        }
        neighbors.sort((a, b) => b.similarity - a.similarity || a.userId - b.userId);
        const topNeighbors = neighbors.slice(0, 20);
        const profile = record.profile.map(x => ({ ...describe(x.movieId),
            rating: x.rating, timestamp: x.timestamp }));
        const profileVector = Array.from(genreNames, (_, index) =>
            profile.reduce((sum, x) => sum +
                (x.genres.includes(genreNames[index]) ? 1 : 0), 0) / 3);
        const activeProfileGenres = Object.fromEntries(Array.from(genreNames, (name, index) =>
            [name, profileVector[index]]).filter(([, value]) => value > 0));
        const heldOut = describe(record.heldOutMovieId);
        const content = record.top5.content.map(x => ({ ...describe(x.movieId), score: x.score }));
        const userBased = record.top5.userBased.map(x => {
            const support = userSupport(userId, x.movieId, topNeighbors);
            close(support.predictedScore, x.score);
            return { ...describe(x.movieId), score: x.score, support };
        });
        const itemBased = record.top5.itemBased.map(x => {
            const support = itemSupport(userId, x.movieId, ratedIds);
            close(support.predictedScore, x.score);
            return { ...describe(x.movieId), score: x.score, support };
        });
        const heldOutSupport = {
            userBased: userSupport(userId, record.heldOutMovieId, topNeighbors),
            itemBased: itemSupport(userId, record.heldOutMovieId, ratedIds),
        };
        cases.push({ type: selected.type, userId, priorRatingCount: prior.length,
            priorRatingDistribution: Object.fromEntries([1, 2, 3, 4, 5].map(rating =>
                [rating, prior.filter(x => x.rating === rating).length])),
            laterOrSameTimeRemovedCount: removed.length,
            profile, activeProfileGenres, heldOut: { ...heldOut,
                rating: record.heldOutRating, timestamp: record.heldOutTimestamp },
            ranks: record.ranks, content, userBased, itemBased,
            selectedNeighbors: topNeighbors, heldOutSupport });
    } finally {
        for (const x of removed) matrix[userId][x.itemId] = x.rating;
    }
}
assert.equal(matrix.flat().filter(x => x !== 0).length, 100000);
const output = path.join(resultsDir, 'phase5_cases.json');
fs.writeFileSync(output, `${JSON.stringify({
    protocol: 'Same strict earlier-only active-user matrix and selected profiles as phase5_aligned_comparison.json; support recomputed from current raw application cosine; no title-based outcome matching',
    cases,
}, null, 2)}\n`);
console.log(JSON.stringify({ output, cases: cases.map(x => ({
    type: x.type, userId: x.userId, heldOut: x.heldOut,
    profile: x.profile.map(y => ({ id: y.movieId, title: y.title, genres: y.genres })),
    ranks: x.ranks,
    top5: {
        content: x.content.map(y => [y.movieId, y.score]),
        userBased: x.userBased.map(y => [y.movieId, y.score, y.support.contributorCount,
            y.support.medianCoRatedCount]),
        itemBased: x.itemBased.map(y => [y.movieId, y.score, y.support.contributorCount,
            y.support.medianCoRatedCount, y.support.observedRatingsOtherUsers]),
    },
    heldOutSupport: {
        userBased: [x.heldOutSupport.userBased.predictedScore,
            x.heldOutSupport.userBased.contributorCount],
        itemBased: [x.heldOutSupport.itemBased.predictedScore,
            x.heldOutSupport.itemBased.contributorCount],
    }
})) }, null, 2));
