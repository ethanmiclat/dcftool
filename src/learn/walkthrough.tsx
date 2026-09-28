// Guided walkthrough: steps through the model in place, spotlighting the rows it explains.
// Targets are marked with data-walk="<id>" in the model components.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { money, pct, price } from "../format";
import type { Snapshot, Valuation } from "../types";
import { N } from "./core";

type Rect = { top: number; left: number; width: number; height: number };
type Step = { id: string; target: string; title: string; body: (v: Valuation, s: Snapshot) => React.ReactNode };

const PAD = 8;
const CARD_W = 380;
const GAP = 14;

const STEPS: Step[] = [
  {
    id: "question",
    target: "summary",
    title: "The question",
    body: (v, s) => {
      const up = v.upside ?? 0;
      return (
        <>
          A share is a claim on the cash a business will produce. This model works out what that cash is worth today:{" "}
          <N>{price(v.implied_price, s.currency)}</N> a share, against a market price of <N>{price(v.current_price, s.currency)}</N>
          {Math.abs(up) < 0.05 ? ". Much the same." : `, ${pct(Math.abs(up), 0)} ${up > 0 ? "higher" : "lower"}.`} The next steps show how
          it got there.
        </>
      );
    },
  },
  {
    id: "inputs",
    target: "inputs",
    title: "It all starts with assumptions",
    body: () => (
      <>
        Every blue number here is a guess about the future, seeded from the company’s own history and analyst estimates. Everything else
        on the page is calculated from them. Four matter most: revenue growth, EBIT margin, WACC and perpetual growth.
      </>
    ),
  },
  {
    id: "revenue",
    target: "row-revenue",
    title: "Forecast the sales",
    body: (v, s) => {
      const p = v.projections[0];
      return (
        <>
          Columns marked A are reported history; E are estimates. Revenue grows <N>{pct(p.growth, 1)}</N> next year to{" "}
          <N>{money(p.revenue, s.currency)}</N>. Growth then fades toward the long-run rate, which is why the later
          percentages get smaller.
        </>
      );
    },
  },
  {
    id: "profit",
    target: "row-nopat",
    title: "Turn sales into profit, after tax",
    body: (v, s) => {
      const p = v.projections[0];
      return (
        <>
          The EBIT margin of <N>{pct(p.ebit_margin, 1)}</N> turns revenue into operating profit, <N>{money(p.ebit, s.currency)}</N>. Take off tax at{" "}
          <N>{pct(1 - p.nopat / p.ebit, 1)}</N> and you are left with <N>{money(p.nopat, s.currency)}</N>, called NOPAT.
        </>
      );
    },
  },
  {
    id: "fcf",
    target: "row-ufcf",
    title: "From profit to actual cash",
    body: (v, s) => {
      const p = v.projections[0];
      return (
        <>
          Profit is not cash. Add back D&A of {money(p.da, s.currency)} (an expense where no money moves), subtract CapEx of {money(p.capex, s.currency)} (real
          money spent on equipment), and{" "}
          {p.nwc_change >= 0 ? <>subtract {money(p.nwc_change, s.currency)} tied up in day-to-day operations</> : <>add {money(-p.nwc_change, s.currency)} released from day-to-day operations</>}
          : free cash flow of <N>{money(p.fcf, s.currency)}</N>. This is the cash the business really throws off.
        </>
      );
    },
  },
  {
    id: "discount",
    target: "row-pv_fcf",
    title: "Discount it back to today",
    body: (v) => {
      const p = v.projections[0];
      const last = v.projections[v.projections.length - 1];
      return (
        <>
          Money later is worth less than money now. At a WACC of <N>{pct(v.wacc.wacc, 1)}</N>, each dollar in {p.year} is worth{" "}
          <N>{p.discount_factor.toFixed(3)}</N> today, and by {last.year} only <N>{last.discount_factor.toFixed(3)}</N>. Watch this row
          shrink relative to the cash flow row above it.
        </>
      );
    },
  },
  {
    id: "terminal",
    target: "terminal",
    title: "Value everything after the forecast",
    body: (v, s) => (
      <>
        The business does not stop at the end of the forecast. The terminal value assumes cash grows at a fixed rate forever, giving{" "}
        <N>{money(v.terminal_value, s.currency)}</N>, worth <N>{money(v.pv_terminal_value, s.currency)}</N> in today’s money. That is{" "}
        <N>{pct(v.tv_pct_of_ev, 0)}</N> of the whole valuation, so those long-run guesses matter enormously.
      </>
    ),
  },
  {
    id: "bridge",
    target: "bridge",
    title: "From business value to share price",
    body: (v, s) => (
      <>
        Forecast plus terminal value gives the value of the whole business, <N>{money(v.enterprise_value, s.currency)}</N>. Lenders get
        paid first, so subtract debt and add cash: <N>{money(v.equity_value, s.currency)}</N> for shareholders. Divide by{" "}
        <N>{(s.shares_outstanding / 1e9).toFixed(2)}B</N> shares and you have the value per share.
      </>
    ),
  },
  {
    id: "sensitivity",
    target: "sensitivity",
    title: "How much could it be wrong?",
    body: (v, s) => {
      const cells = v.sensitivity.implied_price.flat().filter((x): x is number => x != null);
      return (
        <>
          WACC and perpetual growth are the hardest inputs to pin down, so the model is re-run across a grid of them. Small changes give
          values from <N>{price(Math.min(...cells), s.currency)}</N> to <N>{price(Math.max(...cells), s.currency)}</N>. This is why
          bankers quote a range, not one number.
        </>
      );
    },
  },
  {
    id: "comps",
    target: "comps",
    title: "A second opinion",
    body: () => (
      <>
        The DCF values the company from its own cash. Comps value it the way you price a house: by what similar companies sell for, using
        multiples like EV/EBITDA and P/E. If the two disagree sharply, one of them is making an assumption worth questioning.
      </>
    ),
  },
  {
    id: "yourturn",
    target: "inputs",
    title: "Now change something",
    body: (v, s) => (
      <>
        Drag one blue input at a time and watch the value at the top. Raise growth or lower the WACC and the value rises. To justify
        today’s price of {price(v.current_price, s.currency)} you would need
        {v.market_implied.wacc != null ? <> a WACC of <N>{pct(v.market_implied.wacc, 1)}</N></> : " a much lower WACC"}
        {v.market_implied.revenue_growth != null ? <>, or growth of <N>{pct(v.market_implied.revenue_growth, 1)}</N> a year</> : ""}. Do
        you believe that?
      </>
    ),
  },
];

