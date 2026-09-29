// Phase 3 analysis of the unchanged Week 3 algorithms.
// node analysis/phase3.mjs benchmark|support|reliability|loo|spotcheck
// Each mode writes a distinct JSON file under ../results/; Phase 2 files stay intact.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2];
assert.ok(['benchmark', 'support', 'reliability', 'loo', 'spotcheck'].includes(mode),
    'Choose benchmark, support, reliability, loo, or spotcheck');
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
const numUsers = evaluate('numUsers');
const numMovies = evaluate('numMovies');
assert.equal(numUsers, 943);
assert.equal(numMovies, 1682);
assert.equal(ratings.length, 100000);
const resultsDir = path.join(project, 'results');
const save = (filename, data) => {
    fs.mkdirSync(resultsDir, { recursive: true });
    const output = path.join(resultsDir, filename);
    fs.writeFileSync(output, `${JSON.stringify(data, null, 2)}\n`);
    console.log(JSON.stringify({ output, summary: data.summary ?? null }, null, 2));
};
const approximately = (actual, expected) => assert.ok(
    Math.abs(actual - expected) <= 1e-10,
    `${actual} differed from ${expected}`
);

// Capture internal IDs after the application's own sorter has run. The
// wrapper returns the exact application result and never changes candidate
// scores, membership, or order. IDs avoid ambiguous duplicate movie titles.
const originalTopRecommendations = context.topRecommendations;
let lastMovieIds = null;
function withIds(method, userId) {
    lastMovieIds = null;
    context.topRecommendations = (candidates, topK) => {
        const output = originalTopRecommendations(candidates, topK);
        lastMovieIds = candidates.slice(0, topK).map(candidate => candidate.movieId);
        return output;
    };
    try {
        const output = context[method](userId);
        assert.equal(output.length, lastMovieIds.length);
        for (let i = 0; i < output.length; i++) {
            assert.equal(output[i].title, movies[lastMovieIds[i] - 1].title);
        }
        return output.map((entry, i) => ({ movieId: lastMovieIds[i],
            title: entry.title, score: entry.score }));
    } finally {
        context.topRecommendations = originalTopRecommendations;
    }
}

function summary(values) {
    if (!values.length) return { count: 0 };
    const sorted = [...values].sort((a, b) => a - b);
    // Linear interpolation at index (n-1)*p. Include zero-overlap pairs.
    const percentile = p => {
        const index = (sorted.length - 1) * p;
        const low = Math.floor(index);
        const high = Math.ceil(index);
        return sorted[low] + (sorted[high] - sorted[low]) * (index - low);
    };
    const total = sorted.reduce((sum, value) => sum + value, 0);
    const thresholds = [1, 2, 5, 10];
    const atMost = Object.fromEntries(thresholds.map(limit => [limit, {
        pairs: sorted.filter(value => value <= limit).length,
        fraction: sorted.filter(value => value <= limit).length / sorted.length,
    }]));
    const bins = [
        ['0', x => x === 0], ['1', x => x === 1], ['2', x => x === 2],
        ['3-5', x => x >= 3 && x <= 5], ['6-10', x => x >= 6 && x <= 10],
        ['11-20', x => x >= 11 && x <= 20],
        ['21-50', x => x >= 21 && x <= 50],
        ['51-100', x => x >= 51 && x <= 100],
        ['101+', x => x >= 101],
    ];
    return { count: sorted.length, min: sorted[0], mean: total / sorted.length,
        p10: percentile(0.10), p25: percentile(0.25),
        median: percentile(0.50), p75: percentile(0.75),
        p90: percentile(0.90), max: sorted.at(-1), atMost,
        histogram: Object.fromEntries(bins.map(([label, condition]) =>
            [label, sorted.filter(condition).length])) };
}

function durationSummary(values) {
    const { count, min, mean, p25, median, p75, max } = summary(values);
    return { count, min, mean, p25, median, p75, max };
}

