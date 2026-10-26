# HW6 experiment evidence summary

**Measured results.** Source frozen at `454af269d268e9babf1f305a7efa807e8ea3c773`; branch `week06-personalized-pagerank`. No commit or push.

## A. Environment

TensorFlow.js **4.22.0**, **webgl** backend, isolated Headless Chrome **155.0.8059.85**, macOS. Completed 2026-10-20. Source commit and branch are recorded above. The reused server was bound to `127.0.0.1:8000` and served exactly `/Users/chenfengru/LLM4Rec-Course-codex/week6`.

The fresh application had no trained MF, validation sweep, test comparison, or recorded recommendations. Full checkpoints: [environment.json](/Users/chenfengru/LLM4Rec-Course-codex/week6/evidence/environment.json) and [server-source-checkpoint.json](/Users/chenfengru/LLM4Rec-Course-codex/week6/evidence/server-source-checkpoint.json).

## B. Data and graph counts

| Quantity | Measured count |
| --- | --- |
| Users / catalog movies / ratings | 943 / 1682 / 100000 |
| Train / validation / test ratings | 79619 / 9596 / 10785 |
| Training users / candidates | 943 / 1611 |
| Positive training interactions | 45602 |
| Graph nodes | 2554 |
| Zero-degree users / movies | 1 / 253 |

## C. Verification

12 PASS / 0 FAIL / 0 PENDING on WebGL. Exact details are in verification.json.

## D–E. Validation and selected alpha

| Alpha | Validation Recall@10 | Cohort | Error |
|---|---:|---:|---|
| 0.50 | 0.11448315913208877 | 846 | none |
| 0.70 | 0.1047969507641043 | 846 | none |
| 0.85 | 0.09002077155336492 | 846 | none |
| 0.95 | 0.07375030387909676 | 846 | none |

Selected alpha = **0.50**. Slider, readout and hw6ReadAlpha() all matched before test evaluation. No test comparison existed at that checkpoint. The four-method handler repeated the same validation table before test evaluation. Exact ties use the smaller alpha.

## F. MF checkpoint and measured diagnostics

16 factors; seed **20261013**; 30 epochs; learning rate 0.01; regularization 0.05; batch size 512; WebGL. Selected validation-RMSE checkpoint: **epoch 1**, RMSE **1.1829944264078285**.

All 30 epochs recorded train RMSE **1.1052078640164102** and validation RMSE **1.1829944264078285**: no improvement across the recorded epochs. The checkpoint used the validation RMSE objective; PPR alpha used validation Recall@10.

| Factor matrix | Shape | L2 norm | RMS |
| --- | --- | --- | --- |
| userFactors | [944, 16] | 0.0011185215514027157 | 9.101193917856322e-06 |
| itemFactors | [1683, 16] | 0.0014878749679739648 | 9.067016121903318e-06 |

| User | Candidate count | Distinct scores | Prediction variance | Constant score |
| --- | --- | --- | --- | --- |
| 1 | 1611 | 1 | 0 | 3.5806026458740234 |
| 2 | 1611 | 1 | 0 | 3.5806026458740234 |

The two candidate prediction vectors are identical. User-specific Top-10 lists differ because exclusions differ; constant-score ties use ascending movie ID. Full factor statistics, prediction statistics and every epoch are preserved in [mf-diagnostics.json](/Users/chenfengru/LLM4Rec-Course-codex/week6/evidence/mf-diagnostics.json). The instructor MF was unchanged.

## G. Four-method test comparison

| Method | Alpha | Recall@10 | Cohort | Unseen relevant records | No eligible relevant | Mean popularity | Iterations | Residual | Converged |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| popularity | n/a | 0.07602291343770759 | 861 | 13 | 82 | 271.99686411149816 | n/a | n/a | n/a |
| pagerank | 0.5 | 0.07969324149418144 | 861 | 13 | 82 | 257.820325203252 | 19 | 5.486072041094303e-7 | true |
| ppr | 0.5 | 0.11218853219486066 | 861 | 13 | 82 | 244.20673635307733 | 21 | 9.782843335415237e-7 | true |
| mf | n/a | 0.021137488852036153 | 861 | 13 | 82 | 96.76085946573689 | n/a | n/a | n/a |

