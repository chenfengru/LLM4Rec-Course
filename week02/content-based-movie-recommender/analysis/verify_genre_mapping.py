#!/usr/bin/env python3
"""Focused checks for the student parser's genre-label alignment."""

from __future__ import annotations

import re
from pathlib import Path


APP_DIR = Path(__file__).resolve().parents[1]
EXPECTED_LABELS = [
    "unknown", "Action", "Adventure", "Animation", "Children's", "Comedy",
    "Crime", "Documentary", "Drama", "Fantasy", "Film-Noir", "Horror",
    "Musical", "Mystery", "Romance", "Sci-Fi", "Thriller", "War", "Western",
]


def labels_from_student_source() -> list[str]:
    source = (APP_DIR / "data.js").read_text()
    match = re.search(r"const genreNames = \[(.*?)\];", source, re.DOTALL)
    if not match:
        raise AssertionError("genreNames array not found in student data.js")
    return re.findall(r'"([^"]+)"', match.group(1))


def raw_movie(movie_id: int) -> tuple[str, list[int]]:
    for line in (APP_DIR / "u.item").read_text(encoding="latin-1").splitlines():
        fields = line.split("|")
        if int(fields[0]) == movie_id:
            return fields[1], [int(value) for value in fields[5:24]]
    raise AssertionError(f"movie ID {movie_id} not found")


def parsed_genres(flags: list[int], labels: list[str]) -> list[str]:
    return [label for label, flag in zip(labels, flags) if flag == 1]


def main() -> None:
    labels = labels_from_student_source()
    assert labels == EXPECTED_LABELS, f"unexpected labels: {labels}"

    toy_title, toy_flags = raw_movie(1)
    assert len(labels) == len(toy_flags) == 19
    assert parsed_genres(toy_flags, labels) == ["Animation", "Children's", "Comedy"]

    western_only = None
    for line in (APP_DIR / "u.item").read_text(encoding="latin-1").splitlines():
        fields = line.split("|")
        flags = [int(value) for value in fields[5:24]]
        if flags[-1] == 1 and sum(flags) == 1:
            western_only = (int(fields[0]), fields[1], flags)
            break
    assert western_only is not None
    western_id, western_title, western_flags = western_only
    assert parsed_genres(western_flags, labels) == ["Western"]

    print(f"PASS label/raw-field count: {len(labels)} == {len(toy_flags)}")
    print(f"PASS {toy_title}: {parsed_genres(toy_flags, labels)}")
    print(
        f"PASS Western-only ID {western_id} {western_title}: "
        f"{parsed_genres(western_flags, labels)}"
    )


if __name__ == "__main__":
    main()