if (mode === 'support') {
    const userId = 2;
    const active = matrix[userId];
    const neighbors = [];
    for (let otherId = 1; otherId <= numUsers; otherId++) {
        if (otherId === userId) continue;
        const detail = context.cosineSimilarityDetails(active, matrix[otherId]);
        if (detail.similarity > 0) neighbors.push({ userId: otherId,
            similarity: detail.similarity, coRatedCount: detail.coRatedCount });
    }
    neighbors.sort((a, b) => b.similarity - a.similarity || a.userId - b.userId);
    const nearest20 = neighbors.slice(0, 20);
    const userRecommendations = withIds('getUserBasedRecommendations', userId)
        .map(recommendation => {
            const contributors = nearest20.filter(neighbor =>
                matrix[neighbor.userId][recommendation.movieId] !== 0)
                .map(neighbor => ({ ...neighbor,
                    candidateRating: matrix[neighbor.userId][recommendation.movieId] }));
            const similarityWeightSum = contributors.reduce((s, x) => s + x.similarity, 0);
            const reconstructed = contributors.reduce((s, x) =>
                s + x.similarity * x.candidateRating, 0) / similarityWeightSum;
            approximately(recommendation.score, reconstructed);
            return { ...recommendation, contributingNeighborCount: contributors.length,
                similarityWeightSum, contributors };
        });
    const ratedMovieIds = [];
    for (let movieId = 1; movieId <= numMovies; movieId++) {
        if (active[movieId] !== 0) ratedMovieIds.push(movieId);
    }
    const neededIds = [...new Set([...ratedMovieIds,
        ...withIds('getItemBasedRecommendations', userId).map(x => x.movieId)])];
    const columns = new Map(neededIds.map(movieId => [movieId,
        matrix.map(row => row[movieId])]));
    const itemRecommendations = withIds('getItemBasedRecommendations', userId)
        .map(recommendation => {
            const contributors = ratedMovieIds.map(ratedMovieId => {
                const detail = context.cosineSimilarityDetails(
                    columns.get(recommendation.movieId), columns.get(ratedMovieId));
                return { movieId: ratedMovieId, title: movies[ratedMovieId - 1].title,
                    activeUserRating: active[ratedMovieId],
                    similarity: detail.similarity, coRatedCount: detail.coRatedCount };
            }).filter(item => item.similarity > 0);
            const similarityWeightSum = contributors.reduce((s, x) => s + x.similarity, 0);
            const reconstructed = contributors.reduce((s, x) =>
                s + x.similarity * x.activeUserRating, 0) / similarityWeightSum;
            approximately(recommendation.score, reconstructed);
            return { ...recommendation, contributingRatedItemCount: contributors.length,
                similarityWeightSum, contributors };
        });
    save('phase3_user2_support.json', {
        protocol: 'Full MovieLens matrix, no holdout; exact existing Top-5 with captured movie IDs',
        userId, activeUserObservedRatings: ratedMovieIds.length,
        selectedNeighbors: nearest20, userRecommendations, itemRecommendations,
        summary: {
            userTop5NeighborCounts: userRecommendations.map(x => x.contributingNeighborCount),
            userTop5WeightSums: userRecommendations.map(x => x.similarityWeightSum),
            userTop5AllContributingRatingsFive: userRecommendations.map(x =>
                x.contributors.every(c => c.candidateRating === 5)),
            itemTop5ContributingItemCounts: itemRecommendations.map(x => x.contributingRatedItemCount),
            itemTop5WeightSums: itemRecommendations.map(x => x.similarityWeightSum),
        }
    });
}

