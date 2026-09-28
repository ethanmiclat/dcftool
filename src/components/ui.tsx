import type { ReactNode } from "react";

/** Numbered report section: serif heading over a hairline, no card chrome. */
export function Section({ n, title, note, action, children, walkId }: {
  n: number;
  title: ReactNode;
  note?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  walkId?: string;
}) {
  return (
    <section aria-labelledby={`sec-${n}`} data-walk={walkId}>
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-rule pb-2">
        <div className="flex items-baseline gap-3">
          <span className="num font-serif text-base text-ink-3">{n}</span>
          <h2 id={`sec-${n}`} className="font-serif text-[22px] font-medium leading-tight tracking-[-0.01em]">
            {title}
          </h2>
        </div>
        {action}
      </header>
      {note && <p className="mt-2 text-[13px] text-ink-3">{note}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Text tabs with an underline for the active option. */
export function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex items-center gap-4">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`-mb-px cursor-pointer border-b-2 py-1 text-[13px] transition-colors duration-150 ${
              active ? "border-ink font-semibold text-ink" : "border-transparent text-ink-3 hover:text-ink"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block h-3 w-3 animate-spin rounded-full border-[1.5px] border-current border-t-transparent ${className}`}
    />
  );
}

export function TextLink({ children, onClick, ...rest }: {
  children: ReactNode;
  onClick: () => void;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      onClick={onClick}
      {...rest}
      className="cursor-pointer text-[13px] text-accent underline decoration-line-strong underline-offset-[3px] transition-colors hover:decoration-accent disabled:cursor-default disabled:text-ink-3 disabled:no-underline"
    >
      {children}
    </button>
  );
}
