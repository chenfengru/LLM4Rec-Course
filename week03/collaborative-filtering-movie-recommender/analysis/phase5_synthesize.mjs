// Rebuild the final machine-readable and Markdown evidence summaries.
// Run: node week03/collaborative-filtering-movie-recommender/analysis/phase5_synthesize.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const resultsDir = path.join(project, 'results');
const read = name => JSON.parse(fs.readFileSync(path.join(resultsDir, name), 'utf8'));
const phase3Reliability = read('phase3_reliability.json');
const phase3Evaluation = read('phase3_leave_one_out.json');
const phase3Efficiency = read('phase3_efficiency.json');
const phase4 = read('phase4_evaluation.json');
const aligned = read('phase5_aligned_comparison.json');
const caseData = read('phase5_cases.json');
assert.equal(aligned.alignedUsers, 853);
assert.equal(phase3Evaluation.userBased.evaluatedUsers, 911);
assert.equal(phase4.methods.raw.userBased.hits, phase3Evaluation.userBased.hits);
assert.equal(caseData.cases.length, 3);

const sensitivity = Object.fromEntries(['T5', 'T10', 'T20'].map(key => [key, {
    userBased: {
        hits: phase4.methods[key].userBased.hits,
        hitRateAt5: phase4.methods[key].userBased.hitRateAt5,
        mrrAt5: phase4.methods[key].userBased.mrrAt5,
        medianContributingOverlap: phase4.methods[key].userBased.support.medianCoRatedCount,
    },
    itemBased: {
        hits: phase4.methods[key].itemBased.hits,
        hitRateAt5: phase4.methods[key].itemBased.hitRateAt5,
        mrrAt5: phase4.methods[key].itemBased.mrrAt5,
        medianContributingOverlap: phase4.methods[key].itemBased.support.medianCoRatedCount,
    },
}]));
const evidence = {
    scope: 'Week 3 application remains raw co-rated-only cosine; all Phase 4 weighting was analysis-only. No report.pdf was produced.',
    sourceResults: [
        'phase3_reliability.json', 'phase3_leave_one_out.json',
        'phase3_efficiency.json', 'phase4_evaluation.json',
        'phase5_aligned_comparison.json', 'phase5_cases.json'
    ],
    implementation: { users: 943, movies: 1682, ratings: 100000,
        ratingRange: [1, 5], missingMarker: 0,
        similarity: 'raw co-rated-only cosine', userNeighborLimit: 20,
        recommendationCount: 5 },
    reliability: {
        userPairs: phase3Reliability.users.pairsEvaluated,
        itemPairs: phase3Reliability.items.pairsEvaluated,
        userPairMedianCoRated: phase3Reliability.users.allPairsCoRatedCounts.median,
        itemPairMedianCoRated: phase3Reliability.items.allPairsCoRatedCounts.median,
        userPairAtMost2Fraction: phase3Reliability.users.allPairsCoRatedCounts.atMost['2'].fraction,
        itemPairAtMost2Fraction: phase3Reliability.items.allPairsCoRatedCounts.atMost['2'].fraction,
        highCosineDefinition: 'raw cosine >= 0.9',
        highCosineUserPairs: phase3Reliability.users.highSimilarityPairCount,
        highCosineItemPairs: phase3Reliability.items.highSimilarityPairCount,
        highCosineUserAtMost2Fraction: phase3Reliability.users.highSimilarityCoRatedCounts.atMost['2'].fraction,
        highCosineItemAtMost2Fraction: phase3Reliability.items.highSimilarityCoRatedCounts.atMost['2'].fraction,
    },
    evaluation: {
        phase3CohortUsers: 911,
        rawUserBased: phase3Evaluation.userBased,
        rawItemBased: phase3Evaluation.itemBased,
        overlapConfidenceExperiment: { applicationAdopted: false,
            primaryThreshold: 10, sensitivity },
    },
    efficiency: {
        theoreticalPairCounts: phase3Efficiency.theoreticalPairCounts,
        phase3OnDemandBenchmark: {
            fixedUserIds: phase3Efficiency.protocol.userIds,
            warmupsPerUserMethod: phase3Efficiency.protocol.warmupsPerUserMethod,
            repetitionsPerUserMethod: phase3Efficiency.protocol.measuredRepetitions,
            userBasedMeanMs: phase3Efficiency.summary.userBased.mean,
            userBasedMedianMs: phase3Efficiency.summary.userBased.median,
            itemBasedMeanMs: phase3Efficiency.summary.itemBased.mean,
            itemBasedMedianMs: phase3Efficiency.summary.itemBased.median,
        }
    },
    week2VsWeek3: {
        phase3CohortUsers: 911,
        alignedUsers: aligned.alignedUsers,
        excluded: { fewerThan20EarlierRatings:
            aligned.excludedUsers.fewerThan20EarlierRatings.length,
            fewerThan3EarlierPositives:
            aligned.excludedUsers.fewerThan3EarlierPositives.length },
        protocol: aligned.protocol,
        contentProfile: aligned.metrics.content,
        userBased: aligned.metrics.userBased,
        itemBased: aligned.metrics.itemBased,
        top5SetOverlap: aligned.overlaps,
        cases: aligned.selectedCases,
    },
    homeworkCoverage: {
        userVsItem: { status: 'measured on this dataset and protocol',
            evidence: ['phase3_leave_one_out.json', 'phase3_efficiency.json',
                'phase5_aligned_comparison.json'],
            limit: 'One positive holdout per eligible user and one local JavaScript runtime do not establish general quality or scalability.' },
        missingValueTradeoffs: { status: 'co-rated-only and overlap confidence measured; alternatives conceptual only',
            evidence: ['phase3_reliability.json', 'phase4_evaluation.json'],
            untested: ['mean imputation', 'matrix factorization'] },
        coldStartAndSparsity: { status: 'sparsity measured; cold start explained conceptually',
            evidence: ['phase3_reliability.json', 'phase4_evaluation.json'],
            limit: 'MovieLens 100K excludes zero-history users; this experiment has no empirical cold-start cohort.' },
        contentVsCf: { status: 'aligned held-out and Top-5 overlap measured',
            evidence: ['phase5_aligned_comparison.json', 'phase5_cases.json'],
            limit: 'Other users retain full ratings, so this is not a global chronological split.' }
    },
};

