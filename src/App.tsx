import { useCallback, useEffect, useRef, useState } from "react";
import { fetchComps, fetchFinancials, fetchValuation } from "./api";
import { AssumptionsPanel } from "./components/AssumptionsPanel";
import { CompsTable } from "./components/CompsTable";
import { FcfChart } from "./components/FcfChart";
import { ProjectionTable } from "./components/ProjectionTable";
import { SensitivityTable } from "./components/SensitivityTable";
import { Summary } from "./components/Summary";
import { TickerForm } from "./components/TickerForm";
import { Section } from "./components/ui";
import { LearnToggle, Term } from "./learn/core";
import { Walkthrough, WalkthroughButton } from "./learn/walkthrough";
import type { Assumptions, CompsResponse, FinancialsResponse, Source, Valuation } from "./types";

function readUrl(): { ticker: string | null; source: Source } {
  const p = new URLSearchParams(window.location.search);
  return { ticker: p.get("t"), source: p.get("src") === "edgar" ? "edgar" : "yfinance" };
}

export default function App() {
  const initial = useRef(readUrl()).current;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<FinancialsResponse | null>(null);
  const [assumptions, setAssumptions] = useState<Assumptions | null>(null);
  const [valuation, setValuation] = useState<Valuation | null>(null);
  const [valBusy, setValBusy] = useState(false);
  const [walking, setWalking] = useState(false);
  const [valError, setValError] = useState<string | null>(null);

  const [comps, setComps] = useState<CompsResponse | null>(null);
  const [peers, setPeers] = useState<string[]>([]);
  const [compsLoading, setCompsLoading] = useState(false);
  const [compsError, setCompsError] = useState<string | null>(null);
  const compsReq = useRef(0);

  const loadComps = useCallback(async (ticker: string, peerList?: string[]) => {
    const id = ++compsReq.current;
    setCompsLoading(true);
    setCompsError(null);
    try {
      const res = await fetchComps(ticker, peerList);
      if (id !== compsReq.current) return;
      setComps(res);
      if (!peerList) setPeers([...res.peers.map((p) => p.ticker), ...res.missing]);
    } catch (e) {
      if (id === compsReq.current) setCompsError((e as Error).message);
    } finally {
      if (id === compsReq.current) setCompsLoading(false);
    }
  }, []);

  const load = useCallback(
    async (ticker: string, source: Source) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchFinancials(ticker, source);
        setData(res);
        setAssumptions(res.assumptions);
        setValuation(res.valuation);
        setValError(null);
        setComps(null);
        setPeers([]);
        loadComps(ticker);
        const url = new URL(window.location.href);
        url.searchParams.set("t", ticker);
        url.searchParams.set("src", source);
        window.history.replaceState(null, "", url);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [loadComps],
  );

  useEffect(() => {
    if (initial.ticker) load(initial.ticker.toUpperCase(), initial.source);
  }, [initial, load]);

  // Re-value on assumption changes (debounced; stale requests aborted).
  useEffect(() => {
    if (!data || !assumptions || assumptions === data.assumptions) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setValBusy(true);
      try {
        const v = await fetchValuation(data.snapshot, assumptions, ctrl.signal);
        setValuation(v);
        setValError(null);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setValError((e as Error).message);
      } finally {
        if (!ctrl.signal.aborted) setValBusy(false);
      }
    }, 150);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [assumptions, data]);

  const snap = data?.snapshot;
  const ccy = snap?.currency ?? "USD";
  const notes = data ? [...data.snapshot.warnings, ...data.notes] : [];
  const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <header className="border-b-[3px] border-double border-rule">
        <div className="mx-auto max-w-[1320px] px-4 sm:px-8">
          <div className="flex items-center justify-between border-b border-line py-2 text-xs text-ink-3">
            <span>Equity valuation · Discounted cash flow</span>
            <div className="flex items-center gap-5">
              {data && <WalkthroughButton onStart={() => setWalking(true)} />}
              <LearnToggle />
              <time className="num hidden sm:inline">{today}</time>
            </div>
          </div>
          <div className="flex flex-col gap-6 py-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="font-serif text-[32px] font-medium leading-none tracking-[-0.02em]">
                DCFTool<span className="text-accent">.</span>
              </div>
              <p className="mt-2 text-[13px] text-ink-3">
                <Term k="unlevered">Unlevered</Term> <Term k="dcf">DCF</Term> · <Term k="cost_of_equity">CAPM</Term>{" "}
                <Term k="wacc">discount rate</Term> · <Term k="terminal_value">Gordon terminal value</Term>
              </p>
            </div>
            <TickerForm onSubmit={load} loading={loading} initialSource={initial.source} />
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-[1320px] overflow-x-clip px-4 py-8 sm:px-8 sm:py-10">
        {error && (
          <div role="alert" className="mb-6 border-l-[3px] border-bad bg-surface px-4 py-3 text-sm">
            <span className="font-semibold text-bad">Could not load that ticker.</span> <span className="text-ink-2">{error}</span>
          </div>
        )}

        {!data && !loading && <EmptyState />}
        {!data && loading && <LoadingState />}

        {data && snap && assumptions && valuation && (
          <div className={`transition-opacity duration-200 ${loading ? "opacity-40" : ""}`}>
            <Summary snap={snap} val={valuation} busy={valBusy} />

            {valError && (
              <div role="alert" className="mt-6 border-l-[3px] border-bad bg-surface px-4 py-2.5 text-sm">
                <span className="font-semibold text-bad">{valError}.</span> <span className="text-ink-2">Showing the last valid result.</span>
              </div>
            )}

            {notes.length > 0 && (
              <details className="group mt-6 border-l-[3px] border-note-ink/40 bg-note-bg px-4 py-2.5 text-[13px] text-note-ink">
                <summary className="cursor-pointer select-none font-medium">
                  Notes on the data ({notes.length}): what was estimated, converted or defaulted
                </summary>
                <ol className="mt-2 list-decimal space-y-1 pl-5">
                  {notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ol>
              </details>
            )}

            <div className="mt-10 grid grid-cols-1 items-start gap-10 lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-12">
              <div className="min-w-0 lg:sticky lg:top-6">
                <AssumptionsPanel
                  a={assumptions}
                  defaults={data.assumptions}
                  hist={data.historical}
                  wacc={valuation.wacc}
                  projections={valuation.projections}
                  riskFreeSource={data.risk_free_source}
                  onChange={setAssumptions}
                />
              </div>

              <div className="min-w-0 space-y-14">
                <Section n={1} title={<Term k="ufcf">Free cash flow</Term>} note="Reported history against the projection your inputs imply.">
                  <FcfChart historical={valuation.historical} projections={valuation.projections} ccy={ccy} />
                </Section>
                <Section n={2} title={<Term k="dcf">Discounted cash flow</Term>} note="EBIT × (1 − t) + D&A − CapEx − ΔNWC, discounted at WACC.">
                  <ProjectionTable val={valuation} ccy={ccy} snap={snap} />
                </Section>
                <Section n={3} walkId="sensitivity" title={<Term k="sensitivity">Sensitivity</Term>} note="Implied value per share across discount rate and perpetual growth.">
                  <SensitivityTable val={valuation} ccy={ccy} />
                </Section>
                <Section n={4} walkId="comps" title={<Term k="comps">Trading comparables</Term>} note="Peers default to the largest names in the same industry. Add or remove tickers to change the set.">
                  <CompsTable
                    data={comps}
                    loading={compsLoading}
                    error={compsError}
                    peers={peers}
                    onPeersChange={(p) => {
                      setPeers(p);
                      loadComps(snap.ticker, p);
                    }}
                    ccy={ccy}
                    dcfPrice={valuation.implied_price}
                  />
                </Section>
              </div>
            </div>
          </div>
        )}
      </main>

      {walking && data && snap && valuation && <Walkthrough val={valuation} snap={snap} onClose={() => setWalking(false)} />}

      <footer className="mx-auto max-w-[1320px] px-4 pb-10 sm:px-8">
        <div className="border-t border-line pt-4 text-xs text-ink-3">
          For education and illustration. Not investment advice. Financial data from Yahoo Finance and SEC EDGAR.
        </div>
      </footer>
    </div>
  );
}

