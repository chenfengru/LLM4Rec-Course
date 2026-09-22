#!/usr/bin/env python3
"""Audit watched-item leakage and recompute the binary-cosine user evaluation.

Historical result files are intentionally left untouched. This script reports
the original three-selected-item exclusion and a corrected all-rated exclusion
side by side, then writes new JSON and Markdown artifacts.
"""

from __future__ import annotations

import hashlib
import json
import math
import platform
import random
import shutil
import statistics
import subprocess
import sys
from collections import Counter, defaultdict
from functools import cmp_to_key
from pathlib import Path


APP_DIR = Path(__file__).resolve().parents[1]
ANALYSIS_DIR = Path(__file__).resolve().parent
ITEM_PATH = APP_DIR / "u.item"
RATING_PATH = APP_DIR / "u.data"
RESULT_PATH = ANALYSIS_DIR / "all_watched_evaluation_results.json"
SUMMARY_PATH = ANALYSIS_DIR / "all_watched_evaluation_summary.md"

GENRES = [
    "unknown", "Action", "Adventure", "Animation", "Children's", "Comedy",
    "Crime", "Documentary", "Drama", "Fantasy", "Film-Noir", "Horror",
    "Musical", "Mystery", "Romance", "Sci-Fi", "Thriller", "War", "Western",
]
POSITIVE_RATING = 4
PROFILE_SIZE = 3
TOP_K = 5
SCORE_TOLERANCE = 1e-12
RANDOM_SEEDS = list(range(20))


def load_movies() -> list[dict]:
    movies = []
    for source_order, line in enumerate(ITEM_PATH.read_text(encoding="latin-1").splitlines()):
        fields = line.split("|")
        vector = [int(value) for value in fields[5:24]]
        if len(vector) != len(GENRES):
            raise AssertionError(f"movie {fields[0]} has {len(vector)} genre fields")
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


def dot(first: list[float], second: list[float]) -> float:
    return sum(a * b for a, b in zip(first, second))


def cosine(first: list[float], second: list[float]) -> float:
    first_norm = math.sqrt(dot(first, first))
    second_norm = math.sqrt(dot(second, second))
    return dot(first, second) / (first_norm * second_norm) if first_norm and second_norm else 0.0


def average(vectors: list[list[float]]) -> list[float]:
    return [sum(values) / len(vectors) for values in zip(*vectors)]


def score_groups(
    movies: list[dict], query: list[float], excluded: set[int]
) -> list[list[tuple[int, float]]]:
    """Return score-tie groups through the group intersecting the Top-5 cutoff."""
    scored = [
        (movie["id"], cosine(query, movie["vector"]))
        for movie in movies
        if movie["id"] not in excluded
    ]

    def compare(first: tuple[int, float], second: tuple[int, float]) -> int:
        difference = second[1] - first[1]
        if abs(difference) <= SCORE_TOLERANCE:
            return 0
        return 1 if difference > 0 else -1

    scored.sort(key=cmp_to_key(compare))
    groups: list[list[tuple[int, float]]] = []
    total = 0
    for candidate in scored:
        if not groups or abs(candidate[1] - groups[-1][0][1]) > SCORE_TOLERANCE:
            if total >= TOP_K:
                break
            groups.append([])
        groups[-1].append(candidate)
        total += 1
    return groups


def source_top5(groups: list[list[tuple[int, float]]]) -> list[int]:
    selected = []
    for group in groups:
        selected.extend(movie_id for movie_id, _ in group[: TOP_K - len(selected)])
        if len(selected) == TOP_K:
            break
    return selected


def priority_top5(
    groups: list[list[tuple[int, float]]], priorities: dict[int, float]
) -> list[int]:
    selected = []
    for group in groups:
        ordered = sorted(group, key=lambda candidate: (priorities[candidate[0]], candidate[0]))
        selected.extend(movie_id for movie_id, _ in ordered[: TOP_K - len(selected)])
        if len(selected) == TOP_K:
            break
    return selected


def percentile(values: list[float], probability: float) -> float:
    """Linear interpolation at (n - 1) * p (Hyndman-Fan type 7)."""
    ordered = sorted(values)
    position = (len(ordered) - 1) * probability
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[lower]
    fraction = position - lower
    return ordered[lower] * (1 - fraction) + ordered[upper] * fraction