const pct = x => `${(100 * x).toFixed(2)}%`;
const num = x => Number(x).toFixed(3);
const mrr = x => Number(x).toFixed(6);
const movieList = (caseItem, key) => caseItem[key].map(x => x.title);
const caseNarratives = {
    contentSucceedsCfFails: 'The held-out movie has Drama and Sci-Fi tags. Drama appears in two profile movies and Sci-Fi in one, giving Week 2 a genre cosine of 0.802 and rank 2. User-Based predicts 3.2 from five contributing neighbors while its Top-5 scores are 5; Item-Based predicts 4.021 for the held-out movie while its Top-5 scores are at least 4.313. This explains the list difference through observed features and ratings.',
    userCfSucceedsContentFails: 'The profile is dominated by Action, Adventure, and Sci-Fi; the held-out movie is Drama only, with genre cosine 0.224. User-Based ranks it fifth at a predicted 5, but that prediction is from one neighbor whose similarity rests on one shared rating. The hit is real under the protocol and has weak support. Item-Based gives the target 3.091, below its Top-5 cutoff.',
    itemCfFailure: 'The held-out Comedy/Drama movie has genre cosine 0.316 against the three-movie profile. User-Based predicts 5 from one neighbor but does not rank it in Top-5. Item-Based predicts 3.807 from 57 positive item similarities; its Top-5 instead scores 4.5 for movies with only one observed rating each. Those winning similarities have one co-rating. This is a concrete sparse-item ranking failure under the protocol.'
};
const caseMarkdown = caseData.cases.map(item => {
    const profile = item.profile.map(x => `${x.title} (${x.rating}/5)`).join('; ');
    const rows = Array.from({ length: 5 }, (_, index) =>
        `| ${index + 1} | ${movieList(item, 'content')[index]} | ${movieList(item, 'userBased')[index]} | ${movieList(item, 'itemBased')[index]} |`).join('\n');
    const caseLabels = {
        contentSucceedsCfFails: 'Content-Based succeeds; both CF methods miss',
        userCfSucceedsContentFails: 'User-Based succeeds; Content-Based misses',
        itemCfFailure: 'Item-Based failure example',
    };
    return `### User ${item.userId}: ${caseLabels[item.type] ?? item.type}\n\n`
        + `Earlier ratings: ${item.priorRatingCount}. Profile: ${profile}. Held-out: ${item.heldOut.title} (${item.heldOut.rating}/5).\n\n`
        + `| Rank | Week 2 profile | Week 3 User-Based | Week 3 Item-Based |\n`
        + `| ---: | --- | --- | --- |\n${rows}\n\n`
        + `${caseNarratives[item.type]}\n`;
}).join('\n');

