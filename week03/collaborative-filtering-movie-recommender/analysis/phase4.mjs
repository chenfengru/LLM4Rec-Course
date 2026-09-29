// Phase 4: one controlled overlap-confidence experiment.
// Run from the repository root:
//   node week03/collaborative-filtering-movie-recommender/analysis/phase4.mjs verify
//   node week03/collaborative-filtering-movie-recommender/analysis/phase4.mjs evaluate
//   node week03/collaborative-filtering-movie-recommender/analysis/phase4.mjs benchmark
// Application code and Phase 2/3 results are never written by this script.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const resultsDir = path.join(project, 'results');
const mode = process.argv[2];
assert.ok(['verify', 'evaluate', 'benchmark'].includes(mode), 'Use verify, evaluate, or benchmark');
const settings = [
    { key: 'raw', threshold: null },
    { key: 'T5', threshold: 5 },
    { key: 'T10', threshold: 10 },
    { key: 'T20', threshold: 20 },
];
const sourceHashes = Object.fromEntries(['u.item', 'u.data'].map(name =>
    [name, createHash('sha256').update(fs.readFileSync(path.join(project, name))).digest('hex')]));

// Load the untouched baseline implementation in an isolated VM. The sparse
// evaluator below only accelerates the analysis. It is checked against the
// actual application functions before use and against all Phase 3 raw ranks.
const app = vm.createContext({ window: {}, console,
    fetch: async filename => new Response(fs.readFileSync(path.join(project, filename))) });
for (const filename of ['data.js', 'script.js']) {
    vm.runInContext(fs.readFileSync(path.join(project, filename), 'utf8'), app, { filename });
}
await app.loadData();
const evaluate = expression => vm.runInContext(expression, app);
const matrix = evaluate('ratingMatrix');
const ratings = evaluate('ratings');
const movies = evaluate('movies');
const numUsers = evaluate('numUsers');
const numMovies = evaluate('numMovies');
assert.equal(numUsers, 943);
assert.equal(numMovies, 1682);
assert.equal(ratings.length, 100000);

const userRows = Array.from({ length: numUsers + 1 }, () => []);
const itemColumns = Array.from({ length: numMovies + 1 }, () => []);
for (let userId = 1; userId <= numUsers; userId++) {
    for (let movieId = 1; movieId <= numMovies; movieId++) {
        const rating = matrix[userId][movieId];
        if (rating === 0) continue;
        userRows[userId].push({ id: movieId, rating });
        itemColumns[movieId].push({ id: userId, rating });
    }
}

// Intersect sorted observed entries. This computes the same co-rated-only
// dot product and norms as script.js, in the same coordinate order.
function sparseCosineDetails(a, b) {
    let i = 0;
    let j = 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    let coRatedCount = 0;
    while (i < a.length && j < b.length) {
        if (a[i].id < b[j].id) { i++; continue; }
        if (a[i].id > b[j].id) { j++; continue; }
        const av = a[i].rating;
        const bv = b[j].rating;
        dot += av * bv;
        normA += av * av;
        normB += bv * bv;
        coRatedCount++;
        i++;
        j++;
    }
    const denominator = Math.sqrt(normA * normB);
    return { similarity: coRatedCount > 0 && denominator > 0 ? dot / denominator : 0,
        coRatedCount };
}

// n/T is a confidence adjustment to a similarity estimate. It neither adds
// a rating nor imputes a missing user-item observation.
function adjustedSimilarity(detail, threshold) {
    return threshold === null ? detail.similarity
        : detail.similarity * Math.min(detail.coRatedCount / threshold, 1);
}

