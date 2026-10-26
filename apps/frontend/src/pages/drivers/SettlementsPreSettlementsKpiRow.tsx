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
import { BoardSection } from "../../components/v3/BoardSection";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { V3 } from "../../design/v3-tokens";

/** A missing or non-numeric amount is UNKNOWN (null → "—"), never a confident 0. */
function amountOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function formatUsdOrNull(n: number | null): string | null {
  return n == null ? null : formatUsd(n);
}

/**
 * ROUND 443.274-C — Settlements-PreSettlements board (Settlements-PreSettlements.png).
 *
 * Six KPI tiles match Settlements home engines (`listSettlements` KPI + `getOpenDriverBills`).
 * "What closes a tour" is a sibling BoardSection (side-by-side with Open pre-settlements in Drivers.tsx).
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

function isYtd(s: SettlementListRow, year: number): boolean {
  const end = new Date(s.period_end);
  return !Number.isNaN(end.getTime()) && end.getFullYear() === year;
}

function formatUsd(dollars: number): string {
  return `$${dollars.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const display = (v: string | number | null) => (v === null || v === undefined ? "—" : String(v));

/** Board copy (Settlements-PreSettlements.png) — same six close checks as the tour gate. */
const CLOSE_CHECKS: Array<{ check: string; how: string }> = [
  { check: "All loads delivered", how: "POD on every load" },
  { check: "Documents", how: "rate con · BOL · POD" },
  { check: "Miles locked", how: "signed settlement → AlwaysTrack → lane history" },
  { check: "Fuel attributed", how: "fills on this tour / next load" },
  { check: "Advances matched", how: "Zelle / cash advances on the tour" },
  { check: "Deductions confirmed", how: "escrow · fines · damages" },
];

type Props = {
  /** Settlements module mount keeps KPI drills under /driver-finance. */
  basePath?: string;
};

