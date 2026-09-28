import type { Num } from "./types";

const SYMBOLS: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", JPY: "¥", CAD: "C$", AUD: "A$" };
export const sym = (ccy: string) => SYMBOLS[ccy] ?? `${ccy} `;

export function money(v: Num | undefined, ccy = "USD"): string {
  if (v == null || !isFinite(v)) return "—";
  const s = sym(ccy);
  const a = Math.abs(v);
  const sign = v < 0 ? "−" : "";
  if (a >= 1e12) return `${sign}${s}${(a / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `${sign}${s}${(a / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${sign}${s}${(a / 1e6).toFixed(1)}M`;
  return `${sign}${s}${a.toFixed(0)}`;
}

/** Values in billions for tables (keeps columns aligned). */
export function bn(v: Num | undefined, digits = 1): string {
  if (v == null || !isFinite(v)) return "—";
  const x = v / 1e9;
  const txt = Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return x < 0 ? `(${txt})` : txt;
}

export function price(v: Num | undefined, ccy = "USD"): string {
  if (v == null || !isFinite(v)) return "—";
  const txt = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${v < 0 ? "−" : ""}${sym(ccy)}${txt}`;
}

export function pct(v: Num | undefined, digits = 1): string {
  if (v == null || !isFinite(v)) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}

export function signedPct(v: Num | undefined, digits = 1): string {
  if (v == null || !isFinite(v)) return "—";
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v * 100).toFixed(digits)}%`;
}

export function multiple(v: Num | undefined): string {
  if (v == null || !isFinite(v)) return "—";
  return `${v.toFixed(1)}x`;
}
