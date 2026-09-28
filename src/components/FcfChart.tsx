import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { money } from "../format";
import type { HistoricalRow, ProjectionRow } from "../types";

interface Point {
  label: string;
  fcf: number | null;
  kind: "Actual" | "Estimate";
  revenue: number | null;
}

const COLORS = { Actual: "var(--hist)", Estimate: "var(--proj)" };

function ChartTooltip({ active, payload, ccy }: { active?: boolean; payload?: { payload: Point }[]; ccy: string }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="border border-line-strong bg-surface px-3 py-2 text-xs shadow-[0_2px_8px_rgb(0_0_0/0.08)]">
      <div className="mb-1 flex items-center gap-1.5 font-semibold">
        <span className="h-2 w-2" style={{ background: COLORS[p.kind] }} />
        {p.label} · {p.kind.toLowerCase()}
      </div>
      <div className="flex justify-between gap-4 text-ink-2">
        <span>Unlevered FCF</span>
        <span className="num text-ink">{money(p.fcf, ccy)}</span>
      </div>
      <div className="flex justify-between gap-4 text-ink-2">
        <span>Revenue</span>
        <span className="num text-ink">{money(p.revenue, ccy)}</span>
      </div>
    </div>
  );
}

export function FcfChart({ historical, projections, ccy }: {
  historical: HistoricalRow[];
  projections: ProjectionRow[];
  ccy: string;
}) {
  const data: Point[] = [
    ...historical.map((h) => ({ label: `FY${h.year}`, fcf: h.fcf, kind: "Actual" as const, revenue: h.revenue })),
    ...projections.map((p) => ({ label: `FY${p.year}E`, fcf: p.fcf, kind: "Estimate" as const, revenue: p.revenue })),
  ];

  return (
    <div>
      <div className="mb-3 flex items-center gap-5 text-[13px] text-ink-2">
        {(["Actual", "Estimate"] as const).map((k) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5" style={{ background: COLORS[k] }} />
            {k}
          </span>
        ))}
        <span className="ml-auto text-xs text-ink-3">{ccy}, unlevered</span>
      </div>
      <div className="h-64 w-full" role="img" aria-label={`Unlevered free cash flow, ${data[0]?.label} to ${data[data.length - 1]?.label}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barCategoryGap="22%">
            <CartesianGrid vertical={false} stroke="var(--line)" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--ink-3)", fontSize: 12 }}
              interval="preserveStartEnd"
              minTickGap={8}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={60}
              tick={{ fill: "var(--ink-3)", fontSize: 12 }}
              tickFormatter={(v: number) => money(v, ccy)}
            />
            <ReferenceLine y={0} stroke="var(--rule)" />
            <Tooltip cursor={{ fill: "var(--surface-2)", opacity: 0.6 }} content={<ChartTooltip ccy={ccy} />} />
            <Bar dataKey="fcf" radius={[2, 2, 0, 0]} maxBarSize={40} isAnimationActive={false}>
              {data.map((d) => (
                <Cell key={d.label} fill={COLORS[d.kind]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
