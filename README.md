# LLM4Rec Course

Course workspace for **Recommender Systems / LLM4Rec**.

This repository is organized week by week so that coursework, experiments, reports, pull requests, and the final capstone remain reproducible and easy to review.

## Course roadmap

| Week | Topic | Status |
|---|---|---|
| 01 | Random Lunch Generator / RecSys Fundamentals | ✅ Completed |
| 02 | Content-Based Filtering | ✅ Completed |
| 03 | Collaborative Filtering | ✅ Completed |
| 04 | Association Rules | Not started |
| 05 | Matrix Factorization | Not started |
| 06 | PageRank | Not started |
| 07 | Recommender Systems with Deep Learning | Not started |
| 08 | Context Encoder | Not started |
| 09 | Context Ranker | Not started |
| 10 | Design LLM4Rec | Not started |
| 11 | Personalized Context | Not started |
| 12 | Capstone Project / Seminar | Not started |

## Week 01 — Random Lunch Generator

### Completed

- [x] Run and inspect the provided Random Lunch Generator baseline
- [x] Deploy the application with GitHub Pages
- [x] Reproduce the missing-icon issue for Ramen, Pasta, and Soup
- [x] Identify the root cause in Font Awesome Free 6.4.0
- [x] Replace invalid icon classes with verified alternatives
- [x] Improve the prompt to require dependency/version verification
- [x] Add a minimal recency-aware weighted-random extension
- [x] Verify the repeat probability mathematically
- [x] Run a seeded 100,000-draw simulation
- [x] Manually verify the final webpage behavior
- [x] Preserve the tool-native Codex `session.json`
- [x] Prepare the A01 report and 3–5 minute presentation

### Main result

The original uniform selector has an immediate-repeat probability of:

`1 / 12 = 8.33%`

Using a recency penalty of `0.25` reduces the theoretical repeat probability to:

`0.25 / 11.25 = 2.22%`

A 100,000-draw simulation produced:

- Uniform random: `8.2941%`
- Recency-aware random: `2.2480%`

All 12 foods remained represented with approximately uniform long-run frequency.

### Week 1 takeaway

AI suggestions should be treated as hypotheses rather than accepted automatically.
The most useful parts of the workflow were checking the real dependency,
verifying the mathematics, reproducing the result, and keeping code changes minimal.

## Week 02 — Content-Based Filtering

Status: ✅ Completed

### Completed

- [x] Run and preserve the instructor baseline
- [x] Correct the MovieLens 19-genre parser
- [x] Implement cosine item-to-item Top-5 recommendation
- [x] Build a three-movie averaged user profile
- [x] Implement profile-based Top-5 recommendation
- [x] Exclude all previously rated movies from recommendation candidates
- [x] Verify zero watched-item leakage after correction
- [x] Compare popularity, long-tail exposure, and catalog coverage
- [x] Diagnose minority-taste dilution from profile averaging
- [x] Test IDF-weighted genre features
- [x] Run deterministic and paired-random tie diagnostics
- [x] Preserve the final report and Codex session audit trail

### Main results

- Jaccard to cosine changed only `1 / 1682` catalog Top-5 lists (`0.059%`).
- Item-to-item vs profile retrieval changed the ordered Top-5 for
  `833 / 942` eligible users (`88.43%`).
- The two methods shared only `0.926 / 5` recommendations on average.
- The original user-level evaluation leaked already-rated movies for
  `598 / 942` users; after full-history exclusion, leakage was `0`.
- Item-to-item catalog coverage was `35.43%`, compared with `31.03%`
  for profile retrieval.
- IDF weighting increased mean distinct profile similarity scores from
  `18.47` to `137.68` and reduced membership-sensitive cutoff ties from
  `92.68%` to `75.58%`.

These results characterize recommendation behavior and representation
discriminability; they do not establish improved recommendation relevance.

### Key files

- `week02/teacher-baseline/` — original instructor baseline
- `week02/content-based-movie-recommender/` — completed Week 2 implementation
- `week02/content-based-movie-recommender/analysis/` — evaluation and audit scripts
- `week02/content-based-movie-recommender/report.pdf` — final A02 report
- `week02/content-based-movie-recommender/session.json` — Codex audit trail
## Week 03 — Collaborative Filtering

