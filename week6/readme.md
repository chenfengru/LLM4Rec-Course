# Week 06 — Movie Recommendations with Personalized PageRank

**LLM4Rec · HSE University · Individual assignment**  
**Implementation:** JavaScript + TensorFlow.js 4.22.0 (browser/WebGL) · **Dataset:** MovieLens 100K  
**Status:** Implemented, experimentally evaluated, and verified (12 PASS / 0 FAIL / 0 PENDING).

This project compares four movie-recommendation methods using a common offline retrieval protocol: **Popularity**, **Global PageRank**, **Personalized PageRank (PPR)**, and the **instructor-provided matrix-factorization (MF) reference**. The main question is whether restarting a graph walk at the target user improves recommendation retrieval over global rankings.

**Main finding:** validation selected **α = 0.50** for PPR. On the same 861-user test cohort, PPR achieved **Recall@10 = 0.112189**, compared with 0.079693 for global PageRank, 0.076023 for popularity, and 0.021137 for the provided MF configuration.

> **Scope:** These are offline results for the evaluated implementations, not evidence that PPR always outperforms a correctly trained MF model or improves real-world retention or revenue.

## Quick start

Requirements: Python 3 (or any static HTTP server), a modern browser with WebGL support, and internet access for the TensorFlow.js CDN. There is **no npm installation, Python ML environment, or build step**.

From the repository root:

```bash
cd week6
python3 -m http.server 8000 --bind 127.0.0.1
```

Open **http://127.0.0.1:8000/index.html**.

Do not open the HTML file through `file://`: the application loads `u.data` and `u.item` with `fetch()`. If port 8000 is occupied, choose a different port and update the URL.

The application loads **TensorFlow.js 4.22.0 from jsDelivr**; D3 is vendored in `vendor/d3.min.js`. The measured experiment used **Headless Chrome 155.0.8059.85, macOS, TensorFlow.js 4.22.0, WebGL**. Results on other backends may differ slightly due to floating-point arithmetic.

### Using the application

The interface is organized into four pages; navigation preserves the current browser session state:

1. **Setup** — load MovieLens data, construct the training graph, and inspect graph statistics.
2. **Recommend** — inspect an eligible Top-10 list for a selected user and method.
3. **Evaluate** — run the validation alpha sweep and the four-method test comparison; inspect the fixed two-user controlled PPR experiment.
4. **Verify** — run the in-app self-checks and export machine-readable verification and results.

The combined four-method evaluation **runs validation selection before test evaluation**. If the standalone alpha sweep was already run, the combined handler repeats it; that is redundant computation, not test-data tuning. The MF reference trains lazily when needed. Keep the page open until a full evaluation finishes.

## Data and graph

The code uses the included **MovieLens 100K** files (`u.data`, `u.item`) and a **per-user chronological 80/10/10 train/validation/test split**. Movies are candidates only if they appear in training.

| Quantity | Measured value |
| --- | ---: |
| Users / catalog movies / ratings | 943 / 1,682 / 100,000 |
| Train / validation / test ratings | 79,619 / 9,596 / 10,785 |
| Training users / candidate movies | 943 / 1,611 |
| Positive training user–movie pairs (`rating ≥ 4`) | 45,602 |
| Graph nodes | 2,554 |
| Zero-positive-degree users / movies | 1 / 253 |

Only positive **training** ratings create binary user–movie edges. Ratings below 4 and missing ratings create no *positive* edge; neither is treated as an explicit negative graph link. Both directions of every positive edge are represented.

The bipartite adjacency matrix is:

\[
A = \begin{bmatrix}0 & R \\ R^\top & 0\end{bmatrix},
\qquad
R_{ui} = \mathbf{1}[\text{training rating}_{ui} \ge 4].
\]

After row normalization, the PageRank/PPR update is:

\[
p_{t+1} = \alpha\left(Q^\top p_t + d_t v\right) + (1-\alpha)v.
\]

Here `α` is the probability of **following a graph link** and `1 − α` is the **restart probability**; `d_t` is probability mass on zero-degree nodes and `v` is the restart distribution. For global PageRank, `v` is uniform across all graph nodes. For PPR, `v` is one-hot at the target user node. Core propagation uses TensorFlow.js tensor operations over the graph's bipartite blocks, avoiding a fully materialized square transition matrix.

