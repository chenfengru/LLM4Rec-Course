#!/usr/bin/env python3
"""Verify three-movie profiles and compare them with active-item cosine."""

from __future__ import annotations

import hashlib
import json
import math
import statistics
from collections import Counter, defaultdict
from functools import cmp_to_key
from pathlib import Path


APP_DIR = Path(__file__).resolve().parents[1]
ITEM_PATH = APP_DIR / "u.item"
RATING_PATH = APP_DIR / "u.data"
GENRES = [
    "unknown", "Action", "Adventure", "Animation", "Children's", "Comedy",
    "Crime", "Documentary", "Drama", "Fantasy", "Film-Noir", "Horror",
    "Musical", "Mystery", "Romance", "Sci-Fi", "Thriller", "War", "Western",
]
TOP_K = 5
POSITIVE_RATING = 4
SCORE_TOLERANCE = 1e-12


def load_movies() -> list[dict]:
    movies = []
    for source_order, line in enumerate(ITEM_PATH.read_text(encoding="latin-1").splitlines()):
        fields = line.split("|")
        vector = [int(value) for value in fields[5:24]]
        movies.append({
            "id": int(fields[0]),
            "title": fields[1],
            "source_order": source_order,
            "vector": vector,
            "genres": [genre for genre, active in zip(GENRES, vector) if active],
        })
    return movies


def load_ratings() -> list[dict]:
    ratings = []
    for source_order, line in enumerate(RATING_PATH.read_text().splitlines()):
        user_id, item_id, rating, timestamp = map(int, line.split("\t"))
        ratings.append({
            "user_id": user_id,
            "item_id": item_id,
            "rating": rating,
            "timestamp": timestamp,
            "source_order": source_order,
        })
    return ratings


def add(vectors: list[list[float]]) -> list[float]:
    return [sum(values) for values in zip(*vectors)]


def average(vectors: list[list[float]]) -> list[float]:
    return [value / len(vectors) for value in add(vectors)]


def dot(a: list[float], b: list[float]) -> float:
    return sum(x * y for x, y in zip(a, b))


def cosine(a: list[float], b: list[float]) -> float:
    norm_a = math.sqrt(dot(a, a))
    norm_b = math.sqrt(dot(b, b))
    return dot(a, b) / (norm_a * norm_b) if norm_a and norm_b else 0.0


def rank(movies: list[dict], query: list[float], excluded: set[int]) -> list[dict]:
    candidates = [
        {**movie, "score": cosine(query, movie["vector"])}
        for movie in movies if movie["id"] not in excluded
    ]
    def compare(first: dict, second: dict) -> int:
        difference = second["score"] - first["score"]
        if abs(difference) <= SCORE_TOLERANCE:
            return 0
        return 1 if difference > 0 else -1

    candidates.sort(key=cmp_to_key(compare))
    return candidates


def describe(items: list[dict], limit: int = TOP_K) -> list[dict]:
    return [
        {
            "id": item["id"],
            "title": item["title"],
            "genres": item["genres"],
            "score": item["score"],
        }
        for item in items[:limit]
    ]


def popularity_summary(recommendations: list[dict], rating_counts: Counter, head: set[int], catalog_size: int) -> dict:
    counts = [rating_counts[movie["id"]] for movie in recommendations]
    unique = {movie["id"] for movie in recommendations}
    long_tail_count = sum(movie["id"] not in head for movie in recommendations)
    return {
        "recommendation_slots": len(recommendations),
        "mean_rating_count": statistics.fmean(counts),
        "median_rating_count": statistics.median(counts),
        "long_tail_count": long_tail_count,
        "long_tail_share": long_tail_count / len(recommendations),
        "unique_movies_recommended": len(unique),
        "recommendable_catalog_size": catalog_size,
        "catalog_coverage": len(unique) / catalog_size,
    }


