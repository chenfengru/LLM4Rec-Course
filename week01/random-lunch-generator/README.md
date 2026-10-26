# Week 01 — Random Lunch Generator

**Course:** LLM4Rec, HSE University  
**Status:** Application implemented · native Codex session checked in  
**Stack:** Single HTML page with embedded CSS and JavaScript; Font Awesome Free 6.4.0 via CDN

This Week 1 project explores the simplest recommendation baseline: drawing one item at random from a fixed list. A small **recency-aware weighted-random extension** illustrates how even one piece of interaction history can change repeated recommendations without making the system genuinely personalized.

## Run

Open [`index.html`](index.html) in a browser. The selection logic is entirely client-side and does not fetch local data files, so a local HTTP server is not required. An internet connection is needed for Font Awesome icons loaded from the CDN.

Alternatively, from the repository root:

```bash
cd week01/random-lunch-generator
python3 -m http.server 8000 --bind 127.0.0.1
```

Then visit http://127.0.0.1:8000/index.html.

The page generates a suggestion at startup; pressing **Generate Lunch!** draws another item. The interface has 12 fixed options and uses a short transition animation.

## Implementation

All of the application code is currently inside `index.html`, including the menu, event handler, inline styles, and the random generator. The empty `assets/` directory is a scaffold, **not** evidence of committed image files; food visuals use Font Awesome icon classes.

- **Uniform first draw:** `Math.floor(Math.random() * 12)`.
- **Recency-aware later draws:** weight the previously chosen lunch by **0.25** and each of the other 11 options by **1**.
- **No hard exclusion:** the previous item is still eligible; its probability is simply reduced.
- **Icon dependency:** the document links Font Awesome Free **6.4.0**. The associated [AI prompt record](prompt.md) discusses checking real icon identifiers rather than inventing class names.

For any next draw immediately after an item has been selected:

\[
P(\text{repeat})=\frac{0.25}{11+0.25}\approx 2.22\%.
\]

Under uniform sampling, the corresponding probability is `1/12 ≈ 8.33%`. This reduction is about the **immediate repeat event**; it does not mean the recommender has learned a stable user preference.

## Results and evidence

The course [repository overview](../../README.md) records a seeded 100,000-draw comparison from the original work:

| Method | Theoretical immediate-repeat rate | Previously recorded simulation |
| --- | ---: | ---: |
| Uniform random | 8.33% | 8.2941% |
| Last-item weight = 0.25 | 2.22% | 2.2480% |

These are **historically recorded results**. The committed Week 1 folder does **not** include a standalone Monte Carlo reproduction script or the raw simulation output, so this README does not claim to have reproduced the simulation again.

## What this assignment demonstrates

1. **BUILD:** implement a working randomized web-app baseline.
2. **ASK WHY:** immediate repeats may feel unhelpful.
3. **TEST:** derive how a reduced previous-item weight changes the next-draw probability.
4. **EXPLAIN:** distinguish unconditional random choice from history-dependent sampling.
5. **IMPROVE:** change only the last-choice weight, leaving the rest of the menu unchanged.

This is still not a learned recommender: there are no user embeddings, ratings, content features, or learned preferences.

## Tracked files

| File | Purpose |
| --- | --- |
| [`index.html`](index.html) | Complete working application (HTML, CSS, JS in one file) |
| [`prompt.md`](prompt.md) | Preserved early AI-assistance prompt/transcript material, including proposed README text |
| [`session.json`](session.json) | AI-tool session record |
| [`assets/`](assets/) | Empty placeholder for optional assets |

The historical `prompt.md` contains an **unfilled sample README and example GitHub Pages URL**; it is archived reference material, not a verified live deployment address. The current tracked folder contains **no PDF report** or standalone presentation file.

**Source dataset:** none; lunch names and icons are hardcoded examples.
