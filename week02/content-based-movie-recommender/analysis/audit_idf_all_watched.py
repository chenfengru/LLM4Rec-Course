#!/usr/bin/env python3
"""Recompute user-level binary/IDF diagnostics with all rated movies excluded."""

from __future__ import annotations

import hashlib
import json
import math
import random
import statistics
from collections import defaultdict
from pathlib import Path


APP_DIR = Path(__file__).resolve().parents[1]
ANALYSIS_DIR = Path(__file__).resolve().parent
ITEM_PATH = APP_DIR / "u.item"
RATING_PATH = APP_DIR / "u.data"
HISTORICAL_PATH = ANALYSIS_DIR / "idf_results.json"
RESULT_PATH = ANALYSIS_DIR / "idf_all_watched_results.json"
SUMMARY_PATH = ANALYSIS_DIR / "idf_all_watched_summary.md"

GENRES = [
    "unknown", "Action", "Adventure", "Animation", "Children's", "Comedy",
    "Crime", "Documentary", "Drama", "Fantasy", "Film-Noir", "Horror",
    "Musical", "Mystery", "Romance", "Sci-Fi", "Thriller", "War", "Western",
]
TOP_K = 5
POSITIVE_RATING = 4
PROFILE_SIZE = 3
TOLERANCE = 1e-12
RANDOM_SEEDS = list(range(20))
METHODS = ("binary_item", "idf_item", "binary_profile", "idf_profile")