def comparison_metrics(pairs: list[tuple[list[int], list[int]]]) -> dict:
    changed = sum(item_ids != profile_ids for item_ids, profile_ids in pairs)
    overlaps = [len(set(item_ids) & set(profile_ids)) for item_ids, profile_ids in pairs]
    return {
        "eligible_user_count": len(pairs),
        "changed_ordered_top5_count": changed,
        "changed_ordered_top5_percent": 100 * changed / len(pairs),
        "mean_top5_set_overlap_fraction": statistics.fmean(overlap / TOP_K for overlap in overlaps),
        "mean_shared_items_out_of_5": statistics.fmean(overlaps),
    }


def catalog_metrics(
    recommendations: list[int], rating_counts: Counter, head: set[int], catalog_size: int
) -> dict:
    popularity = [rating_counts[movie_id] for movie_id in recommendations]
    unique = set(recommendations)
    return {
        "recommendation_slots": len(recommendations),
        "mean_rating_count": statistics.fmean(popularity),
        "median_rating_count": statistics.median(popularity),
        "long_tail_share": sum(movie_id not in head for movie_id in recommendations) / len(recommendations),
        "unique_movies_recommended": len(unique),
        "catalog_coverage": len(unique) / catalog_size,
    }


def evaluate_lists(
    pairs: list[tuple[list[int], list[int]]],
    rating_counts: Counter,
    head: set[int],
    catalog_size: int,
) -> dict:
    item_recommendations = [movie_id for item_ids, _ in pairs for movie_id in item_ids]
    profile_recommendations = [movie_id for _, profile_ids in pairs for movie_id in profile_ids]
    return {
        "comparison": comparison_metrics(pairs),
        "item_to_item": catalog_metrics(item_recommendations, rating_counts, head, catalog_size),
        "profile": catalog_metrics(profile_recommendations, rating_counts, head, catalog_size),
    }


def summarize(values: list[float]) -> dict:
    return {
        "mean": statistics.fmean(values),
        "standard_deviation": statistics.pstdev(values),
        "minimum": min(values),
        "maximum": max(values),
    }


def summarize_random_trials(trials: list[dict]) -> dict:
    comparison_keys = (
        "changed_ordered_top5_count",
        "changed_ordered_top5_percent",
        "mean_top5_set_overlap_fraction",
        "mean_shared_items_out_of_5",
    )
    catalog_keys = (
        "mean_rating_count",
        "median_rating_count",
        "long_tail_share",
        "unique_movies_recommended",
        "catalog_coverage",
    )
    return {
        "comparison": {
            key: summarize([trial["comparison"][key] for trial in trials])
            for key in comparison_keys
        },
        **{
            method: {
                key: summarize([trial[method][key] for trial in trials])
                for key in catalog_keys
            }
            for method in ("item_to_item", "profile")
        },
    }


def executable_version(command: list[str]) -> str:
    try:
        return subprocess.run(command, check=True, capture_output=True, text=True).stdout.strip()
    except (FileNotFoundError, subprocess.CalledProcessError):
        return "version not exposed"


def describe_ids(movie_ids: list[int], by_id: dict[int, dict]) -> list[dict]:
    return [
        {
            "id": movie_id,
            "title": by_id[movie_id]["title"],
            "genres": by_id[movie_id]["genres"],
        }
        for movie_id in movie_ids
    ]


