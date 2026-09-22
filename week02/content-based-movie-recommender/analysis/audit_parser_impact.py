#!/usr/bin/env python3
"""Quantify how the instructor genre-label offset affects Jaccard rankings."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path


BASELINE_LABELS = [
    "Action", "Adventure", "Animation", "Children's", "Comedy", "Crime",
    "Documentary", "Drama", "Fantasy", "Film-Noir", "Horror", "Musical",
    "Mystery", "Romance", "Sci-Fi", "Thriller", "War", "Western",
]
CORRECTED_LABELS = ["unknown", *BASELINE_LABELS]
DATA_PATH = Path(__file__).resolve().parents[1] / "u.item"


def load_movies(path: Path) -> list[dict]:
    movies = []
    for source_order, line in enumerate(path.read_text(encoding="latin-1").splitlines()):
        if not line.strip():
            continue
        fields = line.split("|")
        flags = [int(value) for value in fields[5:24]]
        if len(flags) != len(CORRECTED_LABELS):
            raise ValueError(f"movie {fields[0]} has {len(flags)} genre fields")
        movies.append({
            "id": int(fields[0]),
            "title": fields[1],
            "source_order": source_order,
            "flags": flags,
            # This deliberately reproduces the instructor's 18-label mapping.
            "baseline_genres": [
                label for index, label in enumerate(BASELINE_LABELS)
                if flags[index] == 1
            ],
            "corrected_genres": [
                label for index, label in enumerate(CORRECTED_LABELS)
                if flags[index] == 1
            ],
        })
    return movies


def ranking(movies: list[dict], seed: dict, representation: str) -> list[dict]:
    seed_genres = set(seed[representation])
    scored = []
    for candidate in movies:
        if candidate["id"] == seed["id"]:
            continue
        candidate_genres = set(candidate[representation])
        union = seed_genres | candidate_genres
        score = len(seed_genres & candidate_genres) / len(union) if union else 0.0
        scored.append({
            "id": candidate["id"],
            "title": candidate["title"],
            "score": score,
            "source_order": candidate["source_order"],
        })
    # Python's sort is stable, so score ties preserve u.item source order.
    scored.sort(key=lambda movie: -movie["score"])
    return scored


def compact(items: list[dict], limit: int) -> list[dict]:
    return [
        {"id": item["id"], "title": item["title"], "score": item["score"]}
        for item in items[:limit]
    ]


def main() -> None:
    movies = load_movies(DATA_PATH)
    comparisons = []
    for seed in movies:
        baseline = ranking(movies, seed, "baseline_genres")
        corrected = ranking(movies, seed, "corrected_genres")
        baseline_ids = [movie["id"] for movie in baseline]
        corrected_ids = [movie["id"] for movie in corrected]
        comparisons.append({
            "seed_id": seed["id"],
            "seed_title": seed["title"],
            "raw_western": bool(seed["flags"][18]),
            "top2_changed": baseline_ids[:2] != corrected_ids[:2],
            "top5_changed": baseline_ids[:5] != corrected_ids[:5],
            "baseline_top5": compact(baseline, 5),
            "corrected_top5": compact(corrected, 5),
        })

    western = [item for item in comparisons if item["raw_western"]]
    western_only = next(
        movie for movie in movies
        if movie["flags"][18] == 1 and sum(movie["flags"]) == 1
    )
    selected = next(item for item in comparisons if item["seed_id"] == western_only["id"])

    def count(items: list[dict], key: str) -> int:
        return sum(item[key] for item in items)

    result = {
        "experiment": {
            "data_file": str(DATA_PATH.relative_to(DATA_PATH.parents[2])),
            "data_sha256": hashlib.sha256(DATA_PATH.read_bytes()).hexdigest(),
            "similarity": "Jaccard over parsed genre-label sets",
            "tie_behavior": "stable u.item source order",
            "baseline_labels": BASELINE_LABELS,
            "corrected_labels": CORRECTED_LABELS,
        },
        "catalog": {
            "seed_count": len(comparisons),
            "top2_changed_count": count(comparisons, "top2_changed"),
            "top2_changed_percent": 100 * count(comparisons, "top2_changed") / len(comparisons),
            "top5_changed_count": count(comparisons, "top5_changed"),
            "top5_changed_percent": 100 * count(comparisons, "top5_changed") / len(comparisons),
        },
        "raw_western_seeds": {
            "seed_count": len(western),
            "top2_changed_count": count(western, "top2_changed"),
            "top2_changed_percent": 100 * count(western, "top2_changed") / len(western),
            "top5_changed_count": count(western, "top5_changed"),
            "top5_changed_percent": 100 * count(western, "top5_changed") / len(western),
        },
        "changed_examples": [
            item for item in comparisons if item["top2_changed"] or item["top5_changed"]
        ][:3],
        "western_only_case": {
            "seed_id": western_only["id"],
            "seed_title": western_only["title"],
            "raw_flags": western_only["flags"],
            "baseline_genres": western_only["baseline_genres"],
            "corrected_genres": western_only["corrected_genres"],
            "baseline_top5": selected["baseline_top5"],
            "corrected_top5": selected["corrected_top5"],
        },
    }
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
