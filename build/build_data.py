"""Build data/data.json for the TUKANGDATA decision dashboard.

Sources (no curation: every test pair and every complete validation pair goes in):
  datajointsxinspire/   test.csv, test_history.csv, train.csv, movies.csv, ticket_prices.csv, holidays.csv
  session2/subs7/       F1.csv, F2.csv (final predictions; F2 = main, F1 = high scenario for 5 Lebaran titles)
  ppt_joints_kit/       oof_merged.parquet (cross-validated E15 + LightGBM), calendar and prior CSVs

Usage: python build/build_data.py [--root C:/Users/Owen/Documents/joints]
"""
from __future__ import annotations

import argparse
import json
import logging
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd

from proof_stats import build_proof, card_rule, half_up, stored
from titles import city_title, film_title

log = logging.getLogger("build_data")

# The five Lebaran titles whose level could not be measured (deck p.23): F1 = high, F2 = low scenario.
LEBARAN_SCENARIO = {
    "NA WILLA",
    "PELANGI DI MARS",
    "SENIN HARGA NAIK",
    "SUZZANNA: SANTET DOSA DI ATAS DOSA",
    "TUNGGU AKU SUKSES NANTI",
}
FALLBACK_SEATS = 158  # median seats per show in test_history (tickets / occupancy / shows)
SEAT_RANGE = (50, 500)
LETTERS = "ABCDEFGH"
CAPACITY_QUANTILE = 0.99


@dataclass(frozen=True)
class Paths:
    data: Path
    subs: Path
    kit: Path
    out: Path


def resolve_paths(root: Path, out: Path) -> Paths:
    return Paths(root / "datajointsxinspire", root / "session2" / "subs7", root / "ppt_joints_kit", out)


def day_weight(row: pd.Series) -> float:
    """Day weight relative to its week (deck fig07)."""
    if row.is_weekend:
        return 1.33
    if row.is_nonworking:
        return 1.26
    if row.dow == 4:
        return 0.98
    return 0.91 if row.sch_nat else 0.74


def load_calendar(paths: Paths) -> tuple[dict[str, list], dict[pd.Timestamp, str]]:
    """Returns {iso: [weight, holiday name]} and the holiday dict used by the deck's card rule (load_calendar)."""
    cal = pd.read_csv(paths.kit / "calendar_features.csv", parse_dates=["date"])
    hol = pd.read_csv(paths.data / "holidays.csv", parse_dates=["date"])
    names = {r.date: r.holiday_name for r in hol[hol.holiday_tipe == "holiday"].itertuples()}
    for r in cal[cal.is_cuti_bersama == 1].itertuples():
        names.setdefault(r.date, "Cuti bersama")
    out = {}
    for _, row in cal.iterrows():
        name = names.get(row.date, "")
        if not name and row.date < hol.date.min() and isinstance(row.holiday_name, str):
            name = row.holiday_name  # dates before holidays.csv starts: only the quick estimate reaches them
        out[row.date.strftime("%Y-%m-%d")] = [day_weight(row), name]
    return out, names


def cluster_table(te: pd.DataFrame) -> tuple[dict[str, int], list[dict], list[str]]:
    """Deck rule for names: within a city, letters follow the number of test pairs (fig17 card_data)."""
    pairs = te.groupby(["city_name", "cinema_ids"]).movie_title.nunique().rename("n").reset_index()
    pairs = pairs.sort_values(["city_name", "n", "cinema_ids"], ascending=[True, False, True], kind="stable")
    cities = sorted(pairs.city_name.unique())
    index, table = {}, []
    for city, group in pairs.groupby("city_name", sort=True):
        for letter, row in zip(LETTERS, group.itertuples()):
            index[row.cinema_ids] = len(table)
            table.append({"c": cities.index(city), "l": letter, "n": int(row.n)})
    return index, table, cities


