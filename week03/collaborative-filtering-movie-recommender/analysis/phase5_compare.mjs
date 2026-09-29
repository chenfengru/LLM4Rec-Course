// Phase 5: aligned Week 2 binary-genre profile vs Week 3 raw CF.
// Run: node week03/collaborative-filtering-movie-recommender/analysis/phase5_compare.mjs
// Reads unchanged applications in isolated VMs; writes only phase5 results.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const week2Project = path.resolve(project, '../../week02/content-based-movie-recommender');
const resultsDir = path.join(project, 'results');
const fileHash = filename => createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
const sourceHashes = Object.fromEntries(['u.item', 'u.data'].map(name => {
    const week3File = path.join(project, name);
    const week2File = path.join(week2Project, name);
    assert.equal(fileHash(week3File), fileHash(week2File), `${name} differs between weeks`);
    return [name, fileHash(week3File)];
}));

async function loadApp(directory) {
    const context = vm.createContext({ window: {}, console,
        fetch: async filename => new Response(fs.readFileSync(path.join(directory, filename))) });
    for (const filename of ['data.js', 'script.js']) {
        vm.runInContext(fs.readFileSync(path.join(directory, filename), 'utf8'), context, { filename });
    }
    await context.loadData();
    return { context, evaluate: expression => vm.runInContext(expression, context) };
}
const week2 = await loadApp(week2Project);
const week3 = await loadApp(project);
const w2Movies = week2.evaluate('movies');
const w3Movies = week3.evaluate('movies');
const w3Ratings = week3.evaluate('ratings');
const matrix = week3.evaluate('ratingMatrix');
const genreNames = week2.evaluate('genreNames');
assert.equal(w2Movies.length, 1682);
assert.equal(w3Movies.length, 1682);
assert.equal(w3Ratings.length, 100000);
for (let i = 0; i < w2Movies.length; i++) {
    assert.equal(w2Movies[i].id, w3Movies[i].id);
    assert.equal(w2Movies[i].title, w3Movies[i].title);
}

const phase3 = JSON.parse(fs.readFileSync(path.join(resultsDir, 'phase3_leave_one_out.json')));
assert.equal(phase3.perUser.length, 911);
const byUser = Array.from({ length: 944 }, () => []);
for (const rating of w3Ratings) byUser[rating.userId].push(rating);
const aligned = [];
const exclusions = { fewerThan20EarlierRatings: [], fewerThan3EarlierPositives: [] };
for (const record of phase3.perUser) {
    const earlier = byUser[record.userId].filter(x => x.timestamp < record.heldOutTimestamp);
    if (earlier.length < 20) {
        exclusions.fewerThan20EarlierRatings.push(record.userId);
        continue;
    }
    const earlierPositives = earlier.filter(x => x.rating >= 4)
        .sort((a, b) => b.timestamp - a.timestamp || a.itemId - b.itemId);
    if (earlierPositives.length < 3) {
        exclusions.fewerThan3EarlierPositives.push(record.userId);
        continue;
    }
    const profile = earlierPositives.slice(0, 3);
    assert.ok(profile.every(x => x.timestamp < record.heldOutTimestamp));
    assert.ok(profile.every(x => x.itemId !== record.heldOutMovieId));
    aligned.push({ record, earlier, profile });
}
assert.equal(aligned.length, 853);
assert.equal(exclusions.fewerThan20EarlierRatings.length, 57);
assert.equal(exclusions.fewerThan3EarlierPositives.length, 1);

const originalTopRecommendations = week3.context.topRecommendations;
let capturedIds = null;
week3.context.topRecommendations = (candidates, topK) => {
    const output = originalTopRecommendations(candidates, topK);
    capturedIds = Array.from(candidates.slice(0, topK), x => x.movieId);
    return output;
};

function cfTop5(method, userId) {
    capturedIds = null;
    const output = week3.context[method](userId);
    assert.ok(capturedIds);
    assert.equal(output.length, capturedIds.length);
    return Array.from(output, (x, i) => ({ movieId: capturedIds[i], score: x.score }));
}

// Week 2's existing profile formula and rankMovies implementation, with the
// exclusion set widened from the three seeds to every previously seen item.
function contentTop5(profile, earlierSeen) {
    const profileMovies = profile.map(x => w2Movies[x.itemId - 1]);
    const vector = Array.from(genreNames, (_, index) =>
        profileMovies.reduce((sum, movie) => sum + movie.genreVector[index], 0) / 3);
    return Array.from(week2.context.rankMovies(vector, earlierSeen, 'genreVector'),
        movie => ({ movieId: movie.id, score: movie.score }));
}

