import { MoneyCell } from "../../../components/shared/MoneyCell";
import { formatUsdCents } from "../../../lib/money";

/**
 * SETL-DETAIL-01 (lead ROUND 14, 2026-09-06 17:0xZ — owner: "the Settlements module must be created
 * in the correct format, following much of Load Costs"). Six 93px KPI tiles, matching Load Costs'
 * own KPI framing (LoadDetailCostsTab's "Line haul revenue / Costs on this load / Driver pay /
 * Approximate margin"), not the older Loaded-pay/Empty-miles-pay split this grid carried before:
 * Revenue · Driver pay · Reimbursements · Deductions · Net pay · Company margin.
 *
 * Colours/sizes stay the locked reference contract this grid has always used (93px tall,
 * --kpi-bg #F4F7FA, --th-rule #C7D2DC border, radius 4px, tabular-nums 20px/600 values, 11px/700
 * uppercase #4B5563 labels, 11px muted sub) — only the six labels/values changed, per this round's
 * explicit instruction. Inline-styled (not Tailwind) so a static guard can assert computed styles.
 *
 * ROUND 8.13 — each KPI figure is a MoneyCell → this settlement (literal entity drill).
 */

export type SettlementKpiGridProps = {
  settlementId: string;
  revenueCents: number;
  revenueSub: string;
  driverPayCents: number;
  driverPaySub: string;
  reimbursementCents: number;
  reimbursementLines: number;
  deductionCents: number; // positive magnitude
  deductionBreakdown: string;
  netPayCents: number;
  companyMarginCents: number;
  companyMarginSub: string;
};

function SettlementTile({
  label,
  cents,
  settlementId,
  sub,
  negative,
  prefix = "",
}: {
  label: string;
  cents: number;
  settlementId: string;
  sub: string;
  negative?: boolean;
  prefix?: string;
}) {
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
        {prefix}
        <MoneyCell
          cents={cents}
          format={formatUsdCents}
          drill={{ entity: { kind: "settlement", id: settlementId } }}
        />
      </div>
      <div style={{ fontSize: 11, color: "#6B7280" }}>{sub}</div>
    </div>
  );
}

export function SettlementKpiGrid(props: SettlementKpiGridProps) {
  const {
    settlementId,
    revenueCents,
    revenueSub,
    driverPayCents,
    driverPaySub,
    reimbursementCents,
    reimbursementLines,
    deductionCents,
    deductionBreakdown,
    netPayCents,
    companyMarginCents,
    companyMarginSub,
  } = props;

  return (
    <div
      data-testid="settlement-kpi-grid"
      style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8, margin: "10px 0 14px" }}
    >
      <SettlementTile label="Revenue" cents={revenueCents} settlementId={settlementId} sub={revenueSub} />
      <SettlementTile label="Driver pay" cents={driverPayCents} settlementId={settlementId} sub={driverPaySub} />
      <SettlementTile
        label="Reimbursements"
        cents={reimbursementCents}
        settlementId={settlementId}
        sub={`${reimbursementLines} ${reimbursementLines === 1 ? "line" : "lines"}`}
      />
      <SettlementTile
        label="Deductions"
        cents={deductionCents > 0 ? deductionCents : 0}
        settlementId={settlementId}
        sub={deductionBreakdown || "0 lines"}
        negative={deductionCents > 0}
        prefix={deductionCents > 0 ? "−" : ""}
      />
      <SettlementTile label="Net pay" cents={netPayCents} settlementId={settlementId} sub="Driver take-home this period" />
      <SettlementTile
        label="Company margin"
        cents={companyMarginCents}
        settlementId={settlementId}
        sub={companyMarginSub}
        negative={companyMarginCents < 0}
      />
    </div>
  );
}