## H. Convergence

| Method | Alpha | Seed user | Iterations | L1 residual | Converged |
| --- | --- | --- | --- | --- | --- |
| pagerank | 0.5 | n/a | 19 | 5.486072041094303e-07 | True |
| ppr | 0.5 | 2 | 21 | 9.782843335415237e-07 | True |

All **861** test-user PPR runs converged; **0** nonconverged. Maximum iterations: **22**; maximum residual: **9.994365655074944e-07**, below 1e-6. None reached the 500-iteration cap. Full records: [ppr-cohort-convergence.json](/Users/chenfengru/LLM4Rec-Course-codex/week6/evidence/ppr-cohort-convergence.json).

## I–J. Fixed users’ training histories

**User 1:** 217 training ratings, including 131 positive ratings (≥4). Most frequent positive-rating genres: Drama 61, Comedy 39, Action 36, Sci-Fi 27, Thriller 25, Romance 22.

Five-star training examples (movie ID — title): 113 — Horseman on the Roof, The (Hussard sur le toit, Le) (1995); 198 — Nikita (La Femme Nikita) (1990); 82 — Jurassic Park (1993); 152 — Sleeper (1973); 57 — Priest (1994); 173 — Princess Bride, The (1987); 115 — Haunted World of Edward D. Wood Jr., The (1995); 269 — Full Monty, The (1997).

**User 2:** 49 training ratings, including 32 positive ratings (≥4). Most frequent positive-rating genres: Drama 18, Comedy 11, Romance 11, Action 5, Crime 5, Thriller 3.

Five-star training examples (movie ID — title): 50 — Star Wars (1977); 100 — Fargo (1996); 127 — Godfather, The (1972); 242 — Kolya (1996); 251 — Shall We Dance? (1996); 283 — Emma (1996); 285 — Secrets & Lies (1996); 275 — Sense and Sensibility (1995).

Examples are the eight most recent five-star training ratings, with timestamp ties ordered by movie ID. A multi-genre movie contributes once to each genre count. Full counts and examples: [independent-preparation.json](/Users/chenfengru/LLM4Rec-Course-codex/week6/evidence/independent-preparation.json). These describe observed ratings; they do not establish causal preference.

## K. Eight primary Top-10 lists

### User 1 — popularity

| Rank | Movie ID | Title | Genres | Score | Training popularity |
|---:|---:|---|---|---:|---:|
| 1 | 100 | Fargo (1996) | Crime;Drama;Thriller | 377 | 377 |
| 2 | 258 | Contact (1997) | Drama;Sci-Fi | 307 | 307 |
| 3 | 286 | English Patient, The (1996) | Drama;Romance;War | 279 | 279 |
| 4 | 300 | Air Force One (1997) | Action;Thriller | 235 | 235 |
| 5 | 288 | Scream (1996) | Horror;Thriller | 226 | 226 |
| 6 | 318 | Schindler's List (1993) | Drama;War | 224 | 224 |
| 7 | 313 | Titanic (1997) | Action;Drama;Romance | 219 | 219 |
| 8 | 302 | L.A. Confidential (1997) | Crime;Film-Noir;Mystery;Thriller | 202 | 202 |
| 9 | 357 | One Flew Over the Cuckoo's Nest (1975) | Drama | 202 | 202 |
| 10 | 483 | Casablanca (1942) | Drama;Romance;War | 197 | 197 |

### User 1 — pagerank — alpha 0.50

