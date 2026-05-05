import type { AuthMeResponse } from "../types/api";
import { DataPanel } from "../components/layout/DataPanel";
import { DataPanelRow } from "../components/layout/DataPanelRow";
import { KpiCard } from "../components/layout/KpiCard";
import { KpiStrip } from "../components/layout/KpiStrip";
import { PageHeader } from "../components/layout/PageHeader";
import { SubAreaGrid } from "../components/layout/SubAreaGrid";
import { SubAreaTile } from "../components/layout/SubAreaTile";
import { colors } from "../design/tokens";

const DONE_ITEMS = [
  "BT-1-IDENT-01",
  "BT-1-IDENT-02",
  "BT-1-IDENT-03",
  "BT-1-MDATA-01",
  "BT-1-MDATA-02",
  "BT-1-MDATA-02b",
  "BT-1-MDATA-03",
  "BT-1-CATAL-01",
  "BT-1-CATAL-02",
  "BT-1-CATAL-03",
  "BT-1-PHASE1-AUDIT",
];

const COMING_SOON = [
  "Maintenance",
  "Accounting",
  "Banking",
  "Fuel",
  "Safety",
  "Dispatch",
  "Reports",
  "425C",
  "Driver App",
];

type Props = {
  auth: AuthMeResponse["user"];
};

export function HomePage({ auth }: Props) {
  const displayName = auth.email ?? "Driver";

  return (
    <div className="space-y-4">
      <PageHeader title="Home" subtitle={`Workspace snapshot · last 3 days · ${displayName}`} />

      <KpiStrip>
        <KpiCard label="Tracked Assets" number={42} accent={colors.fleet.strong} />
        <KpiCard label="Assigned/Working" number={19} accent={colors.dispatch.strong} />
        <KpiCard label="Maint Past Due" number={3} accent={colors.maintenance.strong} />
        <KpiCard label="QBO Vendors" number={12} accent={colors.accounting.strong} />
        <KpiCard label="In Service" number={27} accent={colors.drivers.strong} />
        <KpiCard label="Open Damage" number={1} accent={colors.safety.strong} />
        <KpiCard label="Pending QBO Sync" number={7} accent={colors.warn.strong} />
      </KpiStrip>

      <SubAreaGrid>
        <SubAreaTile name="Maintenance" count={3} description="Past due checks" domain="maintenance" urgency="warn" />
        <SubAreaTile name="Accounting" count={7} description="Pending syncs" domain="accounting" urgency="warn" />
        <SubAreaTile name="Banking" count={2} description="Unmatched deposits" domain="accounting" />
        <SubAreaTile name="Fuel" count={4} description="Stops to review" domain="fuel" />
        <SubAreaTile name="Safety" count={1} description="Critical incident" domain="safety" urgency="critical" />
        <SubAreaTile name="Drivers" count={11} description="Active today" domain="drivers" />
        <SubAreaTile name="Dispatch" count={8} description="Loads in transit" domain="dispatch" />
        <SubAreaTile name="Lists & Catalogs" count={8} description="Core registries" domain="fleet" />
      </SubAreaGrid>

      <div className="grid gap-4 lg:grid-cols-2">
        <DataPanel title="Today's attention list" accentColor={colors.warn.strong}>
          {DONE_ITEMS.slice(0, 6).map((item) => (
            <DataPanelRow key={item}>
              <span>{item}</span>
              <span className="text-xs text-gray-500">OK</span>
            </DataPanelRow>
          ))}
        </DataPanel>
        <DataPanel title="Fleet snapshot" accentColor={colors.fleet.strong}>
          {[
            ["Trucks", "18"],
            ["Trailers", "21"],
            ["Equipment", "42"],
            ["Drivers", "28"],
          ].map(([label, value]) => (
            <DataPanelRow key={label}>
              <span>{label}</span>
              <span className="font-semibold text-gray-700">{value}</span>
            </DataPanelRow>
          ))}
        </DataPanel>
      </div>

      <DataPanel title="Coming soon" accentColor={colors.info.strong}>
        {COMING_SOON.slice(0, 6).map((item) => (
          <DataPanelRow key={item}>
            <span>{item}</span>
            <span className="text-xs text-gray-500">Phase roadmap</span>
          </DataPanelRow>
        ))}
      </DataPanel>

      <footer className="text-xs text-gray-500">
        Backend version: {import.meta.env.VITE_BUILD_COMMIT ? String(import.meta.env.VITE_BUILD_COMMIT) : "dev"}
      </footer>
    </div>
  );
}
