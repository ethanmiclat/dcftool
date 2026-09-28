import { useState } from "react";
import { pct } from "../format";
import type { Assumptions, HistoricalStats, Num, ProjectionRow, Wacc } from "../types";
import { Term } from "../learn/core";
import type { GlossaryKey } from "../learn/glossary";
import { Segmented, TextLink } from "./ui";

function Slider({ id, label, value, min, max, step, onChange, hint, digits = 1, info }: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  hint?: string;
  digits?: number;
  info?: GlossaryKey;
}) {
  const fill = ((Math.min(max, Math.max(min, value)) - min) / (max - min)) * 100;
  return (
    <div className="py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] text-ink">
          {info ? <Term k={info}>{label}</Term> : <label htmlFor={id}>{label}</label>}
        </span>
        <span className="num text-[15px] font-semibold text-input">{pct(value, digits)}</span>
      </div>
      <input
        id={id}
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ ["--fill" as string]: `${fill}%` }}
      />
      {hint && <div className="text-xs text-ink-3">{hint}</div>}
    </div>
  );
}

/** Stores decimals, edits in percent. Keeps the typed text while focused. */
function PctInput({ value, onChange, label, step = 0.1, info }: {
  value: number;
  onChange: (v: number) => void;
  label: string;
  step?: number;
  info?: GlossaryKey;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div className="block">
      <span className="block text-xs text-ink-3">{info ? <Term k={info}>{label}</Term> : label}</span>
      <div className="flex items-baseline border-b border-line-strong focus-within:border-ink">
        <input
          type="number"
          aria-label={label}
          inputMode="decimal"
          step={step}
          value={draft ?? (value * 100).toFixed(2).replace(/\.?0+$/, "")}
          onFocus={(e) => setDraft(e.target.value)}
          onChange={(e) => {
            setDraft(e.target.value);
            const n = parseFloat(e.target.value);
            if (!isNaN(n)) onChange(n / 100);
          }}
          onBlur={() => setDraft(null)}
          className="num h-8 w-full min-w-0 bg-transparent text-right text-sm font-semibold text-input focus:outline-none"
        />
        <span className="pl-0.5 text-xs text-ink-3">%</span>
      </div>
    </div>
  );
}

function NumInput({ value, onChange, label, step = 0.05, info }: {
  value: number;
  onChange: (v: number) => void;
  label: string;
  step?: number;
  info?: GlossaryKey;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div className="block">
      <span className="block text-xs text-ink-3">{info ? <Term k={info}>{label}</Term> : label}</span>
      <input
        type="number"
        aria-label={label}
        inputMode="decimal"
        step={step}
        value={draft ?? value.toFixed(2)}
        onFocus={(e) => setDraft(e.target.value)}
        onChange={(e) => {
          setDraft(e.target.value);
          const n = parseFloat(e.target.value);
          if (!isNaN(n)) onChange(n);
        }}
        onBlur={() => setDraft(null)}
        className="num h-8 w-full border-b border-line-strong bg-transparent text-right text-sm font-semibold text-input focus:border-ink focus:outline-none"
      />
    </div>
  );
}