Status: ✅ Completed

### Completed

- [x] Preserve and audit the instructor Week 3 baseline
- [x] Build the MovieLens rating matrix with co-rated-only missing-value handling
- [x] Implement User-Based CF with Top-20 neighbors
- [x] Implement Item-Based CF with similarity-weighted prediction
- [x] Add selected-user / selected-movie rating prediction
- [x] Add side-by-side User-Based and Item-Based Top-5 recommendation
- [x] Exclude already-rated movies from recommendation candidates
- [x] Verify cosine and prediction formulas on deterministic examples
- [x] Measure user-user and item-item co-rating reliability
- [x] Run a 911-user leave-one-out evaluation
- [x] Compare HitRate@5, MRR@5, and runtime
- [x] Test overlap-confidence weighting at T = 5, 10, 20
- [x] Compare Week 2 content-based retrieval with Week 3 CF on 853 aligned users
- [x] Re-run final UI and recommendation regression checks
- [x] Preserve the final A03 report and native Codex session audit trail

### Main results

- Median user-user co-rating overlap was `10`; median item-item overlap was only `1`.
- `14.29%` of user pairs and `60.38%` of item pairs had at most two co-ratings.
- Even among cosine similarities `>= 0.9`, `11.94%` of user pairs and
  `47.70%` of item pairs had at most two co-ratings.
- On the 911-user leave-one-out evaluation:
  - User-Based CF: `HitRate@5 = 0.988%`, `MRR@5 = 0.004848`
  - Item-Based CF: `HitRate@5 = 0%`, `MRR@5 = 0`
- Mean on-demand runtime in the current JavaScript implementation was about
  `1.59 ms` for User-Based CF and `388.48 ms` for Item-Based CF.
- Overlap weighting increased the median evidence behind contributing
  User-Based similarities from `1` to `14` at `T = 10`, but Top-5 quality was
  threshold-sensitive: raw / `T=5` / `T=10` / `T=20` produced
  `9 / 11 / 10 / 5` User-Based hits.
- In the aligned 853-user Week 2 vs Week 3 comparison:
  - Week 2 three-movie content profile: `HitRate@5 = 2.34%`
  - Week 3 User-Based CF: `HitRate@5 = 1.41%`
  - Week 3 Item-Based CF: `HitRate@5 = 0%`

The main Week 3 finding is that a high cosine similarity is not necessarily
a reliable similarity when it is supported by very few shared ratings.
Overlap weighting improved evidence support but did not provide a stable
quality improvement, so the final application retains raw co-rated cosine.

### Key files

- `week03/teacher-baseline/` — original instructor baseline
- `week03/starter-audit/` — starter-code audit and evidence
- `week03/collaborative-filtering-movie-recommender/` — completed Week 3 implementation
- `week03/collaborative-filtering-movie-recommender/analysis/` — analysis and verification scripts
- `week03/collaborative-filtering-movie-recommender/results/` — experiment outputs
- `week03/collaborative-filtering-movie-recommender/report.pdf` — final A03 report
- `week03/collaborative-filtering-movie-recommender/session.json` — native Codex audit trail

## Repository structure

```text
LLM4Rec-Course/
├── README.md
├── AGENTS.md
├── week01/
│   └── random-lunch-generator/
├── week02/
├── week03/
├── ...
├── week12/
├── capstone/
│   ├── idea/
│   ├── experiments/
│   ├── app/
│   └── paper/
├── skills/
└── assets/
```

## Weekly working convention

Each assignment follows the course Top-Down 5-Loop:

**BUILD → ASK WHY → TEST → EXPLAIN → IMPROVE**

1. **BUILD** — run a working baseline
2. **ASK WHY** — question assumptions and consider alternatives
3. **TEST** — verify important AI outputs against code, theory, or data
4. **EXPLAIN** — describe the result in my own words
5. **IMPROVE** — change one meaningful variable and test again

Use a separate branch for meaningful weekly work, for example:

```text
week01-random-lunch
week02-content-based
week03-collaborative-filtering
```

Then open a pull request before merging to `main`.

## Safety / repository hygiene

Do **not** upload proprietary company code, internal model weights, credentials,
private datasets, internal paths, or confidential experiment artifacts.

Only course-safe examples and sanitized data should be committed.
