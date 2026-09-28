"""Data-source registry. Every source returns a FinancialsSnapshot."""
from __future__ import annotations

import time
from typing import Callable

from ..contract import FinancialsSnapshot
from .edgar import fetch_edgar
from .yahoo import fetch_revenue_estimates, fetch_yfinance

SOURCES: dict[str, Callable[[str], FinancialsSnapshot]] = {
    "yfinance": fetch_yfinance,
    "edgar": fetch_edgar,
}
DEFAULT_SOURCE = "yfinance"

FINANCIAL_SECTORS = {"financial services", "financials"}
FINANCIALS_WARNING = (
    "Financial-sector company: debt is operating capital for banks and insurers, so an "
    "unlevered FCF DCF is not a meaningful valuation. Treat output as illustrative."
)

_CACHE_TTL = 15 * 60
_cache: dict[tuple[str, str], tuple[float, FinancialsSnapshot]] = {}


def get_snapshot(ticker: str, source: str = DEFAULT_SOURCE) -> FinancialsSnapshot:
    if source not in SOURCES:
        raise ValueError(f"Unknown source '{source}'. Options: {', '.join(SOURCES)}")
    key = (ticker.upper().strip(), source)
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < _CACHE_TTL:
        return hit[1]
    snap = SOURCES[source](key[0])
    # Estimates come from Yahoo for every source; they only seed default assumptions.
    snap.analyst_revenue_growth = fetch_revenue_estimates(snap.ticker, snap.years, snap.revenue, snap.currency)
    if (snap.sector or "").lower() in FINANCIAL_SECTORS:
        snap.warnings.insert(0, FINANCIALS_WARNING)
    _cache[key] = (time.time(), snap)
    return snap
