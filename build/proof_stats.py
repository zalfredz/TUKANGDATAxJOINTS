"""Evidence numbers for the dashboard's "Bukti" view, recomputed from the OOF file and asserted against the deck."""
from __future__ import annotations

import logging
from typing import Sequence

import numpy as np
import pandas as pd

log = logging.getLogger("proof_stats")

PROFILE_MASE = 0.45436  # decay profile per release weekday x horizon: deck fig13 (make_figs_model.PROFILE_MASE)
KINDS = ("lepas", "tambah", "libur", "tahan", "kurangi")
QUICK_K = 100  # same K as QUICK_K in src/engine.js


def stored(values: np.ndarray) -> np.ndarray:
    """Round tickets to 0.1 so the page's Math.round() equals the deck's np.round() on the raw value."""
    target = np.round(values)
    kept = np.round(values, 1)
    bad = np.floor(kept + 0.5) != target
    repaired = target + np.where(values > target, 0.4, -0.4)
    return np.round(np.where(bad, repaired, kept), 1)


def half_up(values: np.ndarray) -> np.ndarray:
    """Math.round() of the page; use on stored() values, whose .5 ties were placed for this rounding."""
    return np.floor(values + 0.5)


def card_rule(fc: np.ndarray, avg: float, dates: Sequence[pd.Timestamp], hol: dict, rounder=np.round) -> tuple[str, int]:
    """Port of make_figs_model.card_rule (deck fig17, Q-B4). Returns (kind, first day index)."""
    rounded = rounder(fc)
    ratio = fc / avg
    for i in range(7):
        if (rounded[i:] == 0).all():
            return "lepas", i
    weekend = [i for i, d in enumerate(dates) if d.dayofweek >= 5]
    if weekend and max(ratio[i] for i in weekend) >= 1.0:
        return "tambah", max(weekend, key=lambda i: ratio[i])
    for i in range(1, 7):
        if dates[i] in hol and rounded[i] > 0 and rounded[i] >= 1.2 * rounded[i - 1]:
            return "libur", i
    if ratio[4:].mean() >= 0.5:
        return "tahan", 4
    return "kurangi", int(np.argmax(ratio < 0.5))


def mase(oof: pd.DataFrame, column: str) -> float:
    return float((oof[column] - oof.R).abs().mean())


def ladder(oof: pd.DataFrame) -> list[dict]:
    naive_d3 = float((oof.y3 / oof.scale - oof.R).abs().mean())
    naive_mean = float((1 - oof.R).abs().mean())
    rows = [
        ("Tebakan naif: tetap seperti rata-rata D1–D3", naive_mean),
        ("Tebakan naif: tetap seperti D3", naive_d3),
        ("Profil peluruhan per hari rilis × horizon", PROFILE_MASE),
        ("LightGBM", mase(oof, "p00")),
        ("Ansambel GBDT", mase(oof, "p08")),
        ("TabICLv2", mase(oof, "p09")),
        ("TabICLv2 + fitur kalender", mase(oof, "p13")),
        ("Model akhir (E15)", mase(oof, "p15")),
    ]
    return [{"n": name, "v": round(value, 5)} for name, value in rows]


def ticket_errors(oof: pd.DataFrame) -> dict:
    """Same definition as kit 11_NILAI_BISNIS part 3."""
    tickets = oof.R * oof.scale
    errs = {
        "naif": float(((1 - oof.R).abs() * oof.scale).sum()),
        "lgb": float(((oof.p00 - oof.R).abs() * oof.scale).sum()),
        "model": float(((oof.p15 - oof.R).abs() * oof.scale).sum()),
    }
    return {"tickets": float(tickets.sum()), **{k: round(v) for k, v in errs.items()}}