const pair = evidence.efficiency.theoreticalPairCounts;
const rel = evidence.reliability;
const md = `# Week 3 final evidence\n\n`
    + `The final application uses **raw co-rated-only cosine**. Phase 4 overlap confidence is an analysis-only experiment. Scores from Week 2 genre cosine and Week 3 predicted ratings are not directly comparable.\n\n`
    + `## Implementation and reliability\n\n`
    + `| Item | Evidence |\n| --- | --- |\n`
    + `| Users / movies / ratings | 943 / 1,682 / 100,000 |\n`
    + `| Rating and missing convention | Observed 1–5; zero internally means unrated |\n`
    + `| Final similarity | Raw co-rated-only cosine; zero for no overlap or zero norm |\n`
    + `| User-Based neighborhood / output | Up to 20 positive neighbors / Top-5 |\n`
    + `| Median co-rated count, user / item pairs | ${rel.userPairMedianCoRated} / ${rel.itemPairMedianCoRated} |\n`
    + `| Pair fraction with ≤2 co-ratings, user / item | ${pct(rel.userPairAtMost2Fraction)} / ${pct(rel.itemPairAtMost2Fraction)} |\n`
    + `| High-cosine (≥0.9) pairs with ≤2 co-ratings, user / item | ${pct(rel.highCosineUserAtMost2Fraction)} / ${pct(rel.highCosineItemAtMost2Fraction)} |\n\n`
    + `The pair counts are ${rel.userPairs.toLocaleString()} unique user pairs and ${rel.itemPairs.toLocaleString()} unique item pairs. Small overlap does not make cosine mathematically incorrect; it limits how much evidence supports that value.\n\n`
    + `## Held-out evaluation\n\n`
    + `Phase 3 used 911 users, each with the most recent rating ≥4 held out and at least 20 remaining ratings.\n\n`
    + `| Method | Hits | HitRate@5 | MRR@5 | Fewer than five |\n| --- | ---: | ---: | ---: | ---: |\n`
    + `| Raw User-Based | ${phase3Evaluation.userBased.hits} | ${pct(phase3Evaluation.userBased.hitRateAt5)} | ${mrr(phase3Evaluation.userBased.mrrAt5)} | ${phase3Evaluation.userBased.usersWithFewerThan5Results} |\n`
    + `| Raw Item-Based | ${phase3Evaluation.itemBased.hits} | ${pct(phase3Evaluation.itemBased.hitRateAt5)} | ${mrr(phase3Evaluation.itemBased.mrrAt5)} | ${phase3Evaluation.itemBased.usersWithFewerThan5Results} |\n\n`
    + `The controlled overlap-confidence experiment used the same 911 users. T=10 was primary; T=5 and T=20 were sensitivity checks.\n\n`
    + `| Setting | User hits / HR@5 / MRR@5 | Item hits / HR@5 / MRR@5 | Median contributing overlap, user / item |\n| --- | --- | --- | --- |\n`
    + ['T5', 'T10', 'T20'].map(key => {
        const s = sensitivity[key];
        return `| ${key} | ${s.userBased.hits} / ${pct(s.userBased.hitRateAt5)} / ${mrr(s.userBased.mrrAt5)} | ${s.itemBased.hits} / ${pct(s.itemBased.hitRateAt5)} / ${mrr(s.itemBased.mrrAt5)} | ${s.userBased.medianContributingOverlap} / ${s.itemBased.medianContributingOverlap} |`;
    }).join('\n') + `\n\n`
    + `The T=10 User-Based gain was one net hit (10 gained, 9 lost relative to raw), and T=20 fell below raw. Item-Based remained at zero. No weighted setting was adopted in the application.\n\n`
    + `## Efficiency\n\n`
    + `| Dimension | Full square including self | Unique unordered excluding self |\n| --- | ---: | ---: |\n`
    + `| Users | ${pair.users.fullSquareIncludingSelf.toLocaleString()} | ${pair.users.uniqueUnorderedExcludingSelf.toLocaleString()} |\n`
    + `| Items | ${pair.items.fullSquareIncludingSelf.toLocaleString()} | ${pair.items.uniqueUnorderedExcludingSelf.toLocaleString()} |\n\n`
    + `Phase 3 timed complete raw on-demand calls on users [2, 3, 1, 405, 943], with two warmups and five measured calls each: User-Based mean/median ${num(phase3Efficiency.summary.userBased.mean)}/${num(phase3Efficiency.summary.userBased.median)} ms; Item-Based ${num(phase3Efficiency.summary.itemBased.mean)}/${num(phase3Efficiency.summary.itemBased.median)} ms. Full pair counts and on-demand runtimes answer different questions; neither predicts general scalability.\n\n`
    + `## Aligned Week 2 versus Week 3\n\n`
    + `The 853-user primary comparison reuses Phase 3 held-out targets. It requires at least 20 user ratings and three positive profile movies with timestamps strictly earlier than the target. Of the 911 Phase 3 users, 57 lack 20 earlier ratings and one further user lacks three earlier positives. The same earlier-only active-user row and unseen-movie candidate pool are used for all methods. Other users retain full histories; this is not a global chronological split.\n\n`
    + `| Method | Users | Hits | HitRate@5 | MRR@5 | Fewer than five |\n| --- | ---: | ---: | ---: | ---: | ---: |\n`
    + [['Week 2 three-movie binary-genre profile', aligned.metrics.content],
        ['Week 3 User-Based raw', aligned.metrics.userBased],
        ['Week 3 Item-Based raw', aligned.metrics.itemBased]]
        .map(([label, m]) => `| ${label} | ${m.evaluatedUsers} | ${m.hits} | ${pct(m.hitRateAt5)} | ${mrr(m.mrrAt5)} | ${m.usersWithFewerThan5Results} |`).join('\n')
    + `\n\n`
    + `| Top-5 pair | Mean shared movies out of 5 | Users with zero overlap |\n| --- | ---: | ---: |\n`
    + [['Content / User-Based', aligned.overlaps.contentVsUserBased],
        ['Content / Item-Based', aligned.overlaps.contentVsItemBased],
        ['User-Based / Item-Based', aligned.overlaps.userBasedVsItemBased]]
        .map(([label, o]) => `| ${label} | ${num(o.meanSharedItemsOutOf5)} | ${o.usersWithZeroOverlap}/${o.evaluatedUsers} (${pct(o.zeroOverlapFraction)}) |`).join('\n')
    + `\n\nLow list overlap describes different rankings; it does not establish which list is more relevant. The 853-user results should not be substituted for Phase 3's 911-user results because the active-user history was restricted to earlier interactions.\n\n`
    + `## Representative cases\n\n${caseMarkdown}\n`
    + `## Homework question coverage and remaining evidence\n\n`
    + `- **A. User-Based versus Item-Based quality and efficiency:** measured both held-out retrieval and local on-demand runtime. In these protocols User-Based hit more targets and ran faster. The dataset has more items than users, so a full item-pair matrix also has more pairs. These observations do not establish general superiority.\n`
    + `- **B. Missing-value strategies:** co-rated-only uses only observed data and is simple, but the measured overlap distributions show unreliable-looking high similarities from few shared ratings. Overlap-confidence weighting was measured: it improved User-Based support, had small threshold-sensitive hit changes, and did not resolve Item-Based's zero hits. **Mean imputation** could provide dense vectors but can introduce average-rating bias and must preserve the original observed mask; **matrix factorization** could learn latent representations from sparse data but needs training, validation, and more computation. The latter two were not implemented or empirically compared.\n`
    + `- **C. Cold start and sparsity:** without a rated item, a new user has no co-rated entries for User-Based similarity and no rated items to seed Item-Based scores. An unrated new movie also lacks item co-ratings. The observed MovieLens sparsity and low-overlap statistics support the reliability concern; the dataset has no zero-history users for an empirical cold-start test. Confidence weighting does not create new interactions.\n`
    + `- **D. Week 2 versus Week 3:** the aligned 853-user outcomes and pairwise list overlaps are measured. Week 2 uses genre similarity from three earlier liked movies; Week 3 uses ratings from the earlier active-user history and other users. Raw score scales differ, and the comparison retains other users' full histories.\n\n`
    + `Further evidence before a broad quality or business claim would require additional held-out targets or splits, a global time-aware protocol if temporal causality matters, and direct tests of cold-start handling or alternative algorithms. No user or business outcomes were measured.\n\n`
    + `Sources: machine-readable files in ../results/phase3_*, ../results/phase4_evaluation.json, ../results/phase5_aligned_comparison.json, and ../results/phase5_cases.json.\n`;

const jsonOutput = path.join(resultsDir, 'week03_final_evidence.json');
const markdownOutput = path.join(project, 'analysis', 'week03_final_evidence.md');
fs.writeFileSync(jsonOutput, `${JSON.stringify(evidence, null, 2)}\n`);
fs.writeFileSync(markdownOutput, md);
console.log(JSON.stringify({ jsonOutput, markdownOutput,
    alignedUsers: aligned.alignedUsers, caseUsers: caseData.cases.map(x => x.userId) }, null, 2));
