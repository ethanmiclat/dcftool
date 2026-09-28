// Mirrors dcf/contract.py and dcf/engine.py. Rates are decimals.

export type Num = number | null;

export interface Snapshot {
  ticker: string;
  years: number[];
  revenue: Num[];
  ebit: Num[];
  da: Num[];
  capex: Num[];
  nwc_change: Num[];
  shares_outstanding: number;
  share_price: number;
  total_debt: number;
  cash: number;
  name: string;
  currency: string;
  source: string;
  beta: Num;
  interest_expense: Num;
  tax_rate: Num;
  sector: string | null;
  industry: string | null;
  long_term_investments?: number;
  analyst_revenue_growth?: { year: number; growth: number; analysts: number }[];
  warnings: string[];
}

export interface Assumptions {
  revenue_growth: number[];
  ebit_margin: number[];
  tax_rate: number;
  da_pct_revenue: number;
  capex_pct_revenue: number;
  nwc_pct_revenue_change: number;
  risk_free_rate: number;
  beta: number;
  equity_risk_premium: number;
  pre_tax_cost_of_debt: number;
  terminal_growth: number;
  wacc_override: number | null;
  mid_year: boolean;
}

export interface ProjectionRow {
  year: number;
  revenue: number;
  growth: number;
  ebit: number;
  ebit_margin: number;
  nopat: number;
  da: number;
  capex: number;
  nwc_change: number;
  fcf: number;
  discount_factor: number;
  pv_fcf: number;
}

export interface HistoricalRow {
  year: number;
  revenue: Num;
  ebit: Num;
  da: Num;
  capex: Num;
  nwc_change: Num;
  fcf: Num;
}

export interface Wacc {
  cost_of_equity: number;
  pre_tax_cost_of_debt: number;
  after_tax_cost_of_debt: number;
  market_cap: number;
  debt: number;
  equity_weight: number;
  debt_weight: number;
  computed_wacc: number;
  wacc: number;
  overridden: boolean;
}

export interface Valuation {
  ticker: string;
  currency: string;
  current_price: number;
  upside: Num;
  wacc: Wacc;
  projections: ProjectionRow[];
  historical: HistoricalRow[];
  sensitivity: { wacc: number[]; terminal_growth: number[]; implied_price: Num[][] };
  sum_pv_fcf: number;
  terminal_value: number;
  pv_terminal_value: number;
  enterprise_value: number;
  net_debt: number;
  equity_value: number;
  implied_price: number;
  tv_pct_of_ev: Num;
  long_term_investments: number;
  /** Reverse DCF: inputs that would justify today's price, all else equal. */
  market_implied: { wacc: Num; revenue_growth: Num };
}

export interface HistoricalStats {
  revenue_cagr: Num;
  ebit_margin_avg: Num;
  da_pct_revenue: Num;
  capex_pct_revenue: Num;
  nwc_pct_revenue_change: Num;
}

export interface FinancialsResponse {
  snapshot: Snapshot;
  assumptions: Assumptions;
  historical: HistoricalStats;
  notes: string[];
  risk_free_source: string;
  valuation: Valuation;
}

export interface CompRow {
  ticker: string;
  name: string;
  price: Num;
  currency: string | null;
  market_cap: Num;
  enterprise_value: Num;
  ebitda: Num;
  ev_ebitda: Num;
  pe: Num;
  forward_pe: Num;
  revenue_growth: Num;
  ebitda_margin: Num;
  mixed_currency: boolean;
  ok: boolean;
}

export interface CompsResponse {
  subject: CompRow;
  peers: CompRow[];
  median: Record<"ev_ebitda" | "pe" | "forward_pe" | "revenue_growth" | "ebitda_margin", Num>;
  implied_price: { ev_ebitda?: Num; pe?: Num };
  missing: string[];
}

export type Source = "yfinance" | "edgar";
