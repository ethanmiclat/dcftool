"""DCF calc engine. Pure functions over a FinancialsSnapshot + Assumptions.

All rates are decimals (0.08 = 8%). Nothing here does I/O.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
from statistics import mean, median
from typing import Optional

from .contract import FinancialsSnapshot

DEFAULT_ERP = 0.05
DEFAULT_TERMINAL_GROWTH = 0.025
DEFAULT_TAX_RATE = 0.21
DEFAULT_RISK_FREE = 0.0425
DEFAULT_YEARS = 5


def _clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


@dataclass
class Assumptions:
    revenue_growth: list[float]  # one per projection year
    ebit_margin: list[float]  # one per projection year
    tax_rate: float
    da_pct_revenue: float
    capex_pct_revenue: float
    nwc_pct_revenue_change: float  # ΔNWC as a share of Δrevenue
    risk_free_rate: float
    beta: float
    equity_risk_premium: float
    pre_tax_cost_of_debt: float
    terminal_growth: float
    wacc_override: Optional[float] = None
    mid_year: bool = False

    @property
    def years(self) -> int:
        return len(self.revenue_growth)

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> "Assumptions":
        known = set(cls.__dataclass_fields__)
        a = cls(**{k: v for k, v in data.items() if k in known})
        if len(a.ebit_margin) != len(a.revenue_growth):
            raise ValueError("revenue_growth and ebit_margin must have the same number of years")
        if not 1 <= a.years <= 15:
            raise ValueError("projection period must be 1-15 years")
        return a


# ---------------------------------------------------------------- historicals

def historical_stats(s: FinancialsSnapshot) -> dict:
    """Ratios from history that seed the default assumptions."""
    rev = s.revenue
    pairs = lambda a: [(x, r) for x, r in zip(a, rev) if x is not None and r]  # noqa: E731

    first = next((i for i, r in enumerate(rev) if r and r > 0), None)
    last = len(rev) - 1
    cagr = None
    if first is not None and last > first and rev[last] and rev[last] > 0:
        cagr = (rev[last] / rev[first]) ** (1 / (last - first)) - 1

    margins = [e / r for e, r in pairs(s.ebit)]
    da_pct = [d / r for d, r in pairs(s.da)]
    capex_pct = [c / r for c, r in pairs(s.capex)]
    nwc_ratios = []
    for i in range(1, len(rev)):
        if s.nwc_change[i] is not None and rev[i] is not None and rev[i - 1] is not None:
            d_rev = rev[i] - rev[i - 1]
            if abs(d_rev) > 0.005 * abs(rev[i - 1]):
                nwc_ratios.append(s.nwc_change[i] / d_rev)

    return {
        "revenue_cagr": cagr,
        "ebit_margin_avg": mean(margins) if margins else None,
        "ebit_margins": margins,
        "da_pct_revenue": mean(da_pct) if da_pct else None,
        "capex_pct_revenue": mean(capex_pct) if capex_pct else None,
        "nwc_pct_revenue_change": median(nwc_ratios) if nwc_ratios else None,
    }


def historical_fcf(s: FinancialsSnapshot, tax_rate: float) -> list[dict]:
    rows = []
    for i, y in enumerate(s.years):
        ebit, da, capex, nwc = s.ebit[i], s.da[i], s.capex[i], s.nwc_change[i]
        fcf = None
        if ebit is not None:
            fcf = ebit * (1 - tax_rate) + (da or 0) - (capex or 0) - (nwc or 0)
        rows.append({
            "year": y,
            "revenue": s.revenue[i],
            "ebit": ebit,
            "da": da,
            "capex": capex,
            "nwc_change": nwc,
            "fcf": fcf,
        })
    return rows


def default_assumptions(
    s: FinancialsSnapshot, risk_free_rate: float = DEFAULT_RISK_FREE, years: int = DEFAULT_YEARS
) -> tuple[Assumptions, list[str]]:
    """Seed assumptions from history. Returns (assumptions, notes on what was clamped/defaulted)."""
    h = historical_stats(s)
    notes: list[str] = []

    def pick(value, lo, hi, fallback, label, fmt="{:.1%}"):
        if value is None:
            notes.append(f"{label}: no history, defaulted to {fmt.format(fallback)}")
            return fallback
        clamped = _clamp(value, lo, hi)
        if clamped != value:
            notes.append(f"{label}: historical {fmt.format(value)} clamped to {fmt.format(clamped)}")
        return clamped

    growth_path = _consensus_growth_path(s, years, notes)
    if growth_path is None:
        growth = pick(h["revenue_cagr"], -0.10, 0.30, 0.05, "Revenue growth")
        notes.append(f"Revenue growth: no analyst consensus, using historical CAGR of {growth:.1%} for every year")
        growth_path = [growth] * years
    margin = pick(h["ebit_margin_avg"], -0.20, 0.60, 0.15, "EBIT margin")
    if s.tax_rate is not None and s.tax_rate <= 0:
        tax = DEFAULT_TAX_RATE
        notes.append(f"Tax rate: historical rate not positive, defaulted to {DEFAULT_TAX_RATE:.0%}")
    else:
        tax = pick(s.tax_rate, 0.0, 0.35, DEFAULT_TAX_RATE, "Tax rate")
    da = pick(h["da_pct_revenue"], 0.0, 0.30, 0.03, "D&A % revenue")
    capex = pick(h["capex_pct_revenue"], 0.0, 0.40, 0.04, "CapEx % revenue")
    nwc = pick(h["nwc_pct_revenue_change"], -0.30, 0.30, 0.05, "ΔNWC % Δrevenue")
    beta = pick(s.beta, 0.3, 3.0, 1.0, "Beta", "{:.2f}")

    kd = risk_free_rate + 0.015
    if s.interest_expense and s.total_debt and s.total_debt > 0:
        kd = _clamp(s.interest_expense / s.total_debt, risk_free_rate * 0.5, risk_free_rate + 0.08)

    return Assumptions(
        revenue_growth=growth_path,
        ebit_margin=[margin] * years,
        tax_rate=tax,
        da_pct_revenue=da,
        capex_pct_revenue=capex,
        nwc_pct_revenue_change=nwc,
        risk_free_rate=risk_free_rate,
        beta=beta,
        equity_risk_premium=DEFAULT_ERP,
        pre_tax_cost_of_debt=kd,
        terminal_growth=DEFAULT_TERMINAL_GROWTH,
    ), notes


def _consensus_growth_path(s: FinancialsSnapshot, years: int, notes: list[str]) -> Optional[list[float]]:
    """Analyst consensus for the years it covers, then a straight-line fade to terminal growth.

    The fade reaches terminal growth in the year after the projection ends, so the final
    projected year hands off smoothly to the Gordon growth terminal value.
    """
    by_year = {e["year"]: e for e in s.analyst_revenue_growth}
    covered = []
    for i in range(years):
        e = by_year.get(s.years[-1] + i + 1)
        if e is None:
            break
        covered.append(e)
    if not covered:
        return None
    path = [_clamp(e["growth"], -0.50, 1.00) for e in covered]
    last, remaining = path[-1], years - len(path)
    for j in range(1, remaining + 1):
        path.append(last + (DEFAULT_TERMINAL_GROWTH - last) * j / (remaining + 1))
    est = ", ".join(f"FY{e['year']} {e['growth']:.1%} ({e['analysts']} analysts)" for e in covered)
    notes.append(
        f"Revenue growth: analyst consensus for {est}"
        + (f", then fading toward {DEFAULT_TERMINAL_GROWTH:.1%} terminal growth" if remaining else "")
    )
    return path


# ---------------------------------------------------------------- WACC

def compute_wacc(s: FinancialsSnapshot, a: Assumptions) -> dict:
    cost_of_equity = a.risk_free_rate + a.beta * a.equity_risk_premium
    after_tax_kd = a.pre_tax_cost_of_debt * (1 - a.tax_rate)
    equity = s.share_price * s.shares_outstanding
    debt = max(s.total_debt, 0.0)
    total = equity + debt
    we = equity / total if total else 1.0
    wd = 1 - we
    computed = we * cost_of_equity + wd * after_tax_kd
    return {
        "cost_of_equity": cost_of_equity,
        "pre_tax_cost_of_debt": a.pre_tax_cost_of_debt,
        "after_tax_cost_of_debt": after_tax_kd,
        "market_cap": equity,
        "debt": debt,
        "equity_weight": we,
        "debt_weight": wd,
        "computed_wacc": computed,
        "wacc": a.wacc_override if a.wacc_override is not None else computed,
        "overridden": a.wacc_override is not None,
    }


# ---------------------------------------------------------------- DCF

def project(s: FinancialsSnapshot, a: Assumptions) -> list[dict]:
    rows = []
    base_year = s.years[-1]
    prev_rev = s.revenue[-1]
    if prev_rev is None or prev_rev <= 0:
        raise ValueError(f"{s.ticker}: latest revenue is missing or not positive")
    for i in range(a.years):
        rev = prev_rev * (1 + a.revenue_growth[i])
        ebit = rev * a.ebit_margin[i]
        nopat = ebit * (1 - a.tax_rate)
        da = rev * a.da_pct_revenue
        capex = rev * a.capex_pct_revenue
        nwc = (rev - prev_rev) * a.nwc_pct_revenue_change
        rows.append({
            "year": base_year + i + 1,
            "revenue": rev,
            "growth": a.revenue_growth[i],
            "ebit": ebit,
            "ebit_margin": a.ebit_margin[i],
            "nopat": nopat,
            "da": da,
            "capex": capex,
            "nwc_change": nwc,
            "fcf": nopat + da - capex - nwc,
        })
        prev_rev = rev
    return rows


def _valuation(s: FinancialsSnapshot, a: Assumptions, rows: list[dict], wacc: float, g: float) -> dict:
    if wacc <= g:
        raise ValueError(f"WACC ({wacc:.2%}) must exceed terminal growth ({g:.2%})")
    shift = 0.5 if a.mid_year else 0.0
    pv_sum = 0.0
    discounted = []
    for t, r in enumerate(rows, start=1):
        df = 1 / (1 + wacc) ** (t - shift)
        pv = r["fcf"] * df
        pv_sum += pv
        discounted.append({"discount_factor": df, "pv_fcf": pv})
    n = len(rows)
    terminal_fcf = rows[-1]["fcf"] * (1 + g)
    tv = terminal_fcf / (wacc - g)
    # TV sits at the end of year N; with mid-year convention it is discounted with the final cash flow.
    pv_tv = tv / (1 + wacc) ** (n - shift)
    ev = pv_sum + pv_tv
    # Long-term marketable securities are cash-like, so they reduce net debt too.
    net_debt = s.total_debt - s.cash - s.long_term_investments
    equity = ev - net_debt
    price = equity / s.shares_outstanding
    return {
        "discounted": discounted,
        "sum_pv_fcf": pv_sum,
        "terminal_value": tv,
        "pv_terminal_value": pv_tv,
        "enterprise_value": ev,
        "net_debt": net_debt,
        "equity_value": equity,
        "implied_price": price,
        "tv_pct_of_ev": pv_tv / ev if ev else None,
    }


def sensitivity(
    s: FinancialsSnapshot,
    a: Assumptions,
    wacc: float,
    wacc_step: float = 0.005,
    g_step: float = 0.005,
    wacc_points: int = 7,
    g_points: int = 5,
) -> dict:
    rows = project(s, a)
    half_w, half_g = wacc_points // 2, g_points // 2
    waccs = [round(wacc + (i - half_w) * wacc_step, 6) for i in range(wacc_points)]
    gs = [round(a.terminal_growth + (j - half_g) * g_step, 6) for j in range(g_points)]
    grid = []
    for w in waccs:
        line = []
        for g in gs:
            if w <= g or w <= 0:
                line.append(None)
            else:
                line.append(_valuation(s, a, rows, w, g)["implied_price"])
        grid.append(line)
    return {"wacc": waccs, "terminal_growth": gs, "implied_price": grid}


def _solve(f, lo: float, hi: float, target: float, iters: int = 60) -> Optional[float]:
    """Bisection for f(x) = target on [lo, hi]; None if the target is not bracketed."""
    flo, fhi = f(lo) - target, f(hi) - target
    if flo == 0:
        return lo
    if flo * fhi > 0:
        return None
    for _ in range(iters):
        mid = (lo + hi) / 2
        fmid = f(mid) - target
        if (fmid > 0) == (flo > 0):
            lo, flo = mid, fmid
        else:
            hi = mid
    return (lo + hi) / 2


def market_implied(s: FinancialsSnapshot, a: Assumptions, wacc: float) -> dict:
    """Reverse DCF: what the current share price implies, holding everything else fixed.

    - wacc: the discount rate at which the model's cash flows equal today's price.
    - revenue_growth: the constant annual growth (same margins, same WACC) that does.
    """
    rows = project(s, a)
    implied_wacc = _solve(
        lambda w: _valuation(s, a, rows, w, a.terminal_growth)["implied_price"],
        a.terminal_growth + 0.0005, 0.50, s.share_price,
    )

    def price_at_growth(g: float) -> float:
        b = Assumptions(**{**a.to_dict(), "revenue_growth": [g] * a.years})
        return _valuation(s, b, project(s, b), wacc, a.terminal_growth)["implied_price"]

    implied_growth = _solve(price_at_growth, -0.30, 1.00, s.share_price) if wacc > a.terminal_growth else None
    return {"wacc": implied_wacc, "revenue_growth": implied_growth}


def run_dcf(s: FinancialsSnapshot, a: Assumptions) -> dict:
    w = compute_wacc(s, a)
    rows = project(s, a)
    val = _valuation(s, a, rows, w["wacc"], a.terminal_growth)
    for r, d in zip(rows, val.pop("discounted")):
        r.update(d)
    price = val["implied_price"]
    return {
        "ticker": s.ticker,
        "currency": s.currency,
        "current_price": s.share_price,
        "upside": price / s.share_price - 1 if s.share_price else None,
        "wacc": w,
        "projections": rows,
        "historical": historical_fcf(s, a.tax_rate),
        "sensitivity": sensitivity(s, a, w["wacc"]),
        "long_term_investments": s.long_term_investments,
        "market_implied": market_implied(s, a, w["wacc"]),
        **val,
    }
