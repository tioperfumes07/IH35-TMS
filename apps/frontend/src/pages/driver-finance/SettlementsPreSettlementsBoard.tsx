/**
 * ROUND 443.326 — Settlements-PreSettlements full V3 board (not chromeOnly shell).
 * kpiStrip + MoneyListToolbar + ParityTable in this surface file (Escrow grammar).
 * Does NOT mount DriversPage. Open rows from listTours(state=open).
 */
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  getOpenDriverBills,
  listSettlements,
  type SettlementListRow,
} from "../../api/driverFinance";
import { listTours } from "../../api/tourReadout";
import { ListErrorState } from "../../components/ListErrorState";
import { preSettlementColumns } from "../../components/driver-finance/PreSettlementsPanel";
import { ParityTable } from "../../components/parity/ParityTable";
import { MoneyListToolbar } from "../../components/table/MoneyListToolbar";
import { BoardSection } from "../../components/v3/BoardSection";
import { V3KpiTile } from "../../components/v3/V3KpiTile";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { V3 } from "../../design/v3-tokens";
import { formatUsdCents } from "../../lib/money";
import { SettlementsPreSettlementsClosesPanel } from "../drivers/SettlementsPreSettlementsKpiRow";
import {
  preSettlementsOpenTitle,
  preSettlementsYtdSub,
  S443326,
} from "./settlementsV3BoardStrings";

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