def main() -> None:
    movies = load_movies()
    ratings = load_ratings()
    by_id = {movie["id"]: movie for movie in movies}

    positive_by_user = defaultdict(list)
    for rating in ratings:
        if rating["rating"] >= POSITIVE_RATING:
            positive_by_user[rating["user_id"]].append(rating)

    eligible = []
    for user_id in sorted(positive_by_user):
        positives = sorted(
            positive_by_user[user_id],
            key=lambda rating: (-rating["timestamp"], rating["source_order"]),
        )
        if len(positives) >= 3:
            eligible.append((user_id, positives[:3]))

    comparisons = []
    item_recommendations = []
    profile_recommendations = []
    sum_average_identical = 0
    for user_id, selected_ratings in eligible:
        watched = [by_id[rating["item_id"]] for rating in selected_ratings]
        excluded = {movie["id"] for movie in watched}
        sum_profile = add([movie["vector"] for movie in watched])
        average_profile = average([movie["vector"] for movie in watched])
        item_top5 = rank(movies, watched[0]["vector"], excluded)[:TOP_K]
        profile_top5 = rank(movies, average_profile, excluded)[:TOP_K]
        sum_top5 = rank(movies, sum_profile, excluded)[:TOP_K]
        if [movie["id"] for movie in sum_top5] == [movie["id"] for movie in profile_top5]:
            sum_average_identical += 1
        item_ids = [movie["id"] for movie in item_top5]
        profile_ids = [movie["id"] for movie in profile_top5]
        shared = len(set(item_ids) & set(profile_ids))
        comparisons.append({
            "user_id": user_id,
            "watched": watched,
            "changed": item_ids != profile_ids,
            "overlap_fraction": shared / TOP_K,
            "item_top5": item_top5,
            "profile_top5": profile_top5,
        })
        item_recommendations.extend(item_top5)
        profile_recommendations.extend(profile_top5)

    # Operational popularity split: exactly ceil(20%) of all u.item movies,
    # ordered by descending rating count then movie ID for a reproducible tie-break.
    rating_counts = Counter(rating["item_id"] for rating in ratings)
    head_size = math.ceil(0.20 * len(movies))
    popularity_order = sorted(movies, key=lambda movie: (-rating_counts[movie["id"]], movie["id"]))
    head = {movie["id"] for movie in popularity_order[:head_size]}

    changed = [comparison for comparison in comparisons if comparison["changed"]]

    # Manual example independent of the real-user protocol.
    manual_movies = [by_id[movie_id] for movie_id in (1, 50, 100)]
    manual_sum = add([movie["vector"] for movie in manual_movies])
    manual_average = average([movie["vector"] for movie in manual_movies])
    candidate = by_id[181]
    numerator = dot(manual_average, candidate["vector"])
    profile_norm = math.sqrt(dot(manual_average, manual_average))
    candidate_norm = math.sqrt(dot(candidate["vector"], candidate["vector"]))
    manual_cosine = numerator / (profile_norm * candidate_norm)
    implementation_cosine = cosine(manual_average, candidate["vector"])
    if not math.isclose(manual_cosine, implementation_cosine, rel_tol=1e-12):
        raise AssertionError("manual and implementation profile cosine differ")
    manual_excluded = {movie["id"] for movie in manual_movies}
    if [movie["id"] for movie in rank(movies, manual_sum, manual_excluded)] != [
        movie["id"] for movie in rank(movies, manual_average, manual_excluded)
    ]:
        raise AssertionError("sum and average rankings differ")

    result = {
        "experiment": {
            "item_sha256": hashlib.sha256(ITEM_PATH.read_bytes()).hexdigest(),
            "rating_sha256": hashlib.sha256(RATING_PATH.read_bytes()).hexdigest(),
            "movie_count": len(movies),
            "rating_count": len(ratings),
            "positive_rating_threshold": POSITIVE_RATING,
            "profile_size": 3,
            "top_k": TOP_K,
            "tie_behavior": "stable u.item source order",
            "comparison_exclusion": "all three watched movies for both methods",
        },
        "manual_verification": {
            "movies": [
                {"id": movie["id"], "title": movie["title"], "genres": movie["genres"], "vector": movie["vector"]}
                for movie in manual_movies
            ],
            "sum_profile": manual_sum,
            "average_profile": manual_average,
            "candidate": {
                "id": candidate["id"],
                "title": candidate["title"],
                "genres": candidate["genres"],
                "vector": candidate["vector"],
            },
            "dot_product": numerator,
            "profile_norm": profile_norm,
            "candidate_norm": candidate_norm,
            "manual_cosine": manual_cosine,
            "implementation_cosine": implementation_cosine,
            "absolute_difference": abs(manual_cosine - implementation_cosine),
            "sum_vs_average_full_ranking_identical": True,
        },
        "sum_vs_average_eligible_users": {
            "identical_top5_count": sum_average_identical,
            "eligible_user_count": len(eligible),
        },
        "real_user_comparison": {
            "eligible_user_count": len(eligible),
            "changed_ordered_top5_count": len(changed),
            "changed_ordered_top5_percent": 100 * len(changed) / len(eligible),
            "mean_top5_overlap_fraction": statistics.fmean(item["overlap_fraction"] for item in comparisons),
            "mean_shared_items_out_of_5": TOP_K * statistics.fmean(item["overlap_fraction"] for item in comparisons),
            "examples": [
                {
                    "user_id": item["user_id"],
                    "watched_most_recent_first": [
                        {"id": movie["id"], "title": movie["title"], "genres": movie["genres"]}
                        for movie in item["watched"]
                    ],
                    "item_top5": describe(item["item_top5"]),
                    "profile_top5": describe(item["profile_top5"]),
                }
                for item in changed[:3]
            ],
        },
        "popularity": {
            "operational_definition": "Head is the first ceil(20% of 1,682) movies after sorting by descending u.data rating count and then movie ID; long-tail is the remainder.",
            "head_size": head_size,
            "long_tail_size": len(movies) - head_size,
            "item_to_item": popularity_summary(item_recommendations, rating_counts, head, len(movies)),
            "profile": popularity_summary(profile_recommendations, rating_counts, head, len(movies)),
        },
    }
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
