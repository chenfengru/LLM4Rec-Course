# IDF diagnostics with all-watched exclusion

## Reproduce

```bash
python3 week02/content-based-movie-recommender/analysis/audit_idf_all_watched.py
```

The protocol has 942 eligible users. Every movie appearing in a user's
`u.data` records is excluded for binary/IDF item and profile ranking. Historical
`idf_results.json` and `idf_summary.md` remain unchanged for audit history.

## Corrected tie and discriminability diagnostics

| Method | Mean distinct scores | Top-5 tie | Cutoff tie | Membership-sensitive cutoff | Mean cutoff group |
|---|---:|---:|---:|---:|---:|
| Binary item | 9.666667 | 100.000000% | 99.469214% | 94.479830% | 94.138741 |
| IDF item | 79.495754 | 96.602972% | 96.284501% | 89.596603% | 88.877619 |
| Binary profile | 18.469214 | 99.893843% | 98.832272% | 92.675159% | 61.065521 |
| IDF profile | 137.677282 | 90.870488% | 85.987261% | 75.583864% | 31.348148 |

## Binary versus IDF Top-5 membership change

- source-order item: **263 / 942 (27.919321%)**
- source-order profile: **704 / 942 (74.734607%)**
- paired-random item: mean **27.749469%**, SD **0.371398**, range **[26.963907, 28.556263]**
- paired-random profile: mean **74.140127%**, SD **0.597128**, range **[72.611465, 75.053079]**

For each seed 0–19, one movie-priority mapping is shared by all four methods.

## Leakage assertions

- source-order checks: **3768**, leaked slots **0**
- paired-random checks: **75360**, leaked slots **0**
- invariant: `Top5 ∩ watched_set = empty` for every method/user/tie policy

## Values that replace the defective report numbers

| Method | Old distinct | Corrected distinct | Old Top-5 tie | Corrected Top-5 tie | Old cutoff tie | Corrected cutoff tie |
|---|---:|---:|---:|---:|---:|---:|
| Binary item | 10.011677 | 9.666667 | 100.000000% | 100.000000% | 99.575372% | 99.469214% |
| IDF item | 85.876858 | 79.495754 | 96.284501% | 96.602972% | 95.647558% | 96.284501% |
| Binary profile | 19.100849 | 18.469214 | 100.000000% | 99.893843% | 99.044586% | 98.832272% |
| IDF profile | 147.993631 | 137.677282 | 90.976645% | 90.870488% | 83.970276% | 85.987261% |

Old source-order membership-change rates were
25.583864% for item and
74.203822% for profile; use
the corrected values above instead. This audit measures discrimination and
tie structure, not recommendation relevance.