function median(values) {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
const mean = values => values.length ? values.reduce((s, x) => s + x, 0) / values.length : null;
const close = (a, b, message) => assert.ok(Math.abs(a - b) <= 1e-10,
    `${message}: ${a} versus ${b}`);

function rank(candidates) {
    candidates.sort((a, b) => b.score - a.score || a.movieId - b.movieId);
    return candidates.slice(0, 5);
}

const ratingsByUser = Array.from({ length: numUsers + 1 }, () => []);
for (const rating of ratings) ratingsByUser[rating.userId].push(rating);
const eligible = [];
const excluded = { insufficientRemainingRatings: 0, noPositiveRating: 0 };
for (let userId = 1; userId <= numUsers; userId++) {
    const observed = ratingsByUser[userId];
    if (observed.length - 1 < 20) {
        excluded.insufficientRemainingRatings++;
        continue;
    }
    const positives = observed.filter(x => x.rating >= 4);
    if (positives.length === 0) {
        excluded.noPositiveRating++;
        continue;
    }
    positives.sort((a, b) => b.timestamp - a.timestamp || a.itemId - b.itemId);
    eligible.push({ userId, holdout: positives[0] });
}
assert.equal(eligible.length, 911);

function evaluateUser(userId, holdout = null, detailedSupport = false) {
    const heldOutMovieId = holdout?.itemId ?? null;
    const original = holdout ? matrix[userId][heldOutMovieId] : null;
    if (holdout) {
        assert.equal(original, holdout.rating);
        matrix[userId][heldOutMovieId] = 0;
    }
    try {
        const activeRow = holdout
            ? userRows[userId].filter(x => x.id !== heldOutMovieId)
            : userRows[userId];
        const heldOutColumn = holdout
            ? itemColumns[heldOutMovieId].filter(x => x.id !== userId)
            : null;
        const column = movieId => movieId === heldOutMovieId
            ? heldOutColumn : itemColumns[movieId];
        const ratedMovieIds = activeRow.map(x => x.id);
        const unseenMovieIds = [];
        for (let movieId = 1; movieId <= numMovies; movieId++) {
            if (matrix[userId][movieId] === 0) unseenMovieIds.push(movieId);
        }
        const output = Object.fromEntries(settings.map(({ key }) => [key,
            { userBased: [], itemBased: [], neighbors: [] }]));

        // User neighbors: one raw cosine per other user, then rank separately
        // for each confidence setting. Aggregation matches script.js.
        const neighborDetails = [];
        for (let otherId = 1; otherId <= numUsers; otherId++) {
            if (otherId === userId) continue;
            const detail = sparseCosineDetails(activeRow, userRows[otherId]);
            if (detail.similarity > 0) neighborDetails.push({ userId: otherId, detail });
        }
        for (const { key, threshold } of settings) {
            const neighbors = neighborDetails.map(({ userId: otherId, detail }) => ({
                userId: otherId, coRatedCount: detail.coRatedCount,
                similarity: adjustedSimilarity(detail, threshold)
            }));
            neighbors.sort((a, b) => b.similarity - a.similarity || a.userId - b.userId);
            output[key].neighbors = neighbors.slice(0, 20);
            const candidates = [];
            for (const movieId of unseenMovieIds) {
                let numerator = 0;
                let denominator = 0;
                for (const neighbor of output[key].neighbors) {
                    const rating = matrix[neighbor.userId][movieId];
                    if (rating === 0) continue;
                    numerator += neighbor.similarity * rating;
                    denominator += neighbor.similarity;
                }
                if (denominator > 0) candidates.push({ movieId, score: numerator / denominator });
            }
            output[key].userBased = rank(candidates);
        }

        // Item cosine is computed once per candidate/rated pair from the
        // held-out matrix, then used for raw and all three T settings.
        const itemCandidates = Object.fromEntries(settings.map(({ key }) => [key, []]));
        for (const movieId of unseenMovieIds) {
            const numerator = [0, 0, 0, 0];
            const denominator = [0, 0, 0, 0];
            for (const ratedMovieId of ratedMovieIds) {
                const detail = sparseCosineDetails(column(movieId), column(ratedMovieId));
                if (detail.similarity <= 0) continue;
                for (let k = 0; k < settings.length; k++) {
                    const weight = adjustedSimilarity(detail, settings[k].threshold);
                    numerator[k] += weight * matrix[userId][ratedMovieId];
                    denominator[k] += weight;
                }
            }
            for (let k = 0; k < settings.length; k++) {
                if (denominator[k] > 0) {
                    itemCandidates[settings[k].key].push({
                        movieId, score: numerator[k] / denominator[k] });
                }
            }
        }
        for (const { key } of settings) output[key].itemBased = rank(itemCandidates[key]);

        // Support is recorded for *contributing* similarities in Top-5,
        // not for all evaluated pairs. Repeated contributions count again.
        for (const { key, threshold } of settings) {
            for (const recommendation of output[key].userBased) {
                const contributors = output[key].neighbors
                    .filter(x => matrix[x.userId][recommendation.movieId] !== 0)
                    .map(x => ({ id: x.userId, similarity: x.similarity,
                        coRatedCount: x.coRatedCount,
                        rating: matrix[x.userId][recommendation.movieId] }));
                recommendation.support = support(contributors, recommendation.score, detailedSupport);
            }
            for (const recommendation of output[key].itemBased) {
                const contributors = [];
                for (const ratedMovieId of ratedMovieIds) {
                    const detail = sparseCosineDetails(column(recommendation.movieId), column(ratedMovieId));
                    const similarity = adjustedSimilarity(detail, threshold);
                    if (similarity <= 0) continue;
                    contributors.push({ id: ratedMovieId, similarity,
                        coRatedCount: detail.coRatedCount,
                        rating: matrix[userId][ratedMovieId] });
                }
                recommendation.support = support(contributors, recommendation.score, detailedSupport);
            }
        }
        return output;
    } finally {
        if (holdout) matrix[userId][heldOutMovieId] = original;
    }
}

function support(contributors, predictedScore, detailed) {
    const weightSum = contributors.reduce((s, c) => s + c.similarity, 0);
    const numerator = contributors.reduce((s, c) => s + c.similarity * c.rating, 0);
    assert.ok(weightSum > 0);
    close(numerator / weightSum, predictedScore, 'Support reconstruction');
    return { count: contributors.length, weightSum,
        coRatedCounts: contributors.map(x => x.coRatedCount),
        ...(detailed ? { contributors } : {}) };
}

// For direct app comparisons, define the experimental function *inside* its
// VM so it has the same execution environment as the baseline function.
const originalAppCosine = app.cosineSimilarity;
const originalAppTop = app.topRecommendations;
const appCosineByThreshold = new Map();
function setAppSimilarity(threshold) {
    if (threshold === null) { app.cosineSimilarity = originalAppCosine; return; }
    if (!appCosineByThreshold.has(threshold)) {
        const functionInVm = vm.runInContext(`(function(a, b) {
            const detail = cosineSimilarityDetails(a, b);
            return detail.similarity * Math.min(detail.coRatedCount / ${threshold}, 1);
        })`, app);
        appCosineByThreshold.set(threshold, functionInVm);
    }
    app.cosineSimilarity = appCosineByThreshold.get(threshold);
}
function appRecommendations(userId, holdout, threshold, method) {
    const original = holdout ? matrix[userId][holdout.itemId] : null;
    if (holdout) matrix[userId][holdout.itemId] = 0;
    setAppSimilarity(threshold);
    let captured = null;
    app.topRecommendations = (candidates, topK) => {
        const recommendation = originalAppTop(candidates, topK);
        captured = Array.from(candidates.slice(0, topK), x => x.movieId);
        return recommendation;
    };
    try {
        const output = app[method](userId);
        assert.equal(output.length, captured.length);
        return Array.from(output, (entry, i) => ({ movieId: captured[i], score: entry.score }));
    } finally {
        app.topRecommendations = originalAppTop;
        app.cosineSimilarity = originalAppCosine;
        if (holdout) matrix[userId][holdout.itemId] = original;
    }
}

function validateAgainstApplication() {
    // Formula checks, including the zero-overlap and saturation boundaries.
    const one = sparseCosineDetails([{ id: 1, rating: 5 }],
        [{ id: 1, rating: 1 }, { id: 2, rating: 4 }]);
    close(one.similarity, 1, 'One co-rating cosine');
    assert.equal(one.coRatedCount, 1);
    close(adjustedSimilarity(one, 10), 0.1, 'T10 one-overlap factor');
    close(adjustedSimilarity(one, 5), 0.2, 'T5 one-overlap factor');
    close(adjustedSimilarity(one, 20), 0.05, 'T20 one-overlap factor');
    assert.equal(adjustedSimilarity({ similarity: 0, coRatedCount: 0 }, 10), 0);
    assert.equal(adjustedSimilarity({ similarity: 0.8, coRatedCount: 20 }, 10), 0.8);
    for (const [first, second] of [[1, 2], [1, 88], [2, 405], [405, 943]]) {
        const sparse = sparseCosineDetails(userRows[first], userRows[second]);
        const dense = app.cosineSimilarityDetails(matrix[first], matrix[second]);
        close(sparse.similarity, dense.similarity, `User pair ${first}/${second}`);
        assert.equal(sparse.coRatedCount, dense.coRatedCount);
    }
    for (const [first, second] of [[1, 361], [1, 2], [181, 316]]) {
        const denseA = matrix.map(row => row[first]);
        const denseB = matrix.map(row => row[second]);
        const sparse = sparseCosineDetails(itemColumns[first], itemColumns[second]);
        const dense = app.cosineSimilarityDetails(denseA, denseB);
        close(sparse.similarity, dense.similarity, `Item pair ${first}/${second}`);
        assert.equal(sparse.coRatedCount, dense.coRatedCount);
    }
    const cases = [eligible.find(x => x.userId === 2),
        eligible.find(x => x.userId === 65),
        eligible.find(x => x.userId === 405)];
    for (const { userId, holdout } of cases) {
        const calculated = evaluateUser(userId, holdout);
        for (const { key, threshold } of settings) {
            for (const [label, method] of [
                ['userBased', 'getUserBasedRecommendations'],
                ['itemBased', 'getItemBasedRecommendations']
            ]) {
                const direct = appRecommendations(userId, holdout, threshold, method);
                const sparse = calculated[key][label];
                assert.deepEqual(sparse.map(x => x.movieId), direct.map(x => x.movieId),
                    `Top-5 IDs differ for user ${userId}, ${key}, ${label}`);
                for (let i = 0; i < direct.length; i++) {
                    close(sparse[i].score, direct[i].score,
                        `Score for user ${userId}, ${key}, ${label}, rank ${i + 1}`);
                }
            }
        }
    }
    return { verifiedUsers: cases.map(x => x.userId),
        directMethodComparisons: cases.length * settings.length * 2,
        formulaAndSparseDenseChecks: 'passed' };
}

function save(filename, data) {
    fs.mkdirSync(resultsDir, { recursive: true });
    const output = path.join(resultsDir, filename);
    fs.writeFileSync(output, `${JSON.stringify(data, null, 2)}\n`);
    console.log(JSON.stringify({ output, summary: data.summary ?? null }, null, 2));
}

if (mode === 'verify') {
    const verification = validateAgainstApplication();
    const user2 = evaluateUser(2, null, true);
    // Phase 2 raw result must still match the isolated analysis evaluator.
    const phase2 = JSON.parse(fs.readFileSync(path.join(resultsDir, 'user-2-top5.json')));
    for (const [label, prior] of [
        ['userBased', phase2.userBased], ['itemBased', phase2.itemBased]
    ]) {
        assert.deepEqual(user2.raw[label].map(x => movies[x.movieId - 1].title),
            prior.map(x => x.title));
        user2.raw[label].forEach((x, i) => close(x.score, prior[i].score, 'Phase 2 score'));
    }
    const report = Object.fromEntries(settings.map(({ key, threshold }) => [key, {
        threshold,
        userBased: user2[key].userBased.map(x => ({ ...x, title: movies[x.movieId - 1].title })),
        itemBased: user2[key].itemBased.map(x => ({ ...x, title: movies[x.movieId - 1].title })),
        selectedNeighbors: user2[key].neighbors,
    }]));
    save('phase4_user2.json', {
        protocol: 'Full unheld-out MovieLens matrix for user 2; T=5,10,20 sensitivity alongside raw cosine; full Top-5 contributor details',
        sourceHashes, verification,
        userId: 2, originalRatings: userRows[2].length, methods: report,
        summary: Object.fromEntries(settings.map(({ key }) => [key, {
            userBasedTop5Ids: user2[key].userBased.map(x => x.movieId),
            itemBasedTop5Ids: user2[key].itemBased.map(x => x.movieId),
            userBasedSupportCounts: user2[key].userBased.map(x => x.support.count),
            itemBasedSupportCounts: user2[key].itemBased.map(x => x.support.count),
        }]))
    });
}

function newAggregate() {
    return { hitRanks: [], shortLists: 0, supportCounts: [], weightSums: [],
        overlapHistogram: new Map(), allTop5Count: 0 };
}
function addAggregate(aggregate, list, heldOutMovieId) {
    const index = list.findIndex(x => x.movieId === heldOutMovieId);
    aggregate.hitRanks.push(index < 0 ? null : index + 1);
    if (list.length < 5) aggregate.shortLists++;
    aggregate.allTop5Count += list.length;
    for (const rec of list) {
        aggregate.supportCounts.push(rec.support.count);
        aggregate.weightSums.push(rec.support.weightSum);
        for (const n of rec.support.coRatedCounts) {
            aggregate.overlapHistogram.set(n, (aggregate.overlapHistogram.get(n) ?? 0) + 1);
        }
    }
}
function aggregateResults(aggregate, evaluatedUsers) {
    const hits = aggregate.hitRanks.filter(x => x !== null).length;
    const overlapEntries = [...aggregate.overlapHistogram].sort((a, b) => a[0] - b[0]);
    const contributions = overlapEntries.reduce((s, [, count]) => s + count, 0);
    const cumulative = limit => overlapEntries.filter(([n]) => n <= limit)
        .reduce((s, [, count]) => s + count, 0);
    const midpoint = (contributions - 1) / 2;
    const atPosition = position => {
        let count = 0;
        for (const [n, frequency] of overlapEntries) {
            count += frequency;
            if (count > position) return n;
        }
        return null;
    };
    return {
        evaluatedUsers, hits, hitRateAt5: hits / evaluatedUsers,
        mrrAt5: aggregate.hitRanks.reduce((s, rank) =>
            s + (rank === null ? 0 : 1 / rank), 0) / evaluatedUsers,
        usersWithFewerThan5Results: aggregate.shortLists,
        top5Recommendations: aggregate.allTop5Count,
        support: { contributingSimilarities: contributions,
            medianCoRatedCount: (atPosition(Math.floor(midpoint)) + atPosition(Math.ceil(midpoint))) / 2,
            coRatedCountAtMost1Fraction: cumulative(1) / contributions,
            coRatedCountAtMost2Fraction: cumulative(2) / contributions,
            coRatedCountAtMost5Fraction: cumulative(5) / contributions,
            predictionSupportCountMean: mean(aggregate.supportCounts),
            predictionSupportCountMedian: median(aggregate.supportCounts),
            similarityWeightSumMean: mean(aggregate.weightSums),
            similarityWeightSumMedian: median(aggregate.weightSums),
            coRatedCountHistogram: Object.fromEntries(overlapEntries) }
    };
}

if (mode === 'evaluate') {
    const verification = validateAgainstApplication();
    const aggregates = Object.fromEntries(settings.map(({ key }) => [key, {
        userBased: newAggregate(), itemBased: newAggregate() }]));
    const perUser = [];
    const started = performance.now();
    for (const { userId, holdout } of eligible) {
        const calculated = evaluateUser(userId, holdout);
        const row = { userId, heldOutMovieId: holdout.itemId,
            heldOutRating: holdout.rating, heldOutTimestamp: holdout.timestamp,
            methods: {} };
        for (const { key } of settings) {
            row.methods[key] = {};
            for (const label of ['userBased', 'itemBased']) {
                const list = calculated[key][label];
                assert.ok(list.every(x => matrix[userId][x.movieId] === 0 || x.movieId === holdout.itemId));
                addAggregate(aggregates[key][label], list, holdout.itemId);
                const index = list.findIndex(x => x.movieId === holdout.itemId);
                row.methods[key][label] = { rank: index < 0 ? null : index + 1,
                    top5: list.map(x => ({ movieId: x.movieId, score: x.score,
                        supportCount: x.support.count,
                        similarityWeightSum: x.support.weightSum })) };
            }
        }
        perUser.push(row);
        if (perUser.length % 100 === 0) {
            console.error(`Phase 4 evaluated ${perUser.length}/${eligible.length} users`);
        }
    }
    const phase3 = JSON.parse(fs.readFileSync(path.join(resultsDir, 'phase3_leave_one_out.json')));
    for (let i = 0; i < perUser.length; i++) {
        const current = perUser[i];
        const prior = phase3.perUser[i];
        assert.equal(current.userId, prior.userId);
        assert.equal(current.heldOutMovieId, prior.heldOutMovieId);
        assert.equal(current.methods.raw.userBased.rank, prior.userBasedRank);
        assert.equal(current.methods.raw.itemBased.rank, prior.itemBasedRank);
        assert.equal(current.methods.raw.userBased.top5.length, prior.userBasedResultCount);
        assert.equal(current.methods.raw.itemBased.top5.length, prior.itemBasedResultCount);
    }
    assert.equal(matrix.flat().filter(rating => rating !== 0).length, 100000);
    for (const [name, digest] of Object.entries(sourceHashes)) {
        assert.equal(createHash('sha256').update(fs.readFileSync(path.join(project, name)))
            .digest('hex'), digest);
    }
    const methods = Object.fromEntries(settings.map(({ key, threshold }) => [key, {
        threshold,
        userBased: aggregateResults(aggregates[key].userBased, eligible.length),
        itemBased: aggregateResults(aggregates[key].itemBased, eligible.length),
    }]));
    assert.equal(methods.raw.userBased.hits, phase3.userBased.hits);
    assert.equal(methods.raw.itemBased.hits, phase3.itemBased.hits);
    close(methods.raw.userBased.mrrAt5, phase3.userBased.mrrAt5, 'Phase 3 raw MRR');
    close(methods.raw.itemBased.mrrAt5, phase3.itemBased.mrrAt5, 'Phase 3 raw MRR');
    save('phase4_evaluation.json', {
        protocol: {
            cohort: 'Same 911 users as Phase 3: >=21 original ratings and >=1 rating >=4',
            holdout: 'Latest rating >=4 by timestamp, lower movie ID on a tie',
            isolation: 'Clear held-out matrix cell and exclude matching sparse row/column entry for this user; restore matrix cell in finally',
            topK: 5,
            ties: 'Neighbor weight descending, user ID ascending; candidate score descending, movie ID ascending',
            evaluator: 'Sparse intersection in ascending coordinate order; shared raw cosine calculated once per pair per held-out user; four confidence settings reuse it',
            baselineValidation: 'Every raw per-user Top-5 hit/rank/count matches Phase 3; direct application Top-5 IDs and scores checked on users 2, 65, 405 for all settings',
            overlapUnit: 'Each positive similarity contributing to a Top-5 prediction, including repeated pair appearances across predictions',
            totalElapsedMs: performance.now() - started,
            noTuningOnHoldouts: true
        }, sourceHashes, verification, excludedUsers: excluded,
        eligibleUsers: eligible.length, methods, perUser,
        summary: Object.fromEntries(settings.map(({ key }) => [key, {
            userBasedHits: methods[key].userBased.hits,
            userBasedHitRateAt5: methods[key].userBased.hitRateAt5,
            userBasedMRRAt5: methods[key].userBased.mrrAt5,
            itemBasedHits: methods[key].itemBased.hits,
            itemBasedHitRateAt5: methods[key].itemBased.hitRateAt5,
            itemBasedMRRAt5: methods[key].itemBased.mrrAt5,
        }]))
    });
}

function durationSummary(values) {
    return { count: values.length, meanMs: mean(values), medianMs: median(values),
        minMs: Math.min(...values), maxMs: Math.max(...values) };
}

if (mode === 'benchmark') {
    const userIds = [2, 3, 1, 405, 943];
    const measuredRepetitions = 5;
    const warmupsPerUserMethod = 2;
    const methods = [
        ['userBased', 'getUserBasedRecommendations'],
        ['itemBased', 'getItemBasedRecommendations']
    ];
    const compared = [settings[0], settings[2]];
    const timing = { raw: { userBased: {}, itemBased: {} },
        T10: { userBased: {}, itemBased: {} } };
    for (const [label, method] of methods) {
        for (const userId of userIds) {
            const durations = { raw: [], T10: [] };
            for (const setting of compared) {
                setAppSimilarity(setting.threshold);
                for (let i = 0; i < warmupsPerUserMethod; i++) app[method](userId);
            }
            for (let i = 0; i < measuredRepetitions; i++) {
                // Alternate order to reduce drift and JIT/order confounding.
                const pair = i % 2 === 0 ? compared : [...compared].reverse();
                for (const setting of pair) {
                    setAppSimilarity(setting.threshold);
                    const start = performance.now();
                    const top5 = app[method](userId);
                    durations[setting.key].push(performance.now() - start);
                    assert.ok(top5.length <= 5);
                }
            }
            for (const setting of compared) {
                const durationsMs = durations[setting.key];
                timing[setting.key][label][userId] = { durationsMs,
                    ...durationSummary(durationsMs) };
            }
        }
    }
    app.cosineSimilarity = originalAppCosine;
    const summary = Object.fromEntries(['raw', 'T10'].map(key => [key,
        Object.fromEntries(methods.map(([label]) => [label,
            durationSummary(Object.values(timing[key][label]).flatMap(x => x.durationsMs))]))]));
    save('phase4_efficiency.json', {
        protocol: { runtime: process.version, platform: process.platform,
            architecture: process.arch, clock: 'performance.now()',
            userIds, warmupsPerUserMethod, measuredRepetitions,
            order: 'Within each method and fixed user, warm raw and T10 twice each; alternate raw/T10 then T10/raw over five measured pairs',
            measuredWork: 'Complete existing on-demand recommendation functions; only cosineSimilarity is replaced inside the isolated VM for T10',
            note: 'Runtime is machine-, order-, JIT-, and implementation-specific; it is not a general scalability estimate.' },
        sourceHashes, timing, summary
    });
}
