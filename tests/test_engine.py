import math

import pytest

from dcf.contract import FinancialsSnapshot
from dcf.engine import Assumptions, compute_wacc, default_assumptions, historical_stats, run_dcf


def snap(**overrides):
    base = dict(
        ticker="TEST",
        years=[2021, 2022, 2023, 2024],
        revenue=[100.0, 110.0, 121.0, 133.1],
        ebit=[20.0, 22.0, 24.2, 26.62],
        da=[5.0, 5.5, 6.05, 6.655],
        capex=[6.0, 6.6, 7.26, 7.986],
        nwc_change=[None, 1.0, 1.1, 1.21],
        shares_outstanding=10.0,
        share_price=50.0,
        total_debt=100.0,
        cash=20.0,
        beta=1.2,
        tax_rate=0.25,
        interest_expense=5.0,
    )
    base.update(overrides)
    return FinancialsSnapshot(**base)


def flat(**overrides):
    a = dict(
        revenue_growth=[0.10] * 5,
        ebit_margin=[0.20] * 5,
        tax_rate=0.25,
        da_pct_revenue=0.05,
        capex_pct_revenue=0.06,
        nwc_pct_revenue_change=0.10,
        risk_free_rate=0.04,
        beta=1.2,
        equity_risk_premium=0.05,
        pre_tax_cost_of_debt=0.05,
        terminal_growth=0.02,
    )
    a.update(overrides)
    return Assumptions(**a)


def test_historical_stats():
    h = historical_stats(snap())
    assert h["revenue_cagr"] == pytest.approx(0.10)
    assert h["ebit_margin_avg"] == pytest.approx(0.20)
    assert h["da_pct_revenue"] == pytest.approx(0.05)
    assert h["capex_pct_revenue"] == pytest.approx(0.06)
    assert h["nwc_pct_revenue_change"] == pytest.approx(0.10)


def test_defaults_come_from_history():
    a, notes = default_assumptions(snap(), risk_free_rate=0.04)
    assert a.revenue_growth == pytest.approx([0.10] * 5)
    assert a.ebit_margin == pytest.approx([0.20] * 5)
    assert a.pre_tax_cost_of_debt == pytest.approx(0.05)  # 5 / 100
    assert len(notes) == 1 and "historical CAGR" in notes[0]


def test_defaults_use_analyst_consensus_then_fade():
    est = [{"year": 2025, "growth": 0.12, "analysts": 20}, {"year": 2026, "growth": 0.08, "analysts": 18}]
    a, notes = default_assumptions(snap(analyst_revenue_growth=est), risk_free_rate=0.04)
    # 8% fades linearly to 2.5% terminal growth, reached the year after the projection ends.
    assert a.revenue_growth == pytest.approx([0.12, 0.08, 0.06625, 0.0525, 0.03875])
    assert any("consensus" in n for n in notes)


def test_consensus_ignored_unless_it_starts_after_last_reported_year():
    est = [{"year": 2024, "growth": 0.50, "analysts": 20}]  # 2024 is already reported
    a, _ = default_assumptions(snap(analyst_revenue_growth=est), risk_free_rate=0.04)
    assert a.revenue_growth == pytest.approx([0.10] * 5)


def test_long_term_investments_reduce_net_debt():
    base = run_dcf(snap(), flat())
    more = run_dcf(snap(long_term_investments=30.0), flat())
    assert more["net_debt"] == pytest.approx(base["net_debt"] - 30.0)
    assert more["implied_price"] == pytest.approx(base["implied_price"] + 3.0)  # 30 / 10 shares


