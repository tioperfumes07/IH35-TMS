import type { AuthMeResponse } from "../types/api";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { cashAdvanceRequestsOfficeApi } from "../api/cashAdvanceRequests";
import { getHomeAttentionList, getHomeFleetSnapshot, getKpiSummary } from "../api/reports";
import { PageHeader } from "../components/layout/PageHeader";
import { Button } from "../components/Button";
import { SectionQuickJump } from "../components/home/SectionQuickJump";
import { AttentionListRow } from "../components/home/AttentionListRow";
import { FleetSnapshotPanel } from "../components/home/FleetSnapshotPanel";
import { useCompanyContext } from "../contexts/CompanyContext";

const QUICK_JUMPS = [
  { title: "Maintenance", subtitle: "Work orders, R&M, Severe Repair", count: 14, to: "/maintenance" },
  { title: "Accounting", subtitle: "Bills, Expenses, Bill payment", count: 38, to: "/accounting/invoices" },
  { title: "Banking", subtitle: "Categorize, Reconcile, Transfer", count: 22, to: "/banking" },
  { title: "Fuel", subtitle: "Relay inbox, Settings, Planner", count: 19, to: "/fuel" },
  { title: "Safety", subtitle: "HOS, Antidoping, Accidents, DOT", count: 6, to: "/safety" },
  { title: "Drivers", subtitle: "Profiles, Settlements, Permits", count: 3, to: "/drivers" },
  { title: "Dispatch", subtitle: "Loads, Settlements, Geofencing", count: 27, to: "/dispatch" },
  { title: "Lists & Catalogs", subtitle: "Grouped by domain · 8 sets", count: null, to: "/lists" },
];

type Props = {
  auth: AuthMeResponse["user"];
};

