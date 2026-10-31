"""Data checks: data.json against the competition CSVs and final predictions, and index.html against the kit's rules.

Run after the build: python check/check_data.py [--root C:/Users/Owen/Documents/joints]
"""
from __future__ import annotations

import argparse
import json
import logging
import re
import sys
from pathlib import Path
from typing import Callable

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve()
sys.path.insert(0, str(HERE.parents[1] / "build"))
from build_data import LEBARAN_SCENARIO, cluster_table  # noqa: E402
from proof_stats import half_up  # noqa: E402

log = logging.getLogger("check_data")
TEST_PAIRS, TEST_FILMS, CLUSTERS, CITIES = 10373, 160, 121, 69
VAL_PAIRS = 7043
MAX_PAGE_MB = 3.0
Check = Callable[[], None]


def check_counts(data: dict) -> None:
    assert len(data["test"]["film"]) == TEST_PAIRS
    assert len(data["test"]["films"]) == TEST_FILMS
    assert len(data["clusters"]) == CLUSTERS
    assert len(data["cities"]) == CITIES
    assert len(data["val"]["film"]) == VAL_PAIRS


def pair_slice(values: list, i: int, width: int) -> list:
    return values[i * width : i * width + width]


def check_test_forecasts(data: dict, root: Path) -> None:
    """Every stored ticket rounds to the same integer as the final predictions; F1 only on the 5 Lebaran titles."""
    te = pd.read_csv(root / "datajointsxinspire" / "test.csv")
    te["f2"] = pd.read_csv(root / "session2" / "subs7" / "F2.csv").total_ticket
    te["f1"] = pd.read_csv(root / "session2" / "subs7" / "F1.csv").total_ticket
    cl_index, _, _ = cluster_table(te)
    te["cl"] = te.cinema_ids.map(cl_index)
    te = te.sort_values(["movie_title", "cl", "date_show"], kind="stable")
    by_pair = {key: g for key, g in te.groupby(["movie_title", "cl"], sort=False)}
    raw = data["test"]
    for i, (film, cl) in enumerate(zip(raw["film"], raw["cl"])):
        title = raw["films"][film]
        rows = by_pair[(title, cl)]
        kept = np.array(pair_slice(raw["f"], i, 7))
        assert (half_up(kept) == np.round(rows.f2.to_numpy())).all(), (title, cl, "F2")
        alt = raw["alt"].get(str(i))
        assert (alt is not None) == (title in LEBARAN_SCENARIO), (title, "scenario")
        if alt is not None:
            assert (half_up(np.array(alt)) == np.round(rows.f1.to_numpy())).all(), (title, cl, "F1")


def check_test_history(data: dict, root: Path) -> None:
    """D1-D3 tickets and shows equal test_history.csv; a missing day stays 0."""
    th = pd.read_csv(root / "datajointsxinspire" / "test_history.csv")
    te = pd.read_csv(root / "datajointsxinspire" / "test.csv")
    cl_index, _, _ = cluster_table(te)
    th["cl"] = th.cinema_ids.map(cl_index)
    hist = {(r.movie_title, r.cl, r.date_show): (r.total_ticket, r.total_show) for r in th.itertuples()}
    raw = data["test"]
    for i, (film, cl) in enumerate(zip(raw["film"], raw["cl"])):
        title = raw["films"][film]
        d1 = pd.Timestamp(raw["d1"][film])
        for j in range(3):
            day = (d1 + pd.Timedelta(days=j)).strftime("%Y-%m-%d")
            tickets, shows = hist.get((title, cl, day), (0, 0))
            assert raw["y"][i * 3 + j] == tickets, (title, cl, day, "tickets")
            assert raw["sh"][i * 3 + j] == shows, (title, cl, day, "shows")


def check_validation_actuals(data: dict, root: Path) -> None:
    """Validation D1-D3 and D4-D10 actuals equal train.csv ticket by ticket."""
    tr = pd.read_csv(root / "datajointsxinspire" / "train.csv")
    te = pd.read_csv(root / "datajointsxinspire" / "test.csv")
    cl_index, _, _ = cluster_table(te)
    tr["cl"] = tr.cinema_ids.map(cl_index)
    tickets = {(r.movie_title, r.cl, r.date_show): r.total_ticket for r in tr.itertuples()}
    raw = data["val"]
    for i, (film, cl) in enumerate(zip(raw["film"], raw["cl"])):
        title = raw["films"][film]
        d1 = pd.Timestamp(raw["d1"][film])
        values = pair_slice(raw["y"], i, 3) + pair_slice(raw["a"], i, 7)
        for j, value in enumerate(values):
            day = (d1 + pd.Timedelta(days=j)).strftime("%Y-%m-%d")
            assert value == tickets.get((title, cl, day), 0), (title, cl, day, value)


def check_page(root: Path, page: Path) -> None:
    """The page is self-contained, carries no raw cluster IDs, and stays small enough to open anywhere."""
    html = page.read_text(encoding="utf-8")
    size_mb = page.stat().st_size / 1e6
    assert size_mb < MAX_PAGE_MB, f"page is {size_mb:.2f} MB"
    no_fonts = re.sub(r"base64,[A-Za-z0-9+/=]+", "", html)
    assert not re.search(r"https?://", no_fonts), "external URL in page"
    assert not re.search(r"""(?:src|href)\s*=\s*["'](?!#)""", no_fonts), "external resource in page"
    ids = pd.read_csv(root / "datajointsxinspire" / "test.csv", usecols=["cinema_ids"]).cinema_ids.unique()
    leaked = [c for c in ids if c in html]
    assert not leaked, f"raw cluster ids in page: {leaked[:3]}"
    assert not re.search(r"\b[0-9a-f]{32}\b", no_fonts), "hash-like id in page"


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=HERE.parents[3])
    args = parser.parse_args()
    project = HERE.parents[1]
    data = json.loads((project / "data" / "data.json").read_text(encoding="utf-8"))
    checks: list[tuple[str, Check]] = [
        ("counts match the competition data", lambda: check_counts(data)),
        ("all test forecasts equal F2 (and F1 on the Lebaran titles)", lambda: check_test_forecasts(data, args.root)),
        ("all test D1-D3 equal test_history", lambda: check_test_history(data, args.root)),
        ("all validation actuals equal train", lambda: check_validation_actuals(data, args.root)),
        ("page is offline and has no raw cluster ids", lambda: check_page(args.root, project / "index.html")),
    ]
    for name, check in checks:
        check()
        log.info("ok  %s", name)
    log.info("\n%d checks passed", len(checks))


if __name__ == "__main__":
    main()