def test_market_implied_round_trips():
    s, a = snap(), flat(wacc_override=0.09)  # pinned: the price otherwise moves WACC weights
    r = run_dcf(s, a)
    mi = r["market_implied"]
    # Pricing the stock at the model's own value should imply the model's own inputs.
    at_value = snap(share_price=r["implied_price"])
    mi2 = run_dcf(at_value, a)["market_implied"]
    assert mi2["wacc"] == pytest.approx(0.09, abs=1e-6)
    assert mi2["revenue_growth"] == pytest.approx(0.10, abs=1e-6)
    # And the implied inputs really do reproduce the market price.
    assert run_dcf(s, flat(wacc_override=mi["wacc"]))["implied_price"] == pytest.approx(50.0, rel=1e-6)
    assert run_dcf(s, flat(wacc_override=0.09, revenue_growth=[mi["revenue_growth"]] * 5))["implied_price"] == pytest.approx(50.0, rel=1e-6)


def test_defaults_clamp_and_fallback():
    a, notes = default_assumptions(snap(beta=None, tax_rate=-0.1, revenue=[10.0, 20.0, 40.0, 80.0]))
    assert a.revenue_growth[0] == 0.30  # 100% CAGR clamped
    assert a.beta == 1.0 and a.tax_rate == 0.21
    assert len(notes) >= 3


def test_wacc():
    w = compute_wacc(snap(), flat())
    ke = 0.04 + 1.2 * 0.05
    kd = 0.05 * 0.75
    we = 500 / 600
    assert w["cost_of_equity"] == pytest.approx(ke)
    assert w["wacc"] == pytest.approx(we * ke + (1 - we) * kd)
    assert compute_wacc(snap(), flat(wacc_override=0.09))["wacc"] == 0.09


def test_dcf_matches_hand_calculation():
    s, a = snap(), flat(wacc_override=0.10)
    out = run_dcf(s, a)
    prev, pv, fcf = 133.1, 0.0, 0.0
    for t in range(1, 6):
        rev = prev * 1.10
        fcf = rev * 0.20 * 0.75 + rev * 0.05 - rev * 0.06 - (rev - prev) * 0.10
        pv += fcf / 1.10**t
        prev = rev
    tv = fcf * 1.02 / (0.10 - 0.02)
    ev = pv + tv / 1.10**5
    assert out["enterprise_value"] == pytest.approx(ev)
    assert out["implied_price"] == pytest.approx((ev - 80) / 10)
    assert out["upside"] == pytest.approx(out["implied_price"] / 50 - 1)
    assert [r["year"] for r in out["projections"]] == [2025, 2026, 2027, 2028, 2029]


def test_mid_year_raises_value():
    s = snap()
    assert run_dcf(s, flat(mid_year=True))["implied_price"] > run_dcf(s, flat())["implied_price"]


def test_sensitivity_grid_center_matches_base_case():
    out = run_dcf(snap(), flat(wacc_override=0.10))
    sens = out["sensitivity"]
    assert len(sens["wacc"]) == 7 and len(sens["terminal_growth"]) == 5
    assert sens["implied_price"][3][2] == pytest.approx(out["implied_price"])
    # Higher WACC -> lower value; higher g -> higher value.
    assert sens["implied_price"][0][2] > sens["implied_price"][6][2]
    assert sens["implied_price"][3][0] < sens["implied_price"][3][4]


def test_sensitivity_blank_when_wacc_not_above_growth():
    sens = run_dcf(snap(), flat(wacc_override=0.03, terminal_growth=0.02))["sensitivity"]
    assert any(v is None for row in sens["implied_price"] for v in row)


def test_wacc_below_growth_rejected():
    with pytest.raises(ValueError):
        run_dcf(snap(), flat(wacc_override=0.02, terminal_growth=0.03))


def test_snapshot_roundtrip_and_validation():
    s = snap()
    assert FinancialsSnapshot.from_dict(s.to_dict()) == s
    with pytest.raises(ValueError):
        snap(years=[2022, 2021, 2023, 2024]).validate()
    with pytest.raises(ValueError):
        snap(share_price=0).validate()


def test_historical_fcf_handles_missing():
    out = run_dcf(snap(), flat())
    assert all(not math.isnan(r["fcf"]) for r in out["historical"] if r["fcf"] is not None)
