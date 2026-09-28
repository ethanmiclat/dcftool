"""SEC EDGAR (XBRL companyfacts) data source -> FinancialsSnapshot.

Historical financials come straight from company filings. EDGAR has no market
data, so price, beta and sector are still taken from yfinance.

Notes on the XBRL data:
  - Companies change tags over time (e.g. SalesRevenueNet ->
    RevenueFromContractWithCustomerExcludingAssessedTax after ASC 606), so each
    line item has a fallback chain that is merged per fiscal year.
  - The same period is reported in several filings (comparatives, restatements).
    We keep the most recently filed value for each period.
  - `fy` on a fact is the fiscal year of the *filing*, not of the period, so
    periods are identified by their start/end dates instead.
"""
from __future__ import annotations

import os
import threading
from datetime import date
from typing import Optional

import requests

from ..contract import FinancialsSnapshot
from .yahoo import _fx_rate, fetch_info

USER_AGENT = os.environ.get("SEC_USER_AGENT", "DCFTool/1.0 dcftool@example.com")
TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"
FACTS_URL = "https://data.sec.gov/api/xbrl/companyfacts/CIK{cik:010d}.json"
MAX_YEARS = 5

# Fallback chains, most preferred first. IFRS tags cover 20-F/40-F filers.
REVENUE_TAGS = [
    "us-gaap:Revenues",
    "us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax",
    "us-gaap:RevenueFromContractWithCustomerIncludingAssessedTax",
    "us-gaap:SalesRevenueNet",
    "us-gaap:SalesRevenueGoodsNet",
    "us-gaap:SalesRevenueServicesNet",
    "us-gaap:RevenuesNetOfInterestExpense",
    "ifrs-full:Revenue",
    "ifrs-full:RevenueFromContractsWithCustomers",
]
EBIT_TAGS = ["us-gaap:OperatingIncomeLoss", "ifrs-full:ProfitLossFromOperatingActivities"]
PRETAX_TAGS = [
    "us-gaap:IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
    "us-gaap:IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments",
    "us-gaap:IncomeLossFromContinuingOperationsBeforeIncomeTaxesDomestic",
    "ifrs-full:ProfitLossBeforeTax",
]
TAX_TAGS = ["us-gaap:IncomeTaxExpenseBenefit", "ifrs-full:IncomeTaxExpenseContinuingOperations"]
INTEREST_TAGS = [
    "us-gaap:InterestExpense",
    "us-gaap:InterestExpenseNonoperating",
    "us-gaap:InterestExpenseDebt",
    "us-gaap:InterestPaidNet",
    "ifrs-full:InterestExpense",
    "ifrs-full:FinanceCosts",
]
DA_TAGS = [
    "us-gaap:DepreciationDepletionAndAmortization",
    "us-gaap:DepreciationAmortizationAndAccretionNet",
    "us-gaap:DepreciationAndAmortization",
    "us-gaap:Depreciation",
    "ifrs-full:DepreciationAndAmortisationExpense",
    "ifrs-full:DepreciationAmortisationAndImpairmentLossReversalOfImpairmentLossRecognisedInProfitOrLoss",
]
CAPEX_TAGS = [
    "us-gaap:PaymentsToAcquirePropertyPlantAndEquipment",
    "us-gaap:PaymentsToAcquireProductiveAssets",
    "us-gaap:PaymentsForCapitalImprovements",
    "us-gaap:PaymentsToAcquireOtherPropertyPlantAndEquipment",
    "ifrs-full:PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities",
    "ifrs-full:PurchaseOfPropertyPlantAndEquipment",
]
NWC_FLOW_TAGS = ["us-gaap:IncreaseDecreaseInOperatingCapital"]  # positive = NWC increased
CURRENT_ASSETS_TAGS = ["us-gaap:AssetsCurrent", "ifrs-full:CurrentAssets"]
CURRENT_LIABS_TAGS = ["us-gaap:LiabilitiesCurrent", "ifrs-full:CurrentLiabilities"]
CASH_TAGS = [
    "us-gaap:CashAndCashEquivalentsAtCarryingValue",
    "us-gaap:CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents",
    "us-gaap:Cash",
    "ifrs-full:CashAndCashEquivalents",
]
ST_INVEST_TAGS = [
    "us-gaap:ShortTermInvestments",
    "us-gaap:MarketableSecuritiesCurrent",
    "us-gaap:AvailableForSaleSecuritiesDebtSecuritiesCurrent",
    "ifrs-full:CurrentInvestments",
]
LT_INVEST_TAGS = [
    "us-gaap:MarketableSecuritiesNoncurrent",
    "us-gaap:AvailableForSaleSecuritiesDebtSecuritiesNoncurrent",
]
LT_DEBT_TOTAL_TAGS = ["us-gaap:LongTermDebt", "us-gaap:DebtLongtermAndShorttermCombinedAmount"]
LT_DEBT_NONCURRENT_TAGS = ["us-gaap:LongTermDebtNoncurrent", "us-gaap:LongTermDebtAndCapitalLeaseObligations"]
DEBT_CURRENT_TAGS = [
    "us-gaap:LongTermDebtCurrent",
    "us-gaap:LongTermDebtAndCapitalLeaseObligationsCurrent",
    "us-gaap:DebtCurrent",
]
ST_BORROW_TAGS = ["us-gaap:ShortTermBorrowings", "us-gaap:CommercialPaper"]
IFRS_DEBT_TAGS = ["ifrs-full:Borrowings"]
# Used (summed) when a filer has no aggregate borrowings tag.
IFRS_DEBT_COMPONENT_TAGS = [
    "ifrs-full:ShorttermBorrowings",
    "ifrs-full:CurrentPortionOfLongtermBorrowings",
    "ifrs-full:LongtermBorrowings",
    "ifrs-full:CurrentBondsIssuedAndCurrentPortionOfNoncurrentBondsIssued",
    "ifrs-full:NoncurrentPortionOfNoncurrentBondsIssued",
]
# D&A reported as separate depreciation and amortisation lines.
DA_COMPONENT_TAGS = [
    ("us-gaap:Depreciation", "us-gaap:AmortizationOfIntangibleAssets"),
    ("ifrs-full:DepreciationExpense", "ifrs-full:AmortisationExpense"),
]
SHARES_TAGS = ["dei:EntityCommonStockSharesOutstanding", "us-gaap:CommonStockSharesOutstanding"]

