# Week 01 — Visualization Demo (Scaffold)

**Status: Planning scaffold only — not a completed or reproducible visualization.**

This directory was reserved for an optional demonstration of an AI-assisted visualization workflow. It currently contains this README and `.gitkeep` placeholders; **no dataset, plotting script, generated chart, or verified demo result has been committed here**.

## Intended workflow

**Inspect data → Generate visualization → Validate result → Explain evidence**

A completed future demo could:

1. Inspect the schema of a small, sanitized, course-safe dataset.
2. Generate a figure using a reproducible Python script.
3. Run that script and save the generated image.
4. Validate plotted numbers against the source rows.
5. Explain one limitation and a concrete improvement.

## Planned (not yet implemented) structure

```text
visualization-demo/
├── data/
│   └── results.csv                 # Not committed
├── charts/
│   ├── scripts/
│   │   └── latency_comparison.py   # Not committed
│   └── output/
│       └── latency_comparison.png  # Not committed
└── README.md
```

**Repository hygiene:** use only sanitized examples. Do not upload proprietary workplace code, datasets, internal paths, model weights, or private experiment artifacts.

The completed Week 1 homework application is a **different project**: [Random Lunch Generator](../random-lunch-generator/README.md).
