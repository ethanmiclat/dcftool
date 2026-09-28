"""Market-wide inputs: risk-free rate, peer discovery and trading comps (yfinance)."""
from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor
from statistics import median
from typing import Optional

import yfinance as yf

from .engine import DEFAULT_RISK_FREE
from .sources.yahoo import _clean

MAX_PEERS = 5
_rf_cache: tuple[float, float] | None = None


def risk_free_rate() -> tuple[float, str]:
    """10-year US Treasury yield. ^TNX quotes the yield in percent (4.25 = 4.25%)."""
    global _rf_cache
    if _rf_cache and time.time() - _rf_cache[0] < 3600:
        return _rf_cache[1], "10Y US Treasury (^TNX)"
    try:
        close = yf.Ticker("^TNX").history(period="5d")["Close"].dropna()
        rate = float(close.iloc[-1]) / 100
        if not 0 < rate < 0.2:
            raise ValueError(rate)
        _rf_cache = (time.time(), rate)
        return rate, "10Y US Treasury (^TNX)"
    except Exception:
        return DEFAULT_RISK_FREE, "default (Treasury quote unavailable)"


def suggest_peers(ticker: str, limit: int = MAX_PEERS) -> list[str]:
    """Largest companies in the same industry, topped up from the sector if the industry is thin."""
    ticker = ticker.upper()
    try:
        info = yf.Ticker(ticker).info or {}
    except Exception:
        return []
    peers: list[str] = []

    def add_from(frame, min_weight: float) -> None:
        if frame is None or frame.empty:
            return
        for sym, row in frame.iterrows():
            weight = _clean(row.get("market weight")) or 0
            if sym != ticker and sym not in peers and "." not in sym and weight >= min_weight:
                peers.append(sym)
            if len(peers) >= limit:
                return

    try:
        if info.get("industryKey"):
            # Ignore micro-caps that are a rounding error of the industry.
            add_from(yf.Industry(info["industryKey"]).top_companies, 0.002)
        if len(peers) < 3 and info.get("sectorKey"):
            add_from(yf.Sector(info["sectorKey"]).top_companies, 0.0)
    except Exception:
        pass
    return peers[:limit]


def _comp_row(ticker: str) -> dict:
    try:
        info = yf.Ticker(ticker).info or {}
    except Exception:
        info = {}
    ev, ebitda = _clean(info.get("enterpriseValue")), _clean(info.get("ebitda"))
    # Yahoo mixes currencies when financials and the quote differ (e.g. foreign listings),
    # which makes EV and EBITDA-based multiples meaningless. Drop them rather than show garbage.
    mixed = (info.get("financialCurrency") or info.get("currency")) != info.get("currency")
    if mixed or (ev is not None and ev <= 0):
        ev = ebitda = None
    ev_ebitda = _clean(info.get("enterpriseToEbitda")) if ev is not None else None
    if ev_ebitda is None and ev and ebitda and ebitda > 0:
        ev_ebitda = ev / ebitda
    if ev_ebitda is not None and ev_ebitda <= 0:
        ev_ebitda = None  # negative EBITDA -> multiple not meaningful
    pe = _clean(info.get("trailingPE"))
    return {
        "ticker": ticker,
        "name": info.get("shortName") or info.get("longName") or ticker,
        "price": _clean(info.get("currentPrice")) or _clean(info.get("regularMarketPrice")),
        "currency": info.get("currency"),
        "market_cap": _clean(info.get("marketCap")),
        "enterprise_value": ev,
        "ebitda": ebitda,
        "ev_ebitda": ev_ebitda,
        "pe": pe,
        "forward_pe": _clean(info.get("forwardPE")),
        "revenue_growth": _clean(info.get("revenueGrowth")),
        "ebitda_margin": _clean(info.get("ebitdaMargins")),
        "mixed_currency": mixed,
        "ok": bool(info.get("marketCap")),
    }


def _median(rows: list[dict], key: str) -> Optional[float]:
    vals = [r[key] for r in rows if r.get(key) is not None]
    return median(vals) if vals else None


def comps(ticker: str, peers: Optional[list[str]] = None) -> dict:
    ticker = ticker.upper()
    peers = [p.upper() for p in (peers if peers is not None else suggest_peers(ticker)) if p.upper() != ticker]
    with ThreadPoolExecutor(max_workers=6) as pool:
        rows = list(pool.map(_comp_row, [ticker, *peers]))
    subject, peer_rows = rows[0], [r for r in rows[1:] if r["ok"]]
    missing = [r["ticker"] for r in rows[1:] if not r["ok"]]
    keys = ("ev_ebitda", "pe", "forward_pe", "revenue_growth", "ebitda_margin")
    peer_median = {k: _median(peer_rows, k) for k in keys}

    # Implied share price from applying the peer median multiple to the subject.
    implied = {}
    if subject["ok"] and peer_median["ev_ebitda"] and subject["ebitda"] and subject["ebitda"] > 0:
        net_debt = (subject["enterprise_value"] or 0) - (subject["market_cap"] or 0)
        equity = peer_median["ev_ebitda"] * subject["ebitda"] - net_debt
        shares = subject["market_cap"] / subject["price"] if subject["price"] else None
        implied["ev_ebitda"] = equity / shares if shares else None
    if peer_median["pe"] and subject["pe"] and subject["price"]:
        eps = subject["price"] / subject["pe"]
        implied["pe"] = peer_median["pe"] * eps
    return {"subject": subject, "peers": peer_rows, "median": peer_median, "implied_price": implied, "missing": missing}