| Rank | Movie ID | Title | Genres | Score | Training popularity |
|---:|---:|---|---|---:|---:|
| 1 | 258 | Contact (1997) | Drama;Sci-Fi | 0.0023751864209771156 | 307 |
| 2 | 286 | English Patient, The (1996) | Drama;Romance;War | 0.002291253302246332 | 279 |
| 3 | 100 | Fargo (1996) | Crime;Drama;Thriller | 0.002271695528179407 | 377 |
| 4 | 313 | Titanic (1997) | Action;Drama;Romance | 0.002063426189124584 | 219 |
| 5 | 300 | Air Force One (1997) | Action;Thriller | 0.002003419678658247 | 235 |
| 6 | 288 | Scream (1996) | Horror;Thriller | 0.0018683733651414514 | 226 |
| 7 | 302 | L.A. Confidential (1997) | Crime;Film-Noir;Mystery;Thriller | 0.001798133598640561 | 202 |
| 8 | 294 | Liar Liar (1997) | Comedy | 0.0014883466064929962 | 182 |
| 9 | 275 | Sense and Sensibility (1995) | Drama;Romance | 0.0012158651370555162 | 178 |
| 10 | 222 | Star Trek: First Contact (1996) | Action;Adventure;Sci-Fi | 0.0011928167659789324 | 189 |

### User 1 — ppr — alpha 0.50

| Rank | Movie ID | Title | Genres | Score | Training popularity |
|---:|---:|---|---|---:|---:|
| 1 | 100 | Fargo (1996) | Crime;Drama;Thriller | 0.0006855192477814853 | 377 |
| 2 | 258 | Contact (1997) | Drama;Sci-Fi | 0.0004398658056743443 | 307 |
| 3 | 286 | English Patient, The (1996) | Drama;Romance;War | 0.00043101841583848 | 279 |
| 4 | 318 | Schindler's List (1993) | Drama;War | 0.00040381672442890704 | 224 |
| 5 | 357 | One Flew Over the Cuckoo's Nest (1975) | Drama | 0.00037716623046435416 | 202 |
| 6 | 483 | Casablanca (1942) | Drama;Romance;War | 0.00035968932206742465 | 197 |
| 7 | 222 | Star Trek: First Contact (1996) | Action;Adventure;Sci-Fi | 0.000332785421051085 | 189 |
| 8 | 475 | Trainspotting (1996) | Drama | 0.00032809015829116106 | 164 |
| 9 | 275 | Sense and Sensibility (1995) | Drama;Romance | 0.0003201848885510117 | 178 |
| 10 | 423 | E.T. the Extra-Terrestrial (1982) | Children's;Drama;Fantasy;Sci-Fi | 0.00030566827626898885 | 167 |

### User 1 — mf

| Rank | Movie ID | Title | Genres | Score | Training popularity |
|---:|---:|---|---|---:|---:|
| 1 | 5 | Copycat (1995) | Crime;Drama;Thriller | 3.5806026458740234 | 28 |
| 2 | 6 | Shanghai Triad (Yao a yao yao dao waipo qiao) (1995) | Drama | 3.5806026458740234 | 12 |
| 3 | 18 | White Balloon, The (1995) | Drama | 3.5806026458740234 | 1 |
| 4 | 20 | Angels and Insects (1995) | Drama;Romance | 3.5806026458740234 | 31 |
| 5 | 32 | Crumb (1994) | Documentary | 3.5806026458740234 | 46 |
| 6 | 74 | Faster Pussycat! Kill! Kill! (1965) | Action;Comedy;Drama | 3.5806026458740234 | 2 |
| 7 | 100 | Fargo (1996) | Crime;Drama;Thriller | 3.5806026458740234 | 377 |
| 8 | 102 | Aristocats, The (1970) | Animation;Children's | 3.5806026458740234 | 18 |
| 9 | 111 | Truth About Cats & Dogs, The (1996) | Comedy;Romance | 3.5806026458740234 | 131 |
| 10 | 129 | Bound (1996) | Crime;Drama;Romance;Thriller | 3.5806026458740234 | 76 |

### User 2 — popularity

