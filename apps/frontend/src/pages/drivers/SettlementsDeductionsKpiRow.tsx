import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { listSettlements, type SettlementListRow } from "../../api/driverFinance";
import { getActiveLiabilities, getLiabilitiesKpis } from "../../api/liabilities";
import { V3KpiTile } from "../../components/v3/V3KpiTile";
import { V3Panel } from "../../components/v3/V3Panel";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { V3 } from "../../design/v3-tokens";
import { listAutoDeductionPolicies } from "../../hooks/useAutoDeductionPolicies";
import { formatUsdTable } from "../../lib/money";

/**
 * ROUND 443.250 — Settlements Deductions V3 KPI strip + By type panel
 * (Settlements-Deductions.dc.html).
 *
 * Board labels: Deductions this week · Open liabilities · Drivers w/ debt ·
 * Scheduled deductions. Engines unchanged: listSettlements week sum (same Sunday
 * bucket as Settlements home), getActiveLiabilities count, getLiabilitiesKpis
 * drivers_with_debt, listAutoDeductionPolicies status=active. Absent → "—".
 */

function startOfWeekSunday(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - x.getDay());
  x.setHours(0, 0, 0, 0);
  return x;
}

function thisWeekDeductions(rows: SettlementListRow[] | undefined, now: Date): { dollars: number | null; settlementCount: number | null } {
  if (!rows) return { dollars: null, settlementCount: null };
  const start = startOfWeekSunday(now);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  let dollars = 0;
  let settlementCount = 0;
  for (const s of rows) {
    if (s.status === "cancelled") continue;
    const pe = new Date(s.period_end);
    if (Number.isNaN(pe.getTime())) continue;
    if (pe.getTime() >= start.getTime() && pe.getTime() < end.getTime()) {
      dollars += Number(s.deductions_total ?? 0);
      settlementCount += 1;
    }
  }
  return { dollars, settlementCount };
}

function amount(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

const display = (v: string | number | null) => (v === null || v === undefined ? "—" : String(v));

type Props = {
  /** Settlements module mount keeps KPI drills under /driver-finance. */
  basePath?: string;
};

export function SettlementsDeductionsKpiRow({ basePath = "/driver-finance/deductions" }: Props) {
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const settlementsQuery = useQuery({
    queryKey: ["driver-finance", "settlements", companyId, "deductions-v3-kpi"],
    queryFn: () => listSettlements(companyId),
    enabled: Boolean(companyId),
  });
  const liabilitiesListQuery = useQuery({
    queryKey: ["liabilities", "active", companyId, "deductions-v3-kpi"],
    queryFn: () => getActiveLiabilities(companyId),
    enabled: Boolean(companyId),
  });
  const liabilitiesKpisQuery = useQuery({
    queryKey: ["liabilities", "kpis", companyId, "deductions-v3-kpi"],
    queryFn: () => getLiabilitiesKpis(companyId),
    enabled: Boolean(companyId),
  });
  const policiesQuery = useQuery({
    queryKey: ["auto-deduction-policies", companyId, "active", "deductions-v3-kpi"],
    queryFn: () => listAutoDeductionPolicies(companyId, { status: "active" }),
    enabled: Boolean(companyId),
  });

  const week = useMemo(
    () =>
      settlementsQuery.isError
        ? { dollars: null, settlementCount: null }
        : thisWeekDeductions(settlementsQuery.data?.settlements, new Date()),
    [settlementsQuery.data?.settlements, settlementsQuery.isError]
  );

  const openLiabilities = liabilitiesListQuery.isError
    ? null
    : liabilitiesListQuery.data
      ? liabilitiesListQuery.data.liabilities.length
      : null;
  const driversWithDebt = liabilitiesKpisQuery.isError
    ? null
    : amount(liabilitiesKpisQuery.data?.drivers_with_debt);
  const scheduled = policiesQuery.isError
    ? null
    : policiesQuery.data
      ? policiesQuery.data.rows.length
      : null;

  const root = basePath.replace(/\/+$/, "") || "/driver-finance/deductions";
  const weekMoney = week.dollars === null ? null : formatUsdTable(week.dollars);

  return (
    <div className="space-y-3" data-testid="settlements-deductions-v3-chrome">
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))",
          gap: 8,
          fontFamily: V3.font,
        }}
        data-testid="settlements-deductions-kpi-strip"
        data-settlements-deductions-v3-kpis="1"
      >
        <V3KpiTile
          label="Deductions this week"
          value={display(weekMoney)}
          sub={
            week.settlementCount === null
              ? undefined
              : `${week.settlementCount} settlement${week.settlementCount === 1 ? "" : "s"}`
          }
          testId="settlements-deductions-kpi-week"
          onClick={() => navigate("/driver-finance/settlements")}
        />
        <V3KpiTile
          label="Open liabilities"
          value={display(openLiabilities === null ? null : Math.round(openLiabilities))}
          testId="settlements-deductions-kpi-open-liab"
          onClick={() => navigate("/driver-finance/liabilities")}
        />
        <V3KpiTile
          label="Drivers w/ debt"
          value={display(driversWithDebt === null ? null : Math.round(driversWithDebt))}
          testId="settlements-deductions-kpi-drivers-debt"
          onClick={() => navigate("/driver-finance/liabilities")}
        />
        <V3KpiTile
          label="Scheduled deductions"
          value={display(scheduled === null ? null : Math.round(scheduled))}
          testId="settlements-deductions-kpi-scheduled"
          onClick={() => navigate(root)}
        />
      </div>

      <V3Panel
        title="By type · this week"
        subtitle="from settlement deduction totals"
        testId="settlements-deductions-by-type-panel"
        onViewAll={() => navigate("/driver-finance/settlements")}
      >
        <div style={{ padding: "10px 14px" }} data-testid="settlements-deductions-by-type-body">
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
            <span style={{ color: V3.muted, fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>
              Type
            </span>
            <span style={{ color: V3.muted, fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>
              Drivers
            </span>
            <span style={{ color: V3.muted, fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>
              Amount
            </span>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto auto",
              gap: 8,
              fontSize: 12,
              color: V3.ink,
              fontFamily: V3.font,
              padding: "8px 0",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            <span>All deductions</span>
            <span>{display(week.settlementCount)}</span>
            <span>{display(weekMoney)}</span>
          </div>
          <div style={{ fontSize: 11, color: V3.muted, marginTop: 8 }}>
            Split by type comes from settlement deduction lines when opened on a settlement.
          </div>
        </div>
      </V3Panel>
    </div>
  );
}
