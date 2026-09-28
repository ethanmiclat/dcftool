# DCF Valuation Tool

Takes a ticker, pulls historical financials, projects unlevered free cash flow, and outputs a DCF valuation with a sensitivity grid and trading comps. Every assumption is live-editable.

**Stack:** React + Vite + Tailwind + Recharts (TypeScript) · Python/Flask · yfinance · SEC EDGAR XBRL · Vercel

## Run locally

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt pytest
npm install

npm run dev:api   # Flask API on :5050
npm run dev       # Vite on :5180, proxies /api to Flask
npm test          # engine + EDGAR parser unit tests
```

Open http://localhost:5180 or deep link: `/?t=AAPL&src=edgar`.

## Architecture

```
dcf/
  contract.py        FinancialsSnapshot: the seam between data sources and everything else
  sources/
    yahoo.py         yfinance -> FinancialsSnapshot (row-name fallback chains, FX conversion for ADRs)
    edgar.py         SEC companyfacts XBRL -> FinancialsSnapshot (tag fallback chains)
    __init__.py      source registry + 15-min cache
  engine.py          pure calc engine: defaults, WACC, projections, TV, EV bridge, sensitivity
  market.py          risk-free rate (^TNX), peer discovery, trading comps
api/index.py         Flask routes (Vercel serverless entrypoint)
src/                 React frontend
tests/               pytest: engine math vs hand calc; EDGAR parsing on synthetic payloads
```

### Phase 1: Data contract
Sources never pass raw DataFrames or XBRL downstream. They return a `FinancialsSnapshot` with fixed sign conventions (CapEx positive, `nwc_change` = increase in NWC) and a `warnings` list that explains every fallback. The frontend shows these warnings as "data notes."

### Phase 2: Calc engine
- Revenue growth and EBIT margin can be set per year. Growth defaults to analyst consensus (Yahoo) for the years it covers, fading linearly to terminal growth; without consensus it falls back to historical CAGR. Margin defaults to the historical average. Defaults are clamped to sane ranges, and every clamp is reported.
- The equity bridge subtracts debt and adds cash, short-term investments and long-term investments (non-current marketable securities).
- A reverse DCF reports the WACC, and the constant revenue growth, that would justify today's share price with every other input held fixed.
- UFCF = EBIT × (1 − t) + D&A − CapEx − ΔNWC. D&A and CapEx are modeled as % of revenue; ΔNWC as % of Δrevenue.
- WACC: CAPM cost of equity (live 10Y Treasury + beta × ERP), cost of debt = interest / total debt, weighted at market cap and total debt. A manual override is available.
- Terminal value uses Gordon growth. Mid-year convention is optional.
- Sensitivity: 7 × 5 grid of WACC × terminal growth.

The API is stateless. `/api/financials` returns the snapshot, defaults, and a first valuation. The client then POSTs the snapshot plus edited assumptions to `/api/valuation` (debounced) as sliders move.

### Phase 3: Frontend
Implied price vs current, EV bridge, assumption sliders, FCF chart (historical + projected), DCF build table, sensitivity heatmap (colored by upside vs current price), and an editable comps table (EV/EBITDA, P/E, forward P/E) with a multiples-implied price cross-check.

### Phase 4: SEC EDGAR source
Pick "SEC EDGAR" in the UI (or `source=edgar`). Nothing downstream changes.
- Ticker → CIK via `company_tickers.json`; `companyfacts` fetched with a declared User-Agent (set `SEC_USER_AGENT="Your Name you@example.com"`, as SEC requires).
- Fallback chains are merged **per fiscal year**, so a tag switch (e.g. `SalesRevenueNet` → `RevenueFromContractWithCustomerExcludingAssessedTax`) doesn't leave gaps.
- Periods are identified by start/end dates, not the filing's `fy` field. Only ~12-month durations count, and the latest filing wins, which handles restatements.
- Non-calendar and 52/53-week fiscal years (NVDA, AAPL, WMT) are handled.
- ΔNWC: aggregate tag if present → sum of cash-flow working-capital lines, with de-duplication of combined vs component tags → balance-sheet current accounts.
- Multi-class shares (GOOGL) are summed. ADRs (TSM) fall back to the quoted share count. IFRS filers are supported, with currency conversion. Stale balance-sheet tags (>200 days old) are ignored in favor of market data.
- Tested against AAPL, MSFT, NVDA, GOOGL, CAT, KO, WMT, F, TSM, PLTR, SHOP, CELH, JPM, BRK-B. EDGAR and Yahoo agree closely (e.g. AAPL FY2023–25 ΔNWC match exactly).

EDGAR has no market data, so price, beta, and sector still come from Yahoo.

## Known limitations
- For banks/insurers an unlevered DCF isn't meaningful. The app flags financial-sector tickers.
- Peers default to the largest companies in the same Yahoo industry (topped up from the sector). They're editable in the UI.
- Yahoo Finance sometimes rate-limits cloud IPs. If that happens on Vercel, the EDGAR source still supplies statements.

## Deploy (Vercel)
`vercel.json` builds the Vite app to `dist/` and serves `api/index.py` as a Python function, with `/api/*` rewritten to it. Run `vercel` from the repo root and set `SEC_USER_AGENT` in project env vars.

## Learn mode

Two pieces, both explaining the model in plain English with the loaded company's own numbers:

- **Walk me through it** (header, once a model is loaded): an 11-step guided tour that dims the page,
  spotlights the rows it is explaining and steps through the valuation in place.
- **Learn mode** switch (on by default, remembered per browser): every financial term, from section
  headings to input labels, line items and column headings, is underlined; click one for its definition.
  Switched off, the terms render as plain text.

Both are self-contained in `src/learn/` (`glossary.ts` holds every definition, `walkthrough.tsx` every
tour step). To remove them, delete that folder and the lines that import from `./learn` or `../learn`
(in `main.tsx`, `App.tsx`, and the `Summary`, `AssumptionsPanel`, `ProjectionTable`, `SensitivityTable`
and `CompsTable` components, unwrapping any `<Term>` back to its text), plus the `data-walk` attributes
that mark tour targets.
