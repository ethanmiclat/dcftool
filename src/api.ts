import type { Assumptions, CompsResponse, FinancialsResponse, Snapshot, Source, Valuation } from "./types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body as T;
}

export const fetchFinancials = (ticker: string, source: Source) =>
  request<FinancialsResponse>(`/api/financials?ticker=${encodeURIComponent(ticker)}&source=${source}`);

export const fetchValuation = (snapshot: Snapshot, assumptions: Assumptions, signal?: AbortSignal) =>
  request<Valuation>("/api/valuation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ snapshot, assumptions }),
    signal,
  });

export const fetchComps = (ticker: string, peers?: string[]) => {
  const q = peers ? `&peers=${encodeURIComponent(peers.join(","))}` : "";
  return request<CompsResponse>(`/api/comps?ticker=${encodeURIComponent(ticker)}${q}`);
};
