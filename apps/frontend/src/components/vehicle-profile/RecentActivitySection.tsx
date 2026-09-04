/**
 * @archived — Fleet Vehicle Profile active-path (DUALPATH-06, 2026-07-22)
 * Raw-JSON-preview loads/status/work_orders dump. Superseded by
 * `components/maintenance/ServiceTimeline.tsx` (B31), the sole canonical activity surface on
 * `VehicleProfilePage` (`vp-section-5-maintenance`). No longer imported/rendered by
 * `VehicleProfilePage.tsx` — ARCHIVE-not-DELETE per Rule 07. Enforced by
 * `verify-fleet-profile-no-dual-activity.mjs`. Sunset 2026-09-01.
 */
import { useMemo, useState } from "react";
import { ParityTable, type ParityColumn } from "../parity/ParityTable";

type Activity = {
  loads: Array<Record<string, unknown>>;
  status_changes: Array<Record<string, unknown>>;
  work_orders: Array<Record<string, unknown>>;
};

type ActivityRow = {
  id: string;
  preview: string;
};

const TABS = ["loads", "status", "work_orders"] as const;

const COLUMNS: Array<ParityColumn<ActivityRow>> = [
  {
    key: "preview",
    label: "Record",
    sortable: true,
    render: (row) => <span className="font-mono text-gray-800">{row.preview}</span>,
  },
];

function toRows(raw: Array<Record<string, unknown>>, tab: string): ActivityRow[] {
  return raw.map((row, i) => ({
    id: `${tab}-${i}`,
    preview: `${JSON.stringify(row).slice(0, 120)}…`,
  }));
}

export function RecentActivitySection({ activity }: { activity: Activity }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("loads");

  const raw =
    tab === "loads" ? activity.loads : tab === "status" ? activity.status_changes : activity.work_orders;
  const rows = useMemo(() => toRows(raw, tab), [raw, tab]);

  return (
    <section className="rounded-sm border border-gray-200 bg-white p-4" data-testid="vehicle-recent-activity">
      <h2 className="text-xs font-semibold text-gray-800">Recent activity</h2>
      <ParityTable
        rows={rows}
        columns={COLUMNS}
        rowKey={(row) => row.id}
        loading={false}
        storageKey={`vehicle-recent-activity-${tab}`}
        emptyText="No records."
        initialPageSize={10}
        pageSizeOptions={[10, 15, 50, 100]}
        tableTestId="vehicle-recent-activity-table"
        rowTestId={(row) => `vehicle-recent-activity-${row.id}`}
        filterBar={
          <div className="flex gap-2">
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                className={`rounded-sm px-2 py-1 text-xs ${tab === t ? "bg-gray-800 text-white" : "bg-gray-100"}`}
                onClick={() => setTab(t)}
              >
                {t === "loads" ? "Loads" : t === "status" ? "Status changes" : "Work orders"}
              </button>
            ))}
          </div>
        }
      />
    </section>
  );
}
