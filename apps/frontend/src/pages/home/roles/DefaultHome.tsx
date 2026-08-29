import { unverifiableReasonText } from "../../../lib/unverifiableReasonText";
import { BackendVersionFooter } from "../../../components/shared/BackendVersionFooter";
import type { AuthMeResponse } from "../../../types/api";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { cashAdvanceRequestsOfficeApi } from "../../../api/cashAdvanceRequests";
import {
  fetchHomeCashPosition,
  fetchHomeDriversOnDuty,
  fetchHomeFactoringBalance,
  fetchHomeFleetSnapshot,
  fetchHomeOpenLoadsCount,
  fetchHomeQboSyncHealth,
  fetchHomeQboCustomersPushStatus,
  fetchHomeQboVendorsPushStatus,
  fetchHomeQboAccountsPushStatus,
  fetchHomeVendorMappingIntegrity,
  fetchHomeTodayRevenue,
  fetchHomeWosOpenCount,
  type HomeKpiRange,
} from "../../../api/home";
import { getKpiSummary } from "../../../api/reports";
import { PageHeader } from "../../../components/layout/PageHeader";
import { Button } from "../../../components/Button";
import { SectionQuickJump } from "../../../components/home/SectionQuickJump";
import { ComplianceFilingsDueWidget } from "../../../components/home/ComplianceFilingsDueWidget";
import { FleetSnapshotPanel } from "../../../components/home/FleetSnapshotPanel";
import { DriverDaySummaryCard } from "../../../components/home/DriverDaySummaryCard";
import { QboSyncHealthCard } from "../../../components/home/QboSyncHealthCard";
import { VendorMappingIntegrityCard } from "../../../components/home/VendorMappingIntegrityCard";
import { RevenueDiscrepancyDrill } from "../../../components/home/RevenueDiscrepancyDrill";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { AttentionList } from "../AttentionList";
import { FleetUtilizationGauge } from "../charts/FleetUtilizationGauge";
import { WeeklyRevenueChart } from "../charts/WeeklyRevenueChart";
import { WOStatusPieChart } from "../charts/WOStatusPieChart";
import { formatShortDate, formatUsdFromCents, HomeKpiCard } from "../HomeKpiCard";
import { printLetterHtml } from "../../../lib/openPrintableDocument";
import { HomeKpiRangeToggle, revenueKpiLabel } from "../HomeKpiRangeToggle";
import { entityLabel } from "../../../lib/entity-label";
import { EntityLink } from "../../../components/shared/EntityLink";
import { QuickActionsBar } from "../QuickActionsBar";
import { HOME_QUICK_JUMPS } from "../homeQuickJumps";
import { combineQueryIsError } from "../combineQueryIsError";
import "../home-print.css";

type Props = {
  auth: AuthMeResponse["user"];
};

