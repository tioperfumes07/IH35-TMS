/**
 * ROUND 443.326 / 443.280 — Settlements Home board panels (docs/design/v3/Settlements).
 * Chart + deductions side-by-side, then Week-of roster. Shared BoardSection (not local extract).
 */
import type { CSSProperties, Dispatch, SetStateAction } from "react";
import type { NavigateFunction } from "react-router-dom";
import { EntityLink } from "../../components/shared/EntityLink";
import { SettlementRefCell } from "../../components/shared/SettlementRefCell";
import { BoardSection } from "../../components/v3/BoardSection";
import { V3 } from "../../design/v3-tokens";
import { V3Segmented } from "../../components/v3/V3Segmented";
import { entityLabel } from "../../lib/entity-label";
import type { SettlementListRow } from "../../api/driverFinance";
import { companyToday } from "../../lib/businessDate";
import {
  formatSettlementsUsd,
  formatWeekOfTitle,
  settlementPaymentLabel,
  settlementsDerivedReimb,
  settlementsWeekLoadsLabel,
  type SettlementsWeekBucket,
} from "./settlementsHomeBoardHelpers";

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Client CSV of the Week-of roster (fill-not-shell — prior Export only navigated with a dead export flag). */
function exportWeekOfSettlementsCsv(
  weekStartMs: number,
  pill: "open" | "closed",
  rows: SettlementListRow[],
): void {
  const header = ["Driver", "Loads", "Gross", "Deductions", "Reimb", "Net", "Status"]
    .map(csvEscape)
    .join(",");
  const body = rows
    .map((s) => {
      const pay = settlementPaymentLabel(s);
      const status = pay === "Paid" ? "Paid" : pay === "Held" ? "Held" : "Open";
      return [
        s.driver_full_name || "Driver",
        settlementsWeekLoadsLabel(s),
        Number(s.gross_pay ?? 0).toFixed(2),
        Number(s.deductions_total ?? 0).toFixed(2),
        settlementsDerivedReimb(s).toFixed(2),
        Number(s.net_pay ?? 0).toFixed(2),
        status,
      ]
        .map((v) => csvEscape(String(v)))
        .join(",");
    })
    .join("\n");
  const weekLabel = formatWeekOfTitle(new Date(weekStartMs)).replace(/[^a-zA-Z0-9]+/g, "-");
  const blob = new Blob([`${header}\n${body}\n`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `settlements-week-of-${weekLabel}-${pill}-${companyToday()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

type DeductionSplit = {
  escrow: { drivers: Set<string>; amount: number };
  advances: { drivers: Set<string>; amount: number };
  fines: { drivers: Set<string>; amount: number };
};

export type SettlementsHomeBoardPanelsProps = {
  navigate: NavigateFunction;
  companyId: string;
  weekBuckets: SettlementsWeekBucket[];
  weekChartGrain: "net" | "gross" | "deductions";
  setWeekChartGrain: Dispatch<SetStateAction<"net" | "gross" | "deductions">>;
  weekChartMax: number;
  deductionsThisWeek: number;
  deductionSplitThisWeek: DeductionSplit;
  deductionsListError: boolean;
  thisWeekBucket: SettlementsWeekBucket | undefined;
  weekOfPill: "open" | "closed";
  setWeekOfPill: Dispatch<SetStateAction<"open" | "closed">>;
  weekOfOpenCount: number;
  weekOfClosedCount: number;
  weekOfRows: SettlementListRow[];
  weekOfTotals: { gross: number; ded: number; reimb: number; net: number };
  kpiBaseError: boolean;
};

/** Board Status column: ● Paid (green) / ● Open (blue) — payment-facing, not tour Closed. */
function boardStatus(s: SettlementListRow): { label: "Paid" | "Open" | "Held"; color: string } {
  const pay = settlementPaymentLabel(s);
  if (pay === "Paid") return { label: "Paid", color: V3.green };
  if (pay === "Held") return { label: "Held", color: V3.red };
  return { label: "Open", color: V3.link };
}

const money = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function SettlementsHomeBoardPanels(props: SettlementsHomeBoardPanelsProps) {
  const {
    navigate,
    companyId,
    weekBuckets,
    weekChartGrain,
    setWeekChartGrain,
    weekChartMax,
    deductionsThisWeek,
    deductionSplitThisWeek,
    deductionsListError,
    thisWeekBucket,
    weekOfPill,
    setWeekOfPill,
    weekOfOpenCount,
    weekOfClosedCount,
    weekOfRows,
    weekOfTotals,
    kpiBaseError,
  } = props;

  return (
    <div className="space-y-3" data-testid="settlements-home-board-panels">
      {weekBuckets.length > 0 ? (
        <div
          className="grid grid-cols-1 gap-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"
          style={{ alignItems: "start" }}
          data-testid="settlements-home-v3-panels"
        >
          <BoardSection
            title="Net driver pay by week"
            onViewAll={() => navigate("/driver-finance/settlements?tab=payments")}
            headerRight={
              <V3Segmented
                value={weekChartGrain}
                onChange={setWeekChartGrain}
                options={[
                  { id: "net", label: "Net" },
                  { id: "gross", label: "Gross" },
                  { id: "deductions", label: "Deductions" },
                ]}
                testId="settlements-home-week-grain"
              />
            }
            footer={`${weekBuckets.length} weeks, not cancelled, not sample. Bar → that week's settlements.`}
            testId="settlements-home-week-chart-panel"
          >
            <div style={{ padding: "12px 14px 8px" }}>
              <svg
                width="100%"
                height={160}
                viewBox={`0 0 ${weekBuckets.length * 48} 160`}
                preserveAspectRatio="none"
                role="img"
                aria-label="Net driver pay by week"
                data-testid="settlements-home-week-chart"
              >
                {[0, 0.25, 0.5, 0.75, 1].map((t) => {
                  const y = 12 + (1 - t) * 110;
                  return (
                    <line key={t} x1={0} x2={weekBuckets.length * 48} y1={y} y2={y} stroke={V3.chartGrid} strokeWidth={1} />
                  );
                })}
                {weekBuckets.map((w, i) => {
                  const value =
                    weekChartGrain === "net" ? w.net : weekChartGrain === "gross" ? w.gross : w.deductions;
                  const h = Math.max(2, (Math.abs(value) / weekChartMax) * 110);
                  const x = i * 48 + 12;
                  const y = 122 - h;
                  const isLatest = i === weekBuckets.length - 1;
                  return (
                    <g key={w.weekStartMs}>
                      <rect
                        className="setl-v3-grow"
                        x={x}
                        y={y}
                        width={24}
                        height={h}
                        rx={1}
                        fill={value < 0 ? V3.red : isLatest ? V3.shell : V3.data}
                        style={{ transformOrigin: `${x + 12}px 122px` } as CSSProperties}
                      />
                      <text x={x + 12} y={148} textAnchor="middle" style={{ fontSize: 10, fill: V3.muted, fontFamily: V3.font }}>
                        {w.label}
                      </text>
                    </g>
                  );
                })}
              </svg>
              <style>{`
                @keyframes setl-v3-grow { from { transform: scaleY(0); } to { transform: scaleY(1); } }
                .setl-v3-grow { transform-box: fill-box; transform-origin: bottom; animation: setl-v3-grow .9s cubic-bezier(.2,.8,.2,1) both; }
              `}</style>
            </div>
          </BoardSection>

          <BoardSection
            title={`Deductions this week · ${formatSettlementsUsd(deductionsThisWeek)}`}
            onViewAll={() => navigate("/driver-finance/deductions")}
            footer={
              deductionsListError
                ? "Split by type comes from settlement deduction lines. Deduction list failed to load — amounts show as —."
                : "Split by type comes from settlement deduction lines."
            }
            testId="settlements-home-deductions-panel"
          >
            <div style={{ padding: "10px 14px" }} data-testid="settlements-home-deductions-body">
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto auto",
                  gap: 8,
                  fontSize: 12,
                  color: V3.ink,
                  fontFamily: V3.font,
                  padding: "6px 0",
                  borderBottom: `1px solid ${V3.borderSoft}`,
                }}
              >
                <span style={{ color: V3.muted, fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>Type</span>
                <span style={{ color: V3.muted, fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", textAlign: "center" }}>Drivers</span>
                <span style={{ color: V3.muted, fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", textAlign: "right" }}>Amount</span>
              </div>
              {(
                [
                  { id: "escrow" as const, label: "Escrow" },
                  { id: "advances" as const, label: "Advances (Zelle)" },
                  { id: "fines" as const, label: "Fines" },
                ] as const
              ).map((row) => {
                const bucket = deductionSplitThisWeek[row.id];
                const has = bucket.amount > 0 || bucket.drivers.size > 0;
                return (
                  <div
                    key={row.id}
                    data-testid={`settlements-home-deduction-${row.id}`}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto auto",
                      gap: 8,
                      fontSize: 12,
                      color: V3.ink,
                      fontFamily: V3.font,
                      padding: "8px 0",
                      borderBottom: `1px solid ${V3.borderSoft}`,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    <span>{row.label}</span>
                    <span style={{ textAlign: "center", color: has ? V3.ink : V3.muted }}>{has ? bucket.drivers.size : "—"}</span>
                    <span style={{ textAlign: "right", color: has ? V3.ink : V3.muted }}>
                      {has ? formatSettlementsUsd(bucket.amount) : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          </BoardSection>
        </div>
      ) : null}

      {!kpiBaseError && thisWeekBucket ? (
        <BoardSection
          title={`Week of ${formatWeekOfTitle(new Date(thisWeekBucket.weekStartMs))}`}
          onViewAll={() => navigate(`/driver-finance/settlements?tab=${weekOfPill === "closed" ? "closed" : "open"}`)}
          headerRight={
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <V3Segmented
                value={weekOfPill}
                onChange={setWeekOfPill}
                options={[
                  { id: "open", label: `Pre-Settlement (Open) ${weekOfOpenCount}` },
                  { id: "closed", label: `Settlement (Closed) ${weekOfClosedCount}` },
                ]}
                testId="settlements-home-week-of-pill"
              />
              <button
                type="button"
                data-testid="settlements-home-week-of-export"
                disabled={weekOfRows.length === 0}
                onClick={() =>
                  exportWeekOfSettlementsCsv(thisWeekBucket.weekStartMs, weekOfPill, weekOfRows)
                }
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: V3.link,
                  background: "transparent",
                  border: "none",
                  cursor: weekOfRows.length === 0 ? "not-allowed" : "pointer",
                  padding: 0,
                  fontFamily: V3.font,
                  opacity: weekOfRows.length === 0 ? 0.5 : 1,
                }}
              >
                Export
              </button>
            </span>
          }
          footer={`This week · ${weekOfRows.length} with pay · Gross ${money(weekOfTotals.gross)} · Deductions ${money(weekOfTotals.ded)} · Reimb. ${money(weekOfTotals.reimb)} · Net ${money(weekOfTotals.net)}`}
          testId="settlements-home-week-of-panel"
        >
          <div style={{ padding: "0 0 8px" }} data-testid="settlements-home-week-of-body">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.4fr 1.2fr 0.9fr 0.9fr 0.8fr 0.9fr 0.8fr",
                gap: 8,
                padding: "8px 14px",
                borderBottom: `1px solid ${V3.borderSoft}`,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: V3.muted,
                fontFamily: V3.font,
                textAlign: "center",
              }}
            >
              <span style={{ textAlign: "left" }}>Driver</span>
              <span style={{ textAlign: "left" }}>Loads</span>
              <span>Gross</span>
              <span>Deductions</span>
              <span>Reimb.</span>
              <span>Net</span>
              <span>Status</span>
            </div>
            {weekOfRows.length === 0 ? (
              <div style={{ padding: "14px", fontSize: 12, color: V3.muted, fontFamily: V3.font }}>
                No {weekOfPill === "open" ? "open" : "closed"} settlements this week.
              </div>
            ) : (
              weekOfRows.map((s) => {
                const status = boardStatus(s);
                return (
                  <div
                    key={s.id}
                    data-testid={`settlements-home-week-of-row-${s.id}`}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1.4fr 1.2fr 0.9fr 0.9fr 0.8fr 0.9fr 0.8fr",
                      gap: 8,
                      padding: "8px 14px",
                      borderBottom: `1px solid ${V3.borderSoft}`,
                      fontSize: 12,
                      color: V3.ink,
                      fontFamily: V3.font,
                      fontVariantNumeric: "tabular-nums",
                      textAlign: "center",
                      alignItems: "center",
                    }}
                  >
                    <span style={{ textAlign: "left" }}>
                      <EntityLink kind="driver" id={s.driver_id} label={entityLabel(s.driver_full_name || "Driver", s.driver_id, "Driver")} />
                    </span>
                    <span style={{ textAlign: "left", display: "inline-flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                      <span>{settlementsWeekLoadsLabel(s)}</span>
                      {s.load_links?.[0]?.id ? (
                        <SettlementRefCell loadId={s.load_links[0].id} operatingCompanyId={companyId} />
                      ) : (
                        <EntityLink kind="settlement" id={s.id} label="PENDING" />
                      )}
                    </span>
                    <span>{money(Number(s.gross_pay ?? 0))}</span>
                    <span>{money(Number(s.deductions_total ?? 0))}</span>
                    <span>{money(settlementsDerivedReimb(s))}</span>
                    <span style={{ fontWeight: 700 }}>{money(Number(s.net_pay ?? 0))}</span>
                    <span
                      data-testid={`settlements-home-week-of-status-${s.id}`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                        fontWeight: 600,
                        color: status.color,
                      }}
                    >
                      <span
                        aria-hidden
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: "50%",
                          background: status.color,
                          display: "inline-block",
                          flexShrink: 0,
                        }}
                      />
                      {status.label}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </BoardSection>
      ) : null}
    </div>
  );
}
