# Phase 4 controlled overlap-confidence experiment

The question is whether confidence adjustment for small co-rating overlap changes reliability and held-out retrieval. The application remains at its Phase 2 **co-rated-only raw cosine** baseline. Phase 4 changes similarity only inside an isolated analysis script:

```text
adjusted_similarity = raw_co_rated_cosine * min(co_rated_count / T, 1)
```

The primary setting is `T=10`. `T=5` and `T=20` are sensitivity checks, reported whether or not they outperform the primary setting. The factor is a confidence adjustment to the similarity estimate. It adds no rating, fills no missing matrix cell, and does not solve cold start.

Run from the repository root with Node 18+:

```sh
node week03/collaborative-filtering-movie-recommender/analysis/phase4.mjs verify
node week03/collaborative-filtering-movie-recommender/analysis/phase4.mjs evaluate
node week03/collaborative-filtering-movie-recommender/analysis/phase4.mjs benchmark
```

These modes write only new `phase4_*.json` files under `results/`. `verify` writes full-matrix user 2 Top-5 and contributor details for raw/T5/T10/T20. `evaluate` writes all per-user holdout results and cohort support aggregates. `benchmark` measures raw versus T10 complete recommendation calls.

## Holdout and validation

The cohort and target selection are identical to Phase 3: 911 users with at least 21 original ratings and at least one rating `>=4`; the latest such rating by timestamp is held out, with smaller movie ID breaking timestamp ties. The held-out matrix cell is zero during scoring and restored in `finally`. The corresponding entry is also excluded from the analysis-only sparse row and column. Other users' ratings of the target movie remain available. Top-5 is sorted by descending score and ascending movie ID on exact ties; the User-Based top-20 neighborhood is sorted by descending similarity and ascending user ID. Hits compare movie IDs, not potentially duplicate titles. All users remain in the HitRate and MRR denominators even if a method returns fewer than five items.

For speed, the evaluator intersects sorted observed ratings rather than scanning dense zero-filled vectors. Co-rated dot products and norms are accumulated in the same coordinate order as the application. Raw cosine is calculated once per user/user or item/item pair for a held-out user, then the four settings reuse it without carrying pair values across different holdouts. Predictions otherwise use the application's existing weighted-average formulas. The script checks the Top-5 IDs and scores from the actual application functions on held-out users 2, 65, and 405 for all four settings. For **all 911 users**, it checks raw holdout IDs, Top-5 ranks, and result counts against the saved Phase 3 baseline. It reconstructs every Top-5 prediction from the recorded contributors and checks that the full matrix and dataset hashes are restored.

## Support statistics

Support is measured over positive similarities that contribute to **Top-5 predictions in the held-out cohort**. A pair may contribute to more than one recommendation; each contribution is counted in the overlap distribution. Prediction support count is the number of neighbors who rated a candidate (User-Based) or active-user-rated items with positive similarity to it (Item-Based). The similarity-weight sum is the denominator of that recommendation's weighted average. Reporting median co-rated count and the fractions at `<=1`, `<=2`, and `<=5` makes the confidence change visible without changing the algorithm or selecting a threshold from the results.

## Timing

The fixed benchmark users are `[2, 3, 1, 405, 943]`, as in Phase 3. For each method and user, raw and T10 each receive two warmups and five measured calls. The measured order alternates raw/T10 and T10/raw to reduce ordering and JIT drift. Timing includes full on-demand recommendation calls, including item-column construction and candidate sorting. All timings are machine- and implementation-specific. They do not establish general scalability.

## Interpretation boundary

This is one positive holdout per eligible user, not a randomized test split or a test of all possible relevant movies. There are no observed negatives for every unchosen movie. A change of one or two Top-5 hits among 911 users is a small protocol-specific observation. The sensitivity settings are not a search for a winner, and the primary `T=10` setting is not chosen using held-out outcomes. Raw co-rated cosine is mathematically valid; small overlap can make its apparent certainty misleading. No business outcome or cold-start improvement is inferred from these results.
