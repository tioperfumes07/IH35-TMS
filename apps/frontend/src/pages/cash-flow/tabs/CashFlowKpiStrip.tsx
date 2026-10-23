import { formatUsdCents } from "../../../lib/money";
import { V3 } from "../../../design/v3-tokens";

// REG-031 (Cash Flow Home page) — extracted from RollingLedgerTab.tsx's KPI strip.
// ROUND 443.250: restyled onto the single V3 token palette (no per-page hex).
export type CashFlowKpis = {
  opening: number | null;
  incomeToday: number;
  expensesToday: number;
  carriedOver: number;
  netToday: number;
  projectedClosing: number | null;
  incomeNotFactored: number;
  dueNext10: number;
};

export function formatCashFlowCents(cents: number, opts?: { sign?: boolean }): string {
  const abs = Math.abs(cents);
  const dollars = formatUsdCents(abs);
  if (opts?.sign && cents < 0) return `−${dollars}`;
  if (opts?.sign && cents > 0) return `+${dollars}`;
  return cents < 0 ? `−${dollars}` : dollars;
}

export function CashFlowKpiStrip({ kpis, testId = "cash-flow-kpi-strip" }: { kpis: CashFlowKpis; testId?: string }) {
  const tiles: {
    label: string;
    value: number | null;
    sign?: boolean;
    bad?: boolean;
    ok?: boolean;
    zero?: boolean;
  }[] = [
    { label: "Opening cash", value: kpis.opening },
    { label: "Income due today", value: kpis.incomeToday, zero: kpis.incomeToday === 0 },
    { label: "Expenses due today", value: kpis.expensesToday, bad: kpis.expensesToday > 0 },
    { label: "Carried over", value: kpis.carriedOver, zero: kpis.carriedOver === 0 },
    { label: "Net today", value: kpis.netToday, sign: true, bad: kpis.netToday < 0 },
    { label: "Projected closing", value: kpis.projectedClosing, sign: true, bad: kpis.projectedClosing !== null && kpis.projectedClosing < 0 },
    { label: "Open invoices (not factored)", value: kpis.incomeNotFactored, ok: true },
    { label: "Due next 10 days", value: kpis.dueNext10, ok: true },
  ];

  return (
    <div className="grid grid-cols-4 sm:grid-cols-8" style={{ gap: 6 }} data-testid={testId}>
      {tiles.map((tile) => (
        <div
          key={tile.label}
          title={tile.label}
          style={{
            height: 60,
            boxSizing: "border-box",
            background: V3.headerBg,
            border: `1px solid ${V3.border}`,
            borderRadius: 2,
            padding: "4px 8px",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            fontFamily: V3.font,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: ".275px",
              color: V3.muted,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {tile.label}
          </div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              fontVariantNumeric: "tabular-nums",
              whiteSpace: "nowrap",
              color: tile.bad ? V3.ink : tile.ok ? V3.muted : tile.zero ? V3.slate : V3.ink,
            }}
          >
            {tile.value === null ? "—" : formatCashFlowCents(tile.value, { sign: tile.sign })}
          </div>
        </div>
      ))}
    </div>
  );
}
