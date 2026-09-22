# Parser defect impact audit

## Method

The audit uses the student copy of MovieLens `u.item` (SHA-256
`553841ebc7de3a0fd0d6b62a204ea30c1e651aacfb2814c7a6584ac52f2c5701`). It
compares the instructor's 18-label representation with the correctly aligned
19-label representation. Every movie is used once as the active-item seed.
Both conditions use Jaccard similarity, exclude the seed, sort by descending
score, and preserve `u.item` source order for ties.

Run from the repository root:

```bash
python3 week02/content-based-movie-recommender/analysis/audit_parser_impact.py
```

## Results

| Population | Seeds | Top-2 changed | Top-5 changed |
|---|---:|---:|---:|
| Full catalog | 1,682 | 83 (4.9346%) | 106 (6.3020%) |
| Raw Western = 1 | 27 | 22 (81.4815%) | 25 (92.5926%) |

Concrete changed seeds include Bad Boys (ID 27), Free Willy 2 (ID 35), and
Maverick (ID 73). Exact IDs for their before/after lists are stored in
`parser_impact_results.json`; the audit script prints titles and scores.

## Western-only case

The first Western-only row found from the data is Unforgiven (1992), ID 203.
Its 19 raw flags are:

```text
0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1
```

- Baseline genres: `[]`
- Corrected genres: `["Western"]`
- Baseline Top-5: Toy Story, GoldenEye, Four Rooms, Get Shorty, Copycat; all
  scores are 0.0 and source order decides the list.
- Corrected Top-5: Tombstone, Wild Bill, Wyatt Earp, The Wild Bunch, Davy
  Crockett; all scores are 1.0.

This demonstrates an information-loss defect, not merely misleading labels.
