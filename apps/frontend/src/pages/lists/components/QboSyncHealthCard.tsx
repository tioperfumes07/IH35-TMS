import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import type { ListsQboSyncHealthRow } from "../../../api/listsHub";

type Props = {
  rows: ListsQboSyncHealthRow[];
  onForceSync: () => void;
  syncing: boolean;
};

function driftClass(value: string) {
  const v = value.toLowerCase();
  if (v === "0") return "text-[#1F2A44]";
  if (v.includes("pend")) return "text-[#1F2A44]";
  if (v.includes("drift")) return "text-red-700";
  return "text-[#4B5563]";
}

const COLUMNS: Array<ParityColumn<ListsQboSyncHealthRow>> = [
  { key: "entity", label: "Entity", sortable: true },
  { key: "local_count", label: "Local", sortable: true, className: "text-right" },
  {
    key: "qbo_count",
    label: "QBO",
    sortable: true,
    className: "text-right",
    render: (row) => row.qbo_count ?? "—",
  },
  {
    key: "drift",
    label: "Drift",
    sortable: true,
    className: "text-right",
    render: (row) => <span className={`font-semibold ${driftClass(row.drift)}`}>{row.drift}</span>,
  },
];

export function QboSyncHealthCard({ rows, onForceSync, syncing }: Props) {
  return (
    <div className="rounded-sm border border-[#E5E7EB] bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wide text-[#4B5563]">QBO Sync Health</div>
        <button type="button" onClick={onForceSync} disabled={syncing} className="rounded-sm bg-[#1F2A44] px-2.5 py-1 text-xs font-semibold text-white">
          {syncing ? "Starting..." : "Force QBO Sync"}
        </button>
      </div>
      <ParityTable<ListsQboSyncHealthRow>
        columns={COLUMNS}
        rows={rows}
        rowKey={(row) => row.entity}
        storageKey="lists-qbo-sync-health"
        tableTestId="lists-qbo-sync-health-table"
        emptyText="No QBO sync health rows."
      />
    </div>
  );
}