const records = [];
for (const { record, earlier, profile } of aligned) {
    const userId = record.userId;
    const seen = new Set(earlier.map(x => x.itemId));
    const removed = byUser[userId].filter(x => x.timestamp >= record.heldOutTimestamp);
    const beforeCount = matrix[userId].filter(x => x !== 0).length;
    for (const x of removed) {
        assert.equal(matrix[userId][x.itemId], x.rating);
        matrix[userId][x.itemId] = 0;
    }
    try {
        assert.equal(matrix[userId][record.heldOutMovieId], 0);
        assert.equal(matrix[userId].filter(x => x !== 0).length, earlier.length);
        const content = contentTop5(profile, seen);
        const userBased = cfTop5('getUserBasedRecommendations', userId);
        const itemBased = cfTop5('getItemBasedRecommendations', userId);
        for (const top5 of [content, userBased, itemBased]) {
            assert.ok(top5.length <= 5);
            assert.ok(top5.every(x => !seen.has(x.movieId)));
        }
        const rank = top5 => {
            const index = top5.findIndex(x => x.movieId === record.heldOutMovieId);
            return index < 0 ? null : index + 1;
        };
        records.push({ userId, heldOutMovieId: record.heldOutMovieId,
            heldOutRating: record.heldOutRating,
            heldOutTimestamp: record.heldOutTimestamp,
            earlierRatingCount: earlier.length,
            removedSameOrLaterRatings: removed.length,
            profile: profile.map(x => ({ movieId: x.itemId,
                rating: x.rating, timestamp: x.timestamp })),
            ranks: { content: rank(content), userBased: rank(userBased),
                itemBased: rank(itemBased) },
            top5: { content, userBased, itemBased } });
    } finally {
        for (const x of removed) matrix[userId][x.itemId] = x.rating;
        assert.equal(matrix[userId].filter(x => x !== 0).length, beforeCount);
    }
    if (records.length % 100 === 0) console.error(`Aligned comparison ${records.length}/${aligned.length}`);
}
week3.context.topRecommendations = originalTopRecommendations;
assert.equal(records.length, 853);
assert.equal(matrix.flat().filter(x => x !== 0).length, 100000);
for (const [name, digest] of Object.entries(sourceHashes)) {
    assert.equal(fileHash(path.join(project, name)), digest);
}

function methodMetrics(label) {
    const ranks = records.map(x => x.ranks[label]);
    const hits = ranks.filter(x => x !== null).length;
    return { evaluatedUsers: records.length, hits,
        hitRateAt5: hits / records.length,
        mrrAt5: ranks.reduce((sum, x) => sum + (x === null ? 0 : 1 / x), 0) / records.length,
        usersWithFewerThan5Results: records.filter(x => x.top5[label].length < 5).length };
}
function overlap(first, second) {
    const shared = records.map(record => {
        const secondIds = new Set(record.top5[second].map(x => x.movieId));
        return record.top5[first].filter(x => secondIds.has(x.movieId)).length;
    });
    return { evaluatedUsers: shared.length, meanSharedItemsOutOf5:
        shared.reduce((sum, x) => sum + x, 0) / shared.length,
        usersWithZeroOverlap: shared.filter(x => x === 0).length,
        zeroOverlapFraction: shared.filter(x => x === 0).length / shared.length,
        distribution: Object.fromEntries([0, 1, 2, 3, 4, 5]
            .map(n => [n, shared.filter(x => x === n).length])) };
}
const metrics = { content: methodMetrics('content'),
    userBased: methodMetrics('userBased'), itemBased: methodMetrics('itemBased') };
const overlaps = { contentVsUserBased: overlap('content', 'userBased'),
    contentVsItemBased: overlap('content', 'itemBased'),
    userBasedVsItemBased: overlap('userBased', 'itemBased') };

// Case selection uses observable hits only; no outcome is fabricated.
const contentOnly = records.find(x => x.ranks.content !== null
    && x.ranks.userBased === null && x.ranks.itemBased === null);
const userOnly = records.find(x => x.ranks.userBased !== null
    && x.ranks.content === null && x.ranks.itemBased === null
    && x.userId !== contentOnly?.userId);
const itemFailure = records.find(x => x.userId === 2 && x.ranks.itemBased === null)
    ?? records.find(x => x.ranks.itemBased === null
        && x.userId !== contentOnly?.userId && x.userId !== userOnly?.userId);
const cases = [
    { type: 'contentSucceedsCfFails', record: contentOnly },
    { type: 'userCfSucceedsContentFails', record: userOnly },
    { type: 'itemCfFailure', record: itemFailure },
].map(({ type, record }) => ({ type, userId: record?.userId ?? null }));

const result = {
    protocol: {
        source: 'Week 3 Phase 3 holdout user IDs and target movie IDs',
        week2Method: 'Existing binary-genre three-movie profile and rankMovies; most recent three ratings >=4 strictly before held-out timestamp',
        week3Methods: 'Existing raw co-rated-only User-Based and Item-Based functions; no overlap weighting',
        activeUserTrainingHistory: 'Only timestamp < held-out timestamp; remove held-out and all same/later active-user ratings from matrix during both CF calls',
        candidatePool: 'All catalog movies except active-user movies rated strictly before holdout, for all three methods',
        crossUserHistory: 'Other users retain their full ratings, as in Phase 3; this is not a global chronological split',
        ordering: 'Profile events: timestamp descending then movie ID ascending; Week 2 near ties preserve source order; Week 3 exact score ties use movie ID',
        metric: 'Exact movie ID HitRate@5 and MRR@5 on common aligned cohort; Top-5 overlap by movie ID',
        profileMinimum: '3 earlier positive movies; also require 20 earlier ratings to preserve Phase 3 remaining-history minimum',
        scoresNotComparable: 'Week 2 genre cosine and Week 3 predicted ratings have different meanings and scales',
    },
    sourceHashes, phase3EligibleUsers: 911, alignedUsers: records.length,
    excludedUsers: exclusions, metrics, overlaps, selectedCases: cases,
    perUser: records,
    summary: { alignedUsers: records.length,
        contentHits: metrics.content.hits,
        userBasedHits: metrics.userBased.hits,
        itemBasedHits: metrics.itemBased.hits,
        selectedCases: cases }
};
const output = path.join(resultsDir, 'phase5_aligned_comparison.json');
fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ output, metrics, overlaps, selectedCases: cases }, null, 2));
