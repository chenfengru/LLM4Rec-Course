# All-watched exclusion evidence audit

## Reproduce

```bash
python3 week02/content-based-movie-recommender/analysis/audit_all_watched_evaluation.py
```

This is a new audit. Historical result files remain unchanged.

## Leakage: before and after

The previous controlled evaluation excluded only the three selected positive
movies. With every movie appearing in each user's `u.data` history treated as
watched, the previous deterministic Top-5 results had:

- eligible users: **942**
- users with item-mode leakage: **457**
- users with profile-mode leakage: **464**
- item leaked slots: **775**
- profile leaked slots: **846**
- combined leaked slots: **1621**

Concrete examples list `(movie ID, title, user's rating)`:

- user 1: item leakage [(16, 'French Twist (Gazon maudit) (1995)', 5), (49, 'I.Q. (1994)', 3), (66, 'While You Were Sleeping (1995)', 4), (70, 'Four Weddings and a Funeral (1994)', 3), (81, 'Hudsucker Proxy, The (1994)', 5)]; profile leakage [(16, 'French Twist (Gazon maudit) (1995)', 5), (49, 'I.Q. (1994)', 3), (66, 'While You Were Sleeping (1995)', 4), (70, 'Four Weddings and a Funeral (1994)', 3), (81, 'Hudsucker Proxy, The (1994)', 5)]
- user 3: item leakage []; profile leakage [(271, 'Starship Troopers (1997)', 3)]
- user 4: item leakage [(361, 'Incognito (1997)', 5)]; profile leakage []

After excluding the full rated set for every user, both item and profile
leakage are **zero for all source-order and 20 paired-random evaluations**:
1,884 source-order method/user assertions and 37,680 paired-random assertions.

## Profile averaging diagnostic

- mean cosine across all profile/input pairs: **0.720234**
- median of each user's minimum similarity: **0.547723**
- 10th percentile of each user's minimum similarity: **0.377964**
- lowest minimum: **0.218218** for user **104**

Lowest-minimum profile:

- Return of the Jedi (1983): `0.975900` — Action, Adventure, Romance, Sci-Fi, War
- Star Wars (1977): `0.975900` — Action, Adventure, Romance, Sci-Fi, War
- Fierce Creatures (1997): `0.218218` — Comedy

The aggregate evidence does not support calling every averaged profile a
"collapse": mean profile/input cosine is 0.720234. It does show concrete
minority-taste underrepresentation; user 104's Comedy-only input has cosine
0.218218 when the other two inputs share the same five non-Comedy genres.

## Previous numbers invalidated by leakage

| Metric | Old item | Corrected item | Old profile | Corrected profile |
|---|---:|---:|---:|---:|
| Mean rating count | 126.885350 | 108.188323 | 136.668153 | 114.021019 |
| Median rating count | 93.000000 | 75.500000 | 104.000000 | 89.000000 |
| Long-tail share | 0.521444 | 0.584076 | 0.477707 | 0.555414 |
| Unique movies | 485 | 596 | 435 | 522 |
| Catalog coverage | 0.288347 | 0.354340 | 0.258621 | 0.310345 |

Ordered-change count remains 833/942, but overlap changes from
0.185350 to
0.185138; all user-level
comparison and catalog values must therefore be sourced from the corrected run.

## Corrected deterministic source-order results

- ordered Top-5 changed: **833 / 942 (88.428875%)**
- mean Top-5 set overlap: **0.185138**
- mean shared items: **0.925690 / 5**

| Method | Mean rating count | Median | Long-tail share | Unique movies | Coverage |
|---|---:|---:|---:|---:|---:|
| Item-to-item | 108.188323 | 75.500000 | 0.584076 | 596 | 0.354340 |
| Profile | 114.021019 | 89.000000 | 0.555414 | 522 | 0.310345 |

## Corrected paired-random results (20 seeds)

Each seed assigns one fixed priority to every movie ID and shares that mapping
between item and profile tie-breaking.

