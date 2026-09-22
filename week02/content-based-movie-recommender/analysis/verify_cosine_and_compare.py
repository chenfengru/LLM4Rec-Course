#!/usr/bin/env python3
"""Verify cosine math and compare item-to-item ranking methods catalog-wide."""

from __future__ import annotations

import hashlib
import json
import math
import statistics
from pathlib import Path


GENRES = [
    "unknown", "Action", "Adventure", "Animation", "Children's", "Comedy",
    "Crime", "Documentary", "Drama", "Fantasy", "Film-Noir", "Horror",
    "Musical", "Mystery", "Romance", "Sci-Fi", "Thriller", "War", "Western",
]
DATA_PATH = Path(__file__).resolve().parents[1] / "u.item"
MANY_GENRES_THRESHOLD = 4


def load_movies() -> list[dict]:
    movies = []
    for source_order, line in enumerate(DATA_PATH.read_text(encoding="latin-1").splitlines()):
        fields = line.split("|")
        vector = [int(value) for value in fields[5:24]]
        if len(vector) != len(GENRES):
            raise ValueError(f"movie {fields[0]} has {len(vector)} genre fields")
        movies.append({
            "id": int(fields[0]),
            "title": fields[1],
            "source_order": source_order,
            "vector": vector,
            "genres": [genre for genre, active in zip(GENRES, vector) if active],
            "genre_count": sum(vector),
        })
    return movies


def dot(a: list[int], b: list[int]) -> int:
    return sum(x * y for x, y in zip(a, b))


def cosine(a: list[int], b: list[int]) -> float:
    numerator = dot(a, b)
    norm_a = math.sqrt(dot(a, a))
    norm_b = math.sqrt(dot(b, b))
    return numerator / (norm_a * norm_b) if norm_a and norm_b else 0.0


def jaccard(a: list[int], b: list[int]) -> float:
    intersection = sum(x == 1 and y == 1 for x, y in zip(a, b))
    union = sum(x == 1 or y == 1 for x, y in zip(a, b))
    return intersection / union if union else 0.0


def rank(movies: list[dict], seed: dict, scorer) -> list[dict]:
    candidates = []
    for candidate in movies:
        if candidate["id"] == seed["id"]:
            continue
        candidates.append({
            **candidate,
            "score": scorer(seed["vector"], candidate["vector"]),
        })
    # Stable sort preserves u.item source order for equal scores.
    candidates.sort(key=lambda movie: -movie["score"])
    return candidates


def describe(items: list[dict], limit: int = 5) -> list[dict]:
    return [
        {
            "id": item["id"],
            "title": item["title"],
            "genres": item["genres"],
            "genre_count": item["genre_count"],
            "score": item["score"],
        }
        for item in items[:limit]
    ]


def genre_count_summary(recommendations: list[dict]) -> dict:
    counts = [movie["genre_count"] for movie in recommendations]
    many = sum(count >= MANY_GENRES_THRESHOLD for count in counts)
    return {
        "recommendation_slots": len(counts),
        "mean_genre_count": statistics.fmean(counts),
        "median_genre_count": statistics.median(counts),
        "many_genres_threshold": MANY_GENRES_THRESHOLD,
        "many_genres_count": many,
        "many_genres_proportion": many / len(counts),
    }