| Rank | Movie ID | Title | Genres | Score | Training popularity |
|---:|---:|---|---|---:|---:|
| 1 | 181 | Return of the Jedi (1983) | Action;Adventure;Romance;Sci-Fi;War | 339 | 339 |
| 2 | 174 | Raiders of the Lost Ark (1981) | Action;Adventure | 312 | 312 |
| 3 | 98 | Silence of the Lambs, The (1991) | Drama;Thriller | 308 | 308 |
| 4 | 56 | Pulp Fiction (1994) | Crime;Drama | 263 | 263 |
| 5 | 172 | Empire Strikes Back, The (1980) | Action;Adventure;Drama;Romance;Sci-Fi;War | 261 | 261 |
| 6 | 7 | Twelve Monkeys (1995) | Drama;Sci-Fi | 234 | 234 |
| 7 | 79 | Fugitive, The (1993) | Action;Thriller | 230 | 230 |
| 8 | 64 | Shawshank Redemption, The (1994) | Drama | 228 | 228 |
| 9 | 318 | Schindler's List (1993) | Drama;War | 224 | 224 |
| 10 | 173 | Princess Bride, The (1987) | Action;Adventure;Comedy;Romance | 222 | 222 |

### User 2 — pagerank — alpha 0.50

| Rank | Movie ID | Title | Genres | Score | Training popularity |
|---:|---:|---|---|---:|---:|
| 1 | 181 | Return of the Jedi (1983) | Action;Adventure;Romance;Sci-Fi;War | 0.0019889404065907 | 339 |
| 2 | 174 | Raiders of the Lost Ark (1981) | Action;Adventure | 0.0015527261421084404 | 312 |
| 3 | 98 | Silence of the Lambs, The (1991) | Drama;Thriller | 0.0015255436301231384 | 308 |
| 4 | 7 | Twelve Monkeys (1995) | Drama;Sci-Fi | 0.001373774721287191 | 234 |
| 5 | 56 | Pulp Fiction (1994) | Crime;Drama | 0.0013726184843108058 | 263 |
| 6 | 172 | Empire Strikes Back, The (1980) | Action;Adventure;Drama;Romance;Sci-Fi;War | 0.0013182985130697489 | 261 |
| 7 | 117 | Rock, The (1996) | Action;Adventure;Thriller | 0.0013080037897452712 | 215 |
| 8 | 121 | Independence Day (ID4) (1996) | Action;Sci-Fi;War | 0.0012972892727702856 | 207 |
| 9 | 268 | Chasing Amy (1997) | Drama;Romance | 0.0012656085891649127 | 146 |
| 10 | 222 | Star Trek: First Contact (1996) | Action;Adventure;Sci-Fi | 0.0011928167659789324 | 189 |

### User 2 — ppr — alpha 0.50

| Rank | Movie ID | Title | Genres | Score | Training popularity |
|---:|---:|---|---|---:|---:|
| 1 | 181 | Return of the Jedi (1983) | Action;Adventure;Romance;Sci-Fi;War | 0.0006973390700295568 | 339 |
| 2 | 9 | Dead Man Walking (1995) | Drama | 0.0004976635682396591 | 182 |
| 3 | 7 | Twelve Monkeys (1995) | Drama;Sci-Fi | 0.00047437407192774117 | 234 |
| 4 | 117 | Rock, The (1996) | Action;Adventure;Thriller | 0.0004563616821542382 | 215 |
| 5 | 98 | Silence of the Lambs, The (1991) | Drama;Thriller | 0.0004465101519599557 | 308 |
| 6 | 121 | Independence Day (ID4) (1996) | Action;Sci-Fi;War | 0.0004307125345803797 | 207 |
| 7 | 174 | Raiders of the Lost Ark (1981) | Action;Adventure | 0.00040285097202286124 | 312 |
| 8 | 268 | Chasing Amy (1997) | Drama;Romance | 0.0004018109757453203 | 146 |
| 9 | 475 | Trainspotting (1996) | Drama | 0.00040160532807931304 | 164 |
| 10 | 15 | Mr. Holland's Opus (1995) | Drama | 0.00040091839036904275 | 160 |

### User 2 — mf

