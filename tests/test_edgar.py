"""EDGAR parsing against synthetic companyfacts payloads (no network)."""
from datetime import date

import pytest

from dcf.sources.edgar import Facts, fiscal_year, latest_debt, latest_shares, nwc_changes, snapshot_from_facts


def fact(start, end, val, filed):
    row = {"end": end, "val": val, "filed": filed}
    if start:
        row["start"] = start
    return row


def payload(**tags):
    facts = {}
    for key, rows in tags.items():
        ns, name = key.split("__")
        unit = "shares" if "Shares" in name else "USD"
        facts.setdefault(ns.replace("_", "-"), {})[name] = {"units": {unit: rows}}
    return {"entityName": "Test Co", "facts": facts}


def annual(values):
    return [fact(f"{y - 1}-01-01", f"{y - 1}-12-31", v, f"{y}-02-15") for y, v in values.items()]


INFO = {"price": 10.0, "shares": 100.0, "currency": "USD", "beta": 1.1, "name": "Test", "sector": "Industrials"}


def test_fiscal_year_labels():
    assert fiscal_year(date(2024, 9, 28)) == 2024
    assert fiscal_year(date(2022, 1, 1)) == 2021  # 52/53-week year
    assert fiscal_year(date(2025, 1, 26)) == 2025  # NVDA-style January year end


def test_tag_fallback_chain_merges_per_year():
    # Company switched from SalesRevenueNet to the ASC 606 tag in 2019.
    p = payload(
        us_gaap__SalesRevenueNet=annual({2018: 90, 2019: 95}),
        us_gaap__RevenueFromContractWithCustomerExcludingAssessedTax=annual({2019: 100, 2020: 110}),
    )
    rev = Facts(p).annual_chain(
        ["us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax", "us-gaap:SalesRevenueNet"]
    )
    assert rev == {2017: 90, 2018: 100, 2019: 110}


def test_restatement_latest_filing_wins_and_quarters_ignored():
    rows = [
        fact("2023-01-01", "2023-12-31", 100, "2024-02-01"),
        fact("2023-01-01", "2023-12-31", 105, "2025-02-01"),  # restated in next 10-K
        fact("2023-10-01", "2023-12-31", 30, "2024-02-01"),  # quarter, ignored
    ]
    assert Facts(payload(us_gaap__Revenues=rows)).annual("us-gaap:Revenues") == {2023: 105}


def test_nwc_components_no_double_counting():
    p = payload(
        us_gaap__IncreaseDecreaseInAccountsPayableAndAccruedLiabilities=annual({2024: 10}),
        us_gaap__IncreaseDecreaseInAccountsPayable=annual({2024: 7}),  # part of the combined tag
        us_gaap__IncreaseDecreaseInAccountsReceivable=annual({2024: 4}),
        us_gaap__IncreaseDecreaseInInventories=annual({2024: 3}),
    )
    out, method = nwc_changes(Facts(p), [2023])
    assert out == {2023: 4 + 3 - 10}
    assert "cash-flow" in method


def test_multi_class_shares_summed():
    rows = [
        {"end": "2025-01-20", "val": 5, "filed": "2025-02-01"},
        {"end": "2025-01-20", "val": 7, "filed": "2025-02-01"},
        {"end": "2024-01-20", "val": 99, "filed": "2024-02-01"},
    ]
    assert latest_shares(Facts(payload(dei__EntityCommonStockSharesOutstanding=rows))) == 12


def test_stale_debt_tag_ignored():
    p = payload(
        us_gaap__Assets=[{"end": "2025-12-31", "val": 1000, "filed": "2026-02-01"}],
        us_gaap__LongTermDebt=[{"end": "2019-12-31", "val": 50, "filed": "2020-02-01"}],
    )
    debt, note = latest_debt(Facts(p))
    assert debt is None and "no current" in note


def test_snapshot_from_facts_end_to_end():
    years = {2022: 100, 2023: 110, 2024: 121}
    p = payload(
        us_gaap__Revenues=annual(years),
        us_gaap__OperatingIncomeLoss=annual({y: v * 0.2 for y, v in years.items()}),
        us_gaap__DepreciationDepletionAndAmortization=annual({y: 5 for y in years}),
        us_gaap__PaymentsToAcquirePropertyPlantAndEquipment=annual({y: 6 for y in years}),
        us_gaap__IncreaseDecreaseInOperatingCapital=annual({y: 1 for y in years}),
        us_gaap__Assets=[{"end": "2023-12-31", "val": 500, "filed": "2024-02-01"}],
        us_gaap__LongTermDebt=[{"end": "2023-12-31", "val": 40, "filed": "2024-02-01"}],
        us_gaap__CashAndCashEquivalentsAtCarryingValue=[{"end": "2023-12-31", "val": 15, "filed": "2024-02-01"}],
        dei__EntityCommonStockSharesOutstanding=[{"end": "2024-01-15", "val": 100, "filed": "2024-02-01"}],
    )
    s = snapshot_from_facts("TST", p, INFO)
    assert s.years == [2021, 2022, 2023]
    assert s.revenue == [100, 110, 121]
    assert s.ebit == pytest.approx([20, 22, 24.2])
    assert s.total_debt == 40 and s.cash == 15 and s.shares_outstanding == 100
    assert s.source == "edgar"