def zero_detection(oof: pd.DataFrame) -> dict:
    """D10, prediction < 0.5 tickets flags 'will be zero' (11_NILAI_BISNIS part 5)."""
    d10 = oof[oof.k == 10]
    actual_zero = (d10.R * d10.scale).round() == 0

    def score(col: str) -> dict:
        flagged = (d10[col] * d10.scale) < 0.5
        hit = (flagged & actual_zero).sum()
        return {"recall": round(float(hit / actual_zero.sum()), 4), "precision": round(float(hit / flagged.sum()), 4)}

    return {"n": int(len(d10)), "zero": int(actual_zero.sum()), "model": score("p15"), "lgb": score("p00")}


def per_fold(oof: pd.DataFrame) -> list[dict]:
    rows = []
    for fold, g in oof.groupby("fold"):
        rows.append({"f": int(fold), "lgb": round(mase(g, "p00"), 3), "model": round(mase(g, "p15"), 3)})
    return rows


def per_scale(oof: pd.DataFrame) -> list[dict]:
    rows = []
    for group, g in oof.groupby("sg", observed=True):
        rows.append({"g": str(group), "n": int(len(g)), "lgb": round(mase(g, "p00"), 3), "model": round(mase(g, "p15"), 3)})
    return rows


def _realised(kind: str, idx: int, actual: np.ndarray, pred: np.ndarray, avg: float, dates: Sequence[pd.Timestamp]) -> tuple[float, bool]:
    """(realised value, did the rule's claim hold on actual tickets) for one pair."""
    ra = actual / avg
    if kind == "lepas":
        return float(actual[idx:].mean()), bool(np.round(actual[6]) == 0)
    if kind == "tambah":
        weekend = [i for i, d in enumerate(dates) if d.dayofweek >= 5]
        best = max(weekend, key=lambda i: pred[i])
        return float(ra[best]), bool(ra[best] >= 1.0)
    if kind == "libur":
        uplift = actual[idx] / max(actual[idx - 1], 1)
        return float(uplift), bool(uplift >= 1.2)
    if kind == "tahan":
        return float(ra[4:].mean()), bool(ra[4:].mean() >= 0.5)
    tail = float(ra[idx:].mean())
    return tail, tail < 0.5


def _decision_rows(groups: list[pd.DataFrame], hol: dict) -> pd.DataFrame:
    rows = []
    for g in groups:
        scale = g.scale.iloc[0]
        first = g.iloc[0]
        avg = max(1.0, (first.y1 + first.y2 + first.y3) / 3)
        dates = list(g.date)
        # exactly the values embedded in the page, so its live numbers and these stats agree
        pred = stored(g.p15.clip(lower=0).to_numpy() * scale)
        actual = np.round(g.R.to_numpy() * scale)
        light = np.round(g.p00.clip(lower=0).to_numpy() * scale)
        kind, idx = card_rule(pred, avg, dates, hol, half_up)
        real, held = _realised(kind, idx, actual, pred, avg, dates)
        rows.append(dict(kind=kind, hind=card_rule(actual, avg, dates, hol, half_up)[0], lgb=card_rule(light, avg, dates, hol, half_up)[0], real=real, held=held))
    return pd.DataFrame(rows)


def decision_stats(groups: list[pd.DataFrame], hol: dict) -> dict:
    """All complete validation pairs, no selection: confusion against hindsight plus how each saran's claim held."""
    d = _decision_rows(groups, hol)
    direction = {"lepas": -1, "kurangi": -1, "tahan": 0, "tambah": 1, "libur": 1}
    realised = {}
    for kind in KINDS:
        part = d[d.kind == kind]
        realised[kind] = {
            "n": int(len(part)),
            "held": round(float(part.held.mean()), 4),
            "median": round(float(part.real.median()), 3),
            "q25": round(float(part.real.quantile(0.25)), 3),
            "q75": round(float(part.real.quantile(0.75)), 3),
            "q90": round(float(part.real.quantile(0.90)), 3),
            "mean": round(float(part.real.mean()), 2),
        }
    confusion = pd.crosstab(d.kind, d.hind).reindex(index=list(KINDS), columns=list(KINDS), fill_value=0)
    return {
        "n": int(len(d)),
        "agree": round(float((d.kind == d.hind).mean()), 4),
        "agree_lgb": round(float((d.lgb == d.hind).mean()), 4),
        "direction": round(float((d.kind.map(direction) == d.hind.map(direction)).mean()), 4),
        "confusion": confusion.to_numpy().tolist(),
        "realised": realised,
    }


