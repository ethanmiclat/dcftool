import { useState } from "react";
import { pct, price, signedPct } from "../format";
import type { Valuation } from "../types";
import { Term } from "../learn/core";
import { Segmented } from "./ui";

// Diverging on upside vs. current price: red = downside, neutral = fair, navy = upside.
const STEPS = [
  { max: -0.3, bg: "var(--div-neg-3)", strong: true, label: "< −30%" },
  { max: -0.15, bg: "var(--div-neg-2)", label: "−30/−15" },
  { max: -0.05, bg: "var(--div-neg-1)", label: "−15/−5" },
  { max: 0.05, bg: "var(--div-mid)", label: "±5%" },
  { max: 0.15, bg: "var(--div-pos-1)", label: "+5/+15" },
  { max: 0.3, bg: "var(--div-pos-2)", label: "+15/+30" },
  { max: Infinity, bg: "var(--div-pos-3)", strong: true, label: "> +30%" },
];
const step = (upside: number) => STEPS.find((s) => upside <= s.max)!;

export function SensitivityTable({ val, ccy }: { val: Valuation; ccy: string }) {
  const [mode, setMode] = useState<"price" | "upside">("price");
  const { wacc, terminal_growth: gs, implied_price: grid } = val.sensitivity;
  const baseW = Math.floor(wacc.length / 2);
  const baseG = Math.floor(gs.length / 2);
  const cur = val.current_price;
  const cells = grid.flat().filter((v): v is number => v != null);
  const lo = Math.min(...cells);
  const hi = Math.max(...cells);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-ink-2">
          Range <span className="num font-semibold text-ink">{price(lo, ccy)}</span> to{" "}
          <span className="num font-semibold text-ink">{price(hi, ccy)}</span> against a current price of{" "}
          <span className="num font-semibold text-ink">{price(cur, ccy)}</span>.
        </p>
        <Segmented
          label="Show"
          value={mode}
          onChange={setMode}
          options={[
            { value: "price", label: "Value / share" },
            { value: "upside", label: "vs. current" },
          ]}
        />
      </div>
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <table className="num w-full min-w-[460px] border-separate border-spacing-[2px] text-[13px]">
          <thead>
            <tr>
              <th className="pb-1 text-left align-bottom text-xs font-normal text-ink-3">
                <Term k="wacc">WACC</Term> <span aria-hidden>↓</span> · <Term k="perpetual_growth">g</Term>{" "}
                <span aria-hidden>→</span>
              </th>
              {gs.map((g, j) => (
                <th key={g} className={`px-2 pb-1 text-right ${j === baseG ? "font-semibold text-ink" : "font-normal text-ink-3"}`}>{pct(g, 1)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {wacc.map((w, i) => (
              <tr key={w}>
                <th scope="row" className={`pr-3 text-left ${i === baseW ? "font-semibold text-ink" : "font-normal text-ink-3"}`}>{pct(w, 1)}</th>
                {grid[i].map((v, j) => {
                  if (v == null) {
                    return <td key={j} className="bg-surface-2 px-2 py-2 text-right text-ink-3" title="WACC must exceed terminal growth">n/m</td>;
                  }
                  const up = v / cur - 1;
                  const s = step(up);
                  const base = i === baseW && j === baseG;
                  return (
                    <td
                      key={j}
                      title={`WACC ${pct(w, 1)}, g ${pct(gs[j], 1)}: ${price(v, ccy)}, ${signedPct(up)} vs. current`}
                      className={`px-2 py-2 text-right ${s.strong ? "text-white" : "text-ink"} ${base ? "font-bold outline-2 -outline-offset-2 outline-rule" : ""}`}
                      style={{ background: s.bg }}
                    >
                      {mode === "price" ? price(v, ccy) : signedPct(up, 0)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-ink-3">
        <span>Implied value vs. current price:</span>
        <div className="flex gap-[2px]">
          {STEPS.map((s) => (
            <div key={s.label} className="flex flex-col items-center">
              <div className="h-2.5 w-12" style={{ background: s.bg }} />
              <span className="mt-1 whitespace-nowrap text-[10px]">{s.label}</span>
            </div>
          ))}
        </div>
        <span className="ml-auto">Outlined: base case</span>
      </div>
    </div>
  );
}
