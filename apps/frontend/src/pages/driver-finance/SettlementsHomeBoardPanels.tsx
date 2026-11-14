/**
 * ROUND 443.326 / 443.280 — Settlements Home board panels (docs/design/v3/Settlements).
 * Chart + deductions side-by-side, then Week-of roster. Shared BoardSection (not local extract).
 */
import type { CSSProperties, Dispatch, SetStateAction } from "react";
import type { NavigateFunction } from "react-router-dom";
import { EntityLink } from "../../components/shared/EntityLink";
import { MoneyCell } from "../../components/shared/MoneyCell";
import { SettlementRefCell } from "../../components/shared/SettlementRefCell";
import { BoardSection } from "../../components/v3/BoardSection";
import { V3 } from "../../design/v3-tokens";
import { V3Segmented } from "../../components/v3/V3Segmented";
import { entityLabel } from "../../lib/entity-label";
import type { SettlementListRow } from "../../api/driverFinance";
import { companyToday } from "../../lib/businessDate";
import { formatNumber, formatQuantityTable, formatUsd } from "../../lib/money";
import {
  formatSettlementsUsd,
  formatWeekOfTitle,
  settlementPaymentLabel,
  settlementsDerivedReimb,
  settlementsRowTourClosed,
  settlementsWeekLoadsLabel,
  settlementsWeekOfStatusLabel,
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
  weekStartIso: string,
  pill: "open" | "closed",
  rows: SettlementListRow[],
): void {
  const header = ["Driver", "Loads", "Gross", "Deductions", "Reimb", "Net", "Status"]
    .map(csvEscape)
    .join(",");
  const body = rows
    .map((s) => {
      const status = weekOfBoardStatus(s).label;
      return [
        s.driver_full_name || "Driver",
        settlementsWeekLoadsLabel(s),
        formatUsd(Number(s.gross_pay ?? 0)),
        formatUsd(Number(s.deductions_total ?? 0)),
        formatUsd(settlementsDerivedReimb(s)),
        formatUsd(Number(s.net_pay ?? 0)),
        status,
      ]
        .map((v) => csvEscape(String(v)))
        .join(",");
    })
    .join("\n");
  const weekLabel = formatWeekOfTitle(weekStartIso).replace(/[^a-zA-Z0-9]+/g, "-");
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
  /** ROUND 7.30 / Codex batch88 — bar click selects Week-of roster (URL week_start company-calendar ISO). */
  onSelectWeek: (weekStartIso: string) => void;
  weekOfPill: "open" | "closed";
  setWeekOfPill: Dispatch<SetStateAction<"open" | "closed">>;
  weekOfOpenCount: number;
  weekOfClosedCount: number;
  weekOfRows: SettlementListRow[];
  weekOfTotals: { gross: number; ded: number; reimb: number; net: number };
  kpiBaseError: boolean;
};

/**
 * T4 / REG-102 — Week-of Status must agree with Open/Closed pills (tour close), not payment-only.
 * Paid/Held still win when payment_state says so; otherwise tour-closed → Closed (never "Open" on the Closed pill).
 * R90-32: pill="closed" forces non-Paid/Held/Cancelled rows to "Closed" (BOARD-45 recorded defect: closed panel labeled rows "Open").
 */
export function weekOfBoardStatus(s: SettlementListRow, pill?: "open" | "closed"): { label: "Paid" | "Open" | "Held" | "Closed" | "Cancelled"; color: string } {
  const pay = settlementPaymentLabel(s);
  if (pay === "Paid") return { label: "Paid", color: V3.green };
  if (pay === "Held") return { label: "Held", color: V3.red };
  const phase = settlementsWeekOfStatusLabel(s);
  if (phase === "Cancelled") return { label: "Cancelled", color: V3.muted };
  // ROUND 8.17 class L — Closed panel never paints "Open"; tour-closed / terminal rows label Closed.
  // R90-32-ITEM-8: Closed = slate #64748B (not V3.shell navy which renders as near-black).
  if (phase === "Closed" || settlementsRowTourClosed(s)) return { label: "Closed", color: "#64748B" };
  // R90-32: When viewing the Closed panel, any remaining row is closed by definition.
  if (pill === "closed") return { label: "Closed", color: "#64748B" };
  return { label: "Open", color: V3.link };
}

