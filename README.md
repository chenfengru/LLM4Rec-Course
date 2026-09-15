# LLM4Rec Course

Course workspace for **Recommender Systems / LLM4Rec**.

This repository is organized week by week so that coursework, experiments, reports, pull requests, and the final capstone remain reproducible and easy to review.

## Course roadmap

| Week | Topic | Status |
|---|---|---|
| 01 | Random Lunch Generator / RecSys Fundamentals | ✅ Completed |
| 02 | Content-Based Filtering | 🚧 In progress |
| 03 | Collaborative Filtering | Not started |
| 04 | Association Rules | Not started |
| 05 | Matrix Factorization | Not started |
| 06 | PageRank | Not started |
| 07 | Recommender Systems with Deep Learning | Not started |
| 08 | Context Encoder | Not started |
| 09 | Context Ranker | Not started |
| 10 | Design LLM4Rec | Not started |
| 11 | Personalized Context | Not started |
| 12 | Capstone Project / Seminar | Not started |

## Week 01 — Random Lunch Generator

### Completed

- [x] Run and inspect the provided Random Lunch Generator baseline
- [x] Deploy the application with GitHub Pages
- [x] Reproduce the missing-icon issue for Ramen, Pasta, and Soup
- [x] Identify the root cause in Font Awesome Free 6.4.0
- [x] Replace invalid icon classes with verified alternatives
- [x] Improve the prompt to require dependency/version verification
- [x] Add a minimal recency-aware weighted-random extension
- [x] Verify the repeat probability mathematically
- [x] Run a seeded 100,000-draw simulation
- [x] Manually verify the final webpage behavior
- [x] Preserve the tool-native Codex `session.json`
- [x] Prepare the A01 report and 3–5 minute presentation

### Main result

The original uniform selector has an immediate-repeat probability of:

`1 / 12 = 8.33%`

Using a recency penalty of `0.25` reduces the theoretical repeat probability to:

`0.25 / 11.25 = 2.22%`

A 100,000-draw simulation produced:

- Uniform random: `8.2941%`
- Recency-aware random: `2.2480%`

All 12 foods remained represented with approximately uniform long-run frequency.

### Week 1 takeaway

AI suggestions should be treated as hypotheses rather than accepted automatically.
The most useful parts of the workflow were checking the real dependency,
verifying the mathematics, reproducing the result, and keeping code changes minimal.

## Week 02 — Content-Based Filtering

Status: 🚧 In progress

### Goals

- [ ] Understand the basic idea of content-based recommendation
- [ ] Learn how items are represented as feature vectors
- [ ] Understand similarity measures, especially cosine similarity
- [ ] Build and run the provided Week 2 baseline
- [ ] Inspect and verify recommendation results
- [ ] Complete A02 using the course 5-Loop

## Repository structure

```text
LLM4Rec-Course/
├── README.md
├── AGENTS.md
├── week01/
│   └── random-lunch-generator/
├── week02/
├── ...
├── week12/
├── capstone/
│   ├── idea/
│   ├── experiments/
│   ├── app/
│   └── paper/
├── skills/
└── assets/
```

## Weekly working convention

Each assignment follows the course Top-Down 5-Loop:

**BUILD → ASK WHY → TEST → EXPLAIN → IMPROVE**

1. **BUILD** — run a working baseline
2. **ASK WHY** — question assumptions and consider alternatives
3. **TEST** — verify important AI outputs against code, theory, or data
4. **EXPLAIN** — describe the result in my own words
5. **IMPROVE** — change one meaningful variable and test again

Use a separate branch for meaningful weekly work, for example:

```text
week01-random-lunch
week02-content-based
week03-collaborative-filtering
```

Then open a pull request before merging to `main`.

## Safety / repository hygiene

Do **not** upload proprietary company code, internal model weights, credentials,
private datasets, internal paths, or confidential experiment artifacts.

Only course-safe examples and sanitized data should be committed.
