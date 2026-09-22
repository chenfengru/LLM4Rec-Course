#!/usr/bin/env python3
"""Measure cosine tie frequency and sensitivity to seeded random tie-breaking."""

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
TOP_K = 5
TOLERANCE = 1e-12
RANDOM_SEEDS = list(range(20))


def load_data() -> tuple[list[dict], list[dict]]:
    movies = []
    for source_order, line in enumerate(ITEM_PATH.read_text(encoding="latin-1").splitlines()):
        fields = line.split("|")
        movies.append({
            "id": int(fields[0]),
            "title": fields[1],
            "source_order": source_order,
            "vector": [int(value) for value in fields[5:24]],
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


def score_groups(movies: list[dict], query: list[float], excluded: set[int]) -> list[list[dict]]:
    # Sort scores to identify tolerance-level groups, then restore source order
    # inside each group to reproduce the application's stable tie behavior.
    candidates = [
        {**movie, "score": cosine(query, movie["vector"])}
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


def source_top5(groups: list[list[dict]]) -> list[dict]:
    selected = []
    for group in groups:
        selected.extend(group[: TOP_K - len(selected)])
        if len(selected) == TOP_K:
            break
    return selected


def randomized_top5(groups: list[list[dict]], seed: int, user_id: int, method_index: int) -> list[dict]:
    selected = []
    for group_index, group in enumerate(groups):
        remaining = TOP_K - len(selected)
        if len(group) <= remaining:
            selected.extend(group)
        else:
            shuffled = list(group)
            # Independent, reproducible randomization per seed/user/method/group.
            rng = random.Random(seed * 10_000_000 + user_id * 100 + method_index * 10 + group_index)
            rng.shuffle(shuffled)
            selected.extend(shuffled[:remaining])
        if len(selected) == TOP_K:
            break
    return selected


def tie_details(groups: list[list[dict]]) -> dict:
    position = 0
    top5_has_tie = False
    cutoff_group_size = 1
    cutoff_group_start = 0
    cutoff_group_end = 0
    for group in groups:
        start = position
        end = position + len(group)
        selected_from_group = max(0, min(end, TOP_K) - start) if start < TOP_K else 0
        if selected_from_group >= 2 and len(group) >= 2:
            top5_has_tie = True
        if start < TOP_K <= end:
            cutoff_group_size = len(group)
            cutoff_group_start = start + 1
            cutoff_group_end = end
            break
        position = end
    return {
        "top5_has_tie": top5_has_tie,
        "cutoff_has_tie": cutoff_group_size >= 2,
        "cutoff_membership_sensitive": cutoff_group_end > TOP_K,
        "cutoff_group_size": cutoff_group_size,
        "cutoff_group_rank_start": cutoff_group_start,
        "cutoff_group_rank_end": cutoff_group_end,
    }


def metric_summary(recommendations: list[dict], rating_counts: Counter, head: set[int], catalog_size: int) -> dict:
    popularity = [rating_counts[movie["id"]] for movie in recommendations]
    unique = {movie["id"] for movie in recommendations}
    return {
        "mean_rating_count": statistics.fmean(popularity),
        "median_rating_count": statistics.median(popularity),
        "long_tail_share": sum(movie["id"] not in head for movie in recommendations) / len(recommendations),
        "unique_movies_recommended": len(unique),
        "catalog_coverage": len(unique) / catalog_size,
    }


def summarize_trials(trials: list[dict], metric: str) -> dict:
    values = [trial[metric] for trial in trials]
    return {
        "mean": statistics.fmean(values),
        "standard_deviation": statistics.pstdev(values),
        "minimum": min(values),
        "maximum": max(values),
    }


def main() -> None:
    movies, ratings = load_data()
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
            watched = [by_id[rating["item_id"]] for rating in positives[:3]]
            eligible.append((user_id, watched))

    rating_counts = Counter(rating["item_id"] for rating in ratings)
    head_size = math.ceil(0.20 * len(movies))
    popularity_order = sorted(movies, key=lambda movie: (-rating_counts[movie["id"]], movie["id"]))
    head = {movie["id"] for movie in popularity_order[:head_size]}

    prepared = []
    tie_records = {"item_to_item": [], "profile": []}
    source_recommendations = {"item_to_item": [], "profile": []}
    source_overlap = []
    source_changed = []
    for user_id, watched in eligible:
        excluded = {movie["id"] for movie in watched}
        item_groups = score_groups(movies, watched[0]["vector"], excluded)
        profile = average([movie["vector"] for movie in watched])
        profile_groups = score_groups(movies, profile, excluded)
        item_top5 = source_top5(item_groups)
        profile_top5 = source_top5(profile_groups)
        item_ids = {movie["id"] for movie in item_top5}
        profile_ids = {movie["id"] for movie in profile_top5}
        source_recommendations["item_to_item"].extend(item_top5)
        source_recommendations["profile"].extend(profile_top5)
        source_overlap.append(len(item_ids & profile_ids) / TOP_K)
        source_changed.append(item_ids != profile_ids)
        tie_records["item_to_item"].append(tie_details(item_groups))
        tie_records["profile"].append(tie_details(profile_groups))
        prepared.append((user_id, item_groups, profile_groups))

    source_metrics = {
        method: metric_summary(recs, rating_counts, head, len(movies))
        for method, recs in source_recommendations.items()
    }
    source_comparison = {
        "mean_top5_set_overlap": statistics.fmean(source_overlap),
        "changed_top5_set_count": sum(source_changed),
        "changed_top5_set_percent": 100 * sum(source_changed) / len(source_changed),
    }

    tie_frequency = {}
    for method, records in tie_records.items():
        top5_ties = sum(record["top5_has_tie"] for record in records)
        cutoff_ties = [record for record in records if record["cutoff_has_tie"]]
        sensitive = sum(record["cutoff_membership_sensitive"] for record in records)
        tie_frequency[method] = {
            "users": len(records),
            "top5_contains_tie_count": top5_ties,
            "top5_contains_tie_percent": 100 * top5_ties / len(records),
            "rank5_cutoff_tie_count": len(cutoff_ties),
            "rank5_cutoff_tie_percent": 100 * len(cutoff_ties) / len(records),
            "mean_cutoff_tie_group_size_among_cutoff_ties": statistics.fmean(
                record["cutoff_group_size"] for record in cutoff_ties
            ),
            "maximum_cutoff_tie_group_size": max(record["cutoff_group_size"] for record in cutoff_ties),
            "membership_sensitive_cutoff_count": sensitive,
            "membership_sensitive_cutoff_percent": 100 * sensitive / len(records),
        }

    per_seed = []
    for seed in RANDOM_SEEDS:
        recommendations = {"item_to_item": [], "profile": []}
        overlaps = []
        changed_sets = []
        for user_id, item_groups, profile_groups in prepared:
            item_top5 = randomized_top5(item_groups, seed, user_id, 0)
            profile_top5 = randomized_top5(profile_groups, seed, user_id, 1)
            recommendations["item_to_item"].extend(item_top5)
            recommendations["profile"].extend(profile_top5)
            item_ids = {movie["id"] for movie in item_top5}
            profile_ids = {movie["id"] for movie in profile_top5}
            overlaps.append(len(item_ids & profile_ids) / TOP_K)
            changed_sets.append(item_ids != profile_ids)
        per_seed.append({
            "seed": seed,
            "item_to_item": metric_summary(recommendations["item_to_item"], rating_counts, head, len(movies)),
            "profile": metric_summary(recommendations["profile"], rating_counts, head, len(movies)),
            "comparison": {
                "mean_top5_set_overlap": statistics.fmean(overlaps),
                "changed_top5_set_count": sum(changed_sets),
                "changed_top5_set_percent": 100 * sum(changed_sets) / len(changed_sets),
            },
        })

    metrics = [
        "mean_rating_count", "median_rating_count", "long_tail_share",
        "unique_movies_recommended", "catalog_coverage",
    ]
    random_summary = {
        method: {
            metric: summarize_trials([trial[method] for trial in per_seed], metric)
            for metric in metrics
        }
        for method in ("item_to_item", "profile")
    }
    random_summary["comparison"] = {
        metric: summarize_trials([trial["comparison"] for trial in per_seed], metric)
        for metric in ("mean_top5_set_overlap", "changed_top5_set_count", "changed_top5_set_percent")
    }

    directional = {
        "profile_mean_popularity_higher_seed_count": sum(
            trial["profile"]["mean_rating_count"] > trial["item_to_item"]["mean_rating_count"]
            for trial in per_seed
        ),
        "profile_median_popularity_higher_seed_count": sum(
            trial["profile"]["median_rating_count"] > trial["item_to_item"]["median_rating_count"]
            for trial in per_seed
        ),
        "profile_long_tail_share_lower_seed_count": sum(
            trial["profile"]["long_tail_share"] < trial["item_to_item"]["long_tail_share"]
            for trial in per_seed
        ),
        "profile_unique_count_lower_seed_count": sum(
            trial["profile"]["unique_movies_recommended"] < trial["item_to_item"]["unique_movies_recommended"]
            for trial in per_seed
        ),
        "profile_catalog_coverage_lower_seed_count": sum(
            trial["profile"]["catalog_coverage"] < trial["item_to_item"]["catalog_coverage"]
            for trial in per_seed
        ),
        "random_seed_count": len(per_seed),
    }

    print(json.dumps({
        "protocol": {
            "eligible_user_count": len(eligible),
            "top_k": TOP_K,
            "score_tolerance": TOLERANCE,
            "random_seeds": RANDOM_SEEDS,
            "randomization": "uniform shuffle within score-tie groups only; cosine scores unchanged",
            "head_definition": "top ceil(20% of 1,682) movies by rating count, movie ID tie-break",
        },
        "tie_frequency": tie_frequency,
        "source_order": {**source_metrics, "comparison": source_comparison},
        "random_tie_summary": random_summary,
        "directional_robustness": directional,
        "per_seed": per_seed,
    }, indent=2))


if __name__ == "__main__":
    main()