Initialize `p_0 = v`. Stop when the L1 residual is below `10^-6`, or after a maximum of 500 iterations; hitting the cap is not treated as convergence.

## Candidate ranking and evaluation

- **Popularity:** number of distinct training users who rated a movie at least 4.
- **Global PageRank:** stationary graph-walk movie-node scores with uniform restart.
- **PPR:** stationary graph-walk movie-node scores with restart at the target user.
- **MF:** the provided seeded 16-factor reference implementation, selected by its lowest validation rating RMSE. It was not changed for this experiment.

For **validation** recommendations, exclude all movies the user rated in training. For **test** recommendations, exclude all movies the user rated in both training and validation, **regardless of rating value**. Sort scores descending, break exact ties by **ascending movie ID**, and return up to 10 training-candidate movies.

A relevant evaluation movie has rating ≥ 4, is in the training candidate pool, and passes the appropriate exclusion rules. Recall@10 is averaged **per user** over a shared warm-user cohort:

\[
\mathrm{Recall@10}_{\text{macro}} =
\frac{1}{|\mathcal{U}|}\sum_{u\in\mathcal{U}}
\frac{|\mathrm{Top10}_u\cap\mathrm{Relevant}_u|}
{|\mathrm{Relevant}_u|}.
\]

PPR probabilities are **not** predicted ratings, viewing probabilities, or purchase probabilities; raw PPR and MF score magnitudes should not be compared directly.

## Validation and final results

One population-wide PPR alpha was selected **using validation Recall@10 only**, from `{0.50, 0.70, 0.85, 0.95}`. Exact ties are resolved in favor of the smaller alpha. The selected value is also used for the main global PageRank test comparison; this is **not** an independently optimized PageRank alpha.

| PPR alpha | Validation Recall@10 | Cohort |
| ---: | ---: | ---: |
| **0.50** | **0.114483** | 846 |
| 0.70 | 0.104797 | 846 |
| 0.85 | 0.090021 | 846 |
| 0.95 | 0.073750 | 846 |

**Selected α = 0.50.** It was applied before inspecting the test results.

| Method | Test Recall@10 | Mean training popularity |
| --- | ---: | ---: |
| Popularity | 0.076023 | 271.997 |
| Global PageRank (α = 0.50) | 0.079693 | 257.820 |
| **PPR (α = 0.50)** | **0.112189** | **244.207** |
| Provided MF reference | 0.021137 | 96.761 |

All methods used the **same 861-user test cohort**. A total of **13 relevant test records** were absent from the training candidate pool; **82 users** had no eligible relevant test movie. Exclusion categories must not be added without accounting for overlap.

PPR improved test Recall@10 by approximately **47.6% relative to popularity** and **40.8% relative to global PageRank**. Mean training popularity is the average count of distinct positive training users of the recommended items; it is **not** a measure of exposure, novelty, or diversity.

All **861 test-user PPR runs converged**, with at most 22 iterations and a maximum observed L1 residual of approximately `9.9944 × 10^-7`; none hit the 500-iteration cap.

### Fixed-user inspection and controlled demo

The fixed users were chosen before reviewing outcome quality: **User 1** and **User 2**, the smallest IDs in the shared test cohort. Their training histories, eight primary Top-10 lists (2 users × 4 methods), titles, genres, scores, per-item training popularity, list means, and overlap are all recorded in [experiment-summary.md](evidence/experiment-summary.md) and [recommendations.csv](evidence/recommendations.csv).

The required one-factor-at-a-time PPR demonstration uses:

| Comparison setting | User | Alpha | Difference from baseline |
| --- | ---: | ---: | --- |
| Baseline | 1 | 0.85 | — |
| Change restart seed only | 2 | 0.85 | 0/10 shared movies |
| Change alpha only | 1 | 0.50 | 7/10 shared movies |

These comparisons describe these two particular users; lower overlap alone does not prove better personalization. The controlled **0.85** reference setting is separate from the **validation-selected 0.50** used for final test evaluation.

