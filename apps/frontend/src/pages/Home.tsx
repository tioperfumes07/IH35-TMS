import type { AuthMeResponse } from "../types/api";
import { PageHeader } from "../components/layout/PageHeader";
import { Button } from "../components/Button";
import { SectionQuickJump } from "../components/home/SectionQuickJump";
import { AttentionListRow } from "../components/home/AttentionListRow";
import { FleetSnapshotPanel } from "../components/home/FleetSnapshotPanel";

const KPI_ITEMS = [
  { label: "Tracked Assets", number: "142", meta: "100 trucks · 42 trailers" },
  { label: "Assigned / Working", number: "68", meta: "on active loads" },
  { label: "Maint Past Due", number: "7", meta: "3 critical", alert: "crit" as const },
  { label: "QBO Vendors", number: "284", meta: "synced 9:38 AM" },
  { label: "Vehicles in Service", number: "94", meta: "Samsara live", healthy: true },
  { label: "Open Damage", number: "4", meta: "2 awaiting estimate", alert: "warn" as const },
  { label: "Pending QBO Sync", number: "12", meta: "retry in 60s", alert: "warn" as const },
];

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

const ATTENTION_ITEMS = [
  { severity: "CRIT" as const, text: "3 maintenance past-due jobs exceed 24h threshold", module: "Maintenance" },
  { severity: "WARN" as const, text: "12 QBO sync retries pending in accounting queue", module: "Accounting" },
  { severity: "WARN" as const, text: "4 open damage cases waiting external estimate", module: "Safety" },
  { severity: "INFO" as const, text: "27 dispatch loads changed state in last 24h", module: "Dispatch" },
  { severity: "INFO" as const, text: "19 fuel planner recommendations generated", module: "Fuel" },
  { severity: "WARN" as const, text: "6 driver files require monthly permit refresh", module: "Drivers" },
];

const FLEET_ROWS = [
  { leftLabel: "Trucks", leftValue: "100", rightLabel: "Refrigerated", rightValue: "28" },
  { leftLabel: "Flatbeds", leftValue: "34", rightLabel: "Dry vans", rightValue: "38" },
  { leftLabel: "Trailers", leftValue: "42", rightLabel: "Out of service", rightValue: "6" },
  { leftLabel: "In shop", leftValue: "9", rightLabel: "Roadside", rightValue: "2" },
  { leftLabel: "Assigned units", leftValue: "68", rightLabel: "Idle units", rightValue: "32" },
  { leftLabel: "Samsara live", leftValue: "94", rightLabel: "No signal >6h", rightValue: "3" },
];

type Props = {
  auth: AuthMeResponse["user"];
};

export function HomePage({ auth }: Props) {
  const displayName = auth.email ?? "Driver";

  return (
    <div className="space-y-4">
      <PageHeader
        title="Home"
        subtitle={`Workspace snapshot · last 3 days · ${displayName}`}
        actions={<Button variant="secondary">Refresh</Button>}
      />

      {/* TODO: wire dashboard snapshot values to backend in P3-T11.16.1 */}
      <div className="grid grid-cols-1 gap-2 xl:grid-cols-7">
        {KPI_ITEMS.map((item) => (
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
            {ATTENTION_ITEMS.map((item) => (
              <AttentionListRow key={item.text} severity={item.severity} text={item.text} moduleLabel={item.module} />
            ))}
          </div>
        </section>
        <FleetSnapshotPanel rows={FLEET_ROWS} />
      </div>

      <footer className="text-xs text-gray-500">
        Backend version: {import.meta.env.VITE_BUILD_COMMIT ? String(import.meta.env.VITE_BUILD_COMMIT) : "dev"}
      </footer>
    </div>
  );
}
