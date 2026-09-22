#!/usr/bin/env python3
"""Compare binary and IDF-weighted genre cosine representations."""

from __future__ import annotations

import json
import math
import random
import statistics
from collections import Counter, defaultdict
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
TOLERANCE = 1e-12
RANDOM_SEEDS = list(range(20))


def load_data() -> tuple[list[dict], list[dict]]:
    movies = []
    for source_order, line in enumerate(ITEM_PATH.read_text(encoding="latin-1").splitlines()):
        fields = line.split("|")
        vector = [int(value) for value in fields[5:24]]
        movies.append({
            "id": int(fields[0]),
            "title": fields[1],
            "source_order": source_order,
            "binary": vector,
            "genres": [genre for genre, active in zip(GENRES, vector) if active],
        })
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
    return movies, ratings


def dot(a: list[float], b: list[float]) -> float:
    return sum(x * y for x, y in zip(a, b))


def cosine(a: list[float], b: list[float]) -> float:
    norm_a = math.sqrt(dot(a, a))
    norm_b = math.sqrt(dot(b, b))
    return dot(a, b) / (norm_a * norm_b) if norm_a and norm_b else 0.0


def average(vectors: list[list[float]]) -> list[float]:
    return [sum(values) / len(vectors) for values in zip(*vectors)]


def score_groups(movies: list[dict], query: list[float], vector_key: str, excluded: set[int]) -> list[list[dict]]:
    candidates = [
        {**movie, "score": cosine(query, movie[vector_key])}
        for movie in movies if movie["id"] not in excluded
    ]
    candidates.sort(key=lambda movie: -movie["score"])
    groups = []
    for candidate in candidates:
        if not groups or abs(candidate["score"] - groups[-1][0]["score"]) > TOLERANCE:
            groups.append([candidate])
        else:
            groups[-1].append(candidate)
    for group in groups:
        group.sort(key=lambda movie: movie["source_order"])
    return groups


def select_top5(groups: list[list[dict]], priorities: dict[int, float] | None = None) -> list[dict]:
    selected = []
    for group in groups:
        ordered = group if priorities is None else sorted(group, key=lambda movie: priorities[movie["id"]])
        selected.extend(ordered[: TOP_K - len(selected)])
        if len(selected) == TOP_K:
            break
    return selected


def tie_details(groups: list[list[dict]]) -> dict:
    position = 0
    top5_has_tie = False
    cutoff_size = 1
    cutoff_end = 0
    for group in groups:
        start, end = position, position + len(group)
        selected_count = max(0, min(end, TOP_K) - start) if start < TOP_K else 0
        if selected_count >= 2 and len(group) >= 2:
            top5_has_tie = True
        if start < TOP_K <= end:
            cutoff_size = len(group)
            cutoff_end = end
            break
        position = end
    return {
        "top5_has_tie": top5_has_tie,
        "cutoff_has_tie": cutoff_size >= 2,
        "membership_sensitive": cutoff_end > TOP_K,
        "cutoff_size": cutoff_size,
        "distinct_score_groups": len(groups),
    }


def aggregate_ties(records: list[dict]) -> dict:
    cutoff_records = [record for record in records if record["cutoff_has_tie"]]
    return {
        "user_count": len(records),
        "top5_tie_count": sum(record["top5_has_tie"] for record in records),
        "top5_tie_percent": 100 * sum(record["top5_has_tie"] for record in records) / len(records),
        "cutoff_tie_count": len(cutoff_records),
        "cutoff_tie_percent": 100 * len(cutoff_records) / len(records),
        "membership_sensitive_count": sum(record["membership_sensitive"] for record in records),
        "membership_sensitive_percent": 100 * sum(record["membership_sensitive"] for record in records) / len(records),
        "mean_cutoff_tie_group_size": statistics.fmean(record["cutoff_size"] for record in cutoff_records),
        "maximum_cutoff_tie_group_size": max(record["cutoff_size"] for record in cutoff_records),
        "distinct_score_groups": {
            "mean": statistics.fmean(record["distinct_score_groups"] for record in records),
            "median": statistics.median(record["distinct_score_groups"] for record in records),
            "minimum": min(record["distinct_score_groups"] for record in records),
            "maximum": max(record["distinct_score_groups"] for record in records),
        },
    }


def catalog_metrics(recommendations: list[dict], rating_counts: Counter, head: set[int], catalog_size: int) -> dict:
    counts = [rating_counts[movie["id"]] for movie in recommendations]
    unique = {movie["id"] for movie in recommendations}
    return {
        "mean_rating_count": statistics.fmean(counts),
        "median_rating_count": statistics.median(counts),
        "long_tail_share": sum(movie["id"] not in head for movie in recommendations) / len(recommendations),
        "unique_movies_recommended": len(unique),
        "catalog_coverage": len(unique) / catalog_size,
    }


def summarize(values: list[float]) -> dict:
    return {
        "mean": statistics.fmean(values),
        "standard_deviation": statistics.pstdev(values),
        "minimum": min(values),
        "maximum": max(values),
    }