| Rank | Movie ID | Title | Genres | Score | Training popularity |
|---:|---:|---|---|---:|---:|
| 1 | 2 | GoldenEye (1995) | Action;Adventure;Thriller | 3.5806026458740234 | 41 |
| 2 | 3 | Four Rooms (1995) | Thriller | 3.5806026458740234 | 27 |
| 3 | 4 | Get Shorty (1995) | Action;Comedy;Drama | 3.5806026458740234 | 96 |
| 4 | 5 | Copycat (1995) | Crime;Drama;Thriller | 3.5806026458740234 | 28 |
| 5 | 6 | Shanghai Triad (Yao a yao yao dao waipo qiao) (1995) | Drama | 3.5806026458740234 | 12 |
| 6 | 7 | Twelve Monkeys (1995) | Drama;Sci-Fi | 3.5806026458740234 | 234 |
| 7 | 8 | Babe (1995) | Children's;Comedy;Drama | 3.5806026458740234 | 137 |
| 8 | 9 | Dead Man Walking (1995) | Drama | 3.5806026458740234 | 182 |
| 9 | 11 | Seven (Se7en) (1995) | Crime;Thriller | 3.5806026458740234 | 152 |
| 10 | 12 | Usual Suspects, The (1995) | Crime;Thriller | 3.5806026458740234 | 205 |

## L. Mean popularity of the eight lists

| Method | User 1 mean training popularity | User 2 mean training popularity |
| --- | --- | --- |
| popularity | 246.8 | 262.1 |
| pagerank | 239.4 | 247.4 |
| ppr | 228.4 | 226.7 |
| mf | 72.2 | 111.4 |

Training popularity counts distinct users with training rating ≥4. It is not platform impressions.

## M. Within-method user overlap

- popularity: 1/10; common movie IDs: 318.
- pagerank: 1/10; common movie IDs: 222.
- ppr: 1/10; common movie IDs: 475.
- mf: 2/10; common movie IDs: 5, 6.

## N. One-factor PPR demonstration

### baseline: User 1, alpha 0.85

Mean training popularity: 245.5

| Rank | Movie ID | Title | Genres | Score | Training popularity |
|---:|---:|---|---|---:|---:|
| 1 | 100 | Fargo (1996) | Crime;Drama;Thriller | 0.0027416832745075226 | 377 |
| 2 | 258 | Contact (1997) | Drama;Sci-Fi | 0.00200196192599833 | 307 |
| 3 | 286 | English Patient, The (1996) | Drama;Romance;War | 0.0018735382473096251 | 279 |
| 4 | 318 | Schindler's List (1993) | Drama;War | 0.0016319362912327051 | 224 |
| 5 | 357 | One Flew Over the Cuckoo's Nest (1975) | Drama | 0.0014931062469258904 | 202 |
| 6 | 483 | Casablanca (1942) | Drama;Romance;War | 0.0014446371933445334 | 197 |
| 7 | 288 | Scream (1996) | Horror;Thriller | 0.001428726827725768 | 226 |
| 8 | 300 | Air Force One (1997) | Action;Thriller | 0.00141310621984303 | 235 |
| 9 | 222 | Star Trek: First Contact (1996) | Action;Adventure;Sci-Fi | 0.001352948253042996 | 189 |
| 10 | 313 | Titanic (1997) | Action;Drama;Romance | 0.0013183335540816188 | 219 |

### change seed only: User 2, alpha 0.85

Mean training popularity: 254.9

| Rank | Movie ID | Title | Genres | Score | Training popularity |
|---:|---:|---|---|---:|---:|
| 1 | 181 | Return of the Jedi (1983) | Action;Adventure;Romance;Sci-Fi;War | 0.0026007501874119043 | 339 |
| 2 | 98 | Silence of the Lambs, The (1991) | Drama;Thriller | 0.0020272978581488132 | 308 |
| 3 | 174 | Raiders of the Lost Ark (1981) | Action;Adventure | 0.0019665774889290333 | 312 |
| 4 | 7 | Twelve Monkeys (1995) | Drama;Sci-Fi | 0.0017902939580380917 | 234 |
| 5 | 56 | Pulp Fiction (1994) | Crime;Drama | 0.0017448202706873417 | 263 |
| 6 | 117 | Rock, The (1996) | Action;Adventure;Thriller | 0.001684593502432108 | 215 |
| 7 | 172 | Empire Strikes Back, The (1980) | Action;Adventure;Drama;Romance;Sci-Fi;War | 0.0016606281278654933 | 261 |
| 8 | 9 | Dead Man Walking (1995) | Drama | 0.0016079518245533109 | 182 |
| 9 | 121 | Independence Day (ID4) (1996) | Action;Sci-Fi;War | 0.001602756790816784 | 207 |
| 10 | 64 | Shawshank Redemption, The (1994) | Drama | 0.0015171804698184133 | 228 |