_session = requests.Session()
_session.headers.update({"User-Agent": USER_AGENT, "Accept-Encoding": "gzip, deflate"})
_cik_map: dict[str, int] = {}
_cik_lock = threading.Lock()


# ---------------------------------------------------------------- fetching

def lookup_cik(ticker: str) -> int:
    ticker = ticker.upper().strip()
    with _cik_lock:
        if not _cik_map:
            resp = _session.get(TICKERS_URL, timeout=20)
            resp.raise_for_status()
            for row in resp.json().values():
                _cik_map[row["ticker"].upper()] = int(row["cik_str"])
    for candidate in (ticker, ticker.replace(".", "-"), ticker.replace("-", ".")):
        if candidate in _cik_map:
            return _cik_map[candidate]
    raise LookupError(f"{ticker} not found in SEC ticker list (EDGAR only covers SEC filers)")


def fetch_companyfacts(cik: int) -> dict:
    resp = _session.get(FACTS_URL.format(cik=cik), timeout=30)
    if resp.status_code == 404:
        raise LookupError(f"No XBRL financial data on EDGAR for CIK {cik}")
    resp.raise_for_status()
    return resp.json()


# ---------------------------------------------------------------- parsing

def _d(s: str) -> date:
    return date.fromisoformat(s)


def fiscal_year(end: date) -> int:
    """Label a fiscal period by the calendar year it ends in.

    52/53-week years that end in the first days of January belong to the prior year
    (e.g. a year ending 2022-01-01 is FY2021).
    """
    return end.year - 1 if end.month == 1 and end.day <= 7 else end.year


