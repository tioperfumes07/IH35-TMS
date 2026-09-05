import { formatUsdCents } from "../../../lib/money";

/**
 * L5 — driver settlement detail KPI grid, an exact transcription of the owner-approved reference
 * `docs/design/reference/DRIVER-SETTLEMENT-DETAIL-REFERENCE-2026-09-05.html` (.kpis / .kpi block).
 * Six tiles, 6-column grid, each 93px tall on `--kpi-bg #F4F7FA` with a `--th-rule #C7D2DC` border,
 * radius 4px: Loaded pay · Empty miles pay · Additional pay · Reimbursements · Deductions · Net pay.
 * Values are tabular-nums 20px/600; labels 11px/700 uppercase #4B5563; sub 11px muted.
 *
 * Colours/sizes are inline-styled straight from the reference contract (not Tailwind palette classes)
 * so this screen matches the locked reference and the design-contract guard can assert computed styles.
 * Dash-never-zero is a table rule (dash for a not-measured CELL); KPI money tiles are true totals and
 * legitimately read $0.00 when a section has no lines (that is a fact, not a missing measurement).
 */

const MILES = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const RATE = new Intl.NumberFormat("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 });

export type SettlementKpiGridProps = {
  loadedPayCents: number;
  loadedMiles: number;
  loadedRate: number; // dollars per mile
  emptyPayCents: number;
  emptyMiles: number;
  emptyRate: number;
  additionalCents: number;
  additionalLines: number;
  reimbursementCents: number;
  reimbursementLines: number;
  deductionCents: number; // positive magnitude
  deductionBreakdown: string;
  netPayCents: number;
};

function Tile({ label, value, sub, negative }: { label: string; value: string; sub: string; negative?: boolean }) {
  return (
    <div
      style={{
        height: 93,
        boxSizing: "border-box",
        background: "#F4F7FA",
        border: "1px solid #C7D2DC",
        borderRadius: 4,
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", color: "#4B5563" }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: negative ? "#B91C1C" : "#111827" }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: "#6B7280" }}>{sub}</div>
    </div>
  );
}

export function SettlementKpiGrid(props: SettlementKpiGridProps) {
  const {
    loadedPayCents,
    loadedMiles,
    loadedRate,
    emptyPayCents,
    emptyMiles,
    emptyRate,
    additionalCents,
    additionalLines,
    reimbursementCents,
    reimbursementLines,
    deductionCents,
    deductionBreakdown,
    netPayCents,
  } = props;

  return (
    <div
      data-testid="settlement-kpi-grid"
      style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8, margin: "10px 0 14px" }}
    >
      <Tile
        label="Loaded pay"
        value={formatUsdCents(loadedPayCents)}
        sub={`${MILES.format(loadedMiles)} mi @ $${RATE.format(loadedRate)}`}
      />
      <Tile
        label="Empty miles pay"
        value={formatUsdCents(emptyPayCents)}
        sub={`${MILES.format(emptyMiles)} mi @ $${RATE.format(emptyRate)}`}
      />
      <Tile
        label="Additional pay"
        value={formatUsdCents(additionalCents)}
        sub={`${additionalLines} ${additionalLines === 1 ? "line" : "lines"}`}
      />
      <Tile
        label="Reimbursements"
        value={formatUsdCents(reimbursementCents)}
        sub={`${reimbursementLines} ${reimbursementLines === 1 ? "line" : "lines"}`}
      />
      <Tile
        label="Deductions"
        value={deductionCents > 0 ? `−${formatUsdCents(deductionCents)}` : formatUsdCents(0)}
        sub={deductionBreakdown || "0 lines"}
        negative={deductionCents > 0}
      />
      <Tile label="Net pay" value={formatUsdCents(netPayCents)} sub="Driver take-home this period" />
    </div>
  );
}
