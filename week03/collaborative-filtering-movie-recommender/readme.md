# Week 03 — Collaborative Filtering Movie Recommender

**Course:** LLM4Rec, HSE University  
**Status:** Implemented, verified, evaluated, and reported  
**Stack:** Vanilla HTML/CSS/JavaScript · Node.js (offline analyses, Node 18+ recommended)  
**Dataset:** MovieLens 100K · 943 users, 1,682 movies, 100,000 observed ratings

This project implements and compares **User-Based** and **Item-Based Collaborative Filtering (CF)** based on observed user–movie ratings. Unlike Week 2's genre-based retrieval, these algorithms use **co-rating patterns**, with explicit handling of missing ratings and sparse neighborhoods.

The instructor's original specification is preserved separately under [`../teacher-baseline/`](../teacher-baseline/). This file describes the **completed student implementation and measured results**, not the original code-generation prompt.

## Quick start

From the repository root:

```bash
cd week03/collaborative-filtering-movie-recommender
python3 -m http.server 8000 --bind 127.0.0.1
```

Open http://127.0.0.1:8000/index.html. Data are loaded with `fetch('u.item')` and `fetch('u.data')`, so **HTTP serving is required** rather than assuming direct `file://` loading works.

The browser interface supports two workflows:

1. **Single rating prediction:** select a user and an unrated movie; inspect both User-Based and Item-Based estimates and their evidence-support counts.
2. **Top-5 recommendation:** choose a user and compare two side-by-side lists, excluding that user's already-rated movies.

The application is self-contained, with no npm install or external ML library. The Python command above only starts a static file server; **the recommendation algorithms run in JavaScript**.

## Algorithm and missing-value convention

The rating matrix indexes **users × movies**, with observed integer ratings from 1 to 5. A zero is an **internal missing-value sentinel**, not an actual zero rating or evidence of dislike. Similarity uses only **co-rated coordinates**:

\[
\operatorname{sim}(a,b) = \frac{\sum_{j\in C} a_j b_j}
{\sqrt{\sum_{j\in C}a_j^2}\sqrt{\sum_{j\in C}b_j^2}},
\]

where `C` is the set of coordinates rated by both users/items. Empty overlap or zero norm yields similarity zero.

- **User-Based CF:** find up to **20** other users with positive similarity, then score unseen movies using a similarity-weighted average of ratings from neighbors who rated the movie.
- **Item-Based CF:** compare item columns on shared raters; score a candidate using positively similar items the active user has rated and a similarity-weighted rating average.
- **Top-5:** exclude all already-rated movies; order by descending predicted score, with movie ID as deterministic tie-breaker.
- **Evidence support:** show contributing-neighbor count for User-Based and contributing-rated-item count for Item-Based. These are descriptive counts; they do **not** directly reweight the final app's similarities.

The final application deliberately retains **raw co-rated-only cosine**. **Overlap-confidence weighting was tested as an offline alternative and was not adopted.**

## Deterministic verification

Run from the repository root (Node.js with built-in `fetch`/`Response` support, for example Node 18+):

```bash
node week03/collaborative-filtering-movie-recommender/analysis/verify_cf.mjs
node week03/collaborative-filtering-movie-recommender/analysis/verify_phase6a.mjs
```

The committed checks cover hand-checkable cosine and toy-matrix cases, no-overlap behavior, actual MovieLens counts, recommendation exclusions, selected User 2 Top-5 consistency, UI wiring, and dataset immutability. The saved [Phase 6A verification output](results/phase6a_verification.json) documents a previous verification run. The above commands are offered for reproducibility and were **not freshly rerun for this README update**.

## Main measured results

### Sparsity and similarity reliability

| Diagnostic | User–user pairs | Item–item pairs |
| --- | ---: | ---: |
| Unique unordered pairs | 444,153 | 1,413,721 |
| Median common ratings | 10 | 1 |
| Pairs with ≤2 common ratings | 14.29% | 60.38% |
| Pairs with cosine ≥0.9 that have ≤2 common ratings | 11.94% | 47.70% |

Very high cosine scores can therefore be supported by **one or two** ratings. That is a reliability concern, not a mathematical failure of cosine.

### Held-out evaluation (911 eligible users)

The experiment holds out each eligible user's most recent **positive** rating, leaving at least 20 earlier ratings for the active user.