class Facts:
    """Thin accessor over a companyfacts payload, pinned to one currency unit."""

    def __init__(self, payload: dict):
        self.payload = payload
        self.name = payload.get("entityName", "")
        self.currency = self._pick_currency()

    def _pick_currency(self) -> str:
        # The reporting currency is the unit with the most revenue facts. Foreign filers
        # often add a USD "convenience translation" for the latest year only; ignore it.
        counts: dict[str, int] = {}
        for tag in REVENUE_TAGS:
            for unit, rows in self._units(tag).items():
                counts[unit] = counts.get(unit, 0) + len(rows)
        return max(counts, key=counts.get) if counts else "USD"

    def _units(self, tag: str) -> dict:
        ns, name = tag.split(":")
        return self.payload.get("facts", {}).get(ns, {}).get(name, {}).get("units", {})

    def _facts(self, tag: str, unit: Optional[str] = None) -> list[dict]:
        return self._units(tag).get(unit or self.currency, [])

    def annual(self, tag: str) -> dict[int, float]:
        """Full-year duration values keyed by fiscal year; latest filing wins."""
        best: dict[int, tuple[str, float]] = {}
        for f in self._facts(tag):
            if "start" not in f:
                continue
            days = (_d(f["end"]) - _d(f["start"])).days
            if not 350 <= days <= 380:
                continue
            fy = fiscal_year(_d(f["end"]))
            if fy not in best or f["filed"] > best[fy][0]:
                best[fy] = (f["filed"], float(f["val"]))
        return {y: v for y, (_, v) in best.items()}

    def instants(self, tag: str, unit: Optional[str] = None) -> dict[date, float]:
        """Point-in-time values keyed by date; latest filing wins."""
        best: dict[date, tuple[str, float]] = {}
        for f in self._facts(tag, unit):
            if "start" in f:
                continue
            end = _d(f["end"])
            if end not in best or f["filed"] > best[end][0]:
                best[end] = (f["filed"], float(f["val"]))
        return {d: v for d, (_, v) in best.items()}

    def annual_chain(self, tags: list[str]) -> dict[int, float]:
        """Merge a fallback chain per year: earlier tags win, later tags fill gaps."""
        out: dict[int, float] = {}
        for tag in tags:
            for y, v in self.annual(tag).items():
                out.setdefault(y, v)
        return out

    def instant_chain(self, tags: list[str], unit: Optional[str] = None) -> dict[date, float]:
        out: dict[date, float] = {}
        for tag in tags:
            for d, v in self.instants(tag, unit).items():
                out.setdefault(d, v)
        return out

    def fy_end_instants(self, tags: list[str]) -> dict[int, float]:
        """Instant values at fiscal-year ends, keyed by fiscal year."""
        out: dict[int, float] = {}
        for d, v in sorted(self.instant_chain(tags).items()):
            out[fiscal_year(d)] = v  # later dates in the same FY overwrite (the FY-end one)
        return out


def _latest(values: dict[date, float]) -> tuple[Optional[date], Optional[float]]:
    if not values:
        return None, None
    d = max(values)
    return d, values[d]


def _at(values: dict[date, float], when: date) -> float:
    return values.get(when, 0.0)


STALE_DAYS = 200  # balance-sheet tags older than this vs. the latest balance sheet are ignored


def balance_sheet_date(facts: Facts) -> Optional[date]:
    return _latest(facts.instant_chain(["us-gaap:Assets", "ifrs-full:Assets"]))[0]


def _fresh(values: dict[date, float], ref: Optional[date]) -> dict[date, float]:
    if ref is None:
        return values
    return {d: v for d, v in values.items() if (ref - d).days <= STALE_DAYS}


