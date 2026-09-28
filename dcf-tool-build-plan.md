# DCF Valuation Tool — Build Plan

## Overview
A web app that takes a stock ticker, pulls historical financials, projects free cash flow, and outputs a DCF valuation with a comps table and sensitivity analysis. Built to demonstrate finance + engineering skill together for an IB/finance-track resume.

**Stack:** React/Vite/Tailwind frontend, Python/Flask backend, deployed to Vercel.

## Phase 1 — Data Layer (yfinance)

Goal: get clean historical financials into a normalized shape, decoupled from where they come from.

- Install `yfinance`
- Pull `income_stmt`, `balance_sheet`, `cashflow` for a given ticker
- Extract and normalize the following fields into a defined contract (see below):
  - Revenue (historical, 3–5 years)
  - EBIT / Operating income
  - D&A
  - CapEx
  - Change in net working capital
  - Shares outstanding
  - Current share price
  - Total debt, cash (for WACC / enterprise value bridge)

### Data contract (define explicitly, don't pass raw yfinance output downstream)
A dataclass / TypedDict, e.g.:
```
FinancialsSnapshot:
  ticker: str
  years: list[int]
  revenue: list[float]
  ebit: list[float]
  da: list[float]
  capex: list[float]
  nwc_change: list[float]
  shares_outstanding: float
  share_price: float
  total_debt: float
  cash: float
```
This is the seam that lets Phase 4 (EDGAR swap) happen without touching anything downstream.

## Phase 2 — Calc Engine

- Revenue projection (user-adjustable growth rate assumptions per year, default to historical CAGR)
- Margin assumptions (EBIT margin, user-adjustable, default to historical average)
- Unlevered FCF build: EBIT × (1 - tax rate) + D&A - CapEx - ΔNWC
- WACC calculation (or user-input override): cost of equity via CAPM (risk-free rate + beta × equity risk premium), cost of debt, weighted by capital structure
- Terminal value (Gordon growth method)
- Discount FCF + terminal value back to present → implied enterprise value → implied share price
- Sensitivity grid: implied share price across a WACC × terminal growth rate matrix

## Phase 3 — Frontend

- Ticker input
- Assumption sliders: revenue growth, EBIT margin, WACC, terminal growth rate
- Output: implied share price vs. current price, upside/downside %
- Sensitivity table (heatmap style)
- Comps table: pull 3–5 peer tickers, show EV/EBITDA and P/E vs. subject company
- Chart: historical + projected FCF

## Phase 4 — EDGAR Swap (later, contained)

- Ticker → CIK lookup (SEC-published mapping file)
- Pull `companyfacts` JSON per company (requires proper User-Agent header)
- Build tag-normalization fallback chains per line item (e.g. `Revenues` → `RevenueFromContractWithCustomerExcludingAssessedTax` → `SalesRevenueNet`)
- Test against a diverse set of tickers (tech, industrial, financial, small-cap) to catch tag variations and edge cases (restatements, non-calendar fiscal years, sparse early-year tags)
- Swap into the same `FinancialsSnapshot` contract — nothing downstream changes

## Resume framing (for later writeup)
- Automated DCF valuation tool with dynamic assumption modeling and peer comps
- Data layer migrated from third-party aggregator (yfinance) to direct SEC XBRL parsing for reliability
- Built full data pipeline, valuation engine, and interactive frontend independently
