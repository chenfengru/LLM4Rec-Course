# Week 02 — Content-Based Movie Recommender

**Course:** LLM4Rec, HSE University  
**Status:** Implemented and audited · course report and native Codex session tracked  
**Stack:** Vanilla HTML/CSS/JavaScript (browser); Python 3 for offline diagnostics  
**Data:** MovieLens 100K, 1,682 movies and 100,000 ratings

This assignment compares **Top-5 item-to-item retrieval** against recommendations from the **average genre profile of three selected movies**. The baseline uses binary MovieLens genre features and cosine similarity; optional IDF weighting is an **analysis/representation experiment**, not evidence of higher relevance.

## Run the browser application

From the repository root:

```bash
cd week02/content-based-movie-recommender
python3 -m http.server 8000 --bind 127.0.0.1
```

Open http://127.0.0.1:8000/index.html. The browser fetches the included `u.item` and `u.data` files, so direct `file://` loading is not recommended.

The interface allows you to select a **single active movie** or a **three-movie profile** and compare Top-5 output under:

- **Binary genres — required cosine baseline**
- **IDF-weighted genres — experimental improvement**

The browser application does **not** take a user ID or enforce a particular user's complete rating history. **Full-history watched-item exclusion is applied by the separate offline user-level audit**, not by the three-movie browser picker. The browser itself excludes the selected query/profile movies.

## Algorithm

Movies have **19 binary genre flags**, including `unknown` and `Western`. The instructor's original parser incorrectly aligned 18 labels with 19 flags; the working version corrects this mapping. A selected movie's vector is scored against other movies using zero-safe cosine:

\[
s(a,b)=\frac{a\cdot b}{\|a\|_2\|b\|_2}.
\]

The profile is the arithmetic mean of **exactly three** selected movie vectors, followed by the same cosine ranking. Near-equal scores (difference at most `1e-12`) keep MovieLens source order as the deterministic tie policy.

The optional IDF representation weights each genre by:

```text
idf(g) = log((N + 1) / (df(g) + 1)) + 1
```

The browser supports this mode for either the item or the profile query.

## Verification and corrected evaluation

The later **all-watched exclusion audit** corrected a historical user-level evaluation error: excluding only the three selected positive movies had allowed movies from the same user's wider rating history back into recommended lists. The corrected audit excludes **every movie recorded in that user's `u.data` history**, regardless of rating.

| Result | Corrected, audited value |
| --- | ---: |
| Eligible users in controlled comparison | 942 |
| Users whose ordered item/profile Top-5 differ | 833/942 (88.43%) |
| Mean number of shared recommendations | 0.92569 out of 5 |
| Watched-item leakage after full-history exclusion | 0 |
| Item-to-item unique recommended movies / catalog coverage | 596 / 35.43% |
| Profile unique recommended movies / catalog coverage | 522 / 31.03% |
| Binary vs IDF profile mean distinct scores | 18.47 vs 137.68 |
| Binary vs IDF profile membership-sensitive cutoff ties | 92.68% vs 75.58% |

Additional audited observations:

- Correcting the original parser changed Jaccard Top-5 membership for **106/1,682** item seeds.
- On the corrected schema, Jaccard and binary cosine differed in Top-5 membership for **1/1,682** item seeds.
- Before full-history exclusion, the two methods together produced **1,621 leaked recommendation slots** (775 item; 846 profile) in the original controlled 942-user evaluation.
- The corrected source-order run and 20 paired-random tie-break runs had **zero** leaked slots. These checks validate the audit output, not the behavior of a hypothetical user-aware browser UI.
- IDF increased discriminability and changed rankings, but this analysis does **not** demonstrate improved held-out relevance.

## Reproduce the offline analyses

Run from the repository root; scripts read the checked-in MovieLens files:

```bash
python3 week02/content-based-movie-recommender/analysis/verify_genre_mapping.py
python3 week02/content-based-movie-recommender/analysis/verify_cosine_and_compare.py
python3 week02/content-based-movie-recommender/analysis/verify_profile_and_compare.py
python3 week02/content-based-movie-recommender/analysis/audit_all_watched_evaluation.py
python3 week02/content-based-movie-recommender/analysis/audit_idf_all_watched.py
```

For historical parser and tie experiments, see the other `analysis/*.py` scripts. These commands describe **how to rerun** the committed analyses; they have not been freshly executed as part of this documentation update.

### Authoritative results

- [Full-history exclusion summary](analysis/all_watched_evaluation_summary.md) — correct user-level retrieval and coverage values; explicitly identifies old results invalidated by leakage.
- [Full-history exclusion output](analysis/all_watched_evaluation_results.json)
- [IDF with full-history exclusion](analysis/idf_all_watched_summary.md) — corrected distinct-score counts and tie rates.
- [Corrected IDF output](analysis/idf_all_watched_results.json)
- [Cosine and schema diagnostics](analysis/cosine_summary.md)
- [Course report (PDF)](report.pdf) and [native Codex session](session.json).

Some **earlier** analysis files contain pre-correction metrics. They remain in the repository for audit history; **do not mix them with the corrected figures above**.

## Key limitations

These findings measure feature representation, ranking changes, tie sensitivity, and catalog exposure under a specific protocol. **A different Top-5 list is not necessarily a better list.** No supervised training, ratings-as-weights, text embedding, or held-out relevance gain is established by the IDF experiment. The profile mean can underrepresent a minority genre preference, as illustrated in the full-history audit, but this does not show that every averaged profile collapses.

## Project files

```text
content-based-movie-recommender/
├── index.html, style.css
├── data.js, script.js
├── u.item, u.data
├── analysis/             # Deterministic and paired-random audits, evidence
├── report.pdf
├── session.json
└── README.md
```

**Instructor baseline:** [`../teacher-baseline/`](../teacher-baseline/) — preserved separately and not overwritten.  
**Dataset reference:** Harper & Konstan, [*The MovieLens Datasets: History and Context*](https://doi.org/10.1145/2827872), ACM TiiS, 2015.
