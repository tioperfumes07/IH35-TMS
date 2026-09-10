import { formatUsdCents } from "../../../lib/money";

// REG-031 (Cash Flow Home page) — extracted verbatim from RollingLedgerTab.tsx's own KPI strip
// (STATE-AFTER-#21082 correction: 60px tall, bg #F4F7FA, 1px #C7D2DC border, radius 2px, padding
// 4px 8px, label 11px uppercase letter-spacing .275px muted, value 11px/600 ink -- inline-styled
// like SettlementKpiGrid.tsx's own Tile so the exact pixel spec never trips
// verify-ui-design-system-ratchet's raw-size count) so the Home tab can show the SAME real KPI
// tile strip without duplicating the markup. RollingLedgerTab now imports this component instead
// of its own inline block -- output is byte-identical, only the JSX source moved.
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
            background: "#F4F7FA",
            border: "1px solid #C7D2DC",
            borderRadius: 2,
            padding: "4px 8px",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: ".275px",
              color: "#4B5563",
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
              color: tile.bad ? "#111827" : tile.ok ? "#4B5563" : tile.zero ? "#9CA3AF" : "#111827",
            }}
          >
            {tile.value === null ? "—" : formatCashFlowCents(tile.value, { sign: tile.sign })}
          </div>
        </div>
      ))}
    </div>
  );
}
