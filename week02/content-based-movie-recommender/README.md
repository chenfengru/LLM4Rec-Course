# Week 2: Content-Based Movie Recommender

## Objective

Compare Top-5 recommendations from one active movie with recommendations from an aggregated three-movie profile, using MovieLens 100K genre features and cosine similarity.

## Run the app

From this directory, start a local server:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000/`. The app loads `u.item` in the browser, so serving the directory is more portable than opening `index.html` directly.

## Required implementation

- Parses all 19 MovieLens genre fields with the corrected mapping, including `unknown` and `Western`.
- Represents each movie as a 19-dimensional binary genre vector.
- Uses zero-safe cosine similarity and returns five scored recommendations.
- Keeps the active movie out of item-to-item candidates.
- Builds the profile by averaging exactly three movie vectors element by element.
- Keeps all three watched movies out of profile candidates.
- Uses MovieLens source order as the deterministic tie-break after a `1e-12` score comparison.

The required default is **Binary genres — required cosine baseline**. The interface keeps both **Item-to-Item Cosine** and **3-Movie Profile Cosine** available for direct comparison.

## Experimental IDF improvement

The optional **IDF-weighted genres — experimental improvement** mode weights each genre by

```text
idf(g) = log((N + 1) / (df(g) + 1)) + 1
```

Movie vectors are weighted before cosine scoring; three-movie profiles average the weighted vectors. This mode is a controlled representation experiment, not part of the required binary-cosine baseline.

## Reproducible analysis

Scripts and their machine-readable and Markdown results are in `analysis/`:

- `audit_parser_impact.py` — impact of the original 18-label parser defect.
- `verify_genre_mapping.py` — corrected mapping checks.
- `verify_cosine_and_compare.py` — cosine arithmetic, Jaccard comparison, and overlap diagnostic.
- `verify_profile_and_compare.py` — profile arithmetic, real-user comparison, and catalog diagnostics.
- `audit_tie_sensitivity.py` — source-order versus seeded random tie-breaking.
- `audit_idf_weighting.py` — IDF arithmetic, discrimination, catalog, and paired tie-robustness checks.

Run any script from the repository root with `python3 path/to/script.py`. Each script uses the checked-in MovieLens files and fixed seeds where randomness is involved.

## Key verified findings

- Correcting the parser changed Top-2 membership for 83 of 1,682 seeds and Top-5 membership for 106 of 1,682 seeds under the original Jaccard setup.
- Corrected Jaccard and ordinary binary cosine produced different Top-5 membership for 1 of 1,682 item seeds; this is a catalog observation, not a relevance result.
- In the controlled 942-user comparison, ordered item/profile Top-5 lists differed for 833 users (88.4289%), with mean set-overlap fraction 0.18535.
- Binary genre vectors create large score-tie groups, and catalog popularity/coverage measurements are sensitive to tie-breaking.
- IDF weighting increased the mean number of distinct candidate scores from 10.01 to 85.88 for item queries and from 19.10 to 147.99 for profile queries, while reducing tie frequency in the measured setup.

## Limitations

The representation contains only 19 coarse genres. It does not use ratings as weights, recency weights, collaborative signals, text embeddings, or popularity reranking. The controlled comparisons measure ranking behavior and catalog diagnostics, not held-out relevance. Consequently, neither profile aggregation nor IDF weighting is claimed to improve recommendation quality. Exact/tolerance-level ties still exist, and deterministic source-order tie-breaking can affect membership at the Top-5 cutoff.