def quick_estimate_stats(groups: list[pd.DataFrame], cal: dict) -> dict:
    """Leave-one-family-out accuracy of the page's quick estimate (median decay of the 100 most similar cases)."""
    n = len(groups)
    feats, decay, targets, weights13, weights_future = [], [], [], [], []
    families = []
    for g in groups:
        first = g.iloc[0]
        y = np.array([first.y1, first.y2, first.y3])
        d1 = first.d1_date
        wd = np.array([cal[(d1 + pd.Timedelta(days=j)).strftime("%Y-%m-%d")][0] for j in range(10)])
        w13 = wd[:3].mean()
        a = (y + 1) / wd[:3]
        feats.append([np.log(a[1] / a[0]), np.log(a[2] / a[0]), 0.25 * np.log1p(y.mean())])
        ratio = np.round(g.R.to_numpy() * g.scale.iloc[0]) / max(1.0, y.mean())
        decay.append(ratio / (wd[3:] / w13))
        targets.append(ratio)
        weights13.append(w13)
        weights_future.append(wd[3:])
        families.append(g.film.iloc[0].split(" (")[0])
    feats_arr, decay_arr, fam = np.array(feats), np.array(decay), np.array(families)
    errors = np.zeros(n)
    for i in range(n):
        candidates = np.flatnonzero(fam != fam[i])
        dist = ((feats_arr[candidates] - feats_arr[i]) ** 2).sum(axis=1)
        nearest = candidates[np.argsort(dist, kind="stable")[:QUICK_K]]
        pred = np.maximum(np.median(decay_arr[nearest], axis=0) * weights_future[i] / weights13[i], 0)
        errors[i] = np.abs(pred - targets[i]).mean()
    return {"k": QUICK_K, "mase": round(float(errors.mean()), 4), "mase_sample20": round(float(errors[::20].mean()), 4)}


def build_proof(oof: pd.DataFrame, groups: list[pd.DataFrame], hol: dict, parity: dict, cal: dict) -> dict:
    complete = pd.concat(groups)
    proof = {
        "quick": quick_estimate_stats(groups, cal),
        "complete": {"model": round(mase(complete, "p15"), 4), "lgb": round(mase(complete, "p00"), 4)},
        "ladder": ladder(oof),
        "rows": int(len(oof)),
        "pairs_all": int(oof.groupby(["film", "cluster"]).ngroups),
        "folds": per_fold(oof),
        "scale": per_scale(oof),
        "tickets": ticket_errors(oof),
        "zero": zero_detection(oof),
        "decisions": decision_stats(groups, hol),
        "test": {"counts": parity["counts"], "flips": parity["flips"]},
    }
    log.info("MASE E15 %.5f LGB %.5f rows %d", mase(oof, "p15"), mase(oof, "p00"), len(oof))
    log.info("ladder %s", proof["ladder"])
    log.info("folds %s", proof["folds"])
    log.info("scale %s", proof["scale"])
    log.info("tickets %s", proof["tickets"])
    log.info("zero %s", proof["zero"])
    log.info("decisions agree %.4f lgb %.4f direction %.4f", proof["decisions"]["agree"], proof["decisions"]["agree_lgb"], proof["decisions"]["direction"])
    log.info("realised %s", proof["decisions"]["realised"])
    log.info("quick estimate %s", proof["quick"])
    assert abs(mase(oof, "p15") - 0.33747) < 5e-5, "E15 OOF must equal the deck's 0.33747"
    assert proof["rows"] == 50971
    assert abs(proof["tickets"]["model"] - 4461777) < 2, proof["tickets"]
    return proof
