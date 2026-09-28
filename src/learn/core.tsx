// Learn mode: an on/off switch, clickable term definitions and the ⓘ fallback.
// Everything learn-specific lives in src/learn/, so removing the feature means deleting
// this folder and the lines that import from it.
import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { GLOSSARY, type GlossaryKey } from "./glossary";

const STORAGE_KEY = "learn-mode";
const LearnCtx = createContext<{ on: boolean; setOn: (v: boolean) => void }>({ on: false, setOn: () => {} });

function readStored(): boolean {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v == null ? true : v === "1"; // on by default
  } catch {
    return true;
  }
}

export function LearnProvider({ children }: { children: ReactNode }) {
  const [on, setOnState] = useState(readStored);
  const setOn = useCallback((v: boolean) => {
    setOnState(v);
    try {
      localStorage.setItem(STORAGE_KEY, v ? "1" : "0");
    } catch {
      /* storage unavailable: the choice just won't persist */
    }
  }, []);
  return <LearnCtx.Provider value={{ on, setOn }}>{children}</LearnCtx.Provider>;
}

export const useLearn = () => useContext(LearnCtx).on;

export function LearnToggle() {
  const { on, setOn } = useContext(LearnCtx);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => setOn(!on)}
      className="group flex cursor-pointer items-center gap-2 text-xs text-ink-2 hover:text-ink"
    >
      <span>Learn mode</span>
      <span
        aria-hidden
        className={`relative inline-block h-[18px] w-8 shrink-0 rounded-full border transition-colors duration-150 ${
          on ? "border-accent bg-accent" : "border-line-strong bg-transparent"
        }`}
      >
        {/* Explicit left anchor: without it the knob sits at its static position and overflows the track. */}
        <span
          className={`absolute left-px top-px h-3.5 w-3.5 rounded-full transition-[translate,background-color] duration-150 ${
            on ? "translate-x-3.5 bg-accent-ink" : "translate-x-0 bg-line-strong"
          }`}
        />
      </span>
    </button>
  );
}

/**
 * Shared popover plumbing for the two triggers below (`Term` and `Info`).
 * Returns the refs to hang on the trigger and the panel, plus the panel itself.
 */
function useDefinition(k: GlossaryKey, open: boolean, setOpen: (v: boolean) => void) {
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const id = useId();
  const e = GLOSSARY[k];

  // Fixed-position popover so table scroll containers cannot clip it.
  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const width = Math.min(320, window.innerWidth - 16);
    const left = Math.max(8, Math.min(r.left - 12, window.innerWidth - width - 8));
    const h = pop.current?.offsetHeight ?? 160;
    const below = r.bottom + 6;
    const top = below + h > window.innerHeight - 8 && r.top - h - 6 > 8 ? r.top - h - 6 : below;
    setPos({ top, left, width });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onDown = (ev: MouseEvent) => {
      const t = ev.target as Node;
      if (!pop.current?.contains(t) && !btn.current?.contains(t)) close();
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        close();
        btn.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const panel =
    open &&
    createPortal(
      <div
        ref={pop}
        id={id}
        role="dialog"
        aria-label={e.title}
        style={{ top: pos?.top ?? -9999, left: pos?.left ?? 0, width: pos?.width ?? 320 }}
        className="fixed z-50 border border-line-strong border-t-[3px] border-t-accent bg-surface px-4 py-3 text-left text-[13px] font-normal not-italic leading-relaxed text-ink shadow-[0_8px_24px_rgba(0,0,0,0.18)]"
      >
        <div className="font-serif text-[15px] font-medium">{e.title}</div>
        <p className="mt-1 text-ink-2">{e.what}</p>
        {"why" in e && e.why && <p className="mt-2 text-ink-2">{e.why}</p>}
        {"move" in e && e.move && (
          <p className="mt-2 border-t border-line pt-2 text-ink">
            <span className="smallcaps text-ink-3">Effect </span>
            {e.move}
          </p>
        )}
      </div>,
      document.body,
    );

  // Click handling is shared: don't let the trigger toggle an enclosing <label>'s control.
  const trigger = (ev: ReactMouseEvent) => {
    ev.preventDefault();
    ev.stopPropagation();
    setOpen(!open);
  };

  return { btn, id, entry: e, panel, trigger };
}

/**
 * An underlined financial term. Click it to read the definition.
 * With learn mode off it renders as plain text, so copy stays intact.
 */
export function Term({ k, children, className = "" }: { k: GlossaryKey; children?: ReactNode; className?: string }) {
  const on = useLearn();
  const [open, setOpen] = useState(false);
  const { btn, id, entry, panel, trigger } = useDefinition(k, open, setOpen);

  if (!on) return <>{children ?? entry.title}</>;
  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-label={`What is ${entry.title}?`}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={trigger}
        className={`cursor-help text-left underline decoration-dotted decoration-from-font underline-offset-[3px] transition-colors ${
          open ? "text-accent decoration-accent" : "decoration-line-strong hover:text-accent hover:decoration-accent"
        } ${className}`}
      >
        {children ?? entry.title}
      </button>
      {panel}
    </>
  );
}

/** ⓘ button for places with no word to underline. Renders nothing when learn mode is off. */
export function Info({ k, className = "" }: { k: GlossaryKey; className?: string }) {
  const on = useLearn();
  const [open, setOpen] = useState(false);
  const { btn, id, entry, panel, trigger } = useDefinition(k, open, setOpen);

  if (!on) return null;
  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-label={`What is ${entry.title}?`}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={trigger}
        className={`-my-1 inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center align-middle text-accent ${className}`}
      >
        <span
          aria-hidden
          className={`flex h-[15px] w-[15px] items-center justify-center rounded-full border border-current font-serif text-[10px] font-semibold italic leading-none transition-colors ${
            open ? "bg-accent text-accent-ink" : ""
          }`}
        >
          i
        </span>
      </button>
      {panel}
    </>
  );
}

/** “In plain English” box. Renders nothing when learn mode is off. */
export function Lesson({ title = "In plain English", children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  if (!useLearn()) return null;
  return (
    <aside className={`border-l-[3px] border-accent bg-surface px-4 py-3 text-[13px] leading-relaxed text-ink-2 ${className}`}>
      <div className="smallcaps mb-1 text-accent">{title}</div>
      <div className="space-y-2">{children}</div>
    </aside>
  );
}

/** Emphasized number inside a lesson. */
export function N({ children }: { children: ReactNode }) {
  return <span className="num font-semibold text-ink">{children}</span>;
}
