import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  getOpenDriverBills,
  listOpenPreSettlements,
  listSettlements,
  type SettlementListRow,
} from "../../api/driverFinance";
import { V3KpiTile } from "../../components/v3/V3KpiTile";
import { V3Panel } from "../../components/v3/V3Panel";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { V3 } from "../../design/v3-tokens";

/**
 * ROUND 443.250 — Settlements PreSettlements V3 KPI strip + "What closes a tour"
 * (Settlements-PreSettlements.dc.html).
 *
 * Board labels: Total unpaid · Driver pay (period) · Open driver bills.
 * Engines unchanged: listSettlements KPI aggregates + getOpenDriverBills (same as
 * Settlements home). Open pre-settlement count for the panel subtitle comes from
 * listOpenPreSettlements (same filter Drivers already uses). Absent → "—".
 * Ready / Waiting on / Unit are not on SettlementListRow — not invented here.
 */

function startOfWeekSunday(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - x.getDay());
  x.setHours(0, 0, 0, 0);
  return x;
}

function isInThisPeriod(s: SettlementListRow, periodStart: Date): boolean {
  const end = new Date(s.period_end);
  if (Number.isNaN(end.getTime())) return false;
  return end.getTime() >= periodStart.getTime();
}

function formatUsd(dollars: number): string {
  return `$${dollars.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const display = (v: string | number | null) => (v === null || v === undefined ? "—" : String(v));

const CLOSE_CHECKS: Array<{ check: string; how: string }> = [
  { check: "All loads delivered", how: "POD on every load" },
  { check: "Documents", how: "rate con · BOL · POD" },
  { check: "Miles locked", how: "signed settlement → AlwaysTrack → lane history → Google" },
  { check: "Fuel attributed", how: "fills on this tour / next load" },
  { check: "Advances matched", how: "Zelle / cash advances on the tour" },
  { check: "Deductions confirmed", how: "liabilities + auto deductions on the open tour" },
];

type Props = {
  /** Settlements module mount keeps KPI drills under /driver-finance. */
  basePath?: string;
};

export function SettlementsPreSettlementsKpiRow({ basePath = "/driver-finance/pre-settlements" }: Props) {
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const root = basePath.replace(/\/+$/, "") || "/driver-finance/pre-settlements";

  const kpiBaseQuery = useQuery({
    queryKey: ["driver-finance", "settlements-kpi-base", companyId, "presettle-v3"],
    queryFn: () => listSettlements(companyId),
    enabled: Boolean(companyId),
  });
  const openBillsQuery = useQuery({
    queryKey: ["driver-finance", "open-driver-bills", companyId, "presettle-v3"],
    queryFn: () => getOpenDriverBills(companyId),
    enabled: Boolean(companyId),
  });
  const openPreQuery = useQuery({
    queryKey: ["driver-finance", "open-pre-settlements", companyId, "presettle-v3-count"],
    queryFn: () => listOpenPreSettlements(companyId),
    enabled: Boolean(companyId),
  });

  const periodStart = useMemo(() => startOfWeekSunday(new Date()), []);
  const serverKpi = kpiBaseQuery.data?.kpi;
  const kpiSettlements = kpiBaseQuery.data?.settlements ?? [];

  const totalUnpaid = kpiBaseQuery.isError
    ? null
    : (serverKpi?.total_unpaid ?? kpiSettlements.filter((s) => s.status !== "paid").length);

  const driverPayThisPeriod = kpiBaseQuery.isError
    ? null
    : serverKpi != null
      ? formatUsd(Number(serverKpi.driver_pay_this_period ?? 0))
      : formatUsd(
          kpiSettlements
            .filter((s) => isInThisPeriod(s, periodStart) && s.status !== "cancelled")
            .reduce((sum, s) => sum + Number(s.net_pay ?? 0), 0),
        );

  const openBills = openBillsQuery.isError
    ? null
    : (openBillsQuery.data?.open_driver_bills?.total_count ?? null);

  const openPreCount = openPreQuery.isError
    ? null
    : openPreQuery.data
      ? openPreQuery.data.length
      : null;

  return (
    <div className="space-y-3" data-testid="settlements-presettle-v3-chrome">
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))",
          gap: 8,
          fontFamily: V3.font,
        }}
        data-testid="settlements-presettle-kpi-strip"
        data-settlements-presettle-v3-kpis="1"
      >
        <V3KpiTile
          label="Total unpaid"
          value={display(totalUnpaid === null ? null : Math.round(Number(totalUnpaid)))}
          sub="settlements not yet paid"
          testId="settlements-presettle-kpi-total-unpaid"
          onClick={() => navigate("/driver-finance/settlements?view=payments&payment_state=unpaid")}
        />
        <V3KpiTile
          label="Driver pay (period)"
          value={display(driverPayThisPeriod)}
          sub="sum of net pay this period"
          testId="settlements-presettle-kpi-driver-pay"
          onClick={() => navigate("/driver-finance/settlements?view=payments")}
        />
        <V3KpiTile
          label="Open driver bills"
          value={display(openBills === null ? null : Math.round(openBills))}
          sub="unsettled driver pay"
          testId="settlements-presettle-kpi-open-bills"
          onClick={() => navigate("/driver-finance/settlements?view=payments")}
        />
      </div>

      <V3Panel
        title="What closes a tour"
        subtitle={
          openPreCount === null
            ? "open pre-settlements · —"
            : `open pre-settlements · ${openPreCount}`
        }
        testId="settlements-presettle-closes-panel"
        onViewAll={() => navigate(root)}
      >
        <div style={{ padding: "4px 0" }} data-testid="settlements-presettle-closes-body">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0,1fr) minmax(0,1.4fr)",
              gap: 8,
              padding: "6px 14px",
              borderBottom: `1px solid ${V3.borderSoft}`,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: V3.muted,
              fontFamily: V3.font,
            }}
          >
            <span>Check</span>
            <span>How it is met</span>
          </div>
          {CLOSE_CHECKS.map((row) => (
            <div
              key={row.check}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0,1fr) minmax(0,1.4fr)",
                gap: 8,
                padding: "8px 14px",
                borderBottom: `1px solid ${V3.borderSoft}`,
                fontSize: 12,
                color: V3.ink,
                fontFamily: V3.font,
              }}
            >
              <span style={{ fontWeight: 600 }}>{row.check}</span>
              <span style={{ color: V3.muted }}>{row.how}</span>
            </div>
          ))}
        </div>
      </V3Panel>
    </div>
  );
}
