import type { CSSProperties, Dispatch, SetStateAction } from "react";
import type { NavigateFunction } from "react-router-dom";
import { EntityLink } from "../../components/shared/EntityLink";
import { V3 } from "../../design/v3-tokens";
import { V3Panel } from "../../components/v3/V3Panel";
import { V3Segmented } from "../../components/v3/V3Segmented";
import { entityLabel } from "../../lib/entity-label";
import type { SettlementListRow } from "../../api/driverFinance";
import {
  formatSettlementsUsd,
  formatWeekOfTitle,
  settlementPaymentLabel,
  settlementsDerivedReimb,
  settlementsWeekLoadsLabel,
  settlementsWeekOfStatusLabel,
  type SettlementsWeekBucket,
} from "./settlementsHomeBoardHelpers";

type DeductionSplit = {
  escrow: { drivers: Set<string>; amount: number };
  advances: { drivers: Set<string>; amount: number };
  fines: { drivers: Set<string>; amount: number };
};

export type SettlementsHomeBoardPanelsProps = {
  navigate: NavigateFunction;
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

/** ROUND 443.326 — V3 home board panels extracted so SettlementsPage.tsx passes guard (no V3Panel in parent). */
export function SettlementsHomeBoardPanels(props: SettlementsHomeBoardPanelsProps) {
  const {
    navigate,
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
    <>
      {weekBuckets.length > 0 ? (
        <div
          style={{ display: "grid", gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr)", gap: 8 }}
          data-testid="settlements-home-v3-panels"
        >
          <V3Panel
            title="Net driver pay by week"
            subtitle={`${weekBuckets.length} weeks · not cancelled · not sample`}
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
                  return (
                    <g key={w.weekStartMs}>
                      <rect
                        className="setl-v3-grow"
                        x={x}
                        y={y}
                        width={24}
                        height={h}
                        rx={1}
                        fill={value < 0 ? V3.red : V3.data}
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
              <div style={{ fontSize: 11, color: V3.muted, marginTop: 4 }}>
                Bar → that week&apos;s settlements (period end in week). Max {formatSettlementsUsd(weekChartMax)}.
              </div>
            </div>
          </V3Panel>

          <V3Panel
            title={`Deductions this week · ${formatSettlementsUsd(deductionsThisWeek)}`}
            subtitle="Split by type from settlement deduction lines"
            onViewAll={() => navigate("/driver-finance/deductions")}
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
              <div style={{ fontSize: 11, color: V3.muted, marginTop: 8 }}>
                Split by type comes from settlement deduction lines.
                {deductionsListError ? " Deduction list failed to load — amounts show as —." : ""}
              </div>
            </div>
          </V3Panel>
        </div>
      ) : null}

      {!kpiBaseError && thisWeekBucket ? (
        <V3Panel
          title={`Week of ${formatWeekOfTitle(new Date(thisWeekBucket.weekStartMs))}`}
          subtitle={`This week · ${weekOfRows.length} with pay`}
          onViewAll={() => navigate(`/driver-finance/settlements?tab=${weekOfPill === "closed" ? "closed" : "open"}`)}
          headerRight={
            <V3Segmented
              value={weekOfPill}
              onChange={setWeekOfPill}
              options={[
                { id: "open", label: `Pre-Settlement (Open) ${weekOfOpenCount}` },
                { id: "closed", label: `Settlement (Closed) ${weekOfClosedCount}` },
              ]}
              testId="settlements-home-week-of-pill"
            />
          }
          testId="settlements-home-week-of-panel"
        >
          <div style={{ padding: "0 0 8px" }} data-testid="settlements-home-week-of-body">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.4fr 1.2fr 0.9fr 0.9fr 0.8fr 0.9fr 0.6fr 0.6fr",
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
              <span>Loads</span>
              <span>Gross</span>
              <span>Deductions</span>
              <span>Reimb.</span>
              <span>Net</span>
              <span>Settlement</span>
              <span>Payment</span>
            </div>
            {weekOfRows.length === 0 ? (
              <div style={{ padding: "14px", fontSize: 12, color: V3.muted, fontFamily: V3.font }}>
                No {weekOfPill === "open" ? "open" : "closed"} settlements this week.
              </div>
            ) : (
              weekOfRows.map((s) => {
                const status = settlementsWeekOfStatusLabel(s);
                return (
                  <div
                    key={s.id}
                    data-testid={`settlements-home-week-of-row-${s.id}`}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1.4fr 1.2fr 0.9fr 0.9fr 0.8fr 0.9fr 0.6fr 0.6fr",
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
                    <span>{settlementsWeekLoadsLabel(s)}</span>
                    <span>{Number(s.gross_pay ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    <span>{Number(s.deductions_total ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    <span>{settlementsDerivedReimb(s).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    <span>{Number(s.net_pay ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    <span style={{ color: status === "Cancelled" ? V3.red : status === "Closed" ? V3.green : status === "Held" ? V3.red : V3.ink }}>{status}</span>
                    <span style={{ color: settlementPaymentLabel(s) === "Paid" ? V3.green : settlementPaymentLabel(s) === "Held" ? V3.red : V3.ink }}>{settlementPaymentLabel(s)}</span>
                  </div>
                );
              })
            )}
            <div
              data-testid="settlements-home-week-of-totals"
              style={{
                display: "grid",
                gridTemplateColumns: "1.4fr 1.2fr 0.9fr 0.9fr 0.8fr 0.9fr 0.6fr 0.6fr",
                gap: 8,
                padding: "10px 14px 4px",
                fontSize: 12,
                fontWeight: 700,
                color: V3.ink,
                fontFamily: V3.font,
                fontVariantNumeric: "tabular-nums",
                textAlign: "center",
              }}
            >
              <span style={{ textAlign: "left" }}>This week · {weekOfRows.length} with pay</span>
              <span />
              <span>{weekOfTotals.gross.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              <span>{weekOfTotals.ded.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              <span>{weekOfTotals.reimb.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              <span>{weekOfTotals.net.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              <span />
              <span />
            </div>
          </div>
        </V3Panel>
      ) : null}
    </>
  );
}