### MF diagnostic limitation

The unchanged provided MF reference trained for 30 epochs (16 factors, seed 20261013, Adam learning rate 0.01, regularization 0.05, batch size 512), selecting epoch 1 at **validation RMSE = 1.1829944264**. The recorded validation RMSE did not improve across epochs.

For **both inspected users**, all **1,611** candidate scores were identical (`3.5806026459`), with zero prediction variance. Their MF Top-10 lists therefore depended on each user's exclusions and ascending movie-ID tie-breaking, rather than discriminative MF scores. This limits conclusions to **this provided reference configuration**; determining the exact cause of collapse would require additional controlled MF experiments.

**Offline decision:** replace the *provided MF ranking* with PPR for the personalized recommendation section, subject to online validation. A user-level randomized A/B test could compare recommendation-to-play conversion with serving latency and catalog-exposure concentration as guardrails. This dataset cannot establish effects on current-session intent, completed views, retention, or revenue.

## Verification and reproducibility

The final experiment reported **12 PASS / 0 FAIL / 0 PENDING** in the WebGL browser. Checks cover reference PageRank/PPR vectors, normalized rows, restart probability, total probability mass, nonnegativity, stationarity, dangling nodes, graph orientation, candidate filtering, node mapping, and the required public API surface.

Independent evaluation rebuilt the chronological split, candidate pool, exclusions and shared cohort directly from `u.data`, and recomputed all four methods' macro Recall@10 from frozen browser recommendations: **absolute difference 0 for every method**. A separate Float64 sparse-graph reference also matched Popularity, PageRank and PPR aggregate Recall@10 and ordered Top-10 results. This is a **specific checked run**, not a cross-device reproducibility guarantee.

Committed, audited evidence:

| File | Contents |
| --- | --- |
| [`evidence/verification.json`](evidence/verification.json) | Backend and 12 official self-check results |
| [`evidence/results.csv`](evidence/results.csv) | 4 test rows + 4 validation alpha rows + 2 convergence rows |
| [`evidence/recommendations.csv`](evidence/recommendations.csv) | 80 primary recommendation rows + 20 additional controlled-demo rows |
| [`evidence/experiment-summary.md`](evidence/experiment-summary.md) | Full measured setup, top lists, popularity, convergence, MF diagnostics, cross-checks and SHA-256 hashes |

The CSVs preserve the exact browser-exported bytes, including CRLF line endings. Additional temporary browser-controller and audit files are not required to run the application and are not all committed.

## Source layout

```text
week6/
├── index.html                 # Browser application
├── style.css                  # UI layout and workflow navigation
├── data.js                    # MovieLens parsing and chronological split
├── graph.js                   # Bipartite graph and TF.js PageRank/PPR
├── script.js                  # UI, baselines, evaluation, self-checks, exports
├── u.data, u.item             # MovieLens 100K source data
├── vendor/d3.min.js           # Local D3 dependency
└── evidence/
    ├── experiment-summary.md
    ├── verification.json
    ├── results.csv
    └── recommendations.csv
```

## Limitations and provenance

This study uses a **warm-user, per-user chronological** split, not a globally chronological or session-level evaluation. Sparse ratings and held-out relevance do not measure consumption or business impact; statistical uncertainty across alternative splits/seeds was not established. The supplied MF reference may not be representative of a well-tuned MF model.

- **Assignment:** Seungmin Jin, HSE LLM4Rec, [original Week 6 specification (pinned instructor commit)](https://github.com/dryjins/RecSys-LLMs/blob/00c032fb58ca5f7bec05218b5bebee01e462e532/week6/readme.md). This README documents the **completed implementation** rather than repeating the original starter instructions.
- **Dataset:** F. M. Harper and J. A. Konstan, [*The MovieLens Datasets: History and Context*](https://doi.org/10.1145/2827872), ACM TiiS, 2015.
- **Toolchain:** [TensorFlow.js](https://github.com/tensorflow/tfjs), version 4.22.0 in the app's pinned CDN script.

**Submission note:** The course-format PDF report and the unmodified native Codex session log are separate submission artifacts; they are not included in this repository.