| Method | Hits | HitRate@5 | MRR@5 |
| --- | ---: | ---: | ---: |
| User-Based raw cosine | 9 | 0.988% | 0.004848 |
| Item-Based raw cosine | 0 | 0% | 0 |

**Measured on-demand runtime** (five users, two warmups and five repetitions per method; local JavaScript implementation): **1.588 ms mean** for User-Based, versus **388.484 ms mean** for Item-Based. This is not a general cross-device performance claim.

### Overlap-confidence sensitivity (analysis only)

| Configuration | User-Based hits / 911 | Item-Based hits / 911 |
| --- | ---: | ---: |
| Raw cosine (final app) | 9 | 0 |
| T = 5 | 11 | 0 |
| T = 10 | 10 | 0 |
| T = 20 | 5 | 0 |

For `T=10` the User-Based count rose by **one net hit** (10 gained and 9 lost relative to raw) and changes were sensitive to `T`. Item-Based still retrieved no targets. The final browser app **does not apply** this weighting.

### Week 2 vs Week 3 on an aligned 853-user cohort

| Ranking method | Hits | HitRate@5 | MRR@5 |
| --- | ---: | ---: | ---: |
| Week 2 three-movie binary-genre profile | 20 | 2.34% | 0.010219 |
| Week 3 User-Based CF | 12 | 1.41% | 0.007562 |
| Week 3 Item-Based CF | 0 | 0% | 0 |

This experiment uses the same held-out targets and **earlier-only active-user history**. Other users' full histories remain available, so it is **not a globally chronological split**. These 853-user numbers must not be mixed with the separate 911-user comparison. Week 2 cosine scores and Week 3 predicted rating scores have different meanings and are not directly comparable.

Representative case analyses (Users **79**, **20**, and **2**) and the reasons behind successes/failures are in the [final evidence summary](analysis/week03_final_evidence.md).

## Evidence and reproduction map

| File | Purpose |
| --- | --- |
| [`analysis/week03_final_evidence.md`](analysis/week03_final_evidence.md) | Canonical prose summary, protocols, caveats, representative users |
| [`results/week03_final_evidence.json`](results/week03_final_evidence.json) | Structured metrics, cohort definitions, sensitivities |
| [`results/phase3_leave_one_out.json`](results/phase3_leave_one_out.json) | Individual held-out evaluation |
| [`results/phase3_reliability.json`](results/phase3_reliability.json) | Pairwise overlap and high-similarity evidence |
| [`results/phase3_efficiency.json`](results/phase3_efficiency.json) | Pair counts and local runtime |
| [`results/phase4_evaluation.json`](results/phase4_evaluation.json) | Overlap-confidence experiments |
| [`results/phase5_aligned_comparison.json`](results/phase5_aligned_comparison.json) | Week 2 vs Week 3 common-cohort comparison |
| [`results/phase6a_verification.json`](results/phase6a_verification.json) | Final application regression/immutability evidence |
| [`report.pdf`](report.pdf) | Final Week 3 course report |
| [`session.json`](session.json) | AI-tool session audit trail |

The canonical evidence JSON was produced at an earlier research stage and contains a then-current note stating that no report PDF existed. **The PDF was subsequently added to this repository**; that historical metadata remains unaltered for audit provenance.

## Limitations and lessons

- **One positive holdout per user** and only one dataset do not establish general ranking quality.
- Co-rated cosine can reach 1.0 on a single observed match, even when the similarity has poor evidential support.
- Cold start was **discussed, not measured** on users with no rating history. Mean imputation and MF were **not implemented or benchmarked** as Week 3 alternatives.
- The threshold-sensitive overlap experiment did not justify replacing raw cosine in the submitted app.
- Runtime is a local on-demand measurement, **not** production-serving latency or a generalized scalability result.

## Files

```text
collaborative-filtering-movie-recommender/
├── index.html, style.css       # Browser UI
├── data.js, script.js          # MovieLens loader and CF scoring
├── u.item, u.data              # MovieLens 100K
├── analysis/                   # Verification and evaluation scripts
├── results/                    # Saved machine-readable evidence
├── report.pdf                  # Course report
├── session.json                # Native AI session audit
└── readme.md
```

**Dataset reference:** Harper & Konstan, [*The MovieLens Datasets: History and Context*](https://doi.org/10.1145/2827872), ACM TiiS, 2015.