def latest_debt(facts: Facts) -> tuple[Optional[float], str]:
    """Total debt at the latest balance sheet. Returns (None, reason) if no current tag exists."""
    ref = balance_sheet_date(facts)
    total = _fresh(facts.instant_chain(LT_DEBT_TOTAL_TAGS), ref)
    noncur = _fresh(facts.instant_chain(LT_DEBT_NONCURRENT_TAGS), ref)
    cur = facts.instant_chain(DEBT_CURRENT_TAGS)
    st = {t: facts.instants(t) for t in ST_BORROW_TAGS}
    ifrs = _fresh(facts.instant_chain(IFRS_DEBT_TAGS), ref)

    candidates = [d for d in (_latest(total)[0], _latest(noncur)[0], _latest(ifrs)[0]) if d]
    if not candidates:
        parts = {t: _fresh(facts.instants(t), ref) for t in IFRS_DEBT_COMPONENT_TAGS}
        dates = [d for v in parts.values() for d in v]
        if dates:
            when = max(dates)
            return sum(_at(v, when) for v in parts.values()), f"summed from IFRS borrowings/bonds as of {when}"
        return None, "no current debt tags in XBRL"
    when = max(candidates)
    if when in ifrs and when not in total and when not in noncur:
        return ifrs[when], f"from ifrs-full:Borrowings as of {when}"
    # LongTermDebt includes the current portion; LongTermDebtNoncurrent does not.
    base = total[when] if when in total else _at(noncur, when) + _at(cur, when)
    short = sum(_at(v, when) for v in st.values())
    return base + short, f"as of {when.isoformat()}"


def latest_cash(facts: Facts) -> Optional[float]:
    when, cash = _latest(_fresh(facts.instant_chain(CASH_TAGS), balance_sheet_date(facts)))
    if when is None:
        return None
    return cash + _at(facts.instant_chain(ST_INVEST_TAGS), when)


def latest_lt_investments(facts: Facts) -> float:
    """Non-current marketable securities at the latest balance sheet (0 if not reported)."""
    return _latest(_fresh(facts.instant_chain(LT_INVEST_TAGS), balance_sheet_date(facts)))[1] or 0.0


def latest_shares(facts: Facts) -> Optional[float]:
    """Shares outstanding from the cover page, summing share classes (e.g. GOOGL A/B/C)."""
    for tag in SHARES_TAGS:
        rows = facts._facts(tag, "shares")
        if not rows:
            continue
        latest_end = max(r["end"] for r in rows)
        latest_rows = [r for r in rows if r["end"] == latest_end]
        latest_filed = max(r["filed"] for r in latest_rows)
        return float(sum(r["val"] for r in latest_rows if r["filed"] == latest_filed))
    return None


# Operating working-capital lines on the cash-flow statement: (tag, sign, concepts covered).
# XBRL reports "IncreaseDecreaseIn<X>" as the change in the balance itself, so asset increases
# raise NWC (+1) and liability increases lower it (-1). Combined tags come before their parts;
# a tag is only used if none of its concepts are already covered that year (no double counting).
NWC_COMPONENTS = [
    ("IncreaseDecreaseInAccountsPayableAndAccruedLiabilities", -1, {"ap", "accrued"}),
    ("IncreaseDecreaseInAccruedLiabilitiesAndOtherOperatingLiabilities", -1, {"accrued", "ol"}),
    ("IncreaseDecreaseInAccountsAndOtherReceivables", 1, {"ar", "or"}),
    ("IncreaseDecreaseInReceivables", 1, {"ar", "or"}),
    ("IncreaseDecreaseInAccountsAndNotesReceivable", 1, {"ar"}),
    ("IncreaseDecreaseInAccountsReceivable", 1, {"ar"}),
    ("IncreaseDecreaseInOtherReceivables", 1, {"or"}),
    ("IncreaseDecreaseInInventories", 1, {"inv"}),
    ("IncreaseDecreaseInRetailRelatedInventories", 1, {"inv"}),
    ("IncreaseDecreaseInPrepaidDeferredExpenseAndOtherAssets", 1, {"prepaid", "oa"}),
    ("IncreaseDecreaseInPrepaidExpense", 1, {"prepaid"}),
    ("IncreaseDecreaseInPrepaidExpensesOther", 1, {"prepaid"}),
    ("IncreaseDecreaseInOtherOperatingAssets", 1, {"oa"}),
    ("IncreaseDecreaseInOtherCurrentAssets", 1, {"oa"}),
    ("IncreaseDecreaseInContractWithCustomerAsset", 1, {"contract_asset"}),
    ("IncreaseDecreaseInAccountsPayable", -1, {"ap"}),
    ("IncreaseDecreaseInAccountsPayableTrade", -1, {"ap"}),
    ("IncreaseDecreaseInAccruedLiabilities", -1, {"accrued"}),
    ("IncreaseDecreaseInEmployeeRelatedLiabilities", -1, {"employee"}),
    ("IncreaseDecreaseInOtherOperatingLiabilities", -1, {"ol"}),
    ("IncreaseDecreaseInOtherCurrentLiabilities", -1, {"ol"}),
    ("IncreaseDecreaseInContractWithCustomerLiability", -1, {"deferred_rev"}),
    ("IncreaseDecreaseInDeferredRevenue", -1, {"deferred_rev"}),
    ("IncreaseDecreaseInAccruedIncomeTaxesPayable", -1, {"tax"}),
    ("IncreaseDecreaseInAccruedTaxesPayable", -1, {"tax"}),
    ("IncreaseDecreaseInIncomeTaxesPayable", -1, {"tax"}),
]
CORE_NWC_CONCEPTS = {"ar", "inv", "ap"}