def scored_example(seed_movies: list[dict], mode: str, binary_top5: list[dict], idf_top5: list[dict]) -> dict:
    binary_query = seed_movies[0]["binary"] if mode == "item" else average([movie["binary"] for movie in seed_movies])
    idf_query = seed_movies[0]["weighted"] if mode == "item" else average([movie["weighted"] for movie in seed_movies])
    candidates = []
    seen = set()
    for movie in [*binary_top5, *idf_top5]:
        if movie["id"] in seen:
            continue
        seen.add(movie["id"])
        candidates.append({
            "id": movie["id"],
            "title": movie["title"],
            "genres": movie["genres"],
            "binary_cosine": cosine(binary_query, movie["binary"]),
            "idf_cosine": cosine(idf_query, movie["weighted"]),
        })
    return {
        "mode": mode,
        "seed_movies": [
            {"id": movie["id"], "title": movie["title"], "genres": movie["genres"]}
            for movie in seed_movies
        ],
        "binary_top5_ids": [movie["id"] for movie in binary_top5],
        "idf_top5_ids": [movie["id"] for movie in idf_top5],
        "candidate_scores": candidates,
    }


def main() -> None:
    movies, ratings = load_data()
    movie_count = len(movies)
    document_frequency = [sum(movie["binary"][index] for movie in movies) for index in range(len(GENRES))]
    idf = [math.log((movie_count + 1) / (frequency + 1)) + 1 for frequency in document_frequency]
    for movie in movies:
        movie["weighted"] = [value * weight for value, weight in zip(movie["binary"], idf)]

    by_id = {movie["id"]: movie for movie in movies}
    positive_by_user = defaultdict(list)
    for rating in ratings:
        if rating["rating"] >= 4:
            positive_by_user[rating["user_id"]].append(rating)
    eligible = []
    for user_id in sorted(positive_by_user):
        positives = sorted(
            positive_by_user[user_id],
            key=lambda rating: (-rating["timestamp"], rating["source_order"]),
        )
        if len(positives) >= 3:
            eligible.append((user_id, [by_id[rating["item_id"]] for rating in positives[:3]]))

    rating_counts = Counter(rating["item_id"] for rating in ratings)
    head_size = math.ceil(0.20 * movie_count)
    popularity_order = sorted(movies, key=lambda movie: (-rating_counts[movie["id"]], movie["id"]))
    head = {movie["id"] for movie in popularity_order[:head_size]}

    combinations = [
        ("binary", "item"), ("binary", "profile"),
        ("idf", "item"), ("idf", "profile"),
    ]
    vector_key = {"binary": "binary", "idf": "weighted"}
    prepared = []
    tie_records = {f"{feature}_{mode}": [] for feature, mode in combinations}
    source_recs = {f"{feature}_{mode}": [] for feature, mode in combinations}
    source_overlap = {"binary": [], "idf": []}
    source_item_profile_changed = {"binary": [], "idf": []}
    source_binary_idf_changed = {"item": [], "profile": []}
    examples = []

    for user_id, watched in eligible:
        excluded = {movie["id"] for movie in watched}
        groups = {}
        tops = {}
        for feature, mode in combinations:
            key = f"{feature}_{mode}"
            vectors = [movie[vector_key[feature]] for movie in watched]
            query = vectors[0] if mode == "item" else average(vectors)
            groups[key] = score_groups(movies, query, vector_key[feature], excluded)
            tops[key] = select_top5(groups[key])
            tie_records[key].append(tie_details(groups[key]))
            source_recs[key].extend(tops[key])
        for feature in ("binary", "idf"):
            item_ids = {movie["id"] for movie in tops[f"{feature}_item"]}
            profile_ids = {movie["id"] for movie in tops[f"{feature}_profile"]}
            source_overlap[feature].append(len(item_ids & profile_ids) / TOP_K)
            source_item_profile_changed[feature].append(item_ids != profile_ids)
        for mode in ("item", "profile"):
            binary_ids = {movie["id"] for movie in tops[f"binary_{mode}"]}
            idf_ids = {movie["id"] for movie in tops[f"idf_{mode}"]}
            changed = binary_ids != idf_ids
            source_binary_idf_changed[mode].append(changed)
            if changed and not any(example["mode"] == mode for example in examples):
                seed_movies = [watched[0]] if mode == "item" else watched
                example = scored_example(seed_movies, mode, tops[f"binary_{mode}"], tops[f"idf_{mode}"])
                example["user_id"] = user_id
                examples.append(example)
        prepared.append((user_id, groups))

    tie_statistics = {
        feature: {
            mode: aggregate_ties(tie_records[f"{feature}_{mode}"])
            for mode in ("item", "profile")
        }
        for feature in ("binary", "idf")
    }
    source_catalog = {
        feature: {
            mode: catalog_metrics(source_recs[f"{feature}_{mode}"], rating_counts, head, movie_count)
            for mode in ("item", "profile")
        }
        for feature in ("binary", "idf")
    }
    source_comparison = {
        feature: {
            "mean_item_profile_overlap": statistics.fmean(source_overlap[feature]),
            "item_profile_different_count": sum(source_item_profile_changed[feature]),
            "item_profile_different_percent": 100 * sum(source_item_profile_changed[feature]) / len(eligible),
        }
        for feature in ("binary", "idf")
    }
    source_representation_change = {
        mode: {
            "top5_membership_changed_count": sum(source_binary_idf_changed[mode]),
            "top5_membership_changed_percent": 100 * sum(source_binary_idf_changed[mode]) / len(eligible),
        }
        for mode in ("item", "profile")
    }

    per_seed = []
    for seed in RANDOM_SEEDS:
        rng = random.Random(seed)
        priorities = {movie["id"]: rng.random() for movie in movies}
        recommendations = {f"{feature}_{mode}": [] for feature, mode in combinations}
        overlaps = {"binary": [], "idf": []}
        item_profile_changed = {"binary": [], "idf": []}
        representation_changed = {"item": [], "profile": []}
        for _, groups in prepared:
            tops = {key: select_top5(value, priorities) for key, value in groups.items()}
            for key, top5 in tops.items():
                recommendations[key].extend(top5)
            for feature in ("binary", "idf"):
                item_ids = {movie["id"] for movie in tops[f"{feature}_item"]}
                profile_ids = {movie["id"] for movie in tops[f"{feature}_profile"]}
                overlaps[feature].append(len(item_ids & profile_ids) / TOP_K)
                item_profile_changed[feature].append(item_ids != profile_ids)
            for mode in ("item", "profile"):
                binary_ids = {movie["id"] for movie in tops[f"binary_{mode}"]}
                idf_ids = {movie["id"] for movie in tops[f"idf_{mode}"]}
                representation_changed[mode].append(binary_ids != idf_ids)
        per_seed.append({
            "seed": seed,
            "catalog": {
                feature: {
                    mode: catalog_metrics(recommendations[f"{feature}_{mode}"], rating_counts, head, movie_count)
                    for mode in ("item", "profile")
                }
                for feature in ("binary", "idf")
            },
            "item_profile": {
                feature: {
                    "mean_overlap": statistics.fmean(overlaps[feature]),
                    "different_percent": 100 * sum(item_profile_changed[feature]) / len(eligible),
                }
                for feature in ("binary", "idf")
            },
            "binary_vs_idf": {
                mode: 100 * sum(representation_changed[mode]) / len(eligible)
                for mode in ("item", "profile")
            },
        })

    metric_names = [
        "mean_rating_count", "median_rating_count", "long_tail_share",
        "unique_movies_recommended", "catalog_coverage",
    ]
    random_catalog_summary = {
        feature: {
            mode: {
                metric: summarize([trial["catalog"][feature][mode][metric] for trial in per_seed])
                for metric in metric_names
            }
            for mode in ("item", "profile")
        }
        for feature in ("binary", "idf")
    }
    random_comparison_summary = {
        feature: {
            "mean_item_profile_overlap": summarize([trial["item_profile"][feature]["mean_overlap"] for trial in per_seed]),
            "item_profile_different_percent": summarize([trial["item_profile"][feature]["different_percent"] for trial in per_seed]),
        }
        for feature in ("binary", "idf")
    }
    random_representation_change = {
        mode: summarize([trial["binary_vs_idf"][mode] for trial in per_seed])
        for mode in ("item", "profile")
    }

    first, second = by_id[1], by_id[95]
    manual_pair = {
        "movie_a": {"id": first["id"], "title": first["title"], "binary": first["binary"], "weighted": first["weighted"]},
        "movie_b": {"id": second["id"], "title": second["title"], "binary": second["binary"], "weighted": second["weighted"]},
        "ordinary_cosine": cosine(first["binary"], second["binary"]),
        "idf_cosine": cosine(first["weighted"], second["weighted"]),
    }

    print(json.dumps({
        "protocol": {
            "movie_count": movie_count,
            "eligible_user_count": len(eligible),
            "score_tolerance": TOLERANCE,
            "random_seeds": RANDOM_SEEDS,
            "paired_priority_policy": "one fixed random priority per movie ID and seed, shared by all methods",
        },
        "genre_statistics": [
            {"genre": genre, "document_frequency": frequency, "idf": weight}
            for genre, frequency, weight in zip(GENRES, document_frequency, idf)
        ],
        "manual_pair": manual_pair,
        "tie_statistics": tie_statistics,
        "source_order_catalog": source_catalog,
        "random_catalog_summary": random_catalog_summary,
        "source_order_item_profile": source_comparison,
        "random_item_profile_summary": random_comparison_summary,
        "source_order_binary_vs_idf": source_representation_change,
        "random_binary_vs_idf_summary": random_representation_change,
        "ranking_examples": examples,
        "per_seed": per_seed,
    }, indent=2))


if __name__ == "__main__":
    main()