if (mode === 'reliability') {
    const analyzePairs = (kind, vectors, maxId) => {
        const allCounts = [];
        const highCounts = [];
        const highFewExamples = [];
        const highThreshold = 0.9;
        for (let a = 1; a <= maxId; a++) {
            for (let b = a + 1; b <= maxId; b++) {
                const detail = context.cosineSimilarityDetails(vectors[a], vectors[b]);
                allCounts.push(detail.coRatedCount);
                if (detail.similarity >= highThreshold) {
                    highCounts.push(detail.coRatedCount);
                    if (detail.coRatedCount <= 2 && highFewExamples.length < 8) {
                        highFewExamples.push({ firstId: a, secondId: b,
                            similarity: detail.similarity,
                            coRatedCount: detail.coRatedCount });
                    }
                }
            }
        }
        assert.equal(allCounts.length, maxId * (maxId - 1) / 2);
        return { kind, pairsEvaluated: allCounts.length,
            includesZeroOverlapPairs: true, highSimilarityThreshold: highThreshold,
            allPairsCoRatedCounts: summary(allCounts),
            highSimilarityPairCount: highCounts.length,
            highSimilarityCoRatedCounts: summary(highCounts),
            highSimilarityWithAtMostTwo: highCounts.filter(x => x <= 2).length,
            highSimilarityFewOverlapExamples: highFewExamples };
    };
    const userVectors = matrix;
    const itemVectors = Array.from({ length: numMovies + 1 }, (_, movieId) =>
        matrix.map(row => row[movieId]));
    const users = analyzePairs('user-user', userVectors, numUsers);
    const items = analyzePairs('item-item', itemVectors, numMovies);
    save('phase3_reliability.json', {
        protocol: 'All unique unordered pairs; similarity uses unchanged co-rated-only cosine; zero-overlap pairs included; percentiles interpolate at (n-1)*p',
        users, items,
        summary: { userPairs: users.pairsEvaluated,
            userMedianCoRated: users.allPairsCoRatedCounts.median,
            userHighCosinePairs: users.highSimilarityPairCount,
            itemPairs: items.pairsEvaluated,
            itemMedianCoRated: items.allPairsCoRatedCounts.median,
            itemHighCosinePairs: items.highSimilarityPairCount }
    });
}

if (mode === 'benchmark') {
    const userIds = [2, 3, 1, 405, 943];
    const warmupsPerUserMethod = 2;
    const measuredRepetitions = 5;
    const methods = [
        ['userBased', 'getUserBasedRecommendations'],
        ['itemBased', 'getItemBasedRecommendations']
    ];
    const timing = {};
    for (const [label, method] of methods) {
        timing[label] = {};
        for (const userId of userIds) {
            const observedRatings = matrix[userId].filter(value => value !== 0).length;
            for (let rep = 0; rep < warmupsPerUserMethod; rep++) context[method](userId);
            const durationsMs = [];
            for (let rep = 0; rep < measuredRepetitions; rep++) {
                const start = performance.now();
                const result = context[method](userId);
                durationsMs.push(performance.now() - start);
                assert.ok(result.length <= 5);
            }
            timing[label][userId] = {
                observedRatings,
                similarityCallsPerRecommendation: label === 'userBased'
                    ? numUsers - 1 : observedRatings * (numMovies - observedRatings),
                vectorLength: label === 'userBased' ? numMovies + 1 : numUsers + 1,
                durationsMs, meanMs: durationSummary(durationsMs).mean,
                medianMs: durationSummary(durationsMs).median
            };
        }
    }
    const fullSquare = n => n * n;
    const uniquePairs = n => n * (n - 1) / 2;
    const pairCounts = { users: { count: numUsers,
        fullSquareIncludingSelf: fullSquare(numUsers),
        uniqueUnorderedExcludingSelf: uniquePairs(numUsers) },
    items: { count: numMovies,
        fullSquareIncludingSelf: fullSquare(numMovies),
        uniqueUnorderedExcludingSelf: uniquePairs(numMovies) } };
    save('phase3_efficiency.json', {
        protocol: { runtime: process.version, platform: process.platform, architecture: process.arch,
            clock: 'performance.now()', userIds,
            warmupsPerUserMethod, measuredRepetitions,
            order: 'user method for fixed ascending user list, then item method',
            note: 'Measures complete on-demand recommendation calls, including item-column construction and candidate sorting; no ratings are held out.' },
        theoreticalPairCounts: pairCounts, timing,
        summary: {
            userBased: durationSummary(Object.values(timing.userBased).flatMap(x => x.durationsMs)),
            itemBased: durationSummary(Object.values(timing.itemBased).flatMap(x => x.durationsMs)),
        }
    });
}