def write_summary(result: dict) -> None:
    before = result["leakage_before_correction"]
    old = result["previous_source_order_with_three_selected_exclusion"]
    after = result["corrected_source_order"]
    profile = result["profile_averaging_diagnostics"]
    random_summary = result["corrected_paired_random"]["summary"]
    robust = result["corrected_paired_random"]["directional_consistency"]
    environment = result["environment"]

    def method_rows(section: dict) -> str:
        rows = []
        for method, label in (("item_to_item", "Item-to-item"), ("profile", "Profile")):
            metrics = section[method]
            rows.append(
                f"| {label} | {metrics['mean_rating_count']:.6f} | "
                f"{metrics['median_rating_count']:.6f} | {metrics['long_tail_share']:.6f} | "
                f"{metrics['unique_movies_recommended']} | {metrics['catalog_coverage']:.6f} |"
            )
        return "\n".join(rows)

    lowest = profile["lowest_minimum_user"]
    similarity_lines = "\n".join(
        f"- {movie['title']}: `{movie['profile_cosine']:.6f}` — {', '.join(movie['genres']) or 'no active genre'}"
        for movie in lowest["selected_movies_most_recent_first"]
    )
    leakage_example_lines = "\n".join(
        f"- user {example['user_id']}: item leakage "
        f"{[(movie['id'], movie['title'], movie['user_rating']) for movie in example['item_leakage']]}; "
        f"profile leakage "
        f"{[(movie['id'], movie['title'], movie['user_rating']) for movie in example['profile_leakage']]}"
        for example in before["examples"]
    )

    def random_row(section: str, metric: str, label: str) -> str:
        values = random_summary[section][metric]
        return (
            f"| {label} | {values['mean']:.6f} | {values['standard_deviation']:.6f} | "
            f"{values['minimum']:.6f} | {values['maximum']:.6f} |"
        )

    SUMMARY_PATH.write_text(
        f"""# All-watched exclusion evidence audit

## Reproduce

```bash
python3 week02/content-based-movie-recommender/analysis/audit_all_watched_evaluation.py
```

This is a new audit. Historical result files remain unchanged.

## Leakage: before and after

The previous controlled evaluation excluded only the three selected positive
movies. With every movie appearing in each user's `u.data` history treated as
watched, the previous deterministic Top-5 results had:

- eligible users: **{before['eligible_user_count']}**
- users with item-mode leakage: **{before['users_with_item_leakage']}**
- users with profile-mode leakage: **{before['users_with_profile_leakage']}**
- item leaked slots: **{before['item_leaked_slots']}**
- profile leaked slots: **{before['profile_leaked_slots']}**
- combined leaked slots: **{before['total_leaked_slots']}**

Concrete examples list `(movie ID, title, user's rating)`:

{leakage_example_lines}

After excluding the full rated set for every user, both item and profile
leakage are **zero for all source-order and 20 paired-random evaluations**:
1,884 source-order method/user assertions and 37,680 paired-random assertions.

## Profile averaging diagnostic

- mean cosine across all profile/input pairs: **{profile['mean_profile_to_input_similarity']:.6f}**
- median of each user's minimum similarity: **{profile['minimum_similarity_per_user']['median']:.6f}**
- 10th percentile of each user's minimum similarity: **{profile['minimum_similarity_per_user']['percentile_10']:.6f}**
- lowest minimum: **{profile['minimum_similarity_per_user']['minimum']:.6f}** for user **{lowest['user_id']}**

Lowest-minimum profile:

{similarity_lines}

The aggregate evidence does not support calling every averaged profile a
"collapse": mean profile/input cosine is 0.720234. It does show concrete
minority-taste underrepresentation; user 104's Comedy-only input has cosine
0.218218 when the other two inputs share the same five non-Comedy genres.

## Previous numbers invalidated by leakage

| Metric | Old item | Corrected item | Old profile | Corrected profile |
|---|---:|---:|---:|---:|
| Mean rating count | {old['item_to_item']['mean_rating_count']:.6f} | {after['item_to_item']['mean_rating_count']:.6f} | {old['profile']['mean_rating_count']:.6f} | {after['profile']['mean_rating_count']:.6f} |
| Median rating count | {old['item_to_item']['median_rating_count']:.6f} | {after['item_to_item']['median_rating_count']:.6f} | {old['profile']['median_rating_count']:.6f} | {after['profile']['median_rating_count']:.6f} |
| Long-tail share | {old['item_to_item']['long_tail_share']:.6f} | {after['item_to_item']['long_tail_share']:.6f} | {old['profile']['long_tail_share']:.6f} | {after['profile']['long_tail_share']:.6f} |
| Unique movies | {old['item_to_item']['unique_movies_recommended']} | {after['item_to_item']['unique_movies_recommended']} | {old['profile']['unique_movies_recommended']} | {after['profile']['unique_movies_recommended']} |
| Catalog coverage | {old['item_to_item']['catalog_coverage']:.6f} | {after['item_to_item']['catalog_coverage']:.6f} | {old['profile']['catalog_coverage']:.6f} | {after['profile']['catalog_coverage']:.6f} |

Ordered-change count remains 833/942, but overlap changes from
{old['comparison']['mean_top5_set_overlap_fraction']:.6f} to
{after['comparison']['mean_top5_set_overlap_fraction']:.6f}; all user-level
comparison and catalog values must therefore be sourced from the corrected run.

## Corrected deterministic source-order results

- ordered Top-5 changed: **{after['comparison']['changed_ordered_top5_count']} / {after['comparison']['eligible_user_count']} ({after['comparison']['changed_ordered_top5_percent']:.6f}%)**
- mean Top-5 set overlap: **{after['comparison']['mean_top5_set_overlap_fraction']:.6f}**
- mean shared items: **{after['comparison']['mean_shared_items_out_of_5']:.6f} / 5**

| Method | Mean rating count | Median | Long-tail share | Unique movies | Coverage |
|---|---:|---:|---:|---:|---:|
{method_rows(after)}

## Corrected paired-random results (20 seeds)

Each seed assigns one fixed priority to every movie ID and shares that mapping
between item and profile tie-breaking.

| Comparison metric | Mean | Population SD | Min | Max |
|---|---:|---:|---:|---:|
{random_row('comparison', 'changed_ordered_top5_percent', 'Ordered Top-5 changed (%)')}
{random_row('comparison', 'mean_top5_set_overlap_fraction', 'Mean set overlap')}
{random_row('comparison', 'mean_shared_items_out_of_5', 'Mean shared items / 5')}

| Item metric | Mean | Population SD | Min | Max |
|---|---:|---:|---:|---:|
{random_row('item_to_item', 'mean_rating_count', 'Mean rating count')}
{random_row('item_to_item', 'median_rating_count', 'Median rating count')}
{random_row('item_to_item', 'long_tail_share', 'Long-tail share')}
{random_row('item_to_item', 'unique_movies_recommended', 'Unique movies')}
{random_row('item_to_item', 'catalog_coverage', 'Catalog coverage')}

| Profile metric | Mean | Population SD | Min | Max |
|---|---:|---:|---:|---:|
{random_row('profile', 'mean_rating_count', 'Mean rating count')}
{random_row('profile', 'median_rating_count', 'Median rating count')}
{random_row('profile', 'long_tail_share', 'Long-tail share')}
{random_row('profile', 'unique_movies_recommended', 'Unique movies')}
{random_row('profile', 'catalog_coverage', 'Catalog coverage')}

Relative conclusions across seeds:

- profile mean popularity higher in **{robust['profile_mean_popularity_higher_seed_count']} / 20** seeds
- profile median popularity higher in **{robust['profile_median_popularity_higher_seed_count']} / 20** seeds
- profile long-tail share lower in **{robust['profile_long_tail_share_lower_seed_count']} / 20** seeds
- profile unique count lower in **{robust['profile_unique_count_lower_seed_count']} / 20** seeds
- profile coverage lower in **{robust['profile_catalog_coverage_lower_seed_count']} / 20** seeds

The long-tail direction is not universal: seed 5 has item share 0.750955 and
profile share 0.754989. The popularity and unique/coverage directions are
consistent across all 20 seeds.

## Business questions

1. **Item-to-Item vs Profile-Based — what trade-off is observed?** The methods
   produce different ordered Top-5 lists for 88.428875% of users under source
   order, with only 0.925690 shared items out of five on average. The profile
   blends three genre vectors, but in this evaluation its recommendations are
   more concentrated in popular and fewer unique catalog items. This is an
   exposure trade-off, not evidence of higher or lower relevance.
2. **Bias mitigation — is either method more popularity-skewed?** Profile mode
   has higher mean and median recommendation popularity deterministically and
   in all 20 paired-random seeds. A popularity penalty, long-tail quota, or
   diversity-aware reranker could be proposed for a future controlled test;
   none was tested here.
3. **Catalog discovery — which exposes more long-tail/catalog items?** Item mode
   has more unique movies and higher coverage deterministically and in all 20
   seeds. Its long-tail share is higher deterministically and in 19/20 seeds,
   so that specific direction remains tie-sensitive rather than universal.

## Environment and data

- Python: `{environment['python_version']}` ({environment['python_implementation']}) at `{environment['python_executable']}`
- Browser/JavaScript: {environment['browser_runtime']}
- Node: `{environment['node_version']}` at `{environment['node_path']}`
- Codex: `{environment['codex_version']}` at `{environment['codex_path']}`
- Model: {environment['model_version']}
- Seeds: `0` through `19`
- Data: `u.item` SHA-256 `{environment['u_item_sha256']}`; `u.data` SHA-256 `{environment['u_data_sha256']}`

## Interpretation boundaries

The corrected protocol measures ranking differences, popularity, and catalog
exposure. It does not measure relevance, retention, or business impact. A
popularity penalty, long-tail quota, or diversity-aware reranker could be
tested as future mitigation, but none was tested in this audit.
""",
        encoding="utf-8",
    )


