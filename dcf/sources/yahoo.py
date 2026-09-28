"""yfinance data source -> FinancialsSnapshot.

Raw yfinance DataFrames never leave this module.
"""
from __future__ import annotations

import math
from typing import Optional

import yfinance as yf

from ..contract import FinancialsSnapshot

# Row-name fallback chains. First row present with a value wins, per year.
REVENUE_ROWS = ["Total Revenue", "Operating Revenue"]
EBIT_ROWS = ["Operating Income", "Total Operating Income As Reported", "EBIT"]
DA_ROWS = ["Depreciation And Amortization", "Depreciation Amortization Depletion", "Reconciled Depreciation"]
CAPEX_ROWS = ["Capital Expenditure", "Purchase Of PPE", "Net PPE Purchase And Sale"]
NWC_ROWS = ["Change In Working Capital"]  # cash-flow sign: negative = NWC increased
INTEREST_ROWS = ["Interest Expense", "Interest Expense Non Operating"]
DEBT_ROWS = ["Total Debt"]
CASH_ROWS = [
    "Cash Cash Equivalents And Short Term Investments",
    "Cash And Cash Equivalents",
    "Cash Financial",
]
SHARES_ROWS = ["Ordinary Shares Number", "Share Issued"]
# Non-current marketable securities (e.g. Apple's long-term bond portfolio). Excludes
# equity-method stakes, which are strategic rather than cash-like.
LT_INVEST_ROWS = ["Investmentin Financial Assets"]

MAX_YEARS = 5


def _clean(v) -> Optional[float]:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(f) or math.isinf(f) else f


def _row(df, rows: list[str], col) -> Optional[float]:
    for r in rows:
        if r in df.index and col in df.columns:
            v = _clean(df.at[r, col])
            if v is not None:
                return v
    return None


def _series(df, rows: list[str], cols) -> list[Optional[float]]:
    return [_row(df, rows, c) for c in cols]


def _fx_rate(from_ccy: str, to_ccy: str) -> Optional[float]:
    try:
        hist = yf.Ticker(f"{from_ccy}{to_ccy}=X").history(period="5d")
        return _clean(hist["Close"].dropna().iloc[-1])
    except Exception:
        return None


def fetch_info(ticker: str) -> dict:
    """Market data (price, shares, beta, sector...) from yfinance. Shared with the EDGAR source."""
    t = yf.Ticker(ticker)
    try:
        info = t.info or {}
    except Exception:
        info = {}
    price = _clean(info.get("currentPrice")) or _clean(info.get("regularMarketPrice"))
    if price is None:
        try:
            price = _clean(t.fast_info["last_price"])
        except Exception:
            price = None
    # Market cap / price keeps shares on the same basis as the quoted price. This handles
    # multi-class companies (GOOGL) and ADRs, where sharesOutstanding can be one class only.
    mcap = _clean(info.get("marketCap"))
    shares = (
        (mcap / price if mcap and price else None)
        or _clean(info.get("impliedSharesOutstanding"))
        or _clean(info.get("sharesOutstanding"))
    )
    return {
        "name": info.get("longName") or info.get("shortName") or ticker,
        "price": price,
        "shares": shares,
        "beta": _clean(info.get("beta")),
        "currency": info.get("currency") or "USD",
        "financial_currency": info.get("financialCurrency") or info.get("currency") or "USD",
        "sector": info.get("sector"),
        "industry": info.get("industry"),
        "sector_key": info.get("sectorKey"),
        "industry_key": info.get("industryKey"),
        "total_debt": _clean(info.get("totalDebt")),
        "total_cash": _clean(info.get("totalCash")),
        "quote_type": info.get("quoteType"),
    }


