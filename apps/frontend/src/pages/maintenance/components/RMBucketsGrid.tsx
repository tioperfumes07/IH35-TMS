import type { WorkOrder } from "../../../api/maintenance";

type Props = {
  inHouse: WorkOrder[];
  external: WorkOrder[];
  roadside: WorkOrder[];
  onOpen: (id: string) => void;
  onAdvanceStatus?: (id: string, nextStatus: "in_progress" | "waiting_parts" | "complete") => void;
  onCreateRoadside?: () => void;
};

// Approved R&M Status Board = a 5-column workflow kanban (maintenance-FULL-with-chrome.html).
// §7 navy ruling: accent bars use the navy family + amber (warning) + red (critical/OOS); no blue/purple/green.
type ColumnKey = "open" | "in_progress" | "waiting_parts" | "severe" | "complete";
const COLUMNS: { key: ColumnKey; title: string; accent: string }[] = [
  { key: "open", title: "Open", accent: "#1F2A44" },
  { key: "in_progress", title: "In Progress", accent: "#64748b" },
  { key: "waiting_parts", title: "Awaiting Parts", accent: "#b45309" },
  { key: "severe", title: "Severe / OOS", accent: "#dc2626" },
  { key: "complete", title: "Completed", accent: "#334155" },
];

function columnFor(wo: WorkOrder): ColumnKey {
  // A severe / out-of-service WO surfaces in its own critical column regardless of workflow status.
  if ((wo.severity ?? "").toLowerCase() === "severe") return "severe";
  switch (wo.status) {
    case "in_progress": return "in_progress";
    case "waiting_parts": return "waiting_parts";
    case "complete": return "complete";
    default: return "open";
  }
}

function ageDays(openedAt?: string | null): string {
  if (!openedAt) return "";
  const opened = new Date(openedAt).getTime();
  if (Number.isNaN(opened)) return "";
  const days = Math.max(0, Math.floor((Date.now() - opened) / 86_400_000));
  return days === 0 ? "today" : `${days}d`;
}

function KanbanCard({
  row,
  accent,
  onOpen,
  onAdvanceStatus,
}: {
  row: WorkOrder;
  accent: string;
  onOpen: (id: string) => void;
  onAdvanceStatus?: (id: string, nextStatus: "in_progress" | "waiting_parts" | "complete") => void;
}) {
  const age = ageDays(row.opened_at);
  const meta = [row.unit_number ?? row.unit_id, row.driver_id ? "driver" : null, row.description ?? row.wo_type].filter(Boolean).join(" · ");
  return (
    <div className="rounded border border-gray-200 bg-white" style={{ borderLeft: `3px solid ${accent}` }}>
      <button type="button" onClick={() => onOpen(row.id)} className="block w-full px-2 py-1.5 text-left hover:bg-gray-50">
        <div className="flex items-center justify-between gap-1">
          <span className="text-[11px] font-semibold text-gray-800">{row.display_id ?? row.id.slice(0, 8)}</span>
          {row.source_type ? <span className="rounded bg-gray-100 px-1 text-[9px] font-bold tracking-wide text-gray-600">{row.source_type}</span> : null}
        </div>
        <div className="truncate text-[10px] text-gray-500">{meta}</div>
        {age ? <div className="text-[9px] text-gray-400">{age}</div> : null}
      </button>
      {onAdvanceStatus && row.status !== "complete" ? (
        <div className="flex gap-1 border-t border-gray-100 px-2 py-1">
          <button type="button" className="rounded border border-gray-300 px-1 text-[9px] font-semibold text-gray-700" onClick={() => onAdvanceStatus(row.id, "in_progress")}>In-Progress</button>
          <button type="button" className="rounded border border-gray-300 px-1 text-[9px] font-semibold text-gray-700" onClick={() => onAdvanceStatus(row.id, "waiting_parts")}>Waiting</button>
          <button type="button" className="rounded border border-gray-300 px-1 text-[9px] font-semibold text-gray-700" onClick={() => onAdvanceStatus(row.id, "complete")}>Resolved</button>
        </div>
      ) : null}
    </div>
  );
}

export function RMBucketsGrid({ inHouse, external, roadside, onOpen, onAdvanceStatus, onCreateRoadside }: Props) {
  // The board payload arrives location-bucketed; the approved kanban groups by workflow status, so merge
  // (dedup by id) and regroup. Existing location data is preserved — nothing dropped (additive).
  const byId = new Map<string, WorkOrder>();
  for (const wo of [...inHouse, ...external, ...roadside]) if (!byId.has(wo.id)) byId.set(wo.id, wo);
  const all = [...byId.values()];
  const columns = COLUMNS.map((col) => ({ ...col, rows: all.filter((wo) => columnFor(wo) === col.key) }));

  return (
    <div className="space-y-2">
      {onCreateRoadside ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onCreateRoadside}
            className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-900"
          >
            + Roadside WO
          </button>
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3 xl:grid-cols-5">
        {columns.map((col) => (
          <div key={col.key} className="rounded border border-gray-200 bg-gray-50">
            <div className="flex items-center justify-between border-b border-gray-200 px-2 py-1" style={{ borderTop: `2px solid ${col.accent}` }}>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-700">{col.title}</span>
              <span className="rounded bg-white px-1.5 text-[10px] font-bold text-gray-600">{col.rows.length}</span>
            </div>
            <div className="max-h-[28rem] space-y-1 overflow-y-auto p-1.5">
              {col.rows.map((row) => (
                <KanbanCard key={row.id} row={row} accent={col.accent} onOpen={onOpen} onAdvanceStatus={onAdvanceStatus} />
              ))}
              {col.rows.length === 0 ? <div className="px-1 py-2 text-center text-[10px] text-gray-400">—</div> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