def load_data() -> tuple[list[dict], list[dict]]:
    movies = []
    for source_order, line in enumerate(ITEM_PATH.read_text(encoding="latin-1").splitlines()):
        fields = line.split("|")
        vector = [int(value) for value in fields[5:24]]
        if len(vector) != len(GENRES):
            raise AssertionError(f"movie {fields[0]} has {len(vector)} genre fields")
        movies.append({
            "id": int(fields[0]),
            "source_order": source_order,
            "binary": vector,
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


def dot(first: list[float], second: list[float]) -> float:
    return sum(a * b for a, b in zip(first, second))


def cosine(first: list[float], second: list[float]) -> float:
    first_norm = math.sqrt(dot(first, first))
    second_norm = math.sqrt(dot(second, second))
    return dot(first, second) / (first_norm * second_norm) if first_norm and second_norm else 0.0


def average(vectors: list[list[float]]) -> list[float]:
    return [sum(values) / len(vectors) for values in zip(*vectors)]


def score_groups(
    movies: list[dict], query: list[float], vector_key: str, excluded: set[int]
) -> list[list[tuple[int, int, float]]]:
    candidates = [
        (movie["id"], movie["source_order"], cosine(query, movie[vector_key]))
        for movie in movies
        if movie["id"] not in excluded
    ]
    candidates.sort(key=lambda candidate: -candidate[2])
    groups: list[list[tuple[int, int, float]]] = []
    for candidate in candidates:
        if not groups or abs(candidate[2] - groups[-1][0][2]) > TOLERANCE:
            groups.append([candidate])
        else:
            groups[-1].append(candidate)
    for group in groups:
        group.sort(key=lambda candidate: candidate[1])
    return groups


def groups_through_cutoff(groups: list[list[tuple[int, int, float]]]) -> list[list[int]]:
    selected_groups = []
    position = 0
    for group in groups:
        selected_groups.append([candidate[0] for candidate in group])
        position += len(group)
        if position >= TOP_K:
            break
    return selected_groups


def select_top5(groups: list[list[int]], priorities: dict[int, float] | None = None) -> list[int]:
    selected = []
    for group in groups:
        ordered = group if priorities is None else sorted(group, key=lambda movie_id: (priorities[movie_id], movie_id))
        selected.extend(ordered[: TOP_K - len(selected)])
        if len(selected) == TOP_K:
            break
    return selected


def tie_details(groups: list[list[tuple[int, int, float]]]) -> dict:
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
        "distinct_score_values": len(groups),
    }


def aggregate_ties(records: list[dict]) -> dict:
    cutoff_ties = [record for record in records if record["cutoff_has_tie"]]
    return {
        "user_count": len(records),
        "mean_distinct_similarity_scores": statistics.fmean(
            record["distinct_score_values"] for record in records
        ),
        "top5_tie_count": sum(record["top5_has_tie"] for record in records),
        "top5_tie_percent": 100 * sum(record["top5_has_tie"] for record in records) / len(records),
        "cutoff_tie_count": len(cutoff_ties),
        "cutoff_tie_percent": 100 * len(cutoff_ties) / len(records),
        "membership_sensitive_count": sum(record["membership_sensitive"] for record in records),
        "membership_sensitive_percent": 100 * sum(
            record["membership_sensitive"] for record in records
        ) / len(records),
        "mean_cutoff_tie_group_size": statistics.fmean(
            record["cutoff_size"] for record in cutoff_ties
        ),
    }


def membership_change(binary_top5: list[int], idf_top5: list[int]) -> bool:
    return set(binary_top5) != set(idf_top5)


def summarize(values: list[float]) -> dict:
    return {
        "mean": statistics.fmean(values),
        "standard_deviation": statistics.pstdev(values),
        "minimum": min(values),
        "maximum": max(values),
    }


def write_summary(result: dict) -> None:
    ties = result["corrected_tie_statistics"]
    source = result["corrected_source_order_membership_change"]
    random_summary = result["corrected_paired_random_membership_change"]["summary"]
    old_ties = result["historical_defective_results"]["tie_statistics"]
    old_source = result["historical_defective_results"]["source_order_binary_vs_idf"]

    labels = {
        "binary_item": "Binary item",
        "idf_item": "IDF item",
        "binary_profile": "Binary profile",
        "idf_profile": "IDF profile",
    }
    corrected_rows = "\n".join(
        f"| {labels[method]} | {ties[method]['mean_distinct_similarity_scores']:.6f} | "
        f"{ties[method]['top5_tie_percent']:.6f}% | {ties[method]['cutoff_tie_percent']:.6f}% | "
        f"{ties[method]['membership_sensitive_percent']:.6f}% | "
        f"{ties[method]['mean_cutoff_tie_group_size']:.6f} |"
        for method in METHODS
    )
    replacement_rows = "\n".join(
        f"| {labels[method]} | {old_ties[method]['mean_distinct_scores']:.6f} | "
        f"{ties[method]['mean_distinct_similarity_scores']:.6f} | "
        f"{old_ties[method]['top5_tie_percent']:.6f}% | {ties[method]['top5_tie_percent']:.6f}% | "
        f"{old_ties[method]['cutoff_tie_percent']:.6f}% | {ties[method]['cutoff_tie_percent']:.6f}% |"
        for method in METHODS
    )

    SUMMARY_PATH.write_text(
        f"""# IDF diagnostics with all-watched exclusion

## Reproduce

```bash
python3 week02/content-based-movie-recommender/analysis/audit_idf_all_watched.py
```

The protocol has 942 eligible users. Every movie appearing in a user's
`u.data` records is excluded for binary/IDF item and profile ranking. Historical
`idf_results.json` and `idf_summary.md` remain unchanged for audit history.

## Corrected tie and discriminability diagnostics

| Method | Mean distinct scores | Top-5 tie | Cutoff tie | Membership-sensitive cutoff | Mean cutoff group |
|---|---:|---:|---:|---:|---:|
{corrected_rows}

## Binary versus IDF Top-5 membership change

- source-order item: **{source['item_changed_count']} / 942 ({source['item_changed_percent']:.6f}%)**
- source-order profile: **{source['profile_changed_count']} / 942 ({source['profile_changed_percent']:.6f}%)**
- paired-random item: mean **{random_summary['item_changed_percent']['mean']:.6f}%**, SD **{random_summary['item_changed_percent']['standard_deviation']:.6f}**, range **[{random_summary['item_changed_percent']['minimum']:.6f}, {random_summary['item_changed_percent']['maximum']:.6f}]**
- paired-random profile: mean **{random_summary['profile_changed_percent']['mean']:.6f}%**, SD **{random_summary['profile_changed_percent']['standard_deviation']:.6f}**, range **[{random_summary['profile_changed_percent']['minimum']:.6f}, {random_summary['profile_changed_percent']['maximum']:.6f}]**

For each seed 0–19, one movie-priority mapping is shared by all four methods.

## Leakage assertions

- source-order checks: **{result['leakage_assertions']['source_order_checks']}**, leaked slots **0**
- paired-random checks: **{result['leakage_assertions']['paired_random_checks']}**, leaked slots **0**
- invariant: `Top5 ∩ watched_set = empty` for every method/user/tie policy

## Values that replace the defective report numbers

| Method | Old distinct | Corrected distinct | Old Top-5 tie | Corrected Top-5 tie | Old cutoff tie | Corrected cutoff tie |
|---|---:|---:|---:|---:|---:|---:|
{replacement_rows}

Old source-order membership-change rates were
{old_source['item_top5_membership_changed_percent']:.6f}% for item and
{old_source['profile_top5_membership_changed_percent']:.6f}% for profile; use
the corrected values above instead. This audit measures discrimination and
tie structure, not recommendation relevance.
""",
        encoding="utf-8",
    )


def main() -> None:
    movies, ratings = load_data()
    movie_count = len(movies)
    document_frequency = [
        sum(movie["binary"][index] for movie in movies)
        for index in range(len(GENRES))
    ]
    idf = [
        math.log((movie_count + 1) / (frequency + 1)) + 1
        for frequency in document_frequency
    ]
    for movie in movies:
        movie["weighted"] = [value * weight for value, weight in zip(movie["binary"], idf)]

    by_id = {movie["id"]: movie for movie in movies}
    all_ratings_by_user: dict[int, list[dict]] = defaultdict(list)
    positives_by_user: dict[int, list[dict]] = defaultdict(list)
    for rating in ratings:
        all_ratings_by_user[rating["user_id"]].append(rating)
        if rating["rating"] >= POSITIVE_RATING:
            positives_by_user[rating["user_id"]].append(rating)

    eligible = []
    for user_id in sorted(positives_by_user):
        positives = sorted(
            positives_by_user[user_id],
            key=lambda rating: (-rating["timestamp"], rating["source_order"]),
        )
        if len(positives) >= PROFILE_SIZE:
            selected = [by_id[rating["item_id"]] for rating in positives[:PROFILE_SIZE]]
            watched_set = {rating["item_id"] for rating in all_ratings_by_user[user_id]}
            eligible.append((user_id, selected, watched_set))

    tie_records = {method: [] for method in METHODS}
    prepared = []
    source_item_changed = 0
    source_profile_changed = 0
    source_leakage_checks = 0

    for user_id, selected, watched_set in eligible:
        queries = {
            "binary_item": (selected[0]["binary"], "binary"),
            "idf_item": (selected[0]["weighted"], "weighted"),
            "binary_profile": (average([movie["binary"] for movie in selected]), "binary"),
            "idf_profile": (average([movie["weighted"] for movie in selected]), "weighted"),
        }
        cutoff_groups = {}
        source_top5 = {}
        for method in METHODS:
            query, vector_key = queries[method]
            groups = score_groups(movies, query, vector_key, watched_set)
            tie_records[method].append(tie_details(groups))
            cutoff_groups[method] = groups_through_cutoff(groups)
            source_top5[method] = select_top5(cutoff_groups[method])
            if set(source_top5[method]) & watched_set:
                raise AssertionError(f"source-order leakage for user {user_id}, {method}")
            source_leakage_checks += 1

        source_item_changed += membership_change(
            source_top5["binary_item"], source_top5["idf_item"]
        )
        source_profile_changed += membership_change(
            source_top5["binary_profile"], source_top5["idf_profile"]
        )
        prepared.append({
            "user_id": user_id,
            "watched_set": watched_set,
            "cutoff_groups": cutoff_groups,
        })

    random_trials = []
    random_leakage_checks = 0
    for seed in RANDOM_SEEDS:
        rng = random.Random(seed)
        priorities = {movie["id"]: rng.random() for movie in movies}
        item_changed = 0
        profile_changed = 0
        for record in prepared:
            top5 = {
                method: select_top5(record["cutoff_groups"][method], priorities)
                for method in METHODS
            }
            for method in METHODS:
                if set(top5[method]) & record["watched_set"]:
                    raise AssertionError(
                        f"paired-random leakage for user {record['user_id']}, {method}, seed {seed}"
                    )
                random_leakage_checks += 1
            item_changed += membership_change(top5["binary_item"], top5["idf_item"])
            profile_changed += membership_change(top5["binary_profile"], top5["idf_profile"])
        random_trials.append({
            "seed": seed,
            "item_changed_count": item_changed,
            "item_changed_percent": 100 * item_changed / len(eligible),
            "profile_changed_count": profile_changed,
            "profile_changed_percent": 100 * profile_changed / len(eligible),
        })

    historical = json.loads(HISTORICAL_PATH.read_text())
    result = {
        "protocol": {
            "movie_count": len(movies),
            "rating_count": len(ratings),
            "eligible_user_count": len(eligible),
            "eligible_user_definition": "at least 3 ratings >= 4",
            "profile_selection": "three most recent ratings >= 4, timestamp descending",
            "active_item": "most recent selected positive movie",
            "candidate_exclusion": "all movie IDs appearing in u.data for the user, regardless of rating",
            "score_tolerance": TOLERANCE,
            "random_seeds": RANDOM_SEEDS,
            "paired_priority_policy": "one fixed random priority per movie ID per seed, shared by all four methods",
            "idf_formula": "log((N + 1) / (df + 1)) + 1",
            "u_item_sha256": hashlib.sha256(ITEM_PATH.read_bytes()).hexdigest(),
            "u_data_sha256": hashlib.sha256(RATING_PATH.read_bytes()).hexdigest(),
        },
        "corrected_tie_statistics": {
            method: aggregate_ties(tie_records[method]) for method in METHODS
        },
        "corrected_source_order_membership_change": {
            "item_changed_count": source_item_changed,
            "item_changed_percent": 100 * source_item_changed / len(eligible),
            "profile_changed_count": source_profile_changed,
            "profile_changed_percent": 100 * source_profile_changed / len(eligible),
        },
        "corrected_paired_random_membership_change": {
            "summary": {
                "item_changed_percent": summarize([
                    trial["item_changed_percent"] for trial in random_trials
                ]),
                "profile_changed_percent": summarize([
                    trial["profile_changed_percent"] for trial in random_trials
                ]),
            },
            "per_seed": random_trials,
        },
        "leakage_assertions": {
            "source_order_checks": source_leakage_checks,
            "source_order_leaked_slots": 0,
            "paired_random_checks": random_leakage_checks,
            "paired_random_leaked_slots": 0,
            "assertion": "Top5 intersect watched_set is empty for all four methods",
        },
        "historical_defective_results": {
            "source_file": str(HISTORICAL_PATH.relative_to(APP_DIR)),
            "tie_statistics": historical["tie_statistics"],
            "source_order_binary_vs_idf": historical["source_order_binary_vs_idf"],
            "random_binary_vs_idf_percent": historical["random_binary_vs_idf_percent"],
        },
    }

    RESULT_PATH.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    write_summary(result)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