### change alpha only: User 1, alpha 0.5

Mean training popularity: 228.4

| Rank | Movie ID | Title | Genres | Score | Training popularity |
|---:|---:|---|---|---:|---:|
| 1 | 100 | Fargo (1996) | Crime;Drama;Thriller | 0.0006855192477814853 | 377 |
| 2 | 258 | Contact (1997) | Drama;Sci-Fi | 0.0004398658056743443 | 307 |
| 3 | 286 | English Patient, The (1996) | Drama;Romance;War | 0.00043101841583848 | 279 |
| 4 | 318 | Schindler's List (1993) | Drama;War | 0.00040381672442890704 | 224 |
| 5 | 357 | One Flew Over the Cuckoo's Nest (1975) | Drama | 0.00037716623046435416 | 202 |
| 6 | 483 | Casablanca (1942) | Drama;Romance;War | 0.00035968932206742465 | 197 |
| 7 | 222 | Star Trek: First Contact (1996) | Action;Adventure;Sci-Fi | 0.000332785421051085 | 189 |
| 8 | 475 | Trainspotting (1996) | Drama | 0.00032809015829116106 | 164 |
| 9 | 275 | Sense and Sensibility (1995) | Drama;Romance | 0.0003201848885510117 | 178 |
| 10 | 423 | E.T. the Extra-Terrestrial (1982) | Children's;Drama;Fantasy;Sci-Fi | 0.00030566827626898885 | 167 |

| Comparison | Shared movies |
| --- | --- |
| A vs B: seed only | 0/10 |
| A vs C: alpha only | 7/10 |
| B vs C: both differ | 0/10 |

A versus B changes only seed; A versus C changes only alpha. B versus C changes both and cannot isolate either factor.

## O. Selected-user relevant items, hits and recall

| User | Method | Eligible relevant | Hits | Recall@10 | Hit movie IDs |
|---:|---|---:|---:|---:|---|
| 1 | popularity | 19 | 2 | 0.10526315789473684 | 100;258 |
| 2 | popularity | 2 | 0 | 0 | none |
| 1 | pagerank | 19 | 3 | 0.15789473684210525 | 258;100;222 |
| 2 | pagerank | 2 | 0 | 0 | none |
| 1 | ppr | 19 | 3 | 0.15789473684210525 | 100;258;222 |
| 2 | ppr | 2 | 0 | 0 | none |
| 1 | mf | 19 | 7 | 0.3684210526315789 | 6;18;20;32;100;111;129 |
| 2 | mf | 2 | 0 | 0 | none |

## P. Independent aggregate cross-check

The independent Node checker rebuilt chronological splits, candidate pool, positive-edge cohort, test exclusions and relevance directly from u.data. It consumed frozen browser Top-10 movie IDs and scores, checked candidate/exclusion membership and score/ID ordering, and recomputed macro Recall@10 and mean popularity outside the application runner. All four methods use exactly the same 861 users. Ranking uses the frozen application scorers; this audit independently verifies evaluation, not the implementation of each scorer. An additional sparse Float64 validation reference is preserved in independent-preparation.json; the application uses Float32 TensorFlow.js.

| Method | Browser Recall@10 | Independent Recall@10 | Absolute difference | Mean-popularity difference |
|---|---:|---:|---:|---:|
| popularity | 0.07602291343770759 | 0.07602291343770759 | 0 | 0 |
| pagerank | 0.07969324149418144 | 0.07969324149418144 | 0 | 0 |
| ppr | 0.11218853219486066 | 0.11218853219486066 | 0 | 0 |
| mf | 0.021137488852036153 | 0.021137488852036153 | 0 | 0 |