if (mode === 'loo') {
    const ratingsByUser = Array.from({ length: numUsers + 1 }, () => []);
    for (const rating of ratings) ratingsByUser[rating.userId].push(rating);
    const minimumRemainingRatings = 20;
    const users = [];
    const skipped = { insufficientRemainingRatings: 0, noPositiveRating: 0 };
    for (let userId = 1; userId <= numUsers; userId++) {
        const observed = ratingsByUser[userId];
        if (observed.length - 1 < minimumRemainingRatings) {
            skipped.insufficientRemainingRatings++;
            continue;
        }
        const positive = observed.filter(rating => rating.rating >= 4);
        if (positive.length === 0) {
            skipped.noPositiveRating++;
            continue;
        }
        // Most recent timestamp; smaller movie ID wins any timestamp tie.
        positive.sort((a, b) => b.timestamp - a.timestamp || a.itemId - b.itemId);
        users.push({ userId, holdout: positive[0], remainingRatings: observed.length - 1 });
    }
    const records = [];
    const initialObservedCount = matrix.flat().filter(value => value !== 0).length;
    assert.equal(initialObservedCount, 100000);
    const started = performance.now();
    for (const { userId, holdout, remainingRatings } of users) {
        assert.equal(matrix[userId][holdout.itemId], holdout.rating);
        matrix[userId][holdout.itemId] = 0;
        try {
            assert.equal(matrix[userId][holdout.itemId], 0);
            const userBased = withIds('getUserBasedRecommendations', userId);
            const itemBased = withIds('getItemBasedRecommendations', userId);
            for (const list of [userBased, itemBased]) {
                assert.ok(list.length <= 5);
                assert.ok(list.every(entry => matrix[userId][entry.movieId] === 0));
            }
            const rank = list => {
                const index = list.findIndex(x => x.movieId === holdout.itemId);
                return index < 0 ? null : index + 1;
            };
            records.push({ userId, heldOutMovieId: holdout.itemId,
                heldOutRating: holdout.rating, heldOutTimestamp: holdout.timestamp,
                remainingRatings, userBasedRank: rank(userBased),
                itemBasedRank: rank(itemBased), userBasedResultCount: userBased.length,
                itemBasedResultCount: itemBased.length });
        } finally {
            matrix[userId][holdout.itemId] = holdout.rating;
        }
        if (records.length % 100 === 0) {
            console.error(`Evaluated ${records.length}/${users.length} users`);
        }
    }
    assert.equal(records.length, users.length);
    assert.equal(matrix.flat().filter(value => value !== 0).length, initialObservedCount);
    for (const { holdout, userId } of users) {
        assert.equal(matrix[userId][holdout.itemId], holdout.rating);
    }
    const metrics = key => {
        const ranks = records.map(record => record[key]);
        const hits = ranks.filter(rank => rank !== null).length;
        const resultCountKey = key === 'userBasedRank' ? 'userBasedResultCount' : 'itemBasedResultCount';
        return { eligibleUsers: users.length, evaluatedUsers: records.length,
            hits, hitRateAt5: hits / records.length,
            mrrAt5: ranks.reduce((sum, rank) => sum + (rank === null ? 0 : 1 / rank), 0) / records.length,
            usersWithFewerThan5Results: records.filter(record => record[resultCountKey] < 5).length,
            usersWithZeroResults: records.filter(record => record[resultCountKey] === 0).length };
    };
    save('phase3_leave_one_out.json', {
        protocol: {
            originalUserCount: numUsers, minimumRemainingRatings,
            positiveRatingThreshold: 4,
            selection: 'Most recent rating >=4 by timestamp; lower movie ID on tied timestamp',
            isolation: 'Remove only the held-out user-item cell from ratingMatrix, run both unmodified recommenders, restore in finally before next user',
            candidateIdentity: 'Capture internal movie IDs after the existing sorter; do not match titles',
            tieBreaking: 'Neighbor similarity descending, then user ID ascending; candidate score descending, then movie ID ascending (exact numeric ties)',
            metric: 'HitRate@5 = hits/evaluated; MRR@5 = sum(1/rank for hits, 0 for misses)/evaluated',
            noTrainValidationTuning: true,
            totalElapsedMs: performance.now() - started,
        },
        excludedUsers: skipped,
        userBased: metrics('userBasedRank'),
        itemBased: metrics('itemBasedRank'),
        perUser: records,
        summary: { eligibleUsers: users.length,
            userBasedHitRateAt5: metrics('userBasedRank').hitRateAt5,
            userBasedMRRAt5: metrics('userBasedRank').mrrAt5,
            itemBasedHitRateAt5: metrics('itemBasedRank').hitRateAt5,
            itemBasedMRRAt5: metrics('itemBasedRank').mrrAt5 }
    });
}

