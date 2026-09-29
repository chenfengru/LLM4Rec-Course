# Week 3 final evidence

The final application uses **raw co-rated-only cosine**. Phase 4 overlap confidence is an analysis-only experiment. Scores from Week 2 genre cosine and Week 3 predicted ratings are not directly comparable.

## Implementation and reliability

| Item | Evidence |
| --- | --- |
| Users / movies / ratings | 943 / 1,682 / 100,000 |
| Rating and missing convention | Observed 1–5; zero internally means unrated |
| Final similarity | Raw co-rated-only cosine; zero for no overlap or zero norm |
| User-Based neighborhood / output | Up to 20 positive neighbors / Top-5 |
| Median co-rated count, user / item pairs | 10 / 1 |
| Pair fraction with ≤2 co-ratings, user / item | 14.29% / 60.38% |
| High-cosine (≥0.9) pairs with ≤2 co-ratings, user / item | 11.94% / 47.70% |

The pair counts are 444,153 unique user pairs and 1,413,721 unique item pairs. Small overlap does not make cosine mathematically incorrect; it limits how much evidence supports that value.

## Held-out evaluation

Phase 3 used 911 users, each with the most recent rating ≥4 held out and at least 20 remaining ratings.

| Method | Hits | HitRate@5 | MRR@5 | Fewer than five |
| --- | ---: | ---: | ---: | ---: |
| Raw User-Based | 9 | 0.99% | 0.004848 | 0 |
| Raw Item-Based | 0 | 0.00% | 0.000000 | 0 |

The controlled overlap-confidence experiment used the same 911 users. T=10 was primary; T=5 and T=20 were sensitivity checks.

| Setting | User hits / HR@5 / MRR@5 | Item hits / HR@5 / MRR@5 | Median contributing overlap, user / item |
| --- | --- | --- | --- |
| T5 | 11 / 1.21% / 0.005562 | 0 / 0.00% / 0.000000 | 7 / 1 |
| T10 | 10 / 1.10% / 0.004958 | 0 / 0.00% / 0.000000 | 14 / 1 |
| T20 | 5 / 0.55% / 0.002506 | 0 / 0.00% / 0.000000 | 25 / 1 |

The T=10 User-Based gain was one net hit (10 gained, 9 lost relative to raw), and T=20 fell below raw. Item-Based remained at zero. No weighted setting was adopted in the application.

## Efficiency

| Dimension | Full square including self | Unique unordered excluding self |
| --- | ---: | ---: |
| Users | 889,249 | 444,153 |
| Items | 2,829,124 | 1,413,721 |

Phase 3 timed complete raw on-demand calls on users [2, 3, 1, 405, 943], with two warmups and five measured calls each: User-Based mean/median 1.588/1.398 ms; Item-Based 388.484/332.312 ms. Full pair counts and on-demand runtimes answer different questions; neither predicts general scalability.

## Aligned Week 2 versus Week 3

The 853-user primary comparison reuses Phase 3 held-out targets. It requires at least 20 user ratings and three positive profile movies with timestamps strictly earlier than the target. Of the 911 Phase 3 users, 57 lack 20 earlier ratings and one further user lacks three earlier positives. The same earlier-only active-user row and unseen-movie candidate pool are used for all methods. Other users retain full histories; this is not a global chronological split.

| Method | Users | Hits | HitRate@5 | MRR@5 | Fewer than five |
| --- | ---: | ---: | ---: | ---: | ---: |
| Week 2 three-movie binary-genre profile | 853 | 20 | 2.34% | 0.010219 | 0 |
| Week 3 User-Based raw | 853 | 12 | 1.41% | 0.007562 | 0 |
| Week 3 Item-Based raw | 853 | 0 | 0.00% | 0.000000 | 0 |

| Top-5 pair | Mean shared movies out of 5 | Users with zero overlap |
| --- | ---: | ---: |
| Content / User-Based | 0.081 | 785/853 (92.03%) |
| Content / Item-Based | 0.001 | 852/853 (99.88%) |
| User-Based / Item-Based | 0.000 | 853/853 (100.00%) |

Low list overlap describes different rankings; it does not establish which list is more relevant. The 853-user results should not be substituted for Phase 3's 911-user results because the active-user history was restricted to earlier interactions.

## Representative cases

### User 79: Content-Based succeeds; both CF methods miss

Earlier ratings: 53. Profile: I Shot Andy Warhol (1996) (4/5); Star Trek: First Contact (1996) (4/5); Shanghai Triad (Yao a yao yao dao waipo qiao) (1995) (4/5). Held-out: Twelve Monkeys (1995) (5/5).

| Rank | Week 2 profile | Week 3 User-Based | Week 3 Item-Based |
| ---: | --- | --- | --- |
| 1 | Ben-Hur (1959) | Usual Suspects, The (1995) | King of New York (1990) |
| 2 | Twelve Monkeys (1995) | From Dusk Till Dawn (1996) | Mamma Roma (1962) |
| 3 | Mad City (1997) | Braveheart (1995) | Police Story 4: Project S (Chao ji ji hua) (1993) |
| 4 | Day the Earth Stood Still, The (1951) | Birdcage, The (1996) | Fire on the Mountain (1996) |
| 5 | Perfect World, A (1993) | Brothers McMullen, The (1995) | Daniel Defoe's Robinson Crusoe (1996) |

