"""The data contract between data sources and everything downstream.

Every source (yfinance, SEC EDGAR, ...) must produce a FinancialsSnapshot.
The calc engine, API and frontend only ever see this shape, so swapping the
source never touches downstream code.

Conventions:
  - All historical series are aligned to `years`, oldest first.
  - Money values are in the reporting currency, in absolute units (not millions).
  - `capex` is a positive number (cash spent).
  - `nwc_change` is the increase in net working capital (positive = cash used).
  - `long_term_investments` is non-current marketable securities, a cash-like asset
    added to equity value in the bridge (0 if none).
  - `analyst_revenue_growth` holds consensus estimates for fiscal years after the last
    reported year: [{"year": 2026, "growth": 0.08, "analysts": 30}, ...]. Optional.
  - Missing historical values are None; `warnings` explains what was missing.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Optional


@dataclass
class FinancialsSnapshot:
    ticker: str
    years: list[int]
    revenue: list[Optional[float]]
    ebit: list[Optional[float]]
    da: list[Optional[float]]
    capex: list[Optional[float]]
    nwc_change: list[Optional[float]]
    shares_outstanding: float
    share_price: float
    total_debt: float
    cash: float
    # Supporting fields used for default WACC / tax assumptions.
    name: str = ""
    currency: str = "USD"
    source: str = ""
    beta: Optional[float] = None
    interest_expense: Optional[float] = None
    tax_rate: Optional[float] = None
    sector: Optional[str] = None
    industry: Optional[str] = None
    long_term_investments: float = 0.0
    analyst_revenue_growth: list[dict] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> "FinancialsSnapshot":
        known = {f for f in cls.__dataclass_fields__}
        return cls(**{k: v for k, v in data.items() if k in known})

    def validate(self) -> None:
        n = len(self.years)
        if n < 2:
            raise ValueError(f"{self.ticker}: need at least 2 years of history, got {n}")
        for name in ("revenue", "ebit", "da", "capex", "nwc_change"):
            if len(getattr(self, name)) != n:
                raise ValueError(f"{self.ticker}: {name} length does not match years")
        if self.years != sorted(self.years):
            raise ValueError(f"{self.ticker}: years must be ascending")
        if not self.shares_outstanding or self.shares_outstanding <= 0:
            raise ValueError(f"{self.ticker}: missing shares outstanding")
        if not self.share_price or self.share_price <= 0:
            raise ValueError(f"{self.ticker}: missing share price")