function Group({ title, info, children }: { title: string; info?: GlossaryKey; children: React.ReactNode }) {
  return (
    <fieldset className="border-t border-line pt-3">
      <legend className="smallcaps pr-2 text-ink-3">{info ? <Term k={info}>{title}</Term> : title}</legend>
      <div className="divide-y divide-line/60">{children}</div>
    </fieldset>
  );
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const uniform = (xs: number[]) => xs.every((x) => Math.abs(x - xs[0]) < 1e-9);
const histHint = (v: Num, label: string) => (v == null ? undefined : `${label} ${pct(v)}`);

function PerYear({ id, label, values, min, max, projections, onChange, hint, info }: {
  id: string;
  label: string;
  values: number[];
  min: number;
  max: number;
  projections: ProjectionRow[];
  onChange: (vs: number[]) => void;
  hint?: string;
  info?: GlossaryKey;
}) {
  const [open, setOpen] = useState(false);
  const same = uniform(values);
  return (
    <div>
      <Slider
        id={id}
        label={same ? label : `${label}, avg.`}
        value={avg(values)}
        min={min}
        max={max}
        step={0.005}
        info={info}
        // Shift every year by the same amount so a custom or consensus path keeps its shape.
        onChange={(v) => {
          const d = v - avg(values);
          onChange(values.map((x) => x + d));
        }}
        hint={hint}
      />
      <div className="-mt-1 pb-2.5">
        <TextLink onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? "Hide yearly inputs" : same ? "Set by year" : "Edit yearly inputs"}
        </TextLink>
        {open && (
          <div className="mt-2 grid grid-cols-5 gap-2">
            {values.map((v, i) => (
              <PctInput
                key={i}
                label={projections[i] ? `’${String(projections[i].year).slice(2)}` : `Y${i + 1}`}
                value={v}
                onChange={(nv) => onChange(values.map((x, j) => (j === i ? nv : x)))}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function AssumptionsPanel({ a, defaults, hist, wacc, projections, riskFreeSource, onChange }: {
  a: Assumptions;
  defaults: Assumptions;
  hist: HistoricalStats;
  wacc: Wacc;
  projections: ProjectionRow[];
  riskFreeSource: string;
  onChange: (a: Assumptions) => void;
}) {
  const [capmOpen, setCapmOpen] = useState(false);
  const set = <K extends keyof Assumptions>(k: K, v: Assumptions[K]) => onChange({ ...a, [k]: v });
  const dirty = JSON.stringify(a) !== JSON.stringify(defaults);

  const setYears = (n: number) => {
    const extend = (xs: number[]) => Array.from({ length: n }, (_, i) => xs[Math.min(i, xs.length - 1)]);
    onChange({ ...a, revenue_growth: extend(a.revenue_growth), ebit_margin: extend(a.ebit_margin) });
  };

  return (
    <section data-walk="inputs" aria-labelledby="inputs-h" className="bg-surface px-5 pb-5 pt-4">
      <header className="flex items-baseline justify-between gap-2 border-b border-rule pb-2">
        <h2 id="inputs-h" className="font-serif text-[22px] font-medium tracking-[-0.01em]">Model inputs</h2>
        <TextLink onClick={() => onChange(defaults)} disabled={!dirty}>Reset</TextLink>
      </header>
      <p className="mb-4 mt-2 text-xs text-ink-3">
        <span className="font-semibold text-input">Blue</span> figures are inputs; defaults come from reported history
        {uniform(defaults.revenue_growth) ? "" : " and analyst revenue consensus"}.
      </p>

      <div className="space-y-5">
        <Group title="Operating" info="ebit">
          <div className="flex items-center justify-between py-2.5">
            <span className="text-[13px]">
              <Term k="projection_period">Projection period</Term>
            </span>
            <Segmented
              label="Projection period"
              value={String(a.revenue_growth.length)}
              onChange={(v) => setYears(Number(v))}
              options={[5, 7, 10].map((n) => ({ value: String(n), label: `${n} yrs` }))}
            />
          </div>
          <PerYear
            id="growth"
            label="Revenue growth"
            info="revenue_growth"
            values={a.revenue_growth}
            min={-0.2}
            max={Math.max(0.4, Math.ceil(avg(defaults.revenue_growth) * 20) / 10)}
            projections={projections}
            onChange={(v) => set("revenue_growth", v)}
            hint={[
              uniform(defaults.revenue_growth) ? null : "Consensus, fading to terminal",
              histHint(hist.revenue_cagr, "historical CAGR"),
            ].filter(Boolean).join(" · ") || undefined}
          />
          <PerYear
            id="margin"
            label="EBIT margin"
            info="ebit_margin"
            values={a.ebit_margin}
            min={-0.2}
            max={0.6}
            projections={projections}
            onChange={(v) => set("ebit_margin", v)}
            hint={histHint(hist.ebit_margin_avg, "Historical average")}
          />
          <Slider id="tax" label="Tax rate" info="tax_rate" value={a.tax_rate} min={0} max={0.4} step={0.005} onChange={(v) => set("tax_rate", v)} />
          <Slider id="da" label="D&A, % of revenue" info="da" value={a.da_pct_revenue} min={0} max={0.3} step={0.0025} onChange={(v) => set("da_pct_revenue", v)} hint={histHint(hist.da_pct_revenue, "Historical average")} />
          <Slider id="capex" label="CapEx, % of revenue" info="capex" value={a.capex_pct_revenue} min={0} max={0.4} step={0.0025} onChange={(v) => set("capex_pct_revenue", v)} hint={histHint(hist.capex_pct_revenue, "Historical average")} />
          <Slider id="nwc" label="ΔNWC, % of Δrevenue" info="nwc" value={a.nwc_pct_revenue_change} min={-0.5} max={0.5} step={0.005} onChange={(v) => set("nwc_pct_revenue_change", v)} hint={histHint(hist.nwc_pct_revenue_change, "Historical median")} />
        </Group>

        <Group title="Discount rate" info="wacc">
          <div className="pb-2.5">
            <Slider
              id="wacc"
              info="wacc"
              label={a.wacc_override != null ? "WACC (manual)" : "WACC"}
              value={wacc.wacc}
              min={0.04}
              max={0.18}
              step={0.001}
              digits={2}
              onChange={(v) => set("wacc_override", v)}
              hint={
                a.wacc_override != null
                  ? `CAPM would give ${pct(wacc.computed_wacc, 2)}`
                  : `${pct(wacc.cost_of_equity, 1)} Ke × ${pct(wacc.equity_weight, 0)} + ${pct(wacc.after_tax_cost_of_debt, 1)} Kd × ${pct(wacc.debt_weight, 0)}`
              }
            />
            <div className="flex gap-4">
              {a.wacc_override != null && <TextLink onClick={() => set("wacc_override", null)}>Revert to CAPM</TextLink>}
              <TextLink onClick={() => setCapmOpen((o) => !o)} aria-expanded={capmOpen}>
                {capmOpen ? "Hide CAPM build" : "CAPM build"}
              </TextLink>
              <span className="text-[13px] text-ink-3">
                <Term k="cost_of_equity">Cost of equity</Term>
              </span>
            </div>
            {capmOpen && (
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
                <PctInput label="Risk-free rate" info="risk_free" value={a.risk_free_rate} onChange={(v) => set("risk_free_rate", v)} step={0.05} />
                <NumInput label="Levered beta" info="beta" value={a.beta} onChange={(v) => set("beta", v)} />
                <PctInput label="Equity risk premium" info="erp" value={a.equity_risk_premium} onChange={(v) => set("equity_risk_premium", v)} step={0.1} />
                <PctInput label="Pre-tax cost of debt" info="cost_of_debt" value={a.pre_tax_cost_of_debt} onChange={(v) => set("pre_tax_cost_of_debt", v)} step={0.1} />
                <p className="col-span-2 text-xs text-ink-3">Risk-free rate: {riskFreeSource}. Weights at market cap and book debt.</p>
              </div>
            )}
          </div>
        </Group>

        <Group title="Terminal value" info="terminal_value">
          <Slider
            id="tg"
            info="perpetual_growth"
            label="Perpetual growth"
            value={a.terminal_growth}
            min={0}
            max={0.05}
            step={0.001}
            digits={2}
            onChange={(v) => set("terminal_growth", v)}
            hint="Gordon growth on the final-year cash flow"
          />
          <div className="flex items-center justify-between gap-2 py-2.5">
            <span className="text-[13px]">
              <Term k="mid_year">Mid-year convention</Term>
            </span>
            <input
              type="checkbox"
              checked={a.mid_year}
              aria-label="Mid-year convention"
              onChange={(e) => set("mid_year", e.target.checked)}
              className="h-4 w-4 cursor-pointer accent-[var(--input)]"
            />
          </div>
        </Group>
      </div>
    </section>
  );
}