def main() -> None:
    movies = load_movies()
    by_id = {movie["id"]: movie for movie in movies}

    # Toy Story vs Aladdin is real, non-trivial, and has 3 shared genres out
    # of vectors containing 3 and 4 active features respectively.
    first, second = by_id[1], by_id[95]
    manual_dot = dot(first["vector"], second["vector"])
    norm_first = math.sqrt(dot(first["vector"], first["vector"]))
    norm_second = math.sqrt(dot(second["vector"], second["vector"]))
    manual_cosine = manual_dot / (norm_first * norm_second)
    implementation_cosine = cosine(first["vector"], second["vector"])
    if not math.isclose(manual_cosine, implementation_cosine, rel_tol=1e-12):
        raise AssertionError("manual and implementation cosine values differ")
    if cosine([0] * 19, first["vector"]) != 0.0:
        raise AssertionError("zero-norm cosine must be zero")

    comparisons = []
    dot_top5_all = []
    cosine_top5_all = []
    live_seed_ids = {1, 50, 100, 203}
    live_examples = {}
    broad_reordering = None

    for seed in movies:
        jaccard_ranking = rank(movies, seed, jaccard)
        cosine_ranking = rank(movies, seed, cosine)
        dot_ranking = rank(movies, seed, dot)
        jaccard_top5 = jaccard_ranking[:5]
        cosine_top5 = cosine_ranking[:5]
        dot_top5 = dot_ranking[:5]
        jaccard_ids = [movie["id"] for movie in jaccard_top5]
        cosine_ids = [movie["id"] for movie in cosine_top5]
        shared = len(set(jaccard_ids) & set(cosine_ids))
        comparisons.append({
            "seed": seed,
            "changed": jaccard_ids != cosine_ids,
            "membership_changed": set(jaccard_ids) != set(cosine_ids),
            "overlap_fraction": shared / 5,
            "jaccard": jaccard_top5,
            "cosine": cosine_top5,
        })
        dot_top5_all.extend(dot_top5)
        cosine_top5_all.extend(cosine_top5)

        if seed["id"] in live_seed_ids:
            live_examples[str(seed["id"])] = {
                "seed_title": seed["title"],
                "seed_genres": seed["genres"],
                "cosine_top5": describe(cosine_top5),
            }

        if broad_reordering is None:
            cosine_positions = {movie["id"]: position for position, movie in enumerate(cosine_ranking)}
            for dot_position, candidate in enumerate(dot_top5):
                cosine_position = cosine_positions[candidate["id"]]
                if candidate["genre_count"] >= MANY_GENRES_THRESHOLD and cosine_position > dot_position:
                    cosine_item = cosine_ranking[cosine_position]
                    broad_reordering = {
                        "seed_id": seed["id"],
                        "seed_title": seed["title"],
                        "seed_genres": seed["genres"],
                        "candidate_id": candidate["id"],
                        "candidate_title": candidate["title"],
                        "candidate_genres": candidate["genres"],
                        "candidate_genre_count": candidate["genre_count"],
                        "dot_rank": dot_position + 1,
                        "dot_score": candidate["score"],
                        "cosine_rank": cosine_position + 1,
                        "cosine_score": cosine_item["score"],
                        "dot_top5": describe(dot_top5),
                        "cosine_top5": describe(cosine_top5),
                    }
                    break

    changed = [item for item in comparisons if item["changed"]]
    membership_changed = [item for item in comparisons if item["membership_changed"]]
    # Prefer examples where membership changes, not only order within the same set.
    meaningful = membership_changed[:3]

    result = {
        "experiment": {
            "data_file": "week02/content-based-movie-recommender/u.item",
            "data_sha256": hashlib.sha256(DATA_PATH.read_bytes()).hexdigest(),
            "movie_count": len(movies),
            "top_k": 5,
            "tie_behavior": "stable u.item source order",
        },
        "manual_verification": {
            "movie_a": {"id": first["id"], "title": first["title"], "genres": first["genres"], "vector": first["vector"]},
            "movie_b": {"id": second["id"], "title": second["title"], "genres": second["genres"], "vector": second["vector"]},
            "dot_product": manual_dot,
            "norm_a": norm_first,
            "norm_b": norm_second,
            "manual_cosine": manual_cosine,
            "implementation_cosine": implementation_cosine,
            "absolute_difference": abs(manual_cosine - implementation_cosine),
            "zero_norm_check": cosine([0] * 19, first["vector"]),
        },
        "jaccard_vs_cosine": {
            "changed_top5_ordered_count": len(changed),
            "changed_top5_ordered_percent": 100 * len(changed) / len(movies),
            "changed_top5_membership_count": len(membership_changed),
            "changed_top5_membership_percent": 100 * len(membership_changed) / len(movies),
            "average_top5_set_overlap_fraction": statistics.fmean(item["overlap_fraction"] for item in comparisons),
            "average_shared_items_out_of_5": 5 * statistics.fmean(item["overlap_fraction"] for item in comparisons),
            "examples": [
                {
                    "seed_id": item["seed"]["id"],
                    "seed_title": item["seed"]["title"],
                    "seed_genres": item["seed"]["genres"],
                    "jaccard_top5": describe(item["jaccard"]),
                    "cosine_top5": describe(item["cosine"]),
                }
                for item in meaningful
            ],
        },
        "dot_product_vs_cosine": {
            "dot_product": genre_count_summary(dot_top5_all),
            "cosine": genre_count_summary(cosine_top5_all),
            "broad_candidate_reordering": broad_reordering,
        },
        "live_examples": live_examples,
    }
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