def add_show_capacity(clusters: list[dict], cl_index: dict[str, int], paths: Paths) -> list[dict]:
    """Physical limit proxy per cluster: p99 of all-film shows per day in train, never below what test D1-D3 ran."""
    tr = pd.read_csv(paths.data / "train.csv", usecols=["date_show", "cinema_ids", "total_show"])
    th = pd.read_csv(paths.data / "test_history.csv", usecols=["date_show", "cinema_ids", "total_show"])
    train_daily = tr.groupby(["cinema_ids", "date_show"]).total_show.sum().groupby("cinema_ids").quantile(CAPACITY_QUANTILE)
    test_daily = th.groupby(["cinema_ids", "date_show"]).total_show.sum().groupby("cinema_ids").max()
    caps = {}
    for cluster, idx in cl_index.items():
        caps[idx] = int(np.ceil(max(train_daily.get(cluster, 0), test_daily.get(cluster, 0))))
    return [{**row, "cap": caps[i]} for i, row in enumerate(clusters)]


def seat_lookup(hist: pd.DataFrame, title_col: str = "movie_title") -> tuple[dict, dict]:
    """Seats per show per pair = Σ(tickets / occupancy) / Σ shows on days with a usable occupancy."""
    usable = hist[(hist.occupation_rate > 0) & (hist.total_ticket > 0)].copy()
    usable["seats"] = usable.total_ticket / (usable.occupation_rate / 100)
    grouped = usable.groupby([title_col, "cinema_ids"]).agg(seats=("seats", "sum"), shows=("total_show", "sum"))
    per_pair = (grouped.seats / grouped.shows).to_dict()
    per_cluster = (usable.groupby("cinema_ids").seats.sum() / usable.groupby("cinema_ids").total_show.sum()).to_dict()
    return per_pair, per_cluster


def seat_of(title: str, cluster: str, per_pair: dict, per_cluster: dict) -> int:
    value = per_pair.get((title, cluster), per_cluster.get(cluster, FALLBACK_SEATS))
    return int(round(float(np.clip(value, *SEAT_RANGE))))


def build_test(paths: Paths, cl_index: dict[str, int], hol: dict) -> tuple[dict, pd.DataFrame]:
    te = pd.read_csv(paths.data / "test.csv", parse_dates=["date_show"])
    te["f1"] = pd.read_csv(paths.subs / "F1.csv").total_ticket
    te["f2"] = pd.read_csv(paths.subs / "F2.csv").total_ticket
    th = pd.read_csv(paths.data / "test_history.csv", parse_dates=["date_show"])
    per_pair, per_cluster = seat_lookup(th)
    hist = {(r.movie_title, r.cinema_ids, r.date_show): r for r in th.itertuples()}
    te = te.sort_values(["movie_title", "cinema_ids", "date_show"], kind="stable")
    d1s = (te.groupby("movie_title").date_show.min() - pd.Timedelta(days=3)).to_dict()
    titles = sorted(d1s)
    film_idx = {t: i for i, t in enumerate(titles)}
    columns: dict[str, list] = {k: [] for k in ("film", "cl", "y", "sh", "occ", "seat", "f")}
    alt: dict[str, list] = {}
    records = []
    for (title, cluster), g in te.groupby(["movie_title", "cinema_ids"], sort=False):
        assert len(g) == 7, (title, cluster)
        d1 = d1s[title]
        assert g.date_show.iloc[0] == d1 + pd.Timedelta(days=3), (title, cluster)
        days = [hist.get((title, cluster, d1 + pd.Timedelta(days=j))) for j in range(3)]
        y = [int(getattr(d, "total_ticket", 0)) for d in days]
        sh = [int(getattr(d, "total_show", 0)) for d in days]
        occ = max(float(getattr(d, "occupation_rate", 0.0)) for d in days)
        f2, f1 = g.f2.to_numpy(), g.f1.to_numpy()
        kept = stored(f2)
        idx = len(columns["film"])
        columns["film"].append(film_idx[title])
        columns["cl"].append(cl_index[cluster])
        columns["y"] += y
        columns["sh"] += sh
        columns["occ"].append(round(occ, 1))
        columns["seat"].append(seat_of(title, cluster, per_pair, per_cluster))
        columns["f"] += kept.tolist()
        if title in LEBARAN_SCENARIO:
            alt[str(idx)] = stored(f1).tolist()
        records.append(dict(title=title, cl=cl_index[cluster], y=y, sh3=sh[2], occ=occ, raw=f2, kept=kept, dates=list(g.date_show), d1=d1))
    frame = pd.DataFrame(records)
    payload = {"films": titles, "d1": [d1s[t].strftime("%Y-%m-%d") for t in titles], **columns, "alt": alt}
    return payload, frame