def _nwc_from_components(facts: Facts) -> dict[int, float]:
    series = [(facts.annual("us-gaap:" + tag), sign, concepts) for tag, sign, concepts in NWC_COMPONENTS]
    years = {y for values, _, _ in series for y in values}
    out: dict[int, float] = {}
    for y in years:
        covered: set[str] = set()
        total = 0.0
        for values, sign, concepts in series:
            if y in values and not (concepts & covered):
                total += sign * values[y]
                covered |= concepts
        if covered & CORE_NWC_CONCEPTS:
            out[y] = total
    return out


def nwc_changes(facts: Facts, years: list[int]) -> tuple[dict[int, float], str]:
    """Change in operating NWC per fiscal year, and which method produced it.

    Order: aggregate cash-flow tag -> sum of cash-flow working-capital lines ->
    balance sheet: (current assets - cash - ST investments) - (current liabilities - current debt).
    """
    flow = facts.annual_chain(NWC_FLOW_TAGS)
    components = _nwc_from_components(facts)
    ca = facts.fy_end_instants(CURRENT_ASSETS_TAGS)
    cl = facts.fy_end_instants(CURRENT_LIABS_TAGS)
    cash = facts.fy_end_instants(CASH_TAGS)
    sti = facts.fy_end_instants(ST_INVEST_TAGS)
    debt_cur = facts.fy_end_instants(DEBT_CURRENT_TAGS + ST_BORROW_TAGS)

    def nwc(y: int) -> Optional[float]:
        if y not in ca or y not in cl:
            return None
        return (ca[y] - cash.get(y, 0.0) - sti.get(y, 0.0)) - (cl[y] - debt_cur.get(y, 0.0))

    out: dict[int, float] = {}
    methods: set[str] = set()
    for y in years:
        if y in flow:
            out[y] = flow[y]
            methods.add("aggregate cash-flow tag")
        elif y in components:
            out[y] = components[y]
            methods.add("cash-flow working-capital lines")
        elif (cur := nwc(y)) is not None and (prev := nwc(y - 1)) is not None:
            out[y] = cur - prev
            methods.add("balance-sheet current accounts")
    return out, ", ".join(sorted(methods))


