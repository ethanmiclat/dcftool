import { money, pct, price, signedPct } from "../format";
import { Term } from "../learn/core";
import type { GlossaryKey } from "../learn/glossary";
import type { Snapshot, Valuation } from "../types";

function Row({ k, v, strong, info }: { k: string; v: string; strong?: boolean; info?: GlossaryKey }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 border-t border-line py-1.5 text-[13px] ${strong ? "font-semibold" : ""}`}>
      <dt className="text-ink-2">{info ? <Term k={info}>{k}</Term> : k}</dt>
      <dd className="num">{v}</dd>
    </div>
  );
}

export function Summary({ snap, val, busy }: { snap: Snapshot; val: Valuation; busy: boolean }) {
  const ccy = snap.currency;
  const up = val.upside ?? 0;
  const years = val.projections.length;
  const gs = val.sensitivity.terminal_growth;
  const tg = gs[Math.floor(gs.length / 2)];
  const shortName = snap.name.replace(/,?\s+(Inc\.?|Corporation|Corp\.?|Ltd\.?|plc|N\.V\.|S\.A\.)$/i, "");
  const mi = val.market_implied;
  const implied = (v: number | null, d: number) => (v == null ? "not reachable" : pct(v, d));
  const verdict = Math.abs(up) < 0.05 ? "roughly in line with" : up > 0 ? `${pct(Math.abs(up))} above` : `${pct(Math.abs(up))} below`;

  return (
    <section className={`grid grid-cols-1 gap-8 transition-opacity duration-200 lg:grid-cols-[minmax(0,1fr)_340px] ${busy ? "opacity-60" : ""}`}>
      <div className="min-w-0">
        <p className="smallcaps text-ink-3">
          <span className="num text-ink">{snap.ticker}</span>
          {[snap.sector, snap.industry].filter(Boolean).map((s) => (
            <span key={s}> · {s}</span>
          ))}
        </p>
        <h1 className="mt-2 font-serif text-4xl font-medium leading-[1.05] tracking-[-0.02em] sm:text-5xl">{snap.name}</h1>
        <p className="mt-4 max-w-2xl font-serif text-lg leading-relaxed text-ink-2 sm:text-xl">
          On a {years}-year <Term k="dcf">DCF</Term> at a {pct(val.wacc.wacc, 1)} <Term k="wacc">WACC</Term> and {pct(tg, 1)}{" "}
          <Term k="perpetual_growth">terminal growth</Term>, {shortName} is worth <span className="num font-semibold text-ink">{price(val.implied_price, ccy)}</span> a share,{" "}
          {verdict} the current <span className="num text-ink">{price(val.current_price, ccy)}</span>.
        </p>
        <p className="mt-4 text-[13px] text-ink-3">
          Source: {snap.source === "edgar" ? "SEC EDGAR XBRL filings" : "Yahoo Finance"}, FY{snap.years[0]}–FY{snap.years[snap.years.length - 1]}. Market
          data from Yahoo Finance. Figures in {ccy}.
        </p>
      </div>

      <aside data-walk="summary" aria-label="Valuation summary" className="border-t-[3px] border-accent bg-surface px-5 pb-4 pt-3">
        <h2 className="smallcaps text-ink-3">Valuation summary</h2>
        <div className="mt-3 flex items-end justify-between gap-4">
          <div>
            <div className="text-[13px] text-ink-2">
              <Term k="implied_value">Implied value / share</Term>
            </div>
            <div className="num mt-0.5 text-[40px] font-semibold leading-none tracking-[-0.02em]">{price(val.implied_price, ccy)}</div>
          </div>
          <div className={`num pb-1 text-right text-lg font-semibold ${up >= 0 ? "text-good" : "text-bad"}`}>
            <span aria-hidden>{up >= 0 ? "▲" : "▼"} </span>
            {signedPct(val.upside)}
            <div className="text-[11px] font-normal text-ink-3">
              <Term k="upside">{up >= 0 ? "upside" : "downside"}</Term>
            </div>
          </div>
        </div>
        <dl className="mt-4">
          <Row k="Current price" v={price(val.current_price, ccy)} info="current_price" />
          <Row k="Enterprise value" v={money(val.enterprise_value, ccy)} info="enterprise_value" />
          {val.net_debt >= 0 ? (
            <Row k="Less: net debt" v={money(val.net_debt, ccy)} info="net_debt" />
          ) : (
            <Row k="Plus: net cash" v={money(-val.net_debt, ccy)} info="net_debt" />
          )}
          <Row k="Equity value" v={money(val.equity_value, ccy)} strong info="equity_value" />
          <Row k={val.wacc.overridden ? "WACC (manual)" : "WACC (CAPM)"} v={pct(val.wacc.wacc, 2)} info="wacc" />
          <Row k="Terminal value % of EV" v={pct(val.tv_pct_of_ev, 0)} info="tv_pct" />
          <Row k="Market capitalization" v={money(val.wacc.market_cap, ccy)} info="market_cap" />
        </dl>
        <h3 className="smallcaps mt-5 text-ink-3">What today’s price implies</h3>
        <p className="mt-1 text-xs leading-snug text-ink-3">Holding every other input fixed, the market price is justified by:</p>
        <dl className="mt-2">
          <Row k="WACC of" v={implied(mi.wacc, 1)} info="implied_wacc" />
          <Row k="Revenue growth of (every year)" v={implied(mi.revenue_growth, 1)} info="implied_growth" />
        </dl>
      </aside>
    </section>
  );
}