def fetch_yfinance(ticker: str) -> FinancialsSnapshot:
    ticker = ticker.upper().strip()
    t = yf.Ticker(ticker)
    info = fetch_info(ticker)
    inc, cf, bs = t.income_stmt, t.cashflow, t.balance_sheet
    if inc is None or inc.empty:
        raise LookupError(f"No financial statements found for {ticker}")

    warnings: list[str] = []

    # Only keep fiscal years that actually report revenue, oldest first.
    cols = [c for c in inc.columns if _row(inc, REVENUE_ROWS, c) is not None]
    cols = sorted(cols)[-MAX_YEARS:]
    years = [c.year for c in cols]

    revenue = _series(inc, REVENUE_ROWS, cols)
    ebit = _series(inc, EBIT_ROWS, cols)
    da = _series(cf, DA_ROWS, cols) if cf is not None else [None] * len(cols)
    if all(v is None for v in da):
        da = _series(inc, ["Reconciled Depreciation"], cols)
    capex_raw = _series(cf, CAPEX_ROWS, cols) if cf is not None else [None] * len(cols)
    capex = [abs(v) if v is not None else None for v in capex_raw]
    nwc_raw = _series(cf, NWC_ROWS, cols) if cf is not None else [None] * len(cols)
    nwc_change = [-v if v is not None else None for v in nwc_raw]

    for label, series in (("EBIT", ebit), ("D&A", da), ("CapEx", capex), ("change in NWC", nwc_change)):
        missing = [y for y, v in zip(years, series) if v is None]
        if missing:
            warnings.append(f"{label} not reported for {', '.join(map(str, missing))}")
    if all(v is None for v in ebit):
        warnings.append(
            "No operating income reported. This is typical for banks and insurers, "
            "where an unlevered DCF is not meaningful."
        )

    # Latest-year tax rate and interest expense for WACC defaults.
    latest = cols[-1]
    tax_rate = _row(inc, ["Tax Rate For Calcs"], latest)
    if tax_rate is None:
        prov, pretax = _row(inc, ["Tax Provision"], latest), _row(inc, ["Pretax Income"], latest)
        if prov is not None and pretax:
            tax_rate = prov / pretax
    interest = _row(inc, INTEREST_ROWS, latest)
    interest = abs(interest) if interest is not None else None

    # Balance sheet: most recent column.
    total_debt = cash = bs_shares = None
    lt_invest = 0.0
    if bs is not None and not bs.empty:
        bcol = max(bs.columns)
        total_debt = _row(bs, DEBT_ROWS, bcol)
        cash = _row(bs, CASH_ROWS, bcol)
        bs_shares = _row(bs, SHARES_ROWS, bcol)
        lt_invest = max(_row(bs, LT_INVEST_ROWS, bcol) or 0.0, 0.0)
    if total_debt is None:
        total_debt = info["total_debt"] or 0.0
        warnings.append("Total debt taken from quote summary, not balance sheet")
    if cash is None:
        cash = info["total_cash"] or 0.0

    shares = info["shares"] or bs_shares
    if info["shares"] is None and bs_shares:
        warnings.append("Shares outstanding taken from latest balance sheet")

    # Financials reported in a different currency than the listing (e.g. ADRs).
    # Convert statements into the trading currency so per-share values line up.
    fin_ccy, px_ccy = info["financial_currency"], info["currency"]
    if fin_ccy != px_ccy:
        rate = _fx_rate(fin_ccy, px_ccy)
        if rate:
            conv = lambda xs: [v * rate if v is not None else None for v in xs]  # noqa: E731
            revenue, ebit, da, capex, nwc_change = map(conv, (revenue, ebit, da, capex, nwc_change))
            total_debt, cash, lt_invest = total_debt * rate, cash * rate, lt_invest * rate
            interest = interest * rate if interest is not None else None
            warnings.append(f"Financials converted from {fin_ccy} to {px_ccy} at {rate:.4f}")
        else:
            warnings.append(f"Financials are in {fin_ccy} but price is in {px_ccy}; FX conversion failed")

    snap = FinancialsSnapshot(
        ticker=ticker,
        years=years,
        revenue=revenue,
        ebit=ebit,
        da=da,
        capex=capex,
        nwc_change=nwc_change,
        shares_outstanding=shares or 0.0,
        share_price=info["price"] or 0.0,
        total_debt=total_debt,
        cash=cash,
        long_term_investments=lt_invest,
        name=info["name"],
        currency=px_ccy,
        source="yfinance",
        beta=info["beta"],
        interest_expense=interest,
        tax_rate=tax_rate,
        sector=info["sector"],
        industry=info["industry"],
        warnings=warnings,
    )
    snap.validate()
    return snap


def fetch_revenue_estimates(ticker: str, years: list[int], revenue: list[Optional[float]], currency: str) -> list[dict]:
    """Consensus revenue growth for fiscal years after the last reported one.

    Yahoo labels estimates "0y"/"+1y" (current/next fiscal year) without saying which year
    that is, and "0y" lags a few weeks after a 10-K. So we anchor "0y" by matching its
    year-ago revenue to a reported year, then keep only years beyond the latest report.
    """
    try:
        est = yf.Ticker(ticker).revenue_estimate
    except Exception:
        return []
    if est is None or est.empty or "0y" not in est.index:
        return []
    rows = est.to_dict("index")
    cur = rows["0y"]
    fx = 1.0
    est_ccy = cur.get("currency") or currency
    if est_ccy != currency:
        fx = _fx_rate(est_ccy, currency) or 0.0
    ago = _clean(cur.get("yearAgoRevenue"))
    if not fx or not ago:
        return []
    anchor = next(
        (y for y, r in zip(years, revenue) if r and abs(ago * fx - r) / abs(r) < 0.03),
        None,
    )
    if anchor is None:
        return []
    out = []
    for offset, key in enumerate(("0y", "+1y"), start=1):
        row = rows.get(key) or {}
        avg, prev = _clean(row.get("avg")), _clean(row.get("yearAgoRevenue"))
        n = _clean(row.get("numberOfAnalysts")) or 0
        if not avg or not prev or prev <= 0 or n < 3:
            break
        year = anchor + offset
        if year > years[-1]:
            out.append({"year": year, "growth": avg / prev - 1, "analysts": int(n)})
    return out