def snapshot_from_facts(ticker: str, payload: dict, info: dict) -> FinancialsSnapshot:
    facts = Facts(payload)
    warnings: list[str] = []

    revenue = facts.annual_chain(REVENUE_TAGS)
    if not revenue:
        raise LookupError(f"{ticker}: no annual revenue found in XBRL filings")
    years = sorted(revenue)[-MAX_YEARS:]
    # Drop leading years that are far older than the rest (sparse early tags).
    while len(years) > 2 and years[1] - years[0] > 1:
        years = years[1:]

    ebit = facts.annual_chain(EBIT_TAGS)
    pretax = facts.annual_chain(PRETAX_TAGS)
    interest = facts.annual_chain(INTEREST_TAGS)
    derived = [y for y in years if y not in ebit and y in pretax]
    for y in derived:
        ebit[y] = pretax[y] + abs(interest.get(y, 0.0))
    if derived:
        warnings.append(f"No operating income tag; EBIT derived as pre-tax income + interest for {', '.join(map(str, derived))}")

    da = facts.annual_chain(DA_TAGS)
    for dep_tag, amort_tag in DA_COMPONENT_TAGS:
        dep, amort = facts.annual(dep_tag), facts.annual(amort_tag)
        for y in years:
            if y not in da and y in dep:
                da[y] = dep[y] + amort.get(y, 0.0)
    capex = {y: abs(v) for y, v in facts.annual_chain(CAPEX_TAGS).items()}
    nwc, nwc_method = nwc_changes(facts, years)
    if nwc_method:
        warnings.append(f"Change in NWC from {nwc_method}")
    tax = facts.annual_chain(TAX_TAGS)

    def aligned(series: dict[int, float]) -> list[Optional[float]]:
        return [series.get(y) for y in years]

    series = {
        "revenue": aligned(revenue),
        "ebit": aligned(ebit),
        "da": aligned(da),
        "capex": aligned(capex),
        "nwc_change": aligned(nwc),
    }
    for label, key in (("EBIT", "ebit"), ("D&A", "da"), ("CapEx", "capex"), ("change in NWC", "nwc_change")):
        missing = [y for y, v in zip(years, series[key]) if v is None]
        if missing:
            warnings.append(f"{label} not found in XBRL for {', '.join(map(str, missing))}")

    latest = years[-1]
    tax_rate = None
    if latest in tax and pretax.get(latest):
        tax_rate = tax[latest] / pretax[latest]
    interest_exp = abs(interest[latest]) if latest in interest else None

    total_debt, debt_note = latest_debt(facts)
    if total_debt is None:
        total_debt = info.get("total_debt") or 0.0
        warnings.append(f"Total debt: {debt_note}; using market data ({total_debt / 1e9:.1f}B)")
    else:
        warnings.append(f"Total debt {debt_note}")
    cash = latest_cash(facts)
    if cash is None:
        cash = info.get("total_cash") or 0.0
        warnings.append("Cash: no current XBRL value; using market data")
    lt_invest = max(latest_lt_investments(facts), 0.0)
    shares = latest_shares(facts)
    if shares is None:
        shares = info.get("shares")
        warnings.append("Shares outstanding not on EDGAR cover page; using market data")
    elif info.get("shares") and not 0.67 < shares / info["shares"] < 1.5:
        # ADRs: filings count ordinary shares, but the quoted price is per ADR.
        warnings.append(
            f"EDGAR shares ({shares / 1e9:.2f}B) differ from quoted shares "
            f"({info['shares'] / 1e9:.2f}B), likely an ADR ratio or share-class structure; using quoted shares"
        )
        shares = info["shares"]

    # Statements may be in a different currency to the listing (foreign filers).
    if facts.currency != info["currency"]:
        rate = _fx_rate(facts.currency, info["currency"])
        if not rate:
            raise LookupError(f"Cannot convert {facts.currency} financials to {info['currency']}")
        for key in series:
            series[key] = [v * rate if v is not None else None for v in series[key]]
        total_debt, cash, lt_invest = total_debt * rate, cash * rate, lt_invest * rate
        interest_exp = interest_exp * rate if interest_exp is not None else None
        warnings.append(f"Financials converted from {facts.currency} to {info['currency']} at {rate:.4f}")

    warnings.append("Share price, beta and sector from market data (not available on EDGAR)")

    snap = FinancialsSnapshot(
        ticker=ticker,
        years=years,
        **series,
        shares_outstanding=shares or 0.0,
        share_price=info.get("price") or 0.0,
        total_debt=total_debt,
        cash=cash,
        long_term_investments=lt_invest,
        name=info.get("name") or facts.name or ticker,  # EDGAR entity names are all caps
        currency=info["currency"],
        source="edgar",
        beta=info.get("beta"),
        interest_expense=interest_exp,
        tax_rate=tax_rate,
        sector=info.get("sector"),
        industry=info.get("industry"),
        warnings=warnings,
    )
    snap.validate()
    return snap


def fetch_edgar(ticker: str) -> FinancialsSnapshot:
    ticker = ticker.upper().strip()
    cik = lookup_cik(ticker)
    payload = fetch_companyfacts(cik)
    return snapshot_from_facts(ticker, payload, fetch_info(ticker))
