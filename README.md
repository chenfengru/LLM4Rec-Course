# LLM4Rec Course

Course workspace for **Recommender Systems / LLM4Rec**.

This repository is organized week by week so that coursework, experiments,
visualizations, pull requests, and the final capstone remain reproducible and easy to review.

## Course roadmap

| Week | Topic | Status |
|---|---|---|
| 01 | Fundamentals of Recommender Systems | In progress |
| 02 | Content-Based Filtering | Not started |
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

## Week 01

- [x] Review introductory RecSys concepts
- [x] Prepare a local OpenCode visualization workflow
- [ ] Add the visualization demo to this repository
- [ ] Build the Random Lunch Generator
- [ ] Fix image-generation / image-display issues through prompt iteration
- [ ] Deploy the Random Lunch Generator with GitHub Pages
- [ ] Prepare a 3–5 minute visualization demo

## Repository structure

```text
LLM4Rec-Course/
├── README.md
├── AGENTS.md
├── week01/
│   ├── random-lunch-generator/
│   ├── visualization-demo/
│   └── notes.md
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

## Working convention

Each substantial weekly task should ideally follow:

**Question → Experiment → Evidence → Claim → Review**

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