function LoadingState() {
  return (
    <div aria-live="polite" className="animate-pulse space-y-6 py-4">
      <span className="sr-only">Pulling financials</span>
      <div className="h-3 w-64 bg-surface-2" />
      <div className="h-12 w-[28rem] max-w-full bg-surface-2" />
      <div className="h-4 w-[36rem] max-w-full bg-surface-2" />
      <div className="h-4 w-[30rem] max-w-full bg-surface-2" />
    </div>
  );
}

function EmptyState() {
  const steps: [string, string][] = [
    ["Financials", "Revenue, EBIT, D&A, CapEx and working capital, from Yahoo Finance or straight from SEC XBRL filings."],
    ["Projection", "Growth and margins start from the company's own history. Change any of them."],
    ["Discount rate", "Cost of equity from CAPM on the live 10-year Treasury, weighted against after-tax cost of debt."],
    ["Cross-checks", "A WACC × growth sensitivity grid and trading multiples against industry peers."],
  ];
  return (
    <div className="grid gap-12 py-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:py-12">
      <div>
        <h1 className="max-w-xl font-serif text-5xl font-medium leading-[1.02] tracking-[-0.025em] sm:text-6xl">
          What is the business actually worth?
        </h1>
        <p className="mt-6 max-w-lg font-serif text-xl leading-relaxed text-ink-2">
          Enter a ticker to build a discounted cash flow model from reported financials, then pressure-test it with your own
          assumptions.
        </p>
      </div>
      <ol className="border-t border-rule">
        {steps.map(([t, d], i) => (
          <li key={t} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-2 border-b border-line py-4">
            <span className="num font-serif text-lg text-ink-3">{i + 1}</span>
            <div>
              <div className="font-semibold">{t}</div>
              <p className="mt-1 text-sm leading-relaxed text-ink-2">{d}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