def complete_validation(oof: pd.DataFrame) -> list[pd.DataFrame]:
    """Pairs whose 7 targets all exist; the rest touch the 7-16 Jun 2025 recording outage or the end of train."""
    return [g for _, g in oof.groupby(["film", "cluster"], sort=False) if len(g) == 7]


def build_validation(paths: Paths, cl_index: dict[str, int], oof: pd.DataFrame) -> dict:
    tr = pd.read_csv(paths.data / "train.csv", parse_dates=["date_show"])
    per_pair, per_cluster = seat_lookup(tr)
    occ_by = {(r.movie_title, r.cinema_ids, r.date_show): r.occupation_rate for r in tr.itertuples()}
    groups = complete_validation(oof)
    titles = sorted({g.film.iloc[0] for g in groups})
    d1s = {t: sorted({g.d1_date.iloc[0] for g in groups if g.film.iloc[0] == t}) for t in titles}
    assert all(len(v) == 1 for v in d1s.values()), "validation film with more than one D1"
    film_idx = {t: i for i, t in enumerate(titles)}
    columns: dict[str, list] = {k: [] for k in ("film", "cl", "y", "sh", "occ", "seat", "f", "a", "l")}
    for g in groups:
        title, cluster, scale = g.film.iloc[0], g.cluster.iloc[0], g.scale.iloc[0]
        first = g.iloc[0]
        d1 = first.d1_date
        columns["film"].append(film_idx[title])
        columns["cl"].append(cl_index[cluster])
        columns["y"] += [int(first.y1), int(first.y2), int(first.y3)]
        columns["sh"] += [int(first.sh1), int(first.sh2), int(first.sh3)]
        occ = [occ_by.get((title, cluster, d1 + pd.Timedelta(days=j)), 0.0) for j in range(3)]
        columns["occ"].append(round(float(max(occ)), 1))
        columns["seat"].append(seat_of(title, cluster, per_pair, per_cluster))
        columns["f"] += stored(g.p15.clip(lower=0).to_numpy() * scale).tolist()
        columns["a"] += [int(v) for v in np.round(g.R.to_numpy() * scale)]
        columns["l"] += [int(v) for v in np.round(g.p00.clip(lower=0).to_numpy() * scale)]
    payload = {"films": titles, "d1": [d1s[t][0].strftime("%Y-%m-%d") for t in titles], **columns}
    return payload


def build_film_meta(paths: Paths, test: dict, val: dict) -> dict:
    """Display titles plus genre and age rating (movies.csv holds the base title without the IMAX/3D suffix)."""
    movies = pd.read_csv(paths.data / "movies.csv")
    meta = {r.original_title: (r.genre, r.age_rating) for r in movies.itertuples()}

    def one(title: str) -> dict:
        base = title.split(" (")[0]
        genre, rating = meta.get(title, meta.get(base, ("", "")))
        return {
            "t": film_title(title),
            "g": genre if isinstance(genre, str) else "",
            "r": rating if isinstance(rating, str) else "",
        }

    return {"test": [one(t) for t in test["films"]], "val": [one(t) for t in val["films"]]}


