# AGENTS.md

## Purpose

This repository supports coursework and experiments for the LLM4Rec / Recommender Systems course.

AI assistants should help accelerate implementation and understanding, but should not replace
the student's reasoning, experimental design, or interpretation.

## Core workflow

For experimental tasks, prefer this structure:

1. Define one clear question.
2. Establish a baseline.
3. Change one controlled factor at a time when possible.
4. Record code, configuration, random seed, and data assumptions.
5. Produce evidence: metrics, plots, tables, or error analysis.
6. State only claims supported by the evidence.
7. Note limitations and possible next improvements.

## Coding rules

- Prefer simple, readable code over unnecessary abstraction.
- Keep experiments reproducible.
- Do not silently change datasets or evaluation protocols.
- Avoid data leakage.
- Save generated figures and results in clearly named output folders.
- Explain non-obvious design choices in README files.
- Do not fabricate experimental results.

## Course repository rules

- Weekly coursework belongs under `weekXX/`.
- Final-project work belongs under `capstone/`.
- Use feature branches and pull requests for meaningful assignments.
- Do not commit secrets, API keys, credentials, model weights, or private/confidential data.
- Do not copy proprietary company code into this repository.

## Visualization workflow

Before plotting:
- inspect the dataset structure and dtypes;
- check missing values or obvious schema issues.

After plotting:
- verify labels, units, legends, and source data;
- confirm that the visual supports the stated conclusion.

## Writing style

Use concise technical English in repository documentation.
Prefer evidence-first explanations over broad claims.
