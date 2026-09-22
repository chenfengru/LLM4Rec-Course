# Cosine item-to-item audit

## Reproduce

From the repository root:

```bash
python3 week02/content-based-movie-recommender/analysis/verify_cosine_and_compare.py
```

The experiment uses all 1,682 movies, corrected 19-dimensional binary genre
vectors, seed exclusion, and stable `u.item` source order for score ties.

## Numerical check

Toy Story has vector
`[0,0,0,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0]`; Aladdin has
`[0,0,0,1,1,1,0,0,0,0,0,0,1,0,0,0,0,0,0]`. Their dot product is 3,
their norms are `sqrt(3)` and `2`, and cosine is
`3 / (sqrt(3) * 2) = 0.8660254037844387`. Both the Python verification
implementation and the actual JavaScript application function return the same
value. A zero-norm vector returns 0.

## Corrected Jaccard versus cosine

Only 1 of 1,682 ordered Top-5 lists changes (0.059453%); it also changes set
membership. Mean overlap is 0.999881 of five slots, or 4.999405 shared items.
The sole changed seed is Tank Girl (ID 1110). Jaccard's fifth item is Muppet
Treasure Island; cosine's fifth item is Mystery Science Theater 3000.

Because the exhaustive result contains only one changed Top-5 seed, three
distinct changed Top-5 examples do not exist under this protocol. Exact scores
and genres for the sole case are in `cosine_results.json` and printed by the
verification script.

## Raw overlap count versus cosine

Across 8,410 recommendation slots per method:

| Metric | Raw dot product | Cosine |
|---|---:|---:|
| Mean genre count | 2.838644 | 1.695363 |
| Median genre count | 3 | 2 |
| Genre count >= 4 | 1,658 (19.7146%) | 275 (3.2699%) |

For Toy Story, raw overlap ranks four-genre Aladdin first with dot product 3.
Cosine ranks the exact three-genre match Aladdin and the King of Thieves first
and moves Aladdin to second with score 0.8660254.

For binary vectors, the dot product is the shared active-genre count. Cosine
divides it by `sqrt(seed genre count) * sqrt(candidate genre count)`, so an
otherwise equal broad candidate receives a larger denominator. These catalog
statistics support reduced multi-genre dominance for this dataset and protocol;
they do not prove improved recommendation quality or generalization.