A second independent check also computed the popularity, PageRank and PPR scores and ranked lists from the raw sparse graph in Float64. Its differences from the browser are:

| Method | Recall absolute difference | Mean-popularity difference | Ordered Top-10 mismatches |
| --- | --- | --- | --- |
| popularity | 0 | 0 | 0 |
| pagerank | 0 | 0 | 0 |
| ppr | 0 | 0 | 0 |

## Q. Export audit and byte identity

| Export | Audited content |
| --- | --- |
| verification.json | 12 PASS / 0 FAIL / 0 PENDING; backend webgl |
| results.csv | 10 data rows: 4 test comparisons + 4 validation rows + 2 convergence rows |
| recommendations.csv | 100 data rows: 80 primary rows + 20 additional demo rows; no duplicate keys |

The User 1 / PPR / alpha 0.50 demo list overlaps a primary list and is deduplicated by the application. All 10 list groups contain ranks 1–10; user, method, alpha, movie ID, title, genres, finite score and training popularity passed the content audit.

| File | Bytes | SHA-256 |
| --- | --- | --- |
| verification.json | 2336 | `d0cb66f8946556031172a72b8c7ca833e46eda34224263be9b124b3acefefec3` |
| results.csv | 1028 | `5b60e5164856285e58e0bc44928e55125c68e6d53363de69d95fa616d56de5bc` |
| recommendations.csv | 8280 | `00c07b09f0c4e527b76eaae76ebbd2dfb34ab6a4b548a14db71c4d3db479b7f1` |

Hashes were computed from original browser downloads before saving copies. Repository copies are byte-identical. Original download paths and audit details: [audit.json](/Users/chenfengru/LLM4Rec-Course-codex/week6/evidence/audit.json). Browser export files: [verification.json](/Users/chenfengru/LLM4Rec-Course-codex/week6/evidence/verification.json), [results.csv](/Users/chenfengru/LLM4Rec-Course-codex/week6/evidence/results.csv), [recommendations.csv](/Users/chenfengru/LLM4Rec-Course-codex/week6/evidence/recommendations.csv).

## R. Anomalies and limitations

**Measured result:** Native Chrome window targeting was inconsistent. One incomplete validation attempt was interrupted during task cleanup; a subsequent in-app attempt was superseded. No results from either attempt were used. The final evidence comes exclusively from the user-authorized isolated Chrome controller and its fresh application state.

**Measured result:** The preserved verification log was produced before lazy MF training. Its “MF reference: not trained yet” line describes that checkpoint; the later MF diagnostics and 30-epoch history document the trained state used for final test evaluation.

**Measured result:** MF candidate predictions have User 1: 1 distinct score, variance 0; User 2: 1 distinct score, variance 0. Prediction vectors identical across these users: true. Best validation RMSE 1.1829944264078285 at epoch 1; first-epoch validation RMSE 1.1829944264078285.

**Interpretation candidate:** On the inspected full candidate sets, MF behaves as a constant scorer at the browser’s prediction precision. Different displayed lists can arise solely from user-specific exclusions and the ascending-ID tie break. The instructor model was left unchanged.

**Interpretation candidate:** Differences in overlap, genre mix and popularity describe the lists. Lower overlap alone does not establish better personalization. No final business recommendation is made.

**Unresolved issue:** None in the required export/cohort/source audits. Results describe this browser/backend and fixed split; cross-device floating-point reproducibility is not asserted. Runtime includes abandoned attempts and is not an algorithm-speed benchmark.

Source hashes matched for all 54 tracked files, and 10 unrelated untracked files were preserved. The only added repository directory is week6/evidence. No formal report, commit, or push was produced.

Final branch, HEAD, status, empty source/index diffs and hash counts are recorded in [source-immutability.json](/Users/chenfengru/LLM4Rec-Course-codex/week6/evidence/source-immutability.json).