/** Week-of table amounts: no $ prefix, two decimals (e.g. "1,984.30"). */
const money = (n: number) => formatNumber(n, 2);
/** Cents → no-sign dollars string for MoneyCell format prop. */
const fmtCentsNoSign = (cents: number | string | null | undefined): string =>
  formatNumber(Number(cents ?? 0) / 100, 2);
const dollarsToCents = (n: number) => Math.round(Number(n || 0) * 100);
/** Week of MMM D format (e.g., "Week of Oct 19"). */
function fmtWeekMmmD(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

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
    onSelectWeek,
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
          className="grid grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]"
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
            footer={`${formatQuantityTable(weekBuckets.length, 0)} weeks, not cancelled, not sample. Bar → that week's settlements.`}
            testId="settlements-home-week-chart-panel"
          >
            <div style={{ padding: "12px 14px 8px" }}>
              {(() => {
                // Round axis ceiling UP to nearest $10k so ticks are always round numbers.
                const chartCeiling = weekChartMax <= 0 ? 10000 : Math.ceil(weekChartMax / 10000) * 10000;
                return (
              <svg
                width="100%"
                height={200}
                viewBox={`0 0 ${weekBuckets.length * 48 + 56} 200`}
                preserveAspectRatio="none"
                role="img"
                aria-label="Net driver pay by week"
                data-testid="settlements-home-week-chart"
              >
                {[0, 0.5, 1].map((frac) => {
                  const y = 12 + (1 - frac) * 150;
                  const amount = chartCeiling * frac;
                  const kLabel = amount === 0 ? "$0" : amount >= 1000 ? `$${Math.round(amount / 1000)}k` : `$${Math.round(amount)}`;
                  return (
                    <g key={`axis-${frac}`}>
                      <line x1={56} x2={weekBuckets.length * 48 + 56} y1={y} y2={y} stroke={V3.chartGrid} strokeWidth={1} />
                      <text x={52} y={y + 3} textAnchor="end" style={{ fontSize: 11, fill: V3.muted, fontFamily: V3.font }}>
                        {kLabel}
                      </text>
                    </g>
                  );
                })}
                {weekBuckets.map((w, i) => {
                  const value =
                    weekChartGrain === "net" ? w.net : weekChartGrain === "gross" ? w.gross : w.deductions;
                  const h = Math.max(2, (Math.abs(value) / chartCeiling) * 150);
                  const x = i * 48 + 68;
                  const y = 162 - h;
                  const isSelected = thisWeekBucket?.weekStartIso === w.weekStartIso;
                  return (
                    <g key={w.weekStartMs}>
                      <rect
                        className="setl-v3-grow"
                        x={x}
                        y={y}
                        width={24}
                        height={h}
                        rx={1}
                        fill={value < 0 ? V3.red : isSelected ? V3.shell : "#94A3B8"}
                        style={{ transformOrigin: `${x + 12}px 122px`, cursor: "pointer" } as CSSProperties}
                        role="button"
                        tabIndex={0}
                        aria-label={`Week of ${formatWeekOfTitle(w.weekStartIso)}`}
                        aria-pressed={isSelected}
                        data-testid={`settlements-home-week-bar-${w.label}`}
                        onClick={() => onSelectWeek(w.weekStartIso)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onSelectWeek(w.weekStartIso);
                          }
                        }}
                      />
                      <text x={x + 12} y={184} textAnchor="middle" style={{ fontSize: 11, fill: isSelected ? V3.ink : V3.muted, fontFamily: V3.font }}>
                        {w.label}
                      </text>
                    </g>
                  );
                })}
              </svg>
              ); })()}
              <style>{`
                @keyframes setl-v3-grow { from { transform: scaleY(0); } to { transform: scaleY(1); } }
                .setl-v3-grow { transform-box: fill-box; transform-origin: bottom; animation: setl-v3-grow .9s cubic-bezier(.2,.8,.2,1) both; }
              `}</style>
            </div>
          </BoardSection>

          <BoardSection
            title={`Deductions · Week of ${thisWeekBucket ? formatWeekOfTitle(thisWeekBucket.weekStartIso) : "..."} · ${formatSettlementsUsd(deductionsThisWeek)}`}
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
                <span style={{ color: V3.muted, fontSize: 11, fontWeight: 600 }}>Type</span>
                <span style={{ color: V3.muted, fontSize: 11, fontWeight: 600, textAlign: "center" }}>Drivers</span>
                <span style={{ color: V3.muted, fontSize: 11, fontWeight: 600, textAlign: "right" }}>Amount</span>
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
                    <span style={{ textAlign: "right", color: has ? V3.ink : V3.muted, whiteSpace: "nowrap" }}>
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
          title={`Week of ${fmtWeekMmmD(thisWeekBucket.weekStartIso)}`}
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
                onClick={() =>
                  weekOfRows.length > 0 && exportWeekOfSettlementsCsv(thisWeekBucket.weekStartIso, weekOfPill, weekOfRows)
                }
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: V3.ink,
                  background: "#FFFFFF",
                  border: `1px solid ${V3.border}`,
                  borderRadius: 4,
                  cursor: "pointer",
                  padding: "2px 10px",
                  fontFamily: V3.font,
                }}
              >
                Export
              </button>
            </span>
          }
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
                fontWeight: 600,
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
                No {weekOfPill === "open" ? "open" : "closed"} settlements for this week.
              </div>
            ) : (
              <>
              {weekOfRows.map((s) => {
                const status = weekOfBoardStatus(s, weekOfPill);
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
                    <span style={{ textAlign: "left", display: "flex", flexDirection: "column", gap: 2 }}>
                      {(s.load_links ?? []).length > 0
                        ? s.load_links!.map((link) => (
                            <span key={link.id} style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                              <EntityLink kind="load" id={link.id} label={link.label} />
                              <SettlementRefCell loadId={link.id} operatingCompanyId={companyId} />
                            </span>
                          ))
                        : <span>{settlementsWeekLoadsLabel(s)}</span>
                      }
                    </span>
                    <MoneyCell
                      cents={dollarsToCents(Number(s.gross_pay ?? 0))}
                      format={fmtCentsNoSign}
                      drill={{ entity: { kind: "settlement", id: s.id } }}
                    />
                    <MoneyCell
                      cents={dollarsToCents(Number(s.deductions_total ?? 0))}
                      format={fmtCentsNoSign}
                      drill={{ entity: { kind: "settlement", id: s.id } }}
                    />
                    <MoneyCell
                      cents={dollarsToCents(settlementsDerivedReimb(s))}
                      format={fmtCentsNoSign}
                      drill={{ entity: { kind: "settlement", id: s.id } }}
                    />
                    <span style={{ fontWeight: 700 }}>
                      <MoneyCell
                        cents={dollarsToCents(Number(s.net_pay ?? 0))}
                        format={fmtCentsNoSign}
                        drill={{ entity: { kind: "settlement", id: s.id } }}
                      />
                    </span>
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
              })}
              {/* R90-32: Inline totals row (design Board 32 — gray footer row in table, not a text footer). */}
              <div
                data-testid="settlements-home-week-of-totals"
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.4fr 1.2fr 0.9fr 0.9fr 0.8fr 0.9fr 0.8fr",
                  gap: 8,
                  padding: "8px 14px",
                  borderTop: `1px solid ${V3.border}`,
                  background: V3.headerBg,
                  fontSize: 12,
                  fontWeight: 700,
                  fontFamily: V3.font,
                  fontVariantNumeric: "tabular-nums",
                  textAlign: "center",
                  color: V3.ink,
                }}
              >
                <span style={{ textAlign: "left" }}>This week · {formatQuantityTable(weekOfRows.length, 0)} with pay</span>
                <span />
                <span style={{ textAlign: "right" }}>{money(weekOfTotals.gross)}</span>
                <span style={{ textAlign: "right" }}>{money(weekOfTotals.ded)}</span>
                <span style={{ textAlign: "right" }}>{money(weekOfTotals.reimb)}</span>
                <span style={{ textAlign: "right", fontWeight: 700 }}>{money(weekOfTotals.net)}</span>
                <span />
              </div>
              </>
            )}
          </div>
        </BoardSection>
      ) : null}
    </div>
  );
}