/** Board body only — chrome is SettlementsModuleShell / SettlementsSubNavWrapper (443.326). */
export function SettlementsPreSettlementsBoard() {
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [search, setSearch] = useState("");

  const openToursQuery = useQuery({
    queryKey: ["settlements-module", "tours", "open", companyId, "presettle-board"],
    queryFn: () => listTours(companyId, "open"),
    enabled: Boolean(companyId),
  });

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
      ? formatUsd(Number(serverKpi.driver_pay_this_period ?? 0))
      : formatUsd(
          kpiSettlements
            .filter((s) => isInThisPeriod(s, periodStart) && s.status !== "cancelled")
            .reduce((sum, s) => sum + Number(s.net_pay ?? 0), 0),
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

  const driverPaySub = useMemo(() => {
    if (kpiBaseQuery.isError) return S443326.preSettlements.kpiDriverPaySubSum;
    const thisWeekStart = periodStart.getTime();
    const lastWeekStart = thisWeekStart - 7 * 24 * 60 * 60 * 1000;
    let thisNet = 0;
    let lastNet = 0;
    for (const s of kpiSettlements) {
      if (s.status === "cancelled") continue;
      const end = new Date(s.period_end).getTime();
      if (Number.isNaN(end)) continue;
      if (end >= thisWeekStart) thisNet += Number(s.net_pay ?? 0);
      else if (end >= lastWeekStart && end < thisWeekStart) lastNet += Number(s.net_pay ?? 0);
    }
    const delta = thisNet - lastNet;
    const c = S443326.preSettlements;
    if (delta === 0) return c.kpiDriverPaySubFlat;
    if (delta > 0) {
      return (
        <span style={{ fontWeight: 600, color: V3.green }} data-testid="settlements-presettle-kpi-pay-trend">
          {c.kpiDriverPaySubUp}
        </span>
      );
    }
    return (
      <span style={{ fontWeight: 600, color: V3.red }} data-testid="settlements-presettle-kpi-pay-trend">
        {c.kpiDriverPaySubDown}
      </span>
    );
  }, [kpiBaseQuery.isError, kpiSettlements, periodStart]);

  const rows = openToursQuery.isError ? [] : (openToursQuery.data?.rows ?? []);
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const hay = [
        r.driver_name,
        r.unit_number,
        r.display_id,
        r.settlement_id,
        ...(r.legs ?? []).map((l) => l.load_number),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search]);

  const totalCents = filteredRows.reduce((sum, row) => sum + Number(row.driver_pay_cents ?? 0), 0);
  const countLabel = openToursQuery.isLoading || openToursQuery.isError ? "—" : String(filteredRows.length);

  return (
    <div className="space-y-3" data-testid="settlements-presettle-board" data-settlements-presettle-rebuild="1">
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
          label={S443326.preSettlements.kpiTotalUnpaid}
          value={display(totalUnpaid === null ? null : Math.round(Number(totalUnpaid)))}
          sub={S443326.preSettlements.kpiTotalUnpaidSub}
          testId="settlements-presettle-kpi-total-unpaid"
          onClick={() => navigate("/driver-finance/settlements?view=payments&payment_state=unpaid")}
        />
        <V3KpiTile
          label={S443326.preSettlements.kpiThisPeriod}
          value={display(thisPeriod === null ? null : Math.round(Number(thisPeriod)))}
          sub={S443326.preSettlements.kpiThisPeriodSub}
          testId="settlements-presettle-kpi-this-period"
          onClick={() => navigate("/driver-finance/settlements")}
        />
        <V3KpiTile
          label={S443326.preSettlements.kpiDriverPay}
          value={display(driverPayThisPeriod)}
          sub={driverPaySub}
          testId="settlements-presettle-kpi-driver-pay"
          onClick={() => navigate("/driver-finance/settlements?view=payments")}
        />
        <V3KpiTile
          label={S443326.preSettlements.kpiDriversDebt}
          value={display(driversWithDebt === null ? null : Math.round(Number(driversWithDebt)))}
          sub={S443326.preSettlements.kpiDriversDebtSub}
          tone={typeof driversWithDebt === "number" && driversWithDebt > 0 ? "red" : "ink"}
          testId="settlements-presettle-kpi-debt"
          onClick={() => navigate("/driver-finance/settlements?view=payments&focus=debt")}
        />
        <V3KpiTile
          label={S443326.preSettlements.kpiYtd}
          value={display(ytdSettlements === null ? null : Math.round(Number(ytdSettlements)))}
          sub={preSettlementsYtdSub(ytdYear)}
          testId="settlements-presettle-kpi-ytd"
          onClick={() => navigate("/driver-finance/settlements")}
        />
        <V3KpiTile
          label={S443326.preSettlements.kpiOpenBills}
          value={display(openBills === null ? null : Math.round(openBills))}
          sub={S443326.preSettlements.kpiOpenBillsSub}
          testId="settlements-presettle-kpi-open-bills"
          onClick={() => navigate("/driver-finance/settlements?view=payments")}
        />
      </div>

      <MoneyListToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={S443326.preSettlements.searchPlaceholder}
        searchTestId="settlements-presettle-search-input"
        onClearAll={() => setSearch("")}
        activeFilterCount={0}
        testIdPrefix="settlements-presettle"
      >
        {null}
      </MoneyListToolbar>

      {!companyId ? (
        <p className="text-xs text-red-600">{S443326.preSettlements.selectCompany}</p>
      ) : null}

      <div
        style={{ display: "grid", gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr)", gap: 8 }}
        data-testid="settlements-presettle-v3-panels"
        data-settlements-presettle-v3-layout="1"
      >
        <BoardSection
          title={preSettlementsOpenTitle(countLabel)}
          subtitle={S443326.preSettlements.openPanelSubtitle}
          testId="pre-settlements-v3-panel"
          onViewAll={() => navigate("/driver-finance/settlements")}
        >
          <div data-settlements-presettle-v3-panel="1">
            {openToursQuery.isError ? (
              <ListErrorState
                title={S443326.preSettlements.errLoadTitle}
                status={0}
                message={(openToursQuery.error as Error | undefined)?.message}
                onRetry={() => void openToursQuery.refetch()}
              />
            ) : (
              <ParityTable
                title={S443326.preSettlements.tableTitle}
                storageKey="pre-settlements-panel-v3-board-tours"
                columns={preSettlementColumns}
                rows={filteredRows}
                rowKey={(row) => row.settlement_id}
                rowTestId={() => "pre-settlement-row-reverse"}
                loading={openToursQuery.isLoading}
                emptyText={S443326.preSettlements.emptyOpen}
                tableTestId="settlements-presettle-open-table"
                hidePager
                pageSize={Math.max(1, filteredRows.length || 1)}
                footerCells={
                  filteredRows.length > 0
                    ? {
                        loads_so_far: (
                          <span className="font-semibold">{S443326.preSettlements.footerTotal}</span>
                        ),
                        amount: (
                          <span className="font-semibold text-right tabular-nums">
                            <Link className="underline" to="/driver-finance/settlements?state=open">
                              {formatUsdCents(totalCents)}
                            </Link>
                          </span>
                        ),
                      }
                    : undefined
                }
              />
            )}
            <p
              className="px-3.5 py-2 text-xs text-[#6B7280]"
              data-testid="pre-settlements-booked-ahead-note"
              style={{ fontFamily: V3.font, borderTop: `1px solid ${V3.borderSoft}` }}
            >
              {S443326.preSettlements.bookedAheadNote}
            </p>
          </div>
        </BoardSection>
        <SettlementsPreSettlementsClosesPanel basePath="/driver-finance/pre-settlements" />
      </div>
    </div>
  );
}
