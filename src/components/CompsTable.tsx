import { useState } from "react";
import { money, multiple, pct, price } from "../format";
import type { CompRow, CompsResponse } from "../types";
import { Term } from "../learn/core";
import type { GlossaryKey } from "../learn/glossary";
import { Spinner } from "./ui";

function Row({ r, kind }: { r: CompRow; kind: "subject" | "peer" }) {
  const subject = kind === "subject";
  return (
    <tr className={`border-t border-line ${subject ? "bg-surface font-semibold" : ""}`}>
      <td className={`sticky left-0 py-2 pr-4 ${subject ? "bg-surface" : "bg-bg"}`}>
        <div className="flex items-baseline gap-2">
          <span className="num">{r.ticker}</span>
          <span className="hidden max-w-[12rem] truncate text-xs font-normal text-ink-3 md:inline" title={r.name}>{r.name}</span>
          {r.mixed_currency && (
            <span title="Financials and quote are in different currencies; EV-based metrics omitted" className="text-[11px] font-normal text-ink-3">
              FX*
            </span>
          )}
        </div>
      </td>
      <td className="px-2 py-2 text-right">{price(r.price, r.currency ?? "USD")}</td>
      <td className="px-2 py-2 text-right">{money(r.market_cap, r.currency ?? "USD")}</td>
      <td className="px-2 py-2 text-right">{money(r.enterprise_value, r.currency ?? "USD")}</td>
      <td className="px-2 py-2 text-right">{multiple(r.ev_ebitda)}</td>
      <td className="px-2 py-2 text-right">{multiple(r.pe)}</td>
      <td className="px-2 py-2 text-right">{multiple(r.forward_pe)}</td>
      <td className="px-2 py-2 text-right">{pct(r.revenue_growth)}</td>
      <td className="px-2 py-2 text-right">{pct(r.ebitda_margin)}</td>
    </tr>
  );
}

export function CompsTable({ data, loading, error, peers, onPeersChange, ccy, dcfPrice }: {
  data: CompsResponse | null;
  loading: boolean;
  error: string | null;
  peers: string[];
  onPeersChange: (peers: string[]) => void;
  ccy: string;
  dcfPrice: number;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const t = draft.trim().toUpperCase();
    if (t && !peers.includes(t) && peers.length < 8) onPeersChange([...peers, t]);
    setDraft("");
  };

  const cross = data
    ? [
        { label: "DCF (this model)", v: dcfPrice },
        { label: "Peer median EV/EBITDA", v: data.implied_price.ev_ebitda ?? null },
        { label: "Peer median P/E", v: data.implied_price.pe ?? null },
        { label: "Current price", v: data.subject.price },
      ]
    : [];
  const maxV = Math.max(...cross.map((c) => (c.v != null && c.v > 0 ? c.v : 0)), 1);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <span className="smallcaps mr-2 text-ink-3"><Term k="comps">Peer set</Term></span>
        {peers.map((p) => (
          <span key={p} className="num inline-flex items-center gap-0.5 border border-line-strong py-0.5 pl-2 text-[13px] font-medium">
            {p}
            <button
              type="button"
              aria-label={`Remove ${p}`}
              onClick={() => onPeersChange(peers.filter((x) => x !== p))}
              className="grid h-6 w-6 cursor-pointer place-items-center text-ink-3 hover:text-bad"
            >
              ×
            </button>
          </span>
        ))}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
          className="inline-flex"
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value.toUpperCase())}
            placeholder="+ Add ticker"
            aria-label="Add peer ticker"
            className="num h-7 w-28 border-0 border-b border-dashed border-line-strong bg-transparent px-1 text-[13px] uppercase placeholder:normal-case placeholder:text-ink-3 focus:border-solid focus:border-ink focus:outline-none"
          />
        </form>
        {loading && <Spinner className="ml-1 text-ink-3" />}
      </div>

      {error && <p className="text-xs text-bad">{error}</p>}

      {data && (
        <>
          <div className={`-mx-4 overflow-x-auto px-4 transition-opacity sm:mx-0 sm:px-0 ${loading ? "opacity-50" : ""}`}>
            <table className="num w-full min-w-[720px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-rule">
                  <th className="sticky left-0 bg-bg py-2 pr-4 text-left font-semibold">Company</th>
                  {(
                    [
                      ["Price", "current_price"],
                      ["Mkt cap", "market_cap"],
                      ["EV", "enterprise_value"],
                      ["EV/EBITDA", "ev_ebitda"],
                      ["P/E", "pe"],
                      ["Fwd P/E", "fwd_pe"],
                      ["Rev growth", "revenue_growth"],
                      ["EBITDA mgn", "ebitda_margin"],
                    ] as [string, GlossaryKey][]
                  ).map(([h, info]) => (
                    <th key={h} className="px-2 py-2 text-right align-bottom font-semibold">
                      <Term k={info}>{h}</Term>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <Row r={data.subject} kind="subject" />
                {data.peers.map((r) => (
                  <Row key={r.ticker} r={r} kind="peer" />
                ))}
                <tr className="rule-total font-semibold">
                  <td className="sticky left-0 bg-bg py-2 pr-4">
                    <Term k="peer_median">Peer median</Term>
                  </td>
                  <td colSpan={3} />
                  <td className="px-2 py-2 text-right">{multiple(data.median.ev_ebitda)}</td>
                  <td className="px-2 py-2 text-right">{multiple(data.median.pe)}</td>
                  <td className="px-2 py-2 text-right">{multiple(data.median.forward_pe)}</td>
                  <td className="px-2 py-2 text-right">{pct(data.median.revenue_growth)}</td>
                  <td className="px-2 py-2 text-right">{pct(data.median.ebitda_margin)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          {[data.subject, ...data.peers].some((r) => r.mixed_currency) && (
            <p className="mt-2 text-xs text-ink-3">FX* financials reported in a different currency than the quote; EV and EV/EBITDA omitted.</p>
          )}
          {data.missing.length > 0 && (
            <p className="mt-2 text-xs text-ink-3">No market data for {data.missing.join(", ")}.</p>
          )}

          <h3 className="smallcaps mb-3 mt-8 text-ink-3"><Term k="cross_check">Valuation cross-check, per share</Term></h3>
          <div className="space-y-2">
            {cross.map((c) => (
              <div key={c.label} className="grid grid-cols-[8.5rem_minmax(0,1fr)_5.5rem] items-center gap-3 text-[13px] sm:grid-cols-[12rem_minmax(0,1fr)_6rem]">
                <span className="text-ink-2">{c.label}</span>
                <div className="h-3 border-l border-rule">
                  {c.v != null && c.v > 0 && (
                    <div
                      className="h-3"
                      style={{
                        width: `${(c.v / maxV) * 100}%`,
                        background: c.label === "Current price" ? "var(--hist)" : "var(--proj)",
                      }}
                    />
                  )}
                </div>
                <span className="num text-right font-semibold">{price(c.v, ccy)}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-ink-3">
            Multiples-implied prices apply the peer median to the subject's trailing EBITDA / EPS. Market data via Yahoo Finance.
          </p>
        </>
      )}
    </div>
  );
}
