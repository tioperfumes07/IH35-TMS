import type { AuthMeResponse } from "../../types/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { cashAdvanceRequestsOfficeApi } from "../../api/cashAdvanceRequests";
import {
  fetchHomeCashPosition,
  fetchHomeDriversOnDuty,
  fetchHomeFactoringBalance,
  fetchHomeFleetSnapshot,
  fetchHomeOpenLoadsCount,
  fetchHomeQboSyncHealth,
  fetchHomeVendorMappingIntegrity,
  fetchHomeTodayRevenue,
  fetchHomeWosOpenCount,
} from "../../api/home";
import { getKpiSummary } from "../../api/reports";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/Button";
import { SectionQuickJump } from "../../components/home/SectionQuickJump";
import { FleetSnapshotPanel } from "../../components/home/FleetSnapshotPanel";
import { QboSyncHealthCard } from "../../components/home/QboSyncHealthCard";
import { VendorMappingIntegrityCard } from "../../components/home/VendorMappingIntegrityCard";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { AttentionList } from "./AttentionList";
import { FleetUtilizationGauge } from "./charts/FleetUtilizationGauge";
import { WeeklyRevenueChart } from "./charts/WeeklyRevenueChart";
import { WOStatusPieChart } from "./charts/WOStatusPieChart";
import { formatShortDate, formatUsdFromCents, HomeKpiCard } from "./HomeKpiCard";
import { QuickActionsBar } from "./QuickActionsBar";
import "./home-print.css";

const QUICK_JUMPS = [
  { title: "Maintenance", subtitle: "Work orders, R&M, Severe Repair", count: 14, to: "/maintenance" },
  { title: "Accounting", subtitle: "Bills, Expenses, Bill payment", count: 38, to: "/accounting/invoices" },
  { title: "Banking", subtitle: "Categorize, Reconcile, Transfer", count: 22, to: "/banking" },
  { title: "Fuel", subtitle: "Relay inbox, Settings, Planner", count: 19, to: "/fuel" },
  { title: "Safety", subtitle: "HOS, Antidoping, Accidents, DOT", count: 6, to: "/safety" },
  { title: "Drivers", subtitle: "Profiles, Settlements, Permits", count: 3, to: "/drivers" },
  { title: "Dispatch", subtitle: "Loads, Settlements, Geofencing", count: 27, to: "/dispatch" },
  { title: "Lists & Catalogs", subtitle: "Eight catalog sets grouped by domain", count: null, to: "/lists" },
];

type Props = {
  auth: AuthMeResponse["user"];
};