export function DefaultHome({ auth }: Props) {
  const displayName = auth.email ?? "Driver";
  const { selectedCompanyId, selectedCompany } = useCompanyContext();
  const qboAvailable = selectedCompany?.code === "TRANSP";
  const queryClient = useQueryClient();
  const cid = selectedCompanyId ?? "";
  // h-05: KPI range preset — server resolves the window in company TZ (default: today).
  const [kpiRange, setKpiRange] = useState<HomeKpiRange>("today");

  const kpiSummaryQuery = useQuery({
    queryKey: ["reports", "kpi-summary", selectedCompanyId],
    queryFn: () => getKpiSummary(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId),
  });

  const todayRevenueQuery = useQuery({
    queryKey: ["home", "today-revenue", cid, kpiRange],
    queryFn: () => fetchHomeTodayRevenue(cid, kpiRange),
    enabled: Boolean(cid),
  });

  const openLoadsQuery = useQuery({
    queryKey: ["home", "open-loads-count", cid],
    queryFn: () => fetchHomeOpenLoadsCount(cid),
    enabled: Boolean(cid),
  });

  const driversDutyQuery = useQuery({
    queryKey: ["home", "drivers-on-duty", cid],
    queryFn: () => fetchHomeDriversOnDuty(cid),
    enabled: Boolean(cid),
  });

  const wosOpenQuery = useQuery({
    queryKey: ["home", "wos-open-count", cid],
    queryFn: () => fetchHomeWosOpenCount(cid),
    enabled: Boolean(cid),
  });

  const cashPositionQuery = useQuery({
    queryKey: ["home", "cash-position", cid],
    queryFn: () => fetchHomeCashPosition(cid),
    enabled: Boolean(cid),
  });

  const factoringBalanceQuery = useQuery({
    queryKey: ["home", "factoring-balance", cid],
    queryFn: () => fetchHomeFactoringBalance(cid),
    enabled: Boolean(cid),
  });

  const fleetSnapshotQuery = useQuery({
    queryKey: ["home", "fleet-snapshot", selectedCompanyId],
    queryFn: () => fetchHomeFleetSnapshot(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId),
  });

  const qboSyncHealthQuery = useQuery({
    queryKey: ["home", "qbo-sync-health", selectedCompanyId],
    queryFn: () => fetchHomeQboSyncHealth(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId) && qboAvailable,
    refetchInterval: 60_000,
  });

  const qboCustomersPushStatusQuery = useQuery({
    queryKey: ["home", "qbo-customers-push-status", selectedCompanyId],
    queryFn: () => fetchHomeQboCustomersPushStatus(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId) && qboAvailable,
    refetchInterval: 60_000,
  });

  const qboVendorsPushStatusQuery = useQuery({
    queryKey: ["home", "qbo-vendors-push-status", selectedCompanyId],
    queryFn: () => fetchHomeQboVendorsPushStatus(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId) && qboAvailable,
    refetchInterval: 60_000,
  });

  const qboAccountsPushStatusQuery = useQuery({
    queryKey: ["home", "qbo-accounts-push-status", selectedCompanyId],
    queryFn: () => fetchHomeQboAccountsPushStatus(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId) && qboAvailable,
    refetchInterval: 60_000,
  });

  const vendorMappingIntegrityQuery = useQuery({
    queryKey: ["home", "vendor-mapping-integrity", selectedCompanyId],
    queryFn: () => fetchHomeVendorMappingIntegrity(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId),
    refetchInterval: 60_000,
  });

  const ownerCashPendingQuery = useQuery({
    queryKey: ["home", "owner-cash-advance-pending", selectedCompanyId],
    queryFn: () => cashAdvanceRequestsOfficeApi.listPendingOwnerApproval(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId) && auth.role === "Owner",
  });
  const ownerCashPending = ownerCashPendingQuery.data?.requests ?? [];

  function refreshAll() {
    void queryClient.invalidateQueries({ queryKey: ["home"] });
    void kpiSummaryQuery.refetch();
    void fleetSnapshotQuery.refetch();
    void ownerCashPendingQuery.refetch();
  }

  const kpiItems = [
    { label: "Tracked Assets", number: String(kpiSummaryQuery.data?.tracked_assets ?? 0), meta: "company-scoped total assets" },
    { label: "Assigned / Working", number: String(kpiSummaryQuery.data?.assigned_working ?? 0), meta: "on active loads" },
    { label: "Maint Past Due", number: String(kpiSummaryQuery.data?.maint_past_due ?? 0), meta: "work orders past due", alert: "crit" as const },
    ...(qboAvailable ? [{
      label: "QBO Vendors",
      number: qboVendorsPushStatusQuery.data ? String(qboVendorsPushStatusQuery.data.synced) : "—",
      meta: qboVendorsPushStatusQuery.data
        ? `${qboVendorsPushStatusQuery.data.synced}/${qboVendorsPushStatusQuery.data.total} synced to QBO`
        : "—",
    }] : []),
    { label: "Vehicles in Service", number: String(kpiSummaryQuery.data?.live_units ?? 0), meta: "tenant-scoped active units", healthy: true },
    { label: "Open Damage", number: String(kpiSummaryQuery.data?.open_damage ?? 0), meta: "open accidents", alert: "warn" as const },
    ...(qboAvailable ? [{ label: "Pending QBO Sync", number: String(kpiSummaryQuery.data?.pending_qbo_sync ?? 0), meta: "outbox events pending", alert: "warn" as const }] : []),
  ];

  const fleetRows = [
    { leftLabel: "Trucks", leftValue: String(fleetSnapshotQuery.data?.trucks ?? 0), rightLabel: "Refrigerated", rightValue: String(fleetSnapshotQuery.data?.refrigerated ?? 0) },
    { leftLabel: "Flatbeds", leftValue: String(fleetSnapshotQuery.data?.flatbeds ?? 0), rightLabel: "Dry vans", rightValue: String(fleetSnapshotQuery.data?.dry_vans ?? 0) },
    { leftLabel: "Trailers", leftValue: String(fleetSnapshotQuery.data?.trailers ?? 0), rightLabel: "Out of service", rightValue: String(fleetSnapshotQuery.data?.out_of_service ?? 0) },
    { leftLabel: "In shop", leftValue: String(fleetSnapshotQuery.data?.in_shop ?? 0), rightLabel: "Roadside", rightValue: String(fleetSnapshotQuery.data?.roadside ?? 0) },
    { leftLabel: "Assigned units", leftValue: String(fleetSnapshotQuery.data?.assigned_units ?? 0), rightLabel: "Idle units", rightValue: String(fleetSnapshotQuery.data?.idle_units ?? 0) },
    { leftLabel: "Samsara live", leftValue: String(fleetSnapshotQuery.data?.samsara_live ?? 0), rightLabel: "No signal >6h", rightValue: String(fleetSnapshotQuery.data?.no_signal_6h ?? 0) },
  ];

  const tr = todayRevenueQuery.data;
  const ol = openLoadsQuery.data;
  const dd = driversDutyQuery.data;
  const wo = wosOpenQuery.data;
  const cp = cashPositionQuery.data;
  const fb = factoringBalanceQuery.data;

  function printLetter() {
    const esc = (v: unknown) =>
      String(v ?? "—")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    const kpiHtml = kpiItems
      .map((item) => `<tr><th>${esc(item.label)}</th><td>${esc(item.number)}</td><td>${esc(item.meta)}</td></tr>`)
      .join("");
    const fleetHtml = fleetRows
      .map(
        (row) =>
          `<tr><td>${esc(row.leftLabel)}</td><td>${esc(row.leftValue)}</td><td>${esc(row.rightLabel)}</td><td>${esc(row.rightValue)}</td></tr>`,
      )
      .join("");
    printLetterHtml({
      title: `Home snapshot — ${displayName}`,
      bodyHtml: `
        <h1>Home</h1>
        <div class="meta">${esc(`Workspace snapshot (${displayName})`)} · printed ${esc(new Date().toLocaleString())}</div>
        <h1 style="margin-top:16px">KPIs</h1>
        <table>
          <thead><tr><th>Metric</th><th>Value</th><th>Detail</th></tr></thead>
          <tbody>${kpiHtml || `<tr><td colspan="3">No KPI rows</td></tr>`}</tbody>
        </table>
        <h1 style="margin-top:16px">Fleet snapshot</h1>
        <table>
          <thead><tr><th></th><th></th><th></th><th></th></tr></thead>
          <tbody>${fleetHtml || `<tr><td colspan="4">No fleet rows</td></tr>`}</tbody>
        </table>
        <h1 style="margin-top:16px">Operations</h1>
        <table>
          <tbody>
            <tr><th>Open loads</th><td>${esc(ol ? `${ol.total} loads` : "—")}</td></tr>
            <tr><th>Drivers on duty</th><td>${esc(dd ? `${dd.active} / ${dd.total_drivers}` : "—")}</td></tr>
            <tr><th>Open work orders</th><td>${esc(wo ? `${wo.open} WOs` : "—")}</td></tr>
            <tr><th>Cash position</th><td>${esc(cp ? formatUsdFromCents(cp.balance_cents) : "—")}</td></tr>
            <tr><th>Factoring balance</th><td>${esc(
              !fb || fb.status === "unverifiable" || fb.status === "accounting_exception" || fb.outstanding_cents == null
                ? "—"
                : formatUsdFromCents(fb.outstanding_cents),
            )}</td></tr>
            <tr><th>Revenue (${esc(kpiRange)})</th><td>${esc(
              tr == null || tr.status === "unverifiable" || tr.revenue_cents == null
                ? "—"
                : formatUsdFromCents(tr.revenue_cents),
            )}</td></tr>
          </tbody>
        </table>
      `,
    });
  }

  return (
    <div className="home-page flex flex-col gap-4">
      <PageHeader
        title="Home"
        subtitle={`Workspace snapshot for the last three days (${displayName})`}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button type="button" className="text-sm font-medium text-slate-700 hover:underline" onClick={printLetter}>
              Print this page
            </button>
            <Button variant="secondary" onClick={refreshAll}>
              Refresh
            </Button>
          </div>
        }
      />

      {auth.role === "Owner" && selectedCompanyId ? (
        <section className="rounded-sm border border-slate-300 bg-slate-100/90 px-3 py-3 text-sm text-slate-700">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">Pending Owner Approvals</div>
              <div className="mt-1 font-semibold">
                {ownerCashPendingQuery.isLoading
                  ? "Loading…"
                  : `${ownerCashPending.length} cash advance request${ownerCashPending.length === 1 ? "" : "s"} awaiting Owner action`}
              </div>
              <p className="mt-1 max-w-2xl text-xs text-slate-700/90">
                Above-policy driver requests escalated from the office for your approval. Open the queue to review each request and approve or
                decline it.
              </p>
            </div>
            <Link
              to="/driver-finance/cash-advance-requests"
              className="shrink-0 rounded-sm bg-[#1F2A44] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#1F2A44]"
            >
              Open queue
            </Link>
          </div>
          {ownerCashPending.length > 0 ? (
            <ul className="mt-2 space-y-1 border-t border-slate-300/80 pt-2 text-xs">
              {ownerCashPending.slice(0, 5).map((r) => (
                <li key={String(r.id ?? "")} className="flex min-w-0 flex-wrap justify-between gap-2">
                  <span className="font-mono">{String(r.display_id ?? "")}</span>
                  <span className="min-w-0 max-w-[240px]">
                    <EntityLink
                      kind="driver"
                      id={String(r.driver_id ?? "")}
                      label={entityLabel(String(r.driver_name ?? ""), String(r.driver_id ?? ""), "Driver")}
                      className="single-line-name"
                    />
                  </span>
                  <span className="rounded-sm bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">Above policy</span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <section className="attention-list order-1 rounded-sm border border-slate-200 bg-white lg:order-2">
        <div className="border-b border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900">Attention</div>
        <div className="px-3 py-1">
          <AttentionList operatingCompanyId={selectedCompanyId} maxVisibleWhenCollapsed={5} />
        </div>
      </section>

      <div className="order-2 lg:order-2">
        <DriverDaySummaryCard operatingCompanyId={selectedCompanyId} />
      </div>

      {/* h-05: KPI date-range toggle — drives the revenue KPI window (7d/30d/MTD/YTD). */}
      <div className="order-3 lg:order-1">
        <HomeKpiRangeToggle value={kpiRange} onChange={setKpiRange} />
      </div>

      <section className="kpi-grid order-3 grid grid-cols-1 gap-2 md:grid-cols-2 lg:order-1 lg:grid-cols-3">
        <div>
          <HomeKpiCard
            label={revenueKpiLabel(kpiRange)}
            to="/reports"
            number={
              tr == null
                ? "—"
                : tr.status === "unverifiable"
                  ? "Unverifiable"
                  : tr.revenue_cents == null
                    ? "—"
                    : formatUsdFromCents(tr.revenue_cents)
            }
            isLoading={todayRevenueQuery.isLoading}
            isError={todayRevenueQuery.isError}
            error={todayRevenueQuery.error}
            onRetry={() => void todayRevenueQuery.refetch()}
            subtext={
              tr == null ? null : tr.status === "unverifiable" ? (
                <span>
                  Invoice↔GL linkage unverifiable
                  {tr.unverifiable_reason ? `: ${unverifiableReasonText(tr.unverifiable_reason)}` : ""}
                </span>
              ) : (
                <span>
                  Invoice basis (pre-tax)
                  {typeof tr.gl_posted_revenue_cents === "number"
                    ? ` · GL posted ${formatUsdFromCents(tr.gl_posted_revenue_cents)}`
                    : ""}
                  {typeof tr.discrepancy_count === "number" && tr.discrepancy_count > 0
                    ? ` · ${tr.discrepancy_count} ${tr.discrepancy_count === 1 ? "discrepancy" : "discrepancies"}`
                    : ""}
                </span>
              )
            }
            delta={
              kpiRange === "today" && tr != null && tr.delta_pct_vs_yesterday != null && Number.isFinite(tr.delta_pct_vs_yesterday) ? (
                <span
                  className={`inline-flex rounded px-1.5 py-0.5 font-semibold ${
                    tr.delta_pct_vs_yesterday >= 0 ? "bg-slate-100 text-slate-700" : "bg-red-100 text-red-800"
                  }`}
                >
                  {tr.delta_pct_vs_yesterday >= 0 ? "↑ " : "↓ "}
                  {Math.abs(tr.delta_pct_vs_yesterday).toFixed(1)}% vs yesterday
                </span>
              ) : null
            }
          />
          {tr && tr.status !== "unverifiable" ? (
            <RevenueDiscrepancyDrill
              invoices={tr.drill?.mismatched_invoices}
              journals={tr.drill?.mismatched_journal_entries}
              discrepancyCount={tr.discrepancy_count}
              discrepancyCents={tr.discrepancy_cents}
            />
          ) : null}
        </div>
        <HomeKpiCard
          label="Open Loads"
          to="/dispatch?view=loads"
          number={ol ? `${ol.total} loads` : "—"}
          isLoading={openLoadsQuery.isLoading}
          isError={openLoadsQuery.isError}
          error={openLoadsQuery.error}
          onRetry={() => void openLoadsQuery.refetch()}
          subtext={
            ol
              ? `${ol.in_transit} in transit · ${ol.assigned} assigned · ${ol.unassigned} unassigned`
              : null
          }
        />
        <HomeKpiCard
          label="Drivers On Duty"
          to="/driver-hub"
          number={dd ? `${dd.active} / ${dd.total_drivers}` : "—"}
          isLoading={driversDutyQuery.isLoading}
          isError={driversDutyQuery.isError}
          error={driversDutyQuery.error}
          onRetry={() => void driversDutyQuery.refetch()}
          subtext={dd ? `${dd.on_break} on break` : null}
        />
        <HomeKpiCard
          label="WOs Open"
          to="/maintenance"
          number={wo ? `${wo.open} WOs` : "—"}
          isLoading={wosOpenQuery.isLoading}
          isError={wosOpenQuery.isError}
          error={wosOpenQuery.error}
          onRetry={() => void wosOpenQuery.refetch()}
          subtext={wo ? `${wo.in_progress} in progress` : null}
        />
        <HomeKpiCard
          label="Cash Position"
          to="/banking"
          number={cp ? formatUsdFromCents(cp.balance_cents) : "—"}
          isLoading={cashPositionQuery.isLoading}
          isError={cashPositionQuery.isError}
          error={cashPositionQuery.error}
          onRetry={() => void cashPositionQuery.refetch()}
          subtext={cp ? `Last reconciled: ${formatShortDate(cp.last_reconciled_at)}` : null}
        />
        <HomeKpiCard
          label="Factoring Balance"
          to="/factoring"
          number={
            !fb
              ? "—"
              : fb.status === "unverifiable" || fb.status === "accounting_exception"
                ? fb.status === "accounting_exception"
                  ? "Exception"
                  : "Unverifiable"
                : fb.outstanding_cents == null
                  ? "—"
                  : formatUsdFromCents(fb.outstanding_cents)
          }
          isLoading={factoringBalanceQuery.isLoading}
          isError={factoringBalanceQuery.isError}
          error={factoringBalanceQuery.error}
          onRetry={() => void factoringBalanceQuery.refetch()}
          accent="#475569"
          subtext={
            !fb
              ? null
              : fb.status === "unverifiable" || fb.status === "accounting_exception"
                ? `Factoring balance ${fb.status}${fb.unverifiable_reason ? `: ${unverifiableReasonText(fb.unverifiable_reason)}` : ""}`
                : `${fb.invoices_factored ?? 0} invoices factored`
          }
        />
      </section>

      <div className="order-3">
        <QuickActionsBar operatingCompanyId={selectedCompanyId} />
      </div>

      <section className="chart-grid order-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-sm border border-slate-200 bg-white p-3 shadow-xs">
          <WeeklyRevenueChart operatingCompanyId={selectedCompanyId} />
        </div>
        <div className="rounded-sm border border-slate-200 bg-white p-3 shadow-xs">
          <WOStatusPieChart operatingCompanyId={selectedCompanyId} />
        </div>
        <div className="rounded-sm border border-slate-200 bg-white p-3 shadow-xs md:col-span-2 lg:col-span-1">
          <FleetUtilizationGauge operatingCompanyId={selectedCompanyId} />
        </div>
      </section>

      <section className="order-5 space-y-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Operations snapshot (reports KPIs)</div>
        <div className="grid grid-cols-1 gap-2 xl:grid-cols-7">
          {kpiItems.map((item) => (
            <div
              key={item.label}
              className={`rounded border bg-white px-3 py-2 ${
                item.alert === "crit"
                  ? "border-l-[3px] border-l-crit"
                  : item.alert === "warn"
                    ? "border-l-[3px] border-l-[#334155]"
                    : "border-slate-200"
              }`}
            >
              <div className="text-[10px] font-semibold uppercase tracking-[0.04em] text-slate-500">{item.label}</div>
              <div
                className={`text-base font-semibold ${
                  item.alert === "crit"
                    ? "text-crit"
                    : item.alert === "warn"
                      ? "text-[#334155]"
                      : item.healthy
                        ? "text-[#334155]"
                        : "text-slate-900"
                }`}
              >
                {item.number}
              </div>
              <div className="text-[11px] text-slate-500">{item.meta}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="order-6 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {HOME_QUICK_JUMPS.map((jump) => (
          <SectionQuickJump key={jump.title} title={jump.title} subtitle={jump.subtitle} count={jump.count} to={jump.to} />
        ))}
      </div>

      <div className="order-7">
        <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
          {fleetSnapshotQuery.isLoading ? (
            <section className="rounded-sm border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900">Fleet Snapshot</div>
              <div className="space-y-2 p-3">
                <div className="h-6 animate-pulse rounded-sm bg-slate-100" />
                <div className="h-6 animate-pulse rounded-sm bg-slate-100" />
                <div className="h-6 animate-pulse rounded-sm bg-slate-100" />
              </div>
            </section>
          ) : fleetSnapshotQuery.isError ? (
            <section className="rounded-sm border border-red-200 bg-red-50">
              <div className="border-b border-red-200 px-3 py-2 text-sm font-semibold text-red-900">Fleet Snapshot</div>
              <div className="flex items-center justify-between px-3 py-3 text-sm text-red-800">
                <span>Failed to load fleet snapshot. Try refreshing.</span>
                <Button
                  variant="secondary"
                  onClick={() => {
                    void fleetSnapshotQuery.refetch();
                  }}
                >
                  Refresh
                </Button>
              </div>
            </section>
          ) : (
            <FleetSnapshotPanel rows={fleetRows} />
          )}
          <div className="space-y-2">
            {qboAvailable ? <QboSyncHealthCard
              data={qboSyncHealthQuery.data}
              pushStatus={qboCustomersPushStatusQuery.data}
              vendorsPushStatus={qboVendorsPushStatusQuery.data}
              accountsPushStatus={qboAccountsPushStatusQuery.data}
              isLoading={qboSyncHealthQuery.isLoading}
              isError={combineQueryIsError([
                qboSyncHealthQuery,
                qboCustomersPushStatusQuery,
                qboVendorsPushStatusQuery,
                qboAccountsPushStatusQuery,
              ])}
              onRetry={() => {
                void qboSyncHealthQuery.refetch();
                void qboCustomersPushStatusQuery.refetch();
                void qboVendorsPushStatusQuery.refetch();
                void qboAccountsPushStatusQuery.refetch();
              }}
            /> : null}
            <VendorMappingIntegrityCard
              data={vendorMappingIntegrityQuery.data}
              isLoading={vendorMappingIntegrityQuery.isLoading}
              isError={vendorMappingIntegrityQuery.isError}
              onRetry={() => {
                void vendorMappingIntegrityQuery.refetch();
              }}
            />
          </div>
        </div>
      </div>

      <div className="order-7">
        <ComplianceFilingsDueWidget operatingCompanyId={selectedCompanyId ?? null} />
      </div>

      <BackendVersionFooter className="order-8 text-xs text-gray-500" />

    </div>
  );
}
