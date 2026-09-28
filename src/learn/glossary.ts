// Plain-English definitions for learn mode. `move` says which way the valuation goes.

export interface Entry {
  title: string;
  what: string;
  why?: string;
  move?: string;
}

export const GLOSSARY = {
  // ---- The method
  dcf: {
    title: "Discounted cash flow (DCF)",
    what: "A way to value a company from the cash it is expected to produce. Forecast the cash for a few years, add a lump sum for everything after that, then translate it all into today’s money.",
    why: "It values the business on what it earns rather than on what other investors happen to be paying for it today.",
  },
  unlevered: {
    title: "Unlevered",
    what: "Before the effect of debt. Unlevered cash flow is what the operations produce for everyone who funded the company, lenders and shareholders alike.",
    why: "Debt is handled separately, in the WACC and in the bridge from enterprise value to equity value, so it is not double-counted.",
  },
  cross_check: {
    title: "Valuation cross-check",
    what: "The same company priced four ways: this DCF, the peer median EV/EBITDA, the peer median P/E, and the market.",
    why: "Two methods that disagree wildly are a signal to revisit the assumptions, not to trust whichever number you prefer.",
  },

  // ---- Headline numbers
  implied_value: {
    title: "Implied value per share",
    what: "What this model thinks one share is worth today, based on the cash the business is expected to generate. It is the end result of every step on the page.",
    why: "Comparing it with the market price is the point of a DCF: is the stock cheap or expensive given your assumptions?",
  },
  current_price: {
    title: "Current price",
    what: "What one share trades for on the stock market right now.",
    why: "This is the market's collective answer to the same question the model asks. The gap between the two is the upside or downside.",
  },
  upside: {
    title: "Upside / downside",
    what: "How far the implied value is above (upside) or below (downside) the current price, in percent.",
    why: "A big gap does not mean the market is wrong. It usually means your assumptions differ from what the market is pricing in. See “What today’s price implies”.",
  },
  enterprise_value: {
    title: "Enterprise value (EV)",
    what: "The value of the whole business, its operations, regardless of how it is financed. Here it is the sum of all future free cash flows, discounted to today.",
    why: "Think of it as the price to buy the entire company, including taking on its debt and keeping its cash.",
  },
  net_debt: {
    title: "Net debt / net cash",
    what: "Debt minus cash and investments. If the company has more cash than debt, it has net cash instead.",
    why: "Lenders get paid before shareholders, so debt is subtracted from enterprise value. Cash belongs to shareholders, so it is added.",
  },
  equity_value: {
    title: "Equity value",
    what: "The part of the business that belongs to shareholders: enterprise value, minus debt, plus cash.",
    why: "Divide it by the number of shares to get the value of one share.",
  },
  market_cap: {
    title: "Market capitalization",
    what: "Share price × number of shares. What the stock market says all the shares are worth together.",
    why: "It is the market’s version of equity value. Compare it with the model’s equity value.",
  },
  tv_pct: {
    title: "Terminal value % of EV",
    what: "How much of the enterprise value comes from the years after the forecast (the terminal value), instead of the forecast years themselves.",
    why: "It is usually 60–80%. The higher it is, the more the answer depends on long-run guesses (WACC and perpetual growth) rather than the near-term forecast.",
  },
  implied_wacc: {
    title: "Market-implied WACC",
    what: "A reverse DCF. The discount rate that would make the model’s value exactly equal the current share price, with every other input unchanged.",
    why: "If it is far below a normal WACC (roughly 7–10% for large companies), the market is either very confident in the company or expects more growth than you do.",
  },
  implied_growth: {
    title: "Market-implied revenue growth",
    what: "A reverse DCF. The revenue growth, every year of the forecast, that would make the model’s value equal the current price.",
    why: "It turns the share price into a plain question: do you believe the company can grow this fast?",
  },

  // ---- Inputs
  projection_period: {
    title: "Projection period",
    what: "How many years the model forecasts year by year before switching to the terminal value.",
    why: "Five years is standard. Use longer for fast growers that need more time to settle down to a mature growth rate.",
  },
  revenue_growth: {
    title: "Revenue growth",
    what: "How fast sales grow each year. Revenue is the top line: all money from selling products and services.",
    why: "Every other line in the forecast is a percentage of revenue, so growth scales everything.",
    move: "Higher growth → more revenue → more cash flow → higher value.",
  },
  ebit_margin: {
    title: "EBIT margin",
    what: "Operating profit as a share of revenue. A 30% margin means 30 cents of every dollar of sales is left after paying for making and selling the product, running the company and R&D.",
    why: "It is the main measure of how profitable the business is.",
    move: "Higher margin → more profit per dollar of sales → higher value.",
  },
  tax_rate: {
    title: "Tax rate",
    what: "The share of operating profit paid in taxes. Defaults to the company’s actual recent rate.",
    move: "Higher tax → less cash kept → lower value.",
  },
  da: {
    title: "D&A (depreciation & amortization)",
    what: "An accounting expense that spreads the cost of past purchases (factories, equipment, software) over their useful life. No cash leaves the company when D&A is recorded.",
    why: "D&A was subtracted to get EBIT but is not a real cash cost, so it is added back to get cash flow.",
    move: "Higher D&A (as % of revenue) → slightly higher value, since it is a non-cash add-back.",
  },
  capex: {
    title: "CapEx (capital expenditures)",
    what: "Cash spent on long-term assets: factories, data centers, equipment. It is real cash out the door that does not show up as an expense on the income statement.",
    why: "A company has to keep investing to keep growing. CapEx is usually similar to or above D&A over time.",
    move: "Higher CapEx → more cash spent → lower value.",
  },
  nwc: {
    title: "Change in net working capital (ΔNWC)",
    what: "Cash tied up in running day-to-day operations: inventory and money customers owe, minus money the company owes its suppliers. The input is how much working capital changes for each extra dollar of revenue.",
    why: "Growing companies usually need more working capital, which uses cash. Some, like Apple, get paid by customers before paying suppliers, so growth actually releases cash (a negative %).",
    move: "Higher % → more cash tied up as revenue grows → lower value.",
  },
  wacc: {
    title: "WACC (weighted average cost of capital)",
    what: "The discount rate. The return investors demand for giving the company money, blended between shareholders (cost of equity) and lenders (cost of debt) by how much of each the company uses.",
    why: "It is how the model says “cash later is worth less than cash now, and risky cash is worth even less.” It is the single most powerful input on the page.",
    move: "Higher WACC → future cash is discounted harder → lower value.",
  },
  risk_free: {
    title: "Risk-free rate",
    what: "The return you can get with essentially no risk. The model uses the 10-year US Treasury yield, pulled live.",
    why: "Any risky investment has to beat this, so it is the floor for the cost of equity.",
    move: "Higher → higher WACC → lower value.",
  },
  beta: {
    title: "Beta",
    what: "How much the stock moves compared with the overall market. 1.0 moves with the market; 1.5 swings 50% more; 0.7 swings less.",
    why: "In CAPM, a stock that swings more is riskier, so investors demand a higher return.",
    move: "Higher beta → higher cost of equity → lower value.",
  },
  erp: {
    title: "Equity risk premium (ERP)",
    what: "The extra return investors expect from stocks in general over the risk-free rate, to compensate for their risk. Usually assumed to be 4–6%.",
    move: "Higher → higher cost of equity → lower value.",
  },
  cost_of_equity: {
    title: "Cost of equity (CAPM)",
    what: "The return shareholders expect. The CAPM formula: risk-free rate + beta × equity risk premium.",
    why: "Shareholders are paid last and take the most risk, so this is usually the most expensive source of money.",
  },
  cost_of_debt: {
    title: "Cost of debt",
    what: "The interest rate the company pays to borrow. Interest is tax-deductible, so the model uses the after-tax rate.",
    why: "Debt is cheaper than equity because lenders get paid first.",
  },
  perpetual_growth: {
    title: "Perpetual (terminal) growth",
    what: "The rate the model assumes cash flow grows forever after the forecast ends. It should be at or below long-run economic growth (about 2–3%), since no company can outgrow the economy forever.",
    move: "Higher growth → bigger terminal value → higher value. Small changes move the answer a lot.",
  },
  mid_year: {
    title: "Mid-year convention",
    what: "Assumes each year’s cash arrives in the middle of the year rather than at the end, which is more realistic since cash comes in all year.",
    move: "Turning it on discounts each cash flow by half a year less → slightly higher value.",
  },

  // ---- Table rows
  revenue: {
    title: "Revenue",
    what: "Total sales. The top line of the income statement.",
  },
  ebit: {
    title: "EBIT (operating income)",
    what: "Earnings before interest and taxes: revenue minus the costs of running the business. It measures how profitable the operations are, before how the company is financed.",
  },
  taxes: {
    title: "Taxes on EBIT",
    what: "Tax the company would pay on its operating profit if it had no debt. The model ignores the tax savings from interest here because the WACC already accounts for them.",
  },
  nopat: {
    title: "NOPAT",
    what: "Net operating profit after tax = EBIT × (1 − tax rate). Operating profit left after taxes.",
  },
  ufcf: {
    title: "Unlevered free cash flow (UFCF)",
    what: "The cash the business produces after paying for everything it needs to run and grow: NOPAT + D&A − CapEx − increase in working capital.",
    why: "“Unlevered” means before paying lenders, so this cash belongs to both shareholders and lenders. That is why it is discounted at the WACC and gives enterprise value.",
  },
  discount_factor: {
    title: "Discount factor",
    what: "What $1 received in that year is worth today: 1 ÷ (1 + WACC)^years. At a 10% WACC, $1 in five years is worth about $0.62 today.",
  },
  pv_fcf: {
    title: "Present value (PV)",
    what: "A future amount translated into today’s money: cash flow × discount factor.",
  },
  sum_pv: {
    title: "Sum of PV of free cash flows",
    what: "All the forecast years’ cash flows, each converted to today’s money, added up. This is the value of the forecast period alone.",
  },
  terminal_value: {
    title: "Terminal value (Gordon growth)",
    what: "The value of every year after the forecast, in one number. Formula: final-year cash flow × (1 + g) ÷ (WACC − g). It assumes the business keeps growing at g forever.",
    why: "It is then discounted back to today like any other future cash flow.",
  },
  total_debt: {
    title: "Total debt",
    what: "Money the company has borrowed (bonds, loans, and usually leases). Lenders are paid before shareholders, so it is subtracted.",
  },
  cash: {
    title: "Cash & short-term investments",
    what: "Money in the bank and investments that mature within a year. It belongs to shareholders, so it is added.",
  },
  lt_investments: {
    title: "Long-term investments",
    what: "Bonds and other financial investments the company holds for more than a year. Like cash, they can be turned into money for shareholders, so they are added.",
  },
  shares: {
    title: "Shares outstanding",
    what: "The number of shares that exist. Equity value ÷ shares = value per share.",
  },

  // ---- Comps
  comps: {
    title: "Trading comparables (comps)",
    what: "Valuing a company by comparing it with similar listed companies, using ratios called multiples. It asks “what are investors paying for businesses like this?” instead of forecasting cash.",
  },
  ev_ebitda: {
    title: "EV/EBITDA",
    what: "Enterprise value ÷ EBITDA (EBIT plus D&A, a rough measure of operating cash profit). “The market pays X dollars of business value for each dollar of yearly operating profit.”",
    why: "Bankers’ favorite multiple because it ignores debt levels and tax differences, so different companies are easier to compare.",
  },
  pe: {
    title: "P/E (price-to-earnings)",
    what: "Share price ÷ earnings per share over the last 12 months. How many years of current profit you pay for when buying the stock.",
    why: "High P/E = the market expects strong growth (or the stock is expensive).",
  },
  fwd_pe: {
    title: "Forward P/E",
    what: "Share price ÷ the earnings analysts expect over the next 12 months.",
  },
  ebitda_margin: {
    title: "EBITDA margin",
    what: "EBITDA ÷ revenue. How much operating cash profit the company makes per dollar of sales.",
  },
  peer_median: {
    title: "Peer median",
    what: "The middle value across the peer companies. Median is used instead of average so one extreme company does not distort it.",
  },
  sensitivity: {
    title: "Sensitivity table",
    what: "The implied share price recomputed for different combinations of WACC (rows) and perpetual growth (columns). The outlined cell is your base case.",
    why: "A DCF is only as good as its assumptions. The grid shows how wide the reasonable range is.",
  },
} satisfies Record<string, Entry>;

export type GlossaryKey = keyof typeof GLOSSARY;