export function HomePage({ auth }: Props) {
  const displayName = auth.email ?? "Driver";
  const { selectedCompanyId } = useCompanyContext();
  const queryClient = useQueryClient();
  const cid = selectedCompanyId ?? "";

  const kpiSummaryQuery = useQuery({
    queryKey: ["reports", "kpi-summary", selectedCompanyId],
    queryFn: () => getKpiSummary(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId),
  });

  const todayRevenueQuery = useQuery({
    queryKey: ["home", "today-revenue", cid],
    queryFn: () => fetchHomeTodayRevenue(cid),
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
    enabled: Boolean(selectedCompanyId),
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
    { label: "QBO Vendors", number: "284", meta: "synced 9:38 AM" },
    { label: "Vehicles in Service", number: String(kpiSummaryQuery.data?.live_units ?? 0), meta: "tenant-scoped active units", healthy: true },
    { label: "Open Damage", number: String(kpiSummaryQuery.data?.open_damage ?? 0), meta: "open accidents", alert: "warn" as const },
    { label: "Pending QBO Sync", number: String(kpiSummaryQuery.data?.pending_qbo_sync ?? 0), meta: "outbox events pending", alert: "warn" as const },
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

  return (
    <div className="home-page flex flex-col gap-4">
      <PageHeader
        title="Home"
        subtitle={`Workspace snapshot for the last three days (${displayName})`}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button type="button" className="text-sm font-medium text-blue-700 hover:underline" onClick={() => window.print()}>
              Print this page
            </button>
            <Button variant="secondary" onClick={refreshAll}>
              Refresh
            </Button>
          </div>
        }
      />

      {auth.role === "Owner" && selectedCompanyId ? (
        <section className="rounded border border-violet-200 bg-violet-50/90 px-3 py-3 text-sm text-violet-950">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-violet-800">Pending Owner Approvals</div>
              <div className="mt-1 font-semibold">
                {ownerCashPendingQuery.isLoading
                  ? "Loading…"
                  : `${ownerCashPending.length} cash advance request${ownerCashPending.length === 1 ? "" : "s"} awaiting Owner action`}
              </div>
              <p className="mt-1 max-w-2xl text-xs text-violet-900/90">
                Above-policy driver requests escalated from the office queue. Open the cash advance requests page to copy portal links or use the
                email you received.
              </p>
            </div>
            <Link
              to="/driver-finance/cash-advance-requests"
              className="shrink-0 rounded bg-violet-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-800"
            >
              Open queue
            </Link>
          </div>
          {ownerCashPending.length > 0 ? (
            <ul className="mt-2 space-y-1 border-t border-violet-200/80 pt-2 text-xs">
              {ownerCashPending.slice(0, 5).map((r) => (
                <li key={String(r.id ?? "")} className="flex min-w-0 flex-wrap justify-between gap-2">
                  <span className="font-mono">{String(r.display_id ?? "")}</span>
                  <span className="min-w-0 max-w-[240px]">
                    <span
                      title={r.driver_name && String(r.driver_name).trim() ? String(r.driver_name) : undefined}
                      className="single-line-name"
                    >
                      {String(r.driver_name ?? "")}
                    </span>
                  </span>
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900">Above policy</span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <section className="attention-list order-1 rounded border border-slate-200 bg-white lg:order-2">
        <div className="border-b border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900">Attention</div>
        <div className="px-3 py-1">
          <AttentionList operatingCompanyId={selectedCompanyId} maxVisibleWhenCollapsed={5} />
        </div>
      </section>

      <section className="kpi-grid order-2 grid grid-cols-1 gap-2 md:grid-cols-2 lg:order-1 lg:grid-cols-3">
        <HomeKpiCard
          label="Today's Revenue"
          number={tr ? formatUsdFromCents(tr.revenue_cents) : "—"}
          isLoading={todayRevenueQuery.isLoading}
          isError={todayRevenueQuery.isError}
          error={todayRevenueQuery.error}
          onRetry={() => void todayRevenueQuery.refetch()}
          delta={
            tr != null && tr.delta_pct_vs_yesterday != null && Number.isFinite(tr.delta_pct_vs_yesterday) ? (
              <span
                className={`inline-flex rounded px-1.5 py-0.5 font-semibold ${
                  tr.delta_pct_vs_yesterday >= 0 ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
                }`}
              >
                {tr.delta_pct_vs_yesterday >= 0 ? "↑ " : "↓ "}
                {Math.abs(tr.delta_pct_vs_yesterday).toFixed(1)}% vs yesterday
              </span>
            ) : null
          }
        />
        <HomeKpiCard
          label="Open Loads"
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
          number={dd ? `${dd.active} / ${dd.total_drivers}` : "—"}
          isLoading={driversDutyQuery.isLoading}
          isError={driversDutyQuery.isError}
          error={driversDutyQuery.error}
          onRetry={() => void driversDutyQuery.refetch()}
          subtext={dd ? `${dd.on_break} on break` : null}
        />
        <HomeKpiCard
          label="WOs Open"
          number={wo ? `${wo.open} WOs` : "—"}
          isLoading={wosOpenQuery.isLoading}
          isError={wosOpenQuery.isError}
          error={wosOpenQuery.error}
          onRetry={() => void wosOpenQuery.refetch()}
          subtext={wo ? `${wo.in_progress} in progress` : null}
        />
        <HomeKpiCard
          label="Cash Position"
          number={cp ? formatUsdFromCents(cp.balance_cents) : "—"}
          isLoading={cashPositionQuery.isLoading}
          isError={cashPositionQuery.isError}
          error={cashPositionQuery.error}
          onRetry={() => void cashPositionQuery.refetch()}
          subtext={cp ? `Last reconciled: ${formatShortDate(cp.last_reconciled_at)}` : null}
        />
        <HomeKpiCard
          label="Factoring Balance"
          number={fb ? formatUsdFromCents(fb.outstanding_cents) : "—"}
          isLoading={factoringBalanceQuery.isLoading}
          isError={factoringBalanceQuery.isError}
          error={factoringBalanceQuery.error}
          onRetry={() => void factoringBalanceQuery.refetch()}
          accent="#7c3aed"
          subtext={fb ? `${fb.invoices_factored} invoices factored` : null}
        />
      </section>

      <div className="order-3">
        <QuickActionsBar operatingCompanyId={selectedCompanyId} />
      </div>

      <section className="chart-grid order-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="rounded border border-slate-200 bg-white p-3 shadow-sm">
          <WeeklyRevenueChart operatingCompanyId={selectedCompanyId} />
        </div>
        <div className="rounded border border-slate-200 bg-white p-3 shadow-sm">
          <WOStatusPieChart operatingCompanyId={selectedCompanyId} />
        </div>
        <div className="rounded border border-slate-200 bg-white p-3 shadow-sm md:col-span-2 lg:col-span-1">
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
                  ? "border-l-[3px] border-l-[#dc2626]"
                  : item.alert === "warn"
                    ? "border-l-[3px] border-l-[#f59e0b]"
                    : "border-slate-200"
              }`}
            >
              <div className="text-[10px] font-semibold uppercase tracking-[0.04em] text-slate-500">{item.label}</div>
              <div
                className={`text-base font-semibold ${
                  item.alert === "crit"
                    ? "text-[#dc2626]"
                    : item.alert === "warn"
                      ? "text-[#92400e]"
                      : item.healthy
                        ? "text-[#16a34a]"
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
        {QUICK_JUMPS.map((jump) => (
          <SectionQuickJump key={jump.title} title={jump.title} subtitle={jump.subtitle} count={jump.count} to={jump.to} />
        ))}
      </div>

      <div className="order-7">
        <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
          {fleetSnapshotQuery.isLoading ? (
            <section className="rounded border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900">Fleet Snapshot</div>
              <div className="space-y-2 p-3">
                <div className="h-6 animate-pulse rounded bg-slate-100" />
                <div className="h-6 animate-pulse rounded bg-slate-100" />
                <div className="h-6 animate-pulse rounded bg-slate-100" />
              </div>
            </section>
          ) : fleetSnapshotQuery.isError ? (
            <section className="rounded border border-red-200 bg-red-50">
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
            <QboSyncHealthCard
              data={qboSyncHealthQuery.data}
              isLoading={qboSyncHealthQuery.isLoading}
              isError={qboSyncHealthQuery.isError}
              onRetry={() => {
                void qboSyncHealthQuery.refetch();
              }}
            />
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

      <footer className="order-8 text-xs text-gray-500">
        Backend version: {import.meta.env.VITE_BUILD_COMMIT ? String(import.meta.env.VITE_BUILD_COMMIT) : "dev"}
      </footer>
    </div>
  );
}