| Comparison metric | Mean | Population SD | Min | Max |
|---|---:|---:|---:|---:|
| Ordered Top-5 changed (%) | 88.545648 | 0.167513 | 88.110403 | 88.853503 |
| Mean set overlap | 0.185117 | 0.002119 | 0.182378 | 0.188535 |
| Mean shared items / 5 | 0.925584 | 0.010594 | 0.911890 | 0.942675 |

| Item metric | Mean | Population SD | Min | Max |
|---|---:|---:|---:|---:|
| Mean rating count | 63.727527 | 3.122779 | 57.840977 | 70.388535 |
| Median rating count | 30.800000 | 4.411349 | 25.000000 | 40.000000 |
| Long-tail share | 0.772781 | 0.020851 | 0.735456 | 0.809979 |
| Unique movies | 525.800000 | 5.626722 | 514.000000 | 537.000000 |
| Catalog coverage | 0.312604 | 0.003345 | 0.305589 | 0.319263 |

| Profile metric | Mean | Population SD | Min | Max |
|---|---:|---:|---:|---:|
| Mean rating count | 73.848726 | 3.243542 | 68.942887 | 79.492569 |
| Median rating count | 41.400000 | 3.878144 | 30.000000 | 48.000000 |
| Long-tail share | 0.737219 | 0.020495 | 0.706794 | 0.781316 |
| Unique movies | 458.200000 | 5.600000 | 446.000000 | 470.000000 |
| Catalog coverage | 0.272414 | 0.003329 | 0.265161 | 0.279429 |

Relative conclusions across seeds:

- profile mean popularity higher in **20 / 20** seeds
- profile median popularity higher in **20 / 20** seeds
- profile long-tail share lower in **19 / 20** seeds
- profile unique count lower in **20 / 20** seeds
- profile coverage lower in **20 / 20** seeds

The long-tail direction is not universal: seed 5 has item share 0.750955 and
profile share 0.754989. The popularity and unique/coverage directions are
consistent across all 20 seeds.

## Business questions

1. **Item-to-Item vs Profile-Based — what trade-off is observed?** The methods
   produce different ordered Top-5 lists for 88.428875% of users under source
   order, with only 0.925690 shared items out of five on average. The profile
   blends three genre vectors, but in this evaluation its recommendations are
   more concentrated in popular and fewer unique catalog items. This is an
   exposure trade-off, not evidence of higher or lower relevance.
2. **Bias mitigation — is either method more popularity-skewed?** Profile mode
   has higher mean and median recommendation popularity deterministically and
   in all 20 paired-random seeds. A popularity penalty, long-tail quota, or
   diversity-aware reranker could be proposed for a future controlled test;
   none was tested here.
3. **Catalog discovery — which exposes more long-tail/catalog items?** Item mode
   has more unique movies and higher coverage deterministically and in all 20
   seeds. Its long-tail share is higher deterministically and in 19/20 seeds,
   so that specific direction remains tie-sensitive rather than universal.

## Environment and data

- Python: `3.10.11` (CPython) at `/Library/Frameworks/Python.framework/Versions/3.10/bin/python3`
- Browser/JavaScript: Codex in-app browser; exact browser/JavaScript engine version not exposed
- Node: `v24.19.0` at `/Users/chenfengru/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node`
- Codex: `codex-cli 0.155.0-alpha.9.2` at `/Applications/ChatGPT.app/Contents/Resources/codex`
- Model: version not exposed
- Seeds: `0` through `19`
- Data: `u.item` SHA-256 `553841ebc7de3a0fd0d6b62a204ea30c1e651aacfb2814c7a6584ac52f2c5701`; `u.data` SHA-256 `06416e597f82b7342361e41163890c81036900f418ad91315590814211dca490`

## Interpretation boundaries

The corrected protocol measures ranking differences, popularity, and catalog
exposure. It does not measure relevance, retention, or business impact. A
popularity penalty, long-tail quota, or diversity-aware reranker could be
tested as future mitigation, but none was tested in this audit.
