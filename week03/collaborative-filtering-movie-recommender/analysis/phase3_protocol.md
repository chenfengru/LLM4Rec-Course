# Phase 3 analysis protocol

Run from the repository root with Node 18+:

```sh
node week03/collaborative-filtering-movie-recommender/analysis/phase3.mjs support
node week03/collaborative-filtering-movie-recommender/analysis/phase3.mjs reliability
node week03/collaborative-filtering-movie-recommender/analysis/phase3.mjs benchmark
node week03/collaborative-filtering-movie-recommender/analysis/phase3.mjs loo
node week03/collaborative-filtering-movie-recommender/analysis/phase3.mjs spotcheck
```

Each mode loads the existing `data.js` and `script.js` through a Node VM and writes a separate `phase3_*.json` file under `results/`. No application algorithm is replaced. For exact-item evaluation, a temporary wrapper around the existing `topRecommendations()` captures movie IDs **after** its normal sort and slice; it returns the original recommendations unchanged. This is necessary because the UI contract exposes titles and scores but not IDs, and titles need not be unique.

## Support and reliability

The support trace uses the full matrix for user 2 and recomputes the weights of the five results from each method. Each predicted score is checked against its reconstructed similarity-weighted average. It records every contributing neighbor or rated item, its positive similarity, rating, and co-rated count.

The reliability run scans every unique unordered user pair and item pair, excluding self-pairs. Pairs with no shared observations are retained in the all-pairs overlap distribution. High similarity is raw cosine >= 0.9. Percentiles are linearly interpolated between sorted observations at index `(n - 1) * p`. The diagnostic overlap count never weights the cosine.

## Leave-one-out

Users are considered in ascending ID order. Eligibility requires at least 21 original ratings, leaving at least 20, and at least one rating >= 4. For each eligible user, choose the most recent positive rating by timestamp; the smaller movie ID wins timestamp ties. Clear exactly that `ratingMatrix[userId][itemId]` cell before calling either current recommender. Restore it in a `finally` block before the next user. The script asserts that the matrix is fully restored at the end.

All 100,000 source ratings remain in the separate `ratings` array, but the recommenders access only `ratingMatrix`; neither method reads that array after loading. Other users' ratings of the target movie remain available, as in a standard user-specific holdout. No model parameters or thresholds are tuned against holdout outcomes.

The current code breaks neighbor ties by ascending user ID and candidate score ties by ascending movie ID, after descending raw similarity or score. Hits compare internal movie IDs. `HitRate@5` divides the number of hits by all evaluated users. `MRR@5` averages `1/rank` for a hit and zero for a miss. Users producing fewer than five recommendations remain in the denominator. These are single-positive, top-five retrieval diagnostics, not full ranking-quality estimates; missing movies are not established negatives.

The optional spot check uses ten fixed eligible users, reconstructs each held-out item's full candidate rank from the application's sorted candidate array, and cross-checks the derived Top-5 hit against the exhaustive results. It also records observed rating counts for the held-out item and the five Item-Based recommendations, with the held-out cell still removed. This is an audit of the zero Item-Based hits, not a new recommendation method.

## Efficiency

Square pair counts include self-pairs: `n²`. Unique unordered pairs exclude self-pairs: `n(n-1)/2`. These counts describe a full matrix comparison, not the exact number of pair comparisons made per on-demand query.

The benchmark fixes users `[2, 3, 1, 405, 943]` to cover different rating counts. It warms each method twice and records five complete recommendation-call durations per user, using `performance.now()` in one Node process. It does not subtract item-column construction or candidate sorting. Mean and median are reported per user and across the 25 calls per method. CPU load, JIT state, and implementation choices affect these times, so they are not general scalability measurements.

For a user with `r` rated movies, the current User-Based function calls cosine `943-1 = 942` times over vectors of length 1,683. The current Item-Based function calls cosine `r * (1682-r)` times over vectors of length 944, after transposing the matrix on each call. These per-request counts are distinct from the full square pair counts.

## Proposed Week 2 / Week 3 alignment

Both weeks use byte-identical `u.item` and `u.data` files. For a user in the same holdout cohort, construct Week 2's default **binary-genre** single-item query from the most recent remaining positive movie and the three-movie profile from the three most recent remaining positive movies, breaking timestamp ties by movie ID. Use the same held-out target and remove every movie the user has already rated from the Week 2 candidate list. The existing Week 2 UI excludes only its one or three seed movies, so an analysis wrapper would be needed for this aligned exclusion; no Week 2 code is changed in this phase.

Then compare exact movie-ID Top-5 membership, overlap, and held-out HitRate/MRR under the same user cohort and target selection. Week 2 cosine scores measure genre similarity and Week 3 scores estimate ratings, so raw scores cannot be compared directly. Week 2 uses one or three liked movies, whereas current Week 3 uses the complete remaining rating history; even with common targets and candidates, the methods receive different amounts and kinds of information. A separate controlled-history experiment would be needed to isolate that factor. No Week 2/Week 3 performance or business conclusion is made here.