const rectOf = (el: Element): Rect => {
  const r = el.getBoundingClientRect();
  return { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 };
};

export function WalkthroughButton({ onStart, label = "Walk me through it" }: { onStart: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onStart}
      className="cursor-pointer whitespace-nowrap border-b border-accent/40 text-xs text-accent transition-colors hover:border-accent"
    >
      {label}
    </button>
  );
}

export function Walkthrough({ val, snap, onClose }: { val: Valuation; snap: Snapshot; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const [cardH, setCardH] = useState(180);
  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  const measure = useCallback(() => {
    const el = document.querySelector(`[data-walk="${step.target}"]`);
    setRect(el ? rectOf(el) : null);
  }, [step.target]);

  // Bring the target into view, then track it while the page scrolls.
  useEffect(() => {
    const el = document.querySelector(`[data-walk="${step.target}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    let raf = 0;
    const tick = () => {
      measure();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [step.target, measure]);

  useLayoutEffect(() => {
    if (card.current) setCardH(card.current.offsetHeight);
  }, [i, rect?.width]);

  useEffect(() => {
    card.current?.focus();
  }, [i]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setI((n) => Math.min(n + 1, STEPS.length - 1));
      if (e.key === "ArrowLeft") setI((n) => Math.max(n - 1, 0));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.min(CARD_W, vw - 24);
  // Sit under the spotlight when there is room, otherwise above it, otherwise pinned low.
  let top = vh - cardH - 16;
  let left = (vw - w) / 2;
  if (rect) {
    const below = rect.top + rect.height + GAP;
    const above = rect.top - cardH - GAP;
    const beside = Math.max(8, Math.min(rect.top, vh - cardH - 16));
    if (below + cardH < vh - 8) {
      top = below;
      left = rect.left + rect.width / 2 - w / 2;
    } else if (above > 8) {
      top = above;
      left = rect.left + rect.width / 2 - w / 2;
    } else if (rect.left - GAP - w > 12) {
      // Target taller than the viewport: sit alongside it rather than covering it.
      top = beside;
      left = rect.left - GAP - w;
    } else if (rect.left + rect.width + GAP + w < vw - 12) {
      top = beside;
      left = rect.left + rect.width + GAP;
    } else {
      top = Math.max(8, vh - cardH - 16);
      left = rect.left + rect.width / 2 - w / 2;
    }
    left = Math.max(12, Math.min(left, vw - w - 12));
  }

  const shade = "fixed bg-[rgba(8,10,14,0.55)]";
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Guided walkthrough">
      {/* Spotlight: four panels around the target, so the target itself stays crisp and clickable. */}
      {rect ? (
        <>
          <div className={shade} style={{ top: 0, left: 0, right: 0, height: Math.max(0, rect.top) }} />
          <div className={shade} style={{ top: rect.top + rect.height, left: 0, right: 0, bottom: 0 }} />
          <div className={shade} style={{ top: rect.top, left: 0, width: Math.max(0, rect.left), height: rect.height }} />
          <div className={shade} style={{ top: rect.top, left: rect.left + rect.width, right: 0, height: rect.height }} />
          <div
            aria-hidden
            className="pointer-events-none fixed border-2 border-accent"
            style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
          />
        </>
      ) : (
        <div className={shade} style={{ inset: 0 }} />
      )}

      <div
        ref={card}
        tabIndex={-1}
        className="fixed z-[60] border border-line-strong border-t-[3px] border-t-accent bg-surface px-5 py-4 shadow-[0_10px_30px_rgba(0,0,0,0.3)] focus:outline-none"
        style={{ top, left, width: w }}
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="smallcaps text-ink-3">
            Step {i + 1} of {STEPS.length}
          </span>
          <button type="button" onClick={onClose} className="cursor-pointer text-xs text-ink-3 hover:text-ink">
            Close
          </button>
        </div>
        <h2 className="mt-1 font-serif text-lg font-medium tracking-[-0.01em]">{step.title}</h2>
        <p aria-live="polite" className="mt-1.5 text-[13px] leading-relaxed text-ink-2">
          {step.body(val, snap)}
        </p>
        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="hidden gap-1 sm:flex" aria-hidden>
            {STEPS.map((s, n) => (
              <span key={s.id} className={`h-1 w-4 ${n === i ? "bg-accent" : n < i ? "bg-line-strong" : "bg-line"}`} />
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setI((n) => Math.max(0, n - 1))}
              disabled={i === 0}
              className="cursor-pointer text-[13px] text-ink-2 hover:text-ink disabled:cursor-default disabled:text-ink-3/50"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => (last ? onClose() : setI((n) => n + 1))}
              className="cursor-pointer bg-accent px-3 py-1.5 text-[13px] font-medium text-accent-ink"
            >
              {last ? "Done" : "Next →"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
