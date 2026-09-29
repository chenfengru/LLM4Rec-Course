# Week 3 starter audit

Audit date: 2026-09-29. No application code or datasets were changed.

## Scope and preservation

- Initial branch: `week03-collaborative-filtering`, tracking the same-named origin branch.
- Initial status: no tracked changes; three untracked Week 1-3 lecture PDFs.
- Copied all seven files from `week03/teacher-baseline/` into `week03/collaborative-filtering-movie-recommender/` using `cp -pR`.
- Recursive comparison and per-file SHA-256 verification confirm exact file-content equality. The working copy remains identical after the audit.
- Read all of `readme.md`, `data.js`, `script.js`, `index.html`, and `style.css`; inspected every data row. Extracted lecture PDF text and visually inspected the HW3 assignment slide (PDF page 20).
- `probe.mjs` executes the unchanged baseline JavaScript in Node's VM, with small DOM doubles and native `Response` decoding. `evidence.json` records the results and hashes. These checks do not claim real-browser layout, network, or performance validation.

Reproduce from the repository root with Node 18+:

```sh
node week03/starter-audit/probe.mjs > week03/starter-audit/evidence.json
diff -qr week03/teacher-baseline week03/collaborative-filtering-movie-recommender
git diff --exit-code -- week03/teacher-baseline
```

## A. What works now

The page has the requested title, explanatory paragraph, user dropdown, button, and separately labelled result sections. `index.html:33-34` loads `data.js` before `script.js`. CSS provides the centered white container, controls, two-column results, and a single-column breakpoint at 640px.

`loadData()` sequentially fetches movie metadata and ratings, checks HTTP response status, parses both files, calculates dimensions, and calls the matrix stub. On success, initialization populates 943 user options plus the placeholder and displays the loaded status.

The UI rejects the empty selection, calls both recommendation functions for a selected user, and can render supplied `{title, score}` objects to three decimal places. The rating parser retains numeric timestamps, although no algorithm currently uses them.

The runtime check gives `numUsers=943`, `numMovies=1682`, `ratings.length=100000`, and `ratingMatrix=null`. Selecting user 1 produces the explicit homework-placeholder message in both panels.

## B. What the assignment still requires

The four explicit TODOs are the rating matrix (`data.js:104-106`), cosine similarity (`script.js:62-65`), User-Based CF (`script.js:80-83`), and Item-Based CF (`script.js:98-101`). The empty results are intentional scaffolding, not evidence of a hidden ranking bug.

The readme additionally requires one documented missing-value strategy, exclusion of already-rated candidates, descending Top-5 results, approach-specific explanatory text, and meaningful no-result handling. Preserve the data files and data/UI module split.

The lecture's HW3 slide adds written analysis: compare recommendation quality and efficiency for different user/item counts; discuss missing-value trade-offs in simplicity, bias, and computation; explain cold start, sparsity, and unreliable small-overlap similarities. No benchmark, split, metric, or report format is specified in the local readme. No quality or efficiency result has been measured here.

## C. Current missing-value strategy

There is **no implemented strategy**. `ratingMatrix` is `null`; `buildRatingMatrix()` is empty. Its comment proposes `0` for unobserved ratings, valid for this dataset's 1-5 scale. `script.js:4-11` leaves all three strategy choices unchecked. `cosineSimilarity()` ignores its arguments and always returns `0`.

Co-rated-only similarity is the readme's default and the instruction in the cosine TODO, but it is not executable behavior yet. A separate observation mask is unnecessary for the unchanged 1-5 data if zero remains the sentinel. If imputation is selected later, the original observed/unobserved status must still be retained to exclude movies the user actually rated.

## D. Current and requested CF behavior

Both current implementations return `[]` unconditionally:

```js
function getUserBasedRecommendations(activeUserId, topK = 5) {
    // your implementation here
    return [];
}
function getItemBasedRecommendations(activeUserId, topK = 5) {
    // your implementation here
    return [];
}
```

Requested User-Based CF compares the active user's row with other user rows; chooses a positive-similarity neighborhood (20 is an example, not an implemented constant); predicts each unseen movie using a similarity-weighted average of neighbors who rated that movie; then sorts and takes K.

Requested Item-Based CF compares rating columns for the user's rated movies with candidate movie columns, aggregates similarities weighted by the user's ratings, and ranks unseen candidates. The readme does not specify whether aggregation is a raw weighted sum or a normalized weighted average. Those definitions have different scales and can change rankings; resolve this before implementation and before comparing displayed scores.

## Dataset evidence

