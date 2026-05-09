import type { AuthMeResponse } from "../types/api";
import { useQuery } from "@tanstack/react-query";
import { getHomeAttentionList, getHomeFleetSnapshot, getKpiSummary } from "../api/reports";
import { PageHeader } from "../components/layout/PageHeader";
import { Button } from "../components/Button";
import { SectionQuickJump } from "../components/home/SectionQuickJump";
import { AttentionListRow } from "../components/home/AttentionListRow";
import { FleetSnapshotPanel } from "../components/home/FleetSnapshotPanel";
import { useCompanyContext } from "../contexts/CompanyContext";

const QUICK_JUMPS = [
  { title: "Maintenance", subtitle: "Work orders, R&M, Severe Repair", count: 14 },
  { title: "Accounting", subtitle: "Bills, Expenses, Bill payment", count: 38 },
  { title: "Banking", subtitle: "Categorize, Reconcile, Transfer", count: 22 },
  { title: "Fuel", subtitle: "Relay inbox, Settings, Planner", count: 19 },
  { title: "Safety", subtitle: "HOS, Antidoping, Accidents, DOT", count: 6 },
  { title: "Drivers", subtitle: "Profiles, Settlements, Permits", count: 3 },
  { title: "Dispatch", subtitle: "Loads, Settlements, Geofencing", count: 27 },
  { title: "Lists & Catalogs", subtitle: "Grouped by domain · 8 sets", count: null },
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
              void Promise.all([kpiSummaryQuery.refetch(), attentionQuery.refetch(), fleetSnapshotQuery.refetch()]);
            }}
          >
            Refresh
          </Button>
        }
      />

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
          <SectionQuickJump key={jump.title} title={jump.title} subtitle={jump.subtitle} count={jump.count} />
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
