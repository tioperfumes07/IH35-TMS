import { BulkActionBar } from "../../../components/bulk/BulkActionBar";
import { TableSelection, TableSelectionHeader } from "../../../components/bulk/TableSelection";
import { useToast } from "../../../components/Toast";
import { useBulkSelection } from "../../../hooks/useBulkSelection";

type Props = {
  rows: Array<Record<string, unknown>>;
  onOpenAccident: (row: Record<string, unknown>) => void;
};

function typePill(type: string) {
  if (type.includes("accident") || type.includes("hos")) return "bg-red-100 text-red-700";
  if (type.includes("speed") || type.includes("brake")) return "bg-amber-100 text-amber-700";
  if (type.includes("training")) return "bg-slate-100 text-slate-700";
  if (type.includes("drug")) return "bg-slate-100 text-slate-700";
  return "bg-gray-100 text-gray-700";
}

function severityPill(severity: string) {
  if (severity.toLowerCase() === "critical") return "bg-red-100 text-red-700";
  if (severity.toLowerCase() === "major") return "bg-amber-100 text-amber-700";
  return "bg-gray-100 text-gray-700";
}

export function SafetyEventsTable({ rows, onOpenAccident }: Props) {
  const { pushToast } = useToast();
  const selection = useBulkSelection({ cap: 200, onCapExceeded: (e) => pushToast(e.message, "error") });
  const pageRowIds = rows.map((row) => String(row.id));

  return (
    <div className="overflow-x-auto rounded border border-gray-200 bg-white">
      <BulkActionBar
        {...selection.bulkActionBarProps([
          { id: "export", label: "Export Selected", onClick: () => pushToast("Export safety events queued.", "success") },
          { id: "archive", label: "Archive", destructive: true, onClick: () => pushToast("Archive — bulk endpoint pending.", "success") },
        ])}
      />
      <TableSelection
        rows={rows}
        getId={(row) => String(row.id)}
        selectedIds={selection.selectedIds}
        onSelectionChange={selection.setSelectedIds}
        pageRowIds={pageRowIds}
        cap={selection.cap}
      >
        {({ isSelected, toggle }) => (
      <table className="min-w-[1050px] w-full text-left text-xs">
        <thead className="bg-gray-50 text-[10px] uppercase text-gray-600">
          <tr>
            <th className="w-8 px-2 py-1">
              <TableSelectionHeader
                selectedIds={selection.selectedIds}
                pageRowIds={pageRowIds}
                onSelectionChange={selection.setSelectedIds}
                cap={selection.cap}
              />
            </th>
            <th className="px-2 py-1">Date</th>
            <th className="px-2 py-1">Driver</th>
            <th className="px-2 py-1">Unit</th>
            <th className="px-2 py-1">Type</th>
            <th className="px-2 py-1">Severity</th>
            <th className="px-2 py-1">Source</th>
            <th className="px-2 py-1">Action</th>
            <th className="px-2 py-1">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const type = String(row.event_type ?? "");
            const severity = String(row.severity ?? "minor");
            return (
              <tr key={String(row.id)} className="border-t border-gray-100">
                <td className="px-2 py-1">
                  <input type="checkbox" checked={isSelected(String(row.id))} onChange={() => toggle(String(row.id))} aria-label="Select event" />
                </td>
                <td className="px-2 py-1">{String(row.event_at ?? "").slice(0, 10)}</td>
                <td className="px-2 py-1">{String(row.driver_full_name ?? "")}</td>
                <td className="px-2 py-1">{String(row.unit_display_id ?? "—")}</td>
                <td className="px-2 py-1"><span className={`rounded-full px-2 py-0.5 ${typePill(type.toLowerCase())}`}>{type || "event"}</span></td>
                <td className="px-2 py-1"><span className={`rounded-full px-2 py-0.5 ${severityPill(severity)}`}>{severity}</span></td>
                <td className="px-2 py-1">{String(row.source ?? "system")}</td>
                <td className="px-2 py-1">
                  <button
                    type="button"
                    className="text-slate-700 underline"
                    onClick={() => onOpenAccident(row)}
                  >
                    {type.toLowerCase().includes("accident") ? "Open accident" : "View"}
                  </button>
                </td>
                <td className="px-2 py-1">{String(row.status ?? "open")}</td>
              </tr>
            );
          })}
          {rows.length === 0 ? (
            <tr><td colSpan={9} className="px-2 py-3 text-center text-gray-500">No safety events found.</td></tr>
          ) : null}
        </tbody>
      </table>
        )}
      </TableSelection>
    </div>
  );
}