| Check | Result |
| --- | --- |
| `u.item` structure | 1,682 pipe-delimited rows; every row has 24 fields |
| Metadata fields | ID, title, release date, video release date, IMDb URL, then 19 binary genre flags |
| Movie IDs | Ordered and contiguous, 1-1682 |
| `u.data` structure | 100,000 tab-delimited rows; four integer fields: user ID, movie ID, rating, timestamp |
| User IDs | Contiguous, 1-943 |
| Ratings | Integers 1-5; no zero ratings; no duplicate user-movie pairs |
| Coverage | All 1,682 movie IDs referenced; 20-737 ratings per user |
| Matrix density | 6.3047% observed, 93.6953% missing, excluding padding row/column |
| Dataset continuity | Both files byte-identical to Week 2 teacher baseline |

Thus `numMovies=movies.length` and the dropdown's `1..numUsers` loop are valid for these files. Their contiguous-ID assumptions are not current defects. Empty optional metadata fields do not shift pipe-delimited positions. Malformed-line guards are minimal, but no malformed rating rows or missing genre flags were found.

The [GroupLens schema](https://files.grouplens.org/datasets/movielens/ml-100k/README) confirms the flag order begins with `unknown` and ends with `Western`.

## Confirmed defects and verification

### 1. Shifted genre labels

Location: `week03/teacher-baseline/data.js:11-16,64-66` (same lines in working copy).

```js
const genreNames = [
    "Action", "Adventure", "Animation", "Children's", "Comedy",
    "Crime", "Documentary", "Drama", "Fantasy", "Film-Noir",
    "Horror", "Musical", "Mystery", "Romance", "Sci-Fi",
    "Thriller", "War", "Western"
];
const genreValues = fields.slice(5, 24).map(value => parseInt(value));
const genres = genreNames.filter((_, index) => genreValues[index] === 1);
```

Symptom: Toy Story becomes `Children's, Comedy, Crime` instead of `Animation, Children's, Comedy`; GoldenEye becomes `Adventure, Animation, War` instead of `Action, Adventure, Thriller`. Movie 267 (`unknown`) becomes Action.

Root cause: 19 flags including `unknown` are aligned with 18 names omitting `unknown`. The genuine Western flag is never inspected; 27 movies carry it. All 1,682 parsed genre arrays differ from schema-correct arrays.

Verification: the probe compares every unchanged parser output against a schema-derived expected array and records raw flags for examples. In a browser console, inspect `movies.find(m => m.id === 1).genres` and compare to `u.item` row 1. This is a metadata defect. Genres are not used by either CF stub or by the specified rating-based algorithms, so it does not explain today's empty recommendations and should not affect correctly implemented pure CF scores. Intentional seeding cannot be established from the code.

### 2. Accented titles are corrupted during decoding

Location: `week03/teacher-baseline/data.js:26-27`.

```js
const moviesText = await moviesResponse.text();
parseItemData(moviesText);
```

Symptom: movie 543 becomes `Mis�rables, Les (1995)`; nine titles contain decoding replacements.

Root cause: these source bytes are not valid UTF-8 (for example the single byte `E9` in Misérables). `Response.text()` always decodes UTF-8, per [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Response/text). The corruption occurs before parsing, not because of genre indices or HTML's charset declaration.

Verification: the probe passes the exact bytes through native `Response.text()` and compares the parsed titles to a byte-preserving Latin-1 decode. Inspect `movies.find(m => m.id === 543).title` in the browser. IDs and numeric ratings are unaffected; visible recommendation titles can be affected once those movies are rendered.

### 3. Failed loading leaves one panel in a false loading state

Locations: `data.js:43-47`, `script.js:20-21,29-32`.

```js
// script.js
userBased.innerHTML = '<p>Loading movie data...</p>';
itemBased.innerHTML = '<p>Loading movie data...</p>';
// data.js catch
const errorTarget = document.getElementById('user-based-result');
if (errorTarget) {
    errorTarget.innerHTML = `<p class="error">Error: ${error.message}. Please make sure u.item and u.data are in the correct location.</p>`;
}
throw error;
// script.js catch
console.error('Initialization error:', error);
// The error message is already shown by data.js
```

Symptom: a 404 for either file produces an error in User-Based CF while Item-Based CF indefinitely says `Loading movie data...`.

Root cause: the data loader updates only the first panel; the outer catch logs without clearing the second panel. Two console error logs are expected from this nested handling and do not imply two fetch attempts.

Verification: both 404 cases are reproduced by the probe without touching either dataset. For a browser check, block either data request in developer tools and reload; do not rename the baseline files.

### 4. Error-color rule is overridden (static CSS finding)

Location: `week03/teacher-baseline/style.css:96-100,113-115`.

```css
.result-column p,
.result-column ul {
    text-align: left;
    color: #2c3e50;
    margin: 0;
}
.error {
    color: #e74c3c;
}
```

Expected symptom: the generated `<p class="error">` remains dark blue rather than red. Root cause: `.result-column p` has specificity `(0,1,1)`, higher than `.error` at `(0,1,0)`, despite the latter appearing later. The error text remains readable; this is a presentation defect only.

Verification: trigger the failed-load case and inspect the paragraph's computed `color` and matched CSS rules. Predicted color is `rgb(44, 62, 80)`. This audit did not run a real-browser computed-style check.

## E. Specification mismatches and ambiguities

1. **Genre schema conflict:** `readme.md:58-60` itself combines 18 genre names with the last 19 flags. The parser follows an inconsistent specification; the data schema resolves the factual mapping.
2. **Missing values:** `readme.md:85` and `script.js:55-57` demand co-rated-only cosine; `readme.md:110-116` permits choosing co-rated-only, mean imputation, or overlap weighting. The HW3 slide instead lists mean imputation, overlap weighting, or matrix factorization. No strategy is currently selected. Matrix factorization is not an implemented extension of this cosine skeleton.
3. **Matrix orientation:** the lecture describes users as columns and items as rows. `data.js:94-96` explicitly requests `ratingMatrix[userId][movieId]`, so users are rows and movies columns here. Transposition is not a defect; comparing the wrong axis would be.
4. **UI example:** the lecture slide's screenshot selects both a user and a movie and predicts one rating. The readme and supplied HTML select only a user and request two Top-5 lists. Clarify whether the screenshot is illustrative; do not add a movie selector silently.
5. **Item score:** `readme.md:97-100` does not define normalization. A raw sum is an aggregate affinity, not a 1-5 predicted rating directly comparable to User-Based CF's weighted average.
6. **Display contract:** `readme.md:105-106` requests explanatory recommendation wording and graceful sparse-user messages. `script.js:127-135` currently renders a bare list or the homework TODO message. This is unfinished scaffolding, not an independently verified algorithm defect.
7. **Hosting wording:** `readme.md:122` says `file://`-like static hosting (GitHub Pages). `data.js:22,30` uses `fetch('u.item')` / `fetch('u.data')`. Literal local file URLs and HTTP(S) static hosting are different: browsers commonly reject local file fetches. [MDN's local-file CORS explanation](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS/Errors/CORSRequestNotHttp) recommends a local server. Verify the intended launch mode; no external libraries or build step are required for HTTP static hosting. The code has no service worker or explicit offline caching, so an offline GitHub Pages guarantee is not established.

## F. Manual checks before implementation

1. Open the unchanged copy through local HTTP hosting. Check both requests, 943 users, no-selection feedback, and the expected TODO message after selecting a user. Separately test literal `file://` if that launch mode is required.
2. Inspect Toy Story's genres and movie 543's title in the console. Verify the evidence independently of whether those films appear in a result list.
3. Block each data request separately and inspect both result panels and the error paragraph's computed color.
4. Check desktop and narrow-screen layout, long titles, keyboard selection, and focus visibility. CSS has a 640px result breakpoint; full browser visual QA is still pending.
5. Resolve the authoritative missing-value requirement, item-score formula, and Top-5 versus single-rating UI requirement. Keep the user's observed-rating mask conceptually separate from any imputed values.
6. Before coding, hand-work a small matrix with non-square dimensions: user comparisons across movie coordinates; item comparisons across user coordinates; no shared ratings; exactly one shared rating; and candidate neighbors that did not rate the target. For co-rated-only cosine, `[5,0]` and `[1,4]` have similarity 1 on their single shared coordinate; this is weak evidence, not automatically a coding bug.
7. Define how unsupported candidates, fewer-than-five results, neighborhood-size ties, and equal-score ties should behave. These are design decisions, not current demonstrated defects. Distinct movie IDs can share titles; retain ID-based identity when reasoning about duplicates.
8. If later measuring recommendation quality, define a held-out evaluation protocol first. The current app loads all ratings and has no evaluation split; no accuracy claim follows from showing a Top-5 list. Compare performance with fixed users and account for caching before making efficiency claims.

No implementation, fixes, commits, or pull requests were made. Awaiting user approval before application changes.