export function HomePage({ auth }: Props) {
  const displayName = auth.email ?? "Driver";
  const { selectedCompanyId } = useCompanyContext();

  const kpiSummaryQuery = useQuery({
    queryKey: ["reports", "kpi-summary", selectedCompanyId],
    queryFn: () => getKpiSummary(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId),
  });
  const attentionQuery = useQuery({
    queryKey: ["reports", "home-attention-list", selectedCompanyId],
    queryFn: () => getHomeAttentionList(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId),
  });
  const fleetSnapshotQuery = useQuery({
    queryKey: ["reports", "home-fleet-snapshot", selectedCompanyId],
    queryFn: () => getHomeFleetSnapshot(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId),
  });
  const ownerCashPendingQuery = useQuery({
    queryKey: ["home", "owner-cash-advance-pending", selectedCompanyId],
    queryFn: () => cashAdvanceRequestsOfficeApi.listPendingOwnerApproval(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId) && auth.role === "Owner",
  });
  const ownerCashPending = ownerCashPendingQuery.data?.requests ?? [];

  const kpiItems = [
    { label: "Tracked Assets", number: String(kpiSummaryQuery.data?.tracked_assets ?? 0), meta: "company-scoped total assets" },
    { label: "Assigned / Working", number: String(kpiSummaryQuery.data?.assigned_working ?? 0), meta: "on active loads" },
    { label: "Maint Past Due", number: String(kpiSummaryQuery.data?.maint_past_due ?? 0), meta: "work orders past due", alert: "crit" as const },
    { label: "QBO Vendors", number: "284", meta: "synced 9:38 AM" },
    { label: "Vehicles in Service", number: "94", meta: "Samsara live", healthy: true },
    { label: "Open Damage", number: String(kpiSummaryQuery.data?.open_damage ?? 0), meta: "open accidents", alert: "warn" as const },
    { label: "Pending QBO Sync", number: String(kpiSummaryQuery.data?.pending_qbo_sync ?? 0), meta: "outbox events pending", alert: "warn" as const },
  ];

  const attentionItems = (attentionQuery.data?.items ?? [])
    .filter((item) => item.count > 0)
    .map((item) => ({
      severity: item.severity === "critical" ? ("CRIT" as const) : item.severity === "warning" ? ("WARN" as const) : ("INFO" as const),
      text: `${item.count} ${item.message}`,
      module:
        item.link === "/maintenance"
          ? "Maintenance"
          : item.link === "/accounting"
            ? "Accounting"
            : item.link === "/safety"
              ? "Safety"
              : item.link === "/dispatch"
                ? "Dispatch"
                : item.link === "/fuel"
                  ? "Fuel"
                  : item.link === "/drivers"
                    ? "Drivers"
                    : "Home",
    }));

  const fleetRows = [
    { leftLabel: "Trucks", leftValue: String(fleetSnapshotQuery.data?.trucks ?? 0), rightLabel: "Refrigerated", rightValue: String(fleetSnapshotQuery.data?.refrigerated ?? 0) },
    { leftLabel: "Flatbeds", leftValue: String(fleetSnapshotQuery.data?.flatbeds ?? 0), rightLabel: "Dry vans", rightValue: String(fleetSnapshotQuery.data?.dry_vans ?? 0) },
    { leftLabel: "Trailers", leftValue: String(fleetSnapshotQuery.data?.trailers ?? 0), rightLabel: "Out of service", rightValue: String(fleetSnapshotQuery.data?.out_of_service ?? 0) },
    { leftLabel: "In shop", leftValue: String(fleetSnapshotQuery.data?.in_shop ?? 0), rightLabel: "Roadside", rightValue: String(fleetSnapshotQuery.data?.roadside ?? 0) },
    { leftLabel: "Assigned units", leftValue: String(fleetSnapshotQuery.data?.assigned_units ?? 0), rightLabel: "Idle units", rightValue: String(fleetSnapshotQuery.data?.idle_units ?? 0) },
    { leftLabel: "Samsara live", leftValue: String(fleetSnapshotQuery.data?.samsara_live ?? 0), rightLabel: "No signal >6h", rightValue: String(fleetSnapshotQuery.data?.no_signal_6h ?? 0) },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Home"
        subtitle={`Workspace snapshot · last 3 days · ${displayName}`}
        actions={
          <Button
            variant="secondary"
            onClick={() => {
              void Promise.all([
                kpiSummaryQuery.refetch(),
                attentionQuery.refetch(),
                fleetSnapshotQuery.refetch(),
                ownerCashPendingQuery.refetch(),
              ]);
            }}
          >
            Refresh
          </Button>
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
                Above-policy driver requests escalated from the office queue. Open the cash advance requests page to copy portal links
                or use the email you received.
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

      {/* TODO: wire dashboard snapshot values to backend in P3-T11.16.1 */}
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
            <div className={`text-base font-semibold ${item.alert === "crit" ? "text-[#dc2626]" : item.alert === "warn" ? "text-[#92400e]" : item.healthy ? "text-[#16a34a]" : "text-slate-900"}`}>
              {item.number}
            </div>
            <div className="text-[11px] text-slate-500">{item.meta}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {QUICK_JUMPS.map((jump) => (
          <SectionQuickJump key={jump.title} title={jump.title} subtitle={jump.subtitle} count={jump.count} to={jump.to} />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <section className="rounded border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900">Today&apos;s Attention List</div>
          <div className="px-3 py-1">
            {attentionQuery.isLoading ? (
              <div className="space-y-2 py-2">
                <div className="h-5 animate-pulse rounded bg-slate-100" />
                <div className="h-5 animate-pulse rounded bg-slate-100" />
                <div className="h-5 animate-pulse rounded bg-slate-100" />
              </div>
            ) : attentionQuery.isError ? (
              <div className="my-2 flex items-center justify-between rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                <span>Failed to load attention list. Try refreshing.</span>
                <Button
                  variant="secondary"
                  onClick={() => {
                    void attentionQuery.refetch();
                  }}
                >
                  Refresh
                </Button>
              </div>
            ) : attentionItems.length === 0 ? (
              <div className="py-3 text-sm text-slate-500">No items requiring attention.</div>
            ) : (
              attentionItems.map((item) => <AttentionListRow key={item.text} severity={item.severity} text={item.text} moduleLabel={item.module} />)
            )}
          </div>
        </section>
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
      </div>

      <footer className="text-xs text-gray-500">
        Backend version: {import.meta.env.VITE_BUILD_COMMIT ? String(import.meta.env.VITE_BUILD_COMMIT) : "dev"}
      </footer>
    </div>
  );
}