export function SettlementsPreSettlementsKpiRow({ basePath: _basePath = "/driver-finance/pre-settlements" }: Props) {
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

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

  const periodStart = useMemo(() => startOfWeekSunday(new Date()), []);
  const ytdYear = new Date().getFullYear();
  const serverKpi = kpiBaseQuery.data?.kpi;
  const kpiSettlements = kpiBaseQuery.data?.settlements ?? [];

  const totalUnpaid = kpiBaseQuery.isError
    ? null
    : (serverKpi?.total_unpaid ?? kpiSettlements.filter((s) => s.status !== "paid").length);

  const thisPeriod = kpiBaseQuery.isError
    ? null
    : (serverKpi?.this_period ?? kpiSettlements.filter((s) => isInThisPeriod(s, periodStart)).length);

  const driverPayThisPeriod = kpiBaseQuery.isError
    ? null
    : serverKpi != null
      ? formatUsdOrNull(amountOrNull(serverKpi.driver_pay_this_period))
      : formatUsdOrNull(
          kpiSettlements
            .filter((s) => isInThisPeriod(s, periodStart) && s.status !== "cancelled")
            .reduce<number | null>((sum, s) => {
              const n = amountOrNull(s.net_pay);
              return sum == null || n == null ? null : sum + n;
            }, 0),
        );

  const driversWithDebt = kpiBaseQuery.isError
    ? null
    : (serverKpi?.drivers_with_debt ??
      kpiSettlements.filter((s) => typeof s.live_debt_flag === "number" && s.live_debt_flag > 0).length);

  const ytdSettlements = kpiBaseQuery.isError
    ? null
    : (serverKpi?.ytd_settlements ?? kpiSettlements.filter((s) => isYtd(s, ytdYear)).length);

  const openBills = openBillsQuery.isError
    ? null
    : (openBillsQuery.data?.open_driver_bills?.total_count ?? null);

  // Same week-bucket delta as Settlements home — not a second engine.
  const driverPaySub = useMemo(() => {
    if (kpiBaseQuery.isError) return "sum of net pay this period";
    const thisWeekStart = periodStart.getTime();
    const lastWeekStart = thisWeekStart - 7 * 24 * 60 * 60 * 1000;
    let thisNet: number | null = 0;
    let lastNet: number | null = 0;
    for (const s of kpiSettlements) {
      if (s.status === "cancelled") continue;
      const end = new Date(s.period_end).getTime();
      if (Number.isNaN(end)) continue;
      const n = amountOrNull(s.net_pay);
      if (end >= thisWeekStart) thisNet = thisNet == null || n == null ? null : thisNet + n;
      else if (end >= lastWeekStart && end < thisWeekStart) lastNet = lastNet == null || n == null ? null : lastNet + n;
    }
    // A settlement with unknown net pay makes the week-over-week trend unknowable — say so.
    if (thisNet == null || lastNet == null) return "trend unavailable — a settlement has no net pay";
    const delta = thisNet - lastNet;
    if (delta === 0) return "flat vs last wk";
    if (delta > 0) {
      return (
        <span style={{ fontWeight: 600, color: V3.green }} data-testid="settlements-presettle-kpi-pay-trend">
          ▲ vs last wk
        </span>
      );
    }
    return (
      <span style={{ fontWeight: 600, color: V3.red }} data-testid="settlements-presettle-kpi-pay-trend">
        ▼ vs last wk
      </span>
    );
  }, [kpiBaseQuery.isError, kpiSettlements, periodStart]);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))",
        gap: 8,
        fontFamily: V3.font,
      }}
      data-testid="settlements-presettle-kpi-strip"
      data-settlements-presettle-v3-kpis="1"
      data-settlements-presettle-v3-chrome="1"
    >
      <V3KpiTile
        label="Total unpaid"
        value={display(totalUnpaid === null ? null : Math.round(Number(totalUnpaid)))}
        sub="settlements not yet paid"
        testId="settlements-presettle-kpi-total-unpaid"
        onClick={() => navigate("/driver-finance/settlements?view=payments&payment_state=unpaid")}
      />
      <V3KpiTile
        label="This period"
        value={display(thisPeriod === null ? null : Math.round(Number(thisPeriod)))}
        sub="period end this week"
        testId="settlements-presettle-kpi-this-period"
        onClick={() => navigate("/driver-finance/settlements")}
      />
      <V3KpiTile
        label="Driver pay (period)"
        value={display(driverPayThisPeriod)}
        sub={driverPaySub}
        testId="settlements-presettle-kpi-driver-pay"
        onClick={() => navigate("/driver-finance/settlements?view=payments")}
      />
      <V3KpiTile
        label="Drivers w/ debt"
        value={display(driversWithDebt === null ? null : Math.round(Number(driversWithDebt)))}
        sub="live debt balance"
        tone={typeof driversWithDebt === "number" && driversWithDebt > 0 ? "red" : "ink"}
        testId="settlements-presettle-kpi-debt"
        onClick={() => navigate("/driver-finance/settlements?view=payments&focus=debt")}
      />
      <V3KpiTile
        label="YTD settlements"
        value={display(ytdSettlements === null ? null : Math.round(Number(ytdSettlements)))}
        sub={`${ytdYear} calendar year`}
        testId="settlements-presettle-kpi-ytd"
        onClick={() => navigate("/driver-finance/settlements")}
      />
      <V3KpiTile
        label="Open driver bills"
        value={display(openBills === null ? null : Math.round(openBills))}
        sub="unsettled driver pay"
        testId="settlements-presettle-kpi-open-bills"
        onClick={() => navigate("/driver-finance/settlements?view=payments")}
      />
    </div>
  );
}

type ClosesProps = {
  basePath?: string;
};

/** Board right rail — "What closes a tour" (Settlements-PreSettlements.png). */
export function SettlementsPreSettlementsClosesPanel({
  basePath = "/driver-finance/pre-settlements",
}: ClosesProps) {
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const root = basePath.replace(/\/+$/, "") || "/driver-finance/pre-settlements";

  const openPreQuery = useQuery({
    queryKey: ["driver-finance", "open-pre-settlements", companyId, "presettle-v3-count"],
    queryFn: () => listOpenPreSettlements(companyId),
    enabled: Boolean(companyId),
  });

  const openPreCount = openPreQuery.isError
    ? null
    : openPreQuery.data
      ? openPreQuery.data.length
      : null;

  return (
    <BoardSection
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
    </BoardSection>
  );
}
