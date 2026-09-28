import { bn, pct, price } from "../format";
import { Term } from "../learn/core";
import type { GlossaryKey } from "../learn/glossary";
import type { HistoricalRow, Snapshot, Valuation } from "../types";

type Kind = "line" | "sub" | "total" | "input";
type Row = { label: string; kind: Kind; hist: (h: HistoricalRow) => string; proj: (i: number) => string; info?: GlossaryKey };

export function ProjectionTable({ val, ccy, snap }: { val: Valuation; ccy: string; snap: Snapshot }) {
  const shares = snap.shares_outstanding;
  const P = val.projections;
  const H = val.historical;
  const rows: Row[] = [
    { label: "Revenue", info: "revenue", kind: "total", hist: (h) => bn(h.revenue), proj: (i) => bn(P[i].revenue) },
    { label: "% growth", info: "revenue_growth", kind: "input", hist: (h) => {
        const j = H.indexOf(h);
        const prev = j > 0 ? H[j - 1].revenue : null;
        return prev && h.revenue != null ? pct(h.revenue / prev - 1) : "";
      }, proj: (i) => pct(P[i].growth) },
    { label: "EBIT", info: "ebit", kind: "line", hist: (h) => bn(h.ebit), proj: (i) => bn(P[i].ebit) },
    { label: "% margin", info: "ebit_margin", kind: "input", hist: (h) => (h.ebit != null && h.revenue ? pct(h.ebit / h.revenue) : "—"), proj: (i) => pct(P[i].ebit_margin) },
    { label: "Less: taxes on EBIT", info: "taxes", kind: "line", hist: () => "", proj: (i) => bn(-(P[i].ebit - P[i].nopat)) },
    { label: "NOPAT", info: "nopat", kind: "total", hist: () => "", proj: (i) => bn(P[i].nopat) },
    { label: "Plus: D&A", info: "da", kind: "line", hist: (h) => bn(h.da), proj: (i) => bn(P[i].da) },
    { label: "Less: CapEx", info: "capex", kind: "line", hist: (h) => bn(h.capex == null ? null : -h.capex), proj: (i) => bn(-P[i].capex) },
    { label: "Less: increase in NWC", info: "nwc", kind: "line", hist: (h) => bn(h.nwc_change == null ? null : -h.nwc_change), proj: (i) => bn(-P[i].nwc_change) },
    { label: "Unlevered free cash flow", info: "ufcf", kind: "total", hist: (h) => bn(h.fcf), proj: (i) => bn(P[i].fcf) },
    { label: "Discount factor", info: "discount_factor", kind: "sub", hist: () => "", proj: (i) => P[i].discount_factor.toFixed(3) },
    { label: "Present value of FCF", info: "pv_fcf", kind: "line", hist: () => "", proj: (i) => bn(P[i].pv_fcf) },
  ];

  const last = P[P.length - 1].year;
  type BridgeRow = [string, string, "total" | "final" | undefined, GlossaryKey?];
  const bridge: BridgeRow[] = [
    ["Sum of PV of free cash flows", bn(val.sum_pv_fcf), undefined, "sum_pv"],
    ["PV of terminal value", bn(val.pv_terminal_value), undefined, "terminal_value"],
    ["Enterprise value", bn(val.enterprise_value), "total", "enterprise_value"],
    ["Less: total debt", bn(-snap.total_debt), undefined, "total_debt"],
    ["Plus: cash & short-term investments", bn(snap.cash), undefined, "cash"],
    ...(val.long_term_investments
      ? [["Plus: long-term investments", bn(val.long_term_investments), undefined, "lt_investments"] as BridgeRow]
      : []),
    ["Equity value", bn(val.equity_value), "total", "equity_value"],
    ["Shares outstanding (bn)", (shares / 1e9).toFixed(3), undefined, "shares"],
    ["Implied value per share", price(val.implied_price, ccy), "final", "implied_value"],
  ];

  const cell = (kind: Kind) =>
    kind === "total" ? "font-semibold" : kind === "sub" ? "text-ink-3" : kind === "input" ? "italic text-ink-3" : "";

  return (
    <div className="space-y-8">
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <table className="num w-full min-w-[680px] border-collapse text-[13px]">
          <thead>
            <tr>
              <th className="sticky left-0 bg-bg py-2 pr-4 text-left text-xs font-normal text-ink-3">{ccy} in billions, FY</th>
              {H.map((h) => (
                <th key={h.year} className="px-2 py-2 text-right font-semibold">{h.year}A</th>
              ))}
              {P.map((p, i) => (
                <th key={p.year} className={`px-2 py-2 text-right font-semibold text-accent ${i === 0 ? "border-l border-line" : ""}`}>{p.year}E</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} data-walk={r.info ? `row-${r.info}` : undefined} className={r.kind === "total" ? "rule-total" : ""}>
                <td className={`sticky left-0 bg-bg py-1.5 pr-4 ${cell(r.kind)} ${r.kind === "input" || r.kind === "sub" ? "pl-3" : ""}`}>{r.info ? <Term k={r.info}>{r.label}</Term> : r.label}
                </td>
                {H.map((h) => (
                  <td key={h.year} className={`px-2 py-1.5 text-right ${cell(r.kind)}`}>{r.hist(h)}</td>
                ))}
                {P.map((p, i) => (
                  <td
                    key={p.year}
                    className={`px-2 py-1.5 text-right ${i === 0 ? "border-l border-line" : ""} ${r.kind === "input" ? "not-italic font-medium text-input" : cell(r.kind)}`}
                  >
                    {r.proj(i)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-ink-3">
          A = actual, E = estimate. Historical FCF is taxed at the model rate. Negatives in parentheses.
        </p>
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        <div data-walk="bridge">
          <h3 className="smallcaps mb-1 text-ink-3">Enterprise to equity value</h3>
          <table className="num w-full border-collapse text-[13px]">
            <tbody>
              {bridge.map(([k, v, kind, info]) => (
                <tr key={k} className={kind ? "rule-total" : ""}>
                  <td className={`py-1.5 ${kind ? "font-semibold" : "text-ink-2"}`}>
                    {info ? <Term k={info}>{k}</Term> : k}
                  </td>
                  <td className={`py-1.5 text-right ${kind ? "font-semibold" : ""}`}>
                    <span className={kind === "final" ? "rule-double inline-block pb-0.5" : ""}>{v}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div data-walk="terminal">
          <h3 className="smallcaps mb-1 text-ink-3">Terminal value</h3>
          <table className="num w-full border-collapse text-[13px]">
            <tbody>
              <tr>
                <td className="py-1.5 text-ink-2">
                  <Term k="ufcf">FY{last}E free cash flow</Term>
                </td>
                <td className="py-1.5 text-right">{bn(P[P.length - 1].fcf)}</td>
              </tr>
              <tr>
                <td className="py-1.5 text-ink-2">
                  <Term k="terminal_value">Terminal value, Gordon growth</Term>
                </td>
                <td className="py-1.5 text-right">{bn(val.terminal_value)}</td>
              </tr>
              <tr>
                <td className="py-1.5 text-ink-2">
                  <Term k="discount_factor">Discounted to today</Term>
                </td>
                <td className="py-1.5 text-right">{bn(val.pv_terminal_value)}</td>
              </tr>
              <tr className="rule-total">
                <td className="py-1.5 font-semibold">
                  <Term k="tv_pct">Share of enterprise value</Term>
                </td>
                <td className="py-1.5 text-right font-semibold">{pct(val.tv_pct_of_ev, 1)}</td>
              </tr>
            </tbody>
          </table>
          {val.tv_pct_of_ev != null && val.tv_pct_of_ev > 0.75 && (
            <p className="mt-2 text-xs text-ink-3">
              Over three-quarters of the value sits in the terminal year, so the result is highly sensitive to WACC and g (see section 3).
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