if (mode === 'spotcheck') {
    // Inspect full candidate ranks for fixed users without rerunning the full
    // cohort. Capture the existing sort result; do not rescore candidates.
    const userIds = [1, 2, 3, 65, 251, 382, 423, 542, 902, 943];
    const itemPopularity = movieId => matrix.reduce((n, row) =>
        n + (row[movieId] !== 0 ? 1 : 0), 0);
    const samples = [];
    for (const userId of userIds) {
        const holdout = ratings.filter(r => r.userId === userId && r.rating >= 4)
            .sort((a, b) => b.timestamp - a.timestamp || a.itemId - b.itemId)[0];
        assert.ok(holdout);
        matrix[userId][holdout.itemId] = 0;
        try {
            const methods = {};
            for (const [label, method] of [
                ['userBased', 'getUserBasedRecommendations'],
                ['itemBased', 'getItemBasedRecommendations']
            ]) {
                let allCandidates = null;
                context.topRecommendations = (candidates, topK) => {
                    const output = originalTopRecommendations(candidates, topK);
                    allCandidates = candidates.map(x => ({ movieId: x.movieId, score: x.score }));
                    return output;
                };
                try {
                    const top5 = context[method](userId);
                    assert.deepEqual(Array.from(top5, x => x.title),
                        Array.from(allCandidates.slice(0, 5), x => movies[x.movieId - 1].title));
                    const index = allCandidates.findIndex(x => x.movieId === holdout.itemId);
                    methods[label] = {
                        candidateCount: allCandidates.length,
                        heldOutRank: index < 0 ? null : index + 1,
                        heldOutScore: index < 0 ? null : allCandidates[index].score,
                        top5: allCandidates.slice(0, 5).map(x => ({ ...x,
                            observedItemRatings: itemPopularity(x.movieId) }))
                    };
                } finally {
                    context.topRecommendations = originalTopRecommendations;
                }
            }
            samples.push({ userId, heldOutMovieId: holdout.itemId,
                heldOutRating: holdout.rating,
                heldOutItemOtherUserRatings: itemPopularity(holdout.itemId),
                methods });
        } finally {
            matrix[userId][holdout.itemId] = holdout.rating;
        }
    }
    const full = JSON.parse(fs.readFileSync(path.join(resultsDir, 'phase3_leave_one_out.json')));
    for (const sample of samples) {
        const record = full.perUser.find(x => x.userId === sample.userId);
        assert.equal(sample.methods.userBased.heldOutRank <= 5 ?
            sample.methods.userBased.heldOutRank : null, record.userBasedRank);
        assert.equal(sample.methods.itemBased.heldOutRank <= 5 ?
            sample.methods.itemBased.heldOutRank : null, record.itemBasedRank);
    }
    save('phase3_spotcheck.json', {
        protocol: 'Fixed ten users; same most-recent-positive holdout and restored matrix; capture full sorted candidate ranks from the unchanged sorter; cross-check Top-5 hits against exhaustive result',
        userIds, samples,
        summary: { crossCheckedUsers: samples.length,
            itemBasedHeldOutRanks: samples.map(x => x.methods.itemBased.heldOutRank),
            userBasedHeldOutRanks: samples.map(x => x.methods.userBased.heldOutRank) }
    });
}
