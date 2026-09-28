import { useState } from "react";
import type { Source } from "../types";
import { Segmented, Spinner } from "./ui";

const EXAMPLES = ["AAPL", "MSFT", "NVDA", "KO", "CAT"];

export function TickerForm({ onSubmit, loading, initialSource }: {
  onSubmit: (ticker: string, source: Source) => void;
  loading: boolean;
  initialSource: Source;
}) {
  const [ticker, setTicker] = useState("");
  const [source, setSource] = useState<Source>(initialSource);

  const submit = (t: string) => {
    const clean = t.trim().toUpperCase();
    if (clean) onSubmit(clean, source);
  };

  return (
    <div className="flex flex-col gap-2 sm:items-end">
      <form
        className="flex flex-wrap items-end gap-x-5 gap-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit(ticker);
        }}
      >
        <div className="flex flex-col">
          <label htmlFor="ticker" className="smallcaps text-ink-3">Ticker</label>
          <input
            id="ticker"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            placeholder="AAPL"
            autoComplete="off"
            spellCheck={false}
            className="num h-10 w-28 border-0 border-b border-line-strong bg-transparent px-0 text-lg font-semibold uppercase tracking-wide placeholder:font-normal placeholder:text-ink-3/60 focus:border-ink focus:outline-none"
          />
        </div>
        <div className="flex flex-col">
          <span className="smallcaps text-ink-3">Source</span>
          <div className="flex h-10 items-center">
            <Segmented
              label="Data source"
              value={source}
              onChange={setSource}
              options={[
                { value: "yfinance", label: "Yahoo Finance" },
                { value: "edgar", label: "SEC EDGAR" },
              ]}
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={loading || !ticker.trim()}
          className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-[2px] bg-accent px-5 text-sm font-semibold text-accent-ink transition-opacity duration-150 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading && <Spinner />}
          Run model
        </button>
      </form>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-3">
        <span>Examples:</span>
        {EXAMPLES.map((t) => (
          <button
            key={t}
            type="button"
            disabled={loading}
            onClick={() => {
              setTicker(t);
              submit(t);
            }}
            className="num cursor-pointer font-medium text-ink-2 underline decoration-line underline-offset-[3px] hover:text-ink hover:decoration-ink disabled:cursor-default"
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}