def main() -> None:
    movies = load_movies()
    ratings = load_ratings()
    by_id = {movie["id"]: movie for movie in movies}
    all_ratings_by_user: dict[int, list[dict]] = defaultdict(list)
    positives_by_user: dict[int, list[dict]] = defaultdict(list)
    rating_lookup: dict[tuple[int, int], dict] = {}
    for rating in ratings:
        all_ratings_by_user[rating["user_id"]].append(rating)
        rating_lookup[(rating["user_id"], rating["item_id"])] = rating
        if rating["rating"] >= POSITIVE_RATING:
            positives_by_user[rating["user_id"]].append(rating)

    eligible = []
    for user_id in sorted(positives_by_user):
        positives = sorted(
            positives_by_user[user_id],
            key=lambda rating: (-rating["timestamp"], rating["source_order"]),
        )
        if len(positives) >= PROFILE_SIZE:
            selected_ratings = positives[:PROFILE_SIZE]
            selected_movies = [by_id[rating["item_id"]] for rating in selected_ratings]
            watched_set = {rating["item_id"] for rating in all_ratings_by_user[user_id]}
            eligible.append({
                "user_id": user_id,
                "selected_movies": selected_movies,
                "watched_set": watched_set,
            })

    rating_counts = Counter(rating["item_id"] for rating in ratings)
    head_size = math.ceil(0.20 * len(movies))
    popularity_order = sorted(movies, key=lambda movie: (-rating_counts[movie["id"]], movie["id"]))
    head = {movie["id"] for movie in popularity_order[:head_size]}

    before_pairs = []
    corrected_source_pairs = []
    corrected_records = []
    leakage_records = []
    profile_records = []

    for record in eligible:
        user_id = record["user_id"]
        selected_movies = record["selected_movies"]
        selected_ids = {movie["id"] for movie in selected_movies}
        watched_set = record["watched_set"]
        item_query = selected_movies[0]["vector"]
        profile_query = average([movie["vector"] for movie in selected_movies])

        before_item = source_top5(score_groups(movies, item_query, selected_ids))
        before_profile = source_top5(score_groups(movies, profile_query, selected_ids))
        item_leakage = [movie_id for movie_id in before_item if movie_id in watched_set]
        profile_leakage = [movie_id for movie_id in before_profile if movie_id in watched_set]
        before_pairs.append((before_item, before_profile))
        leakage_records.append({
            "user_id": user_id,
            "selected_ids": [movie["id"] for movie in selected_movies],
            "item_top5": before_item,
            "profile_top5": before_profile,
            "item_leakage": item_leakage,
            "profile_leakage": profile_leakage,
        })

        item_groups = score_groups(movies, item_query, watched_set)
        profile_groups = score_groups(movies, profile_query, watched_set)
        corrected_item = source_top5(item_groups)
        corrected_profile = source_top5(profile_groups)
        if set(corrected_item) & watched_set or set(corrected_profile) & watched_set:
            raise AssertionError(f"all-watched exclusion failed for user {user_id}")
        corrected_source_pairs.append((corrected_item, corrected_profile))
        corrected_records.append({
            "user_id": user_id,
            "watched_set": watched_set,
            "item_groups": item_groups,
            "profile_groups": profile_groups,
        })

        similarities = [cosine(profile_query, movie["vector"]) for movie in selected_movies]
        profile_records.append({
            "user_id": user_id,
            "selected_movies": selected_movies,
            "similarities": similarities,
            "minimum": min(similarities),
            "mean": statistics.fmean(similarities),
        })

    leaking = [
        record for record in leakage_records
        if record["item_leakage"] or record["profile_leakage"]
    ]
    leakage_examples = []
    for record in leaking[:3]:
        user_id = record["user_id"]
        leakage_examples.append({
            "user_id": user_id,
            "selected_movies_most_recent_first": describe_ids(record["selected_ids"], by_id),
            "item_top5": describe_ids(record["item_top5"], by_id),
            "profile_top5": describe_ids(record["profile_top5"], by_id),
            "item_leakage": [
                {
                    **describe_ids([movie_id], by_id)[0],
                    "user_rating": rating_lookup[(user_id, movie_id)]["rating"],
                }
                for movie_id in record["item_leakage"]
            ],
            "profile_leakage": [
                {
                    **describe_ids([movie_id], by_id)[0],
                    "user_rating": rating_lookup[(user_id, movie_id)]["rating"],
                }
                for movie_id in record["profile_leakage"]
            ],
        })

    minimums = [record["minimum"] for record in profile_records]
    all_similarities = [value for record in profile_records for value in record["similarities"]]
    lowest_profile = min(profile_records, key=lambda record: (record["minimum"], record["user_id"]))

    random_trials = []
    random_leakage_assertions = 0
    for seed in RANDOM_SEEDS:
        rng = random.Random(seed)
        priorities = {movie["id"]: rng.random() for movie in movies}
        pairs = []
        for record in corrected_records:
            item_top5 = priority_top5(record["item_groups"], priorities)
            profile_top5 = priority_top5(record["profile_groups"], priorities)
            if set(item_top5) & record["watched_set"] or set(profile_top5) & record["watched_set"]:
                raise AssertionError(f"random all-watched exclusion failed for user {record['user_id']}")
            random_leakage_assertions += 2
            pairs.append((item_top5, profile_top5))
        random_trials.append({"seed": seed, **evaluate_lists(pairs, rating_counts, head, len(movies))})

    random_summary = summarize_random_trials(random_trials)
    directional = {
        "random_seed_count": len(RANDOM_SEEDS),
        "profile_mean_popularity_higher_seed_count": sum(
            trial["profile"]["mean_rating_count"] > trial["item_to_item"]["mean_rating_count"]
            for trial in random_trials
        ),
        "profile_median_popularity_higher_seed_count": sum(
            trial["profile"]["median_rating_count"] > trial["item_to_item"]["median_rating_count"]
            for trial in random_trials
        ),
        "profile_long_tail_share_lower_seed_count": sum(
            trial["profile"]["long_tail_share"] < trial["item_to_item"]["long_tail_share"]
            for trial in random_trials
        ),
        "profile_unique_count_lower_seed_count": sum(
            trial["profile"]["unique_movies_recommended"] < trial["item_to_item"]["unique_movies_recommended"]
            for trial in random_trials
        ),
        "profile_catalog_coverage_lower_seed_count": sum(
            trial["profile"]["catalog_coverage"] < trial["item_to_item"]["catalog_coverage"]
            for trial in random_trials
        ),
    }

    bundled_node = Path.home() / ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
    node_path = shutil.which("node") or (str(bundled_node) if bundled_node.exists() else None)
    codex_path = shutil.which("codex")

    result = {
        "protocol": {
            "movie_count": len(movies),
            "rating_count": len(ratings),
            "eligible_user_definition": "at least 3 ratings >= 4",
            "eligible_user_count": len(eligible),
            "profile_selection": "three most recent ratings >= 4, timestamp descending",
            "active_item": "most recent of the three selected positive movies",
            "corrected_exclusion": "all movie IDs appearing in u.data for the user, regardless of rating",
            "top_k": TOP_K,
            "score_tolerance": SCORE_TOLERANCE,
            "head_definition": "top ceil(20% of u.item movies by u.data rating count, movie ID tie-break)",
            "head_size": head_size,
            "long_tail_size": len(movies) - head_size,
            "coverage_denominator": len(movies),
            "random_seeds": RANDOM_SEEDS,
            "paired_random_policy": "one fixed random priority per movie ID per seed, shared by item/profile",
        },
        "current_harness_inspection": {
            "verify_profile_and_compare_py": "excludes only the three selected positive movie IDs for both methods",
            "audit_tie_sensitivity_py": "excludes only the three selected positive movie IDs for both methods",
            "audit_idf_weighting_py": "excludes only the three selected positive movie IDs for all methods",
        },
        "leakage_before_correction": {
            "eligible_user_count": len(eligible),
            "users_with_item_leakage": sum(bool(record["item_leakage"]) for record in leakage_records),
            "users_with_profile_leakage": sum(bool(record["profile_leakage"]) for record in leakage_records),
            "users_with_any_leakage": len(leaking),
            "item_leaked_slots": sum(len(record["item_leakage"]) for record in leakage_records),
            "profile_leaked_slots": sum(len(record["profile_leakage"]) for record in leakage_records),
            "total_leaked_slots": sum(
                len(record["item_leakage"]) + len(record["profile_leakage"])
                for record in leakage_records
            ),
            "examples": leakage_examples,
            "deterministic_metrics_with_invalid_exclusion": evaluate_lists(
                before_pairs, rating_counts, head, len(movies)
            ),
        },
        "leakage_after_correction": {
            "source_order_users_with_item_leakage": 0,
            "source_order_users_with_profile_leakage": 0,
            "source_order_total_leaked_slots": 0,
            "source_order_assertions_checked": len(eligible) * 2,
            "paired_random_total_leaked_slots": 0,
            "paired_random_assertions_checked": random_leakage_assertions,
            "assertion": "Top5 intersect watched_set is empty for every user, method, and evaluated tie policy",
        },
        "profile_averaging_diagnostics": {
            "profile_count": len(profile_records),
            "profile_input_pair_count": len(all_similarities),
            "mean_profile_to_input_similarity": statistics.fmean(all_similarities),
            "mean_of_user_mean_similarities": statistics.fmean(record["mean"] for record in profile_records),
            "minimum_similarity_per_user": {
                "mean": statistics.fmean(minimums),
                "median": statistics.median(minimums),
                "percentile_10": percentile(minimums, 0.10),
                "minimum": min(minimums),
                "maximum": max(minimums),
                "percentile_definition": "linear interpolation at (n - 1) * p",
            },
            "lowest_minimum_user": {
                "user_id": lowest_profile["user_id"],
                "minimum_similarity": lowest_profile["minimum"],
                "selected_movies_most_recent_first": [
                    {
                        "id": movie["id"],
                        "title": movie["title"],
                        "genres": movie["genres"],
                        "vector": movie["vector"],
                        "profile_cosine": similarity,
                    }
                    for movie, similarity in zip(
                        lowest_profile["selected_movies"], lowest_profile["similarities"]
                    )
                ],
            },
        },
        "previous_source_order_with_three_selected_exclusion": evaluate_lists(
            before_pairs, rating_counts, head, len(movies)
        ),
        "corrected_source_order": evaluate_lists(
            corrected_source_pairs, rating_counts, head, len(movies)
        ),
        "corrected_paired_random": {
            "summary": random_summary,
            "directional_consistency": directional,
            "per_seed": random_trials,
        },
        "environment": {
            "python_executable": sys.executable,
            "python_version": platform.python_version(),
            "python_implementation": platform.python_implementation(),
            "browser_runtime": "Codex in-app browser; exact browser/JavaScript engine version not exposed",
            "node_path": node_path or "not found",
            "node_version": executable_version([node_path, "--version"]) if node_path else "not found",
            "codex_path": codex_path or "not found",
            "codex_version": executable_version([codex_path, "--version"]) if codex_path else "version not exposed",
            "model_version": "version not exposed",
            "dataset_files": [str(ITEM_PATH.relative_to(APP_DIR)), str(RATING_PATH.relative_to(APP_DIR))],
            "u_item_sha256": hashlib.sha256(ITEM_PATH.read_bytes()).hexdigest(),
            "u_data_sha256": hashlib.sha256(RATING_PATH.read_bytes()).hexdigest(),
        },
    }

    RESULT_PATH.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    write_summary(result)
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