The held-out movie has Drama and Sci-Fi tags. Drama appears in two profile movies and Sci-Fi in one, giving Week 2 a genre cosine of 0.802 and rank 2. User-Based predicts 3.2 from five contributing neighbors while its Top-5 scores are 5; Item-Based predicts 4.021 for the held-out movie while its Top-5 scores are at least 4.313. This explains the list difference through observed features and ratings.

### User 20: User-Based succeeds; Content-Based misses

Earlier ratings: 45. Profile: Jurassic Park (1993) (4/5); Lost World: Jurassic Park, The (1997) (4/5); Braveheart (1995) (5/5). Held-out: Searching for Bobby Fischer (1993) (5/5).

| Rank | Week 2 profile | Week 3 User-Based | Week 3 Item-Based |
| ---: | --- | --- | --- |
| 1 | Stargate (1994) | Shanghai Triad (Yao a yao yao dao waipo qiao) (1995) | Coldblooded (1995) |
| 2 | Star Trek: First Contact (1996) | Dead Man Walking (1995) | Rough Magic (1995) |
| 3 | Star Trek VI: The Undiscovered Country (1991) | Postino, Il (1994) | Turning, The (1992) |
| 4 | Star Trek: The Wrath of Khan (1982) | Crumb (1994) | Ill Gotten Gains (1997) |
| 5 | Star Trek III: The Search for Spock (1984) | Searching for Bobby Fischer (1993) | Intimate Relations (1996) |

The profile is dominated by Action, Adventure, and Sci-Fi; the held-out movie is Drama only, with genre cosine 0.224. User-Based ranks it fifth at a predicted 5, but that prediction is from one neighbor whose similarity rests on one shared rating. The hit is real under the protocol and has weak support. Item-Based gives the target 3.091, below its Top-5 cutoff.

### User 2: Item-Based failure example

Earlier ratings: 57. Profile: Air Force One (1997) (4/5); Fly Away Home (1996) (4/5); Good Will Hunting (1997) (5/5). Held-out: As Good As It Gets (1997) (5/5).

| Rank | Week 2 profile | Week 3 User-Based | Week 3 Item-Based |
| ---: | --- | --- | --- |
| 1 | GoldenEye (1995) | Maltese Falcon, The (1941) | They Made Me a Criminal (1939) |
| 2 | Apollo 13 (1995) | It Happened One Night (1934) | Shadows (Cienie) (1988) |
| 3 | Free Willy 2: The Adventure Home (1995) | Manchurian Candidate, The (1962) | The Courtyard (1995) |
| 4 | Outbreak (1995) | Babe (1995) | Yankee Zulu (1994) |
| 5 | Free Willy (1993) | From Dusk Till Dawn (1996) | Hostile Intentions (1994) |

The held-out Comedy/Drama movie has genre cosine 0.316 against the three-movie profile. User-Based predicts 5 from one neighbor but does not rank it in Top-5. Item-Based predicts 3.807 from 57 positive item similarities; its Top-5 instead scores 4.5 for movies with only one observed rating each. Those winning similarities have one co-rating. This is a concrete sparse-item ranking failure under the protocol.

## Homework question coverage and remaining evidence

- **A. User-Based versus Item-Based quality and efficiency:** measured both held-out retrieval and local on-demand runtime. In these protocols User-Based hit more targets and ran faster. The dataset has more items than users, so a full item-pair matrix also has more pairs. These observations do not establish general superiority.
- **B. Missing-value strategies:** co-rated-only uses only observed data and is simple, but the measured overlap distributions show unreliable-looking high similarities from few shared ratings. Overlap-confidence weighting was measured: it improved User-Based support, had small threshold-sensitive hit changes, and did not resolve Item-Based's zero hits. **Mean imputation** could provide dense vectors but can introduce average-rating bias and must preserve the original observed mask; **matrix factorization** could learn latent representations from sparse data but needs training, validation, and more computation. The latter two were not implemented or empirically compared.
- **C. Cold start and sparsity:** without a rated item, a new user has no co-rated entries for User-Based similarity and no rated items to seed Item-Based scores. An unrated new movie also lacks item co-ratings. The observed MovieLens sparsity and low-overlap statistics support the reliability concern; the dataset has no zero-history users for an empirical cold-start test. Confidence weighting does not create new interactions.
- **D. Week 2 versus Week 3:** the aligned 853-user outcomes and pairwise list overlaps are measured. Week 2 uses genre similarity from three earlier liked movies; Week 3 uses ratings from the earlier active-user history and other users. Raw score scales differ, and the comparison retains other users' full histories.

Further evidence before a broad quality or business claim would require additional held-out targets or splits, a global time-aware protocol if temporal causality matters, and direct tests of cold-start handling or alternative algorithms. No user or business outcomes were measured.

Sources: machine-readable files in ../results/phase3_*, ../results/phase4_evaluation.json, ../results/phase5_aligned_comparison.json, and ../results/phase5_cases.json.