def build_layers(paths: Paths, cities: list[str]) -> dict:
    """Calendar layers a-d of the notebook (deck L06), used by the quick estimate for a new film."""
    c = pd.read_csv(paths.kit / "cal_final_cohort_multipliers.csv", dtype={"d1": str, "date": str})
    nye = c.date == "2025-12-31"
    pre_lebaran = (c.d1 == "2026-03-11") & c.date.between("2026-03-18", "2026-03-20")
    ramadan = c.d1.between("2026-02-11", "2026-02-17") & (c.date >= "2026-02-18")
    window = c[nye | pre_lebaran | ramadan]
    calm = {f"{r.d1}|{r.k}": float(r.m_resid_p50) for r in window.itertuples()}
    p = pd.read_csv(paths.kit / "priors_lebaran_citytype_final.csv")
    p["k"] = p.dk.str.slice(1).astype(int)
    leb = {}
    for (level, name), g in p.groupby(["level", "name"]):
        if level == "type" or name in ("JAKARTA", "DENPASAR"):
            leb[name] = g.sort_values("k").R_p50.round(4).tolist()
    types = pd.read_csv(paths.kit / "priors_mudik_citytype.csv").set_index("city_name").lebaran_city_type.to_dict()
    assert len(calm) == 23 and all(len(v) == 7 for v in leb.values())
    return {"calm": calm, "leb": leb, "ctype": [types.get(c_, "destination_java") for c_ in cities]}


def build_prices(paths: Paths, cities: list[str]) -> list[list[int]]:
    """[weekday, friday, weekend] rupiah per city, same order as cities."""
    pr = pd.read_csv(paths.data / "ticket_prices.csv").pivot(index="city_name", columns="price_day", values="ceil")
    return [[int(pr.loc[c, "Weekday"]), int(pr.loc[c, "Friday"]), int(pr.loc[c, "Weekend"])] for c in cities]


def check_rule_parity(frame: pd.DataFrame, hol: dict) -> dict:
    """The rule on stored values must equal the rule on the raw submission values."""
    flips = 0
    counts: dict[str, int] = {}
    for r in frame.itertuples():
        avg = max(1.0, sum(r.y) / 3)
        kind_raw = card_rule(r.raw, avg, r.dates, hol)[0]
        kind_kept = card_rule(r.kept, avg, r.dates, hol, half_up)[0]
        flips += kind_raw != kind_kept
        counts[kind_raw] = counts.get(kind_raw, 0) + 1
    log.info("test decisions %s; flips from rounding %d of %d", counts, flips, len(frame))
    return {"counts": counts, "flips": flips}


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    here = Path(__file__).resolve()
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=here.parents[3])
    parser.add_argument("--out", type=Path, default=here.parents[1] / "data" / "data.json")
    args = parser.parse_args()
    paths = resolve_paths(args.root, args.out)

    cal, hol = load_calendar(paths)
    te_raw = pd.read_csv(paths.data / "test.csv")
    cl_index, clusters, cities = cluster_table(te_raw)
    oof = pd.read_parquet(paths.kit / "_sumber_kode" / "_aset" / "oof_merged.parquet").sort_values(["film", "cluster", "k"])

    test, frame = build_test(paths, cl_index, hol)
    val = build_validation(paths, cl_index, oof)
    parity = check_rule_parity(frame, hol)
    payload = {
        "cal": cal,
        "cities": [city_title(c) for c in cities],
        "clusters": add_show_capacity(clusters, cl_index, paths),
        "prices": build_prices(paths, cities),
        "layers": build_layers(paths, cities),
        "meta": build_film_meta(paths, test, val),
        "test": test,
        "val": val,
        "proof": build_proof(oof, complete_validation(oof), hol, parity, cal),
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    log.info("wrote %s: %.2f MB", args.out, args.out.stat().st_size / 1e6)


if __name__ == "__main__":
    main()
