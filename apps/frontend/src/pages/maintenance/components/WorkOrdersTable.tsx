import type { WorkOrder } from "../../../api/maintenance";
import { Link } from "react-router-dom";
import { BulkActionBar } from "../../../components/bulk/BulkActionBar";
import { TableSelection, TableSelectionHeader } from "../../../components/bulk/TableSelection";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";
import { useToast } from "../../../components/Toast";
import { useBulkSelection } from "../../../hooks/useBulkSelection";

type Props = {
  rows: WorkOrder[];
  sourceTypeFilter: string;
  externalVendorFilter: string;
  onSourceTypeChange: (value: string) => void;
  onExternalVendorChange: (value: string) => void;
};

function formatDuration(seconds: number) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h`;
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function renderDuration(row: WorkOrder) {
  if (typeof row.duration_seconds === "number" && row.duration_seconds > 0) {
    return `Closed in ${formatDuration(row.duration_seconds)}`;
  }
  if (row.opened_at) {
    const openFor = Math.max(0, Math.floor((Date.now() - new Date(row.opened_at).getTime()) / 1000));
    return `Open for ${formatDuration(openFor)}`;
  }
  return "—";
}

export function WorkOrdersTable({
  rows,
  sourceTypeFilter,
  externalVendorFilter,
  onSourceTypeChange,
  onExternalVendorChange,
}: Props) {
  const { pushToast } = useToast();
  const selection = useBulkSelection({ cap: 200, onCapExceeded: (e) => pushToast(e.message, "error") });
  const pageRowIds = rows.map((row) => row.id);

  return (
    <div className="space-y-2">
      <BulkActionBar
        {...selection.bulkActionBarProps([
          { id: "close", label: "Close Selected", onClick: () => pushToast("Close WOs — bulk endpoint pending.", "success") },
          { id: "export", label: "Export Selected", onClick: () => pushToast("Export WOs queued.", "success") },
        ])}
      />
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <label className="space-y-1 text-xs">
          <span className="text-gray-600">Filter by source type</span>
          <SelectCombobox className="h-8 w-full rounded border border-gray-300 px-2 text-sm" value={sourceTypeFilter} onChange={(e) => onSourceTypeChange(e.target.value)}>
            <option value="">All</option>
            <option value="IS">IS</option>
            <option value="ES">ES</option>
            <option value="AC">AC</option>
            <option value="ET">ET</option>
            <option value="RT">RT</option>
            <option value="IT">IT</option>
            <option value="RS">RS</option>
          </SelectCombobox>
        </label>
        <label className="space-y-1 text-xs md:col-span-2">
          <span className="text-gray-600">Filter by external vendor (id)</span>
          <input
            className="h-8 w-full rounded border border-gray-300 px-2 text-sm"
            value={externalVendorFilter}
            onChange={(e) => onExternalVendorChange(e.target.value)}
            placeholder="Vendor id..."
          />
        </label>
      </div>
      <div className="overflow-hidden rounded border border-gray-200 bg-white">
        <TableSelection
          rows={rows}
          getId={(row) => row.id}
          selectedIds={selection.selectedIds}
          onSelectionChange={selection.setSelectedIds}
          pageRowIds={pageRowIds}
          cap={selection.cap}
        >
          {({ isSelected, toggle }) => (
        <table className="w-full table-fixed text-left text-xs">
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
              <th className="px-2 py-1">Display ID</th>
              <th className="px-2 py-1">Source Type</th>
              <th className="px-2 py-1">Unit</th>
              <th className="px-2 py-1">Driver</th>
              <th className="px-2 py-1">Vendor</th>
              <th className="px-2 py-1">Status</th>
              <th className="px-2 py-1">Cost</th>
              <th className="px-2 py-1">Timing</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-gray-100">
                <td className="px-2 py-1">
                  <input type="checkbox" checked={isSelected(row.id)} onChange={() => toggle(row.id)} aria-label={`Select ${row.display_id ?? row.id}`} />
                </td>
                <td className="px-2 py-1 font-medium">
                  <Link to={`/maintenance/work-orders/${row.id}`} className="text-indigo-700 hover:underline">
                    {row.display_id ?? row.id.slice(0, 8)}
                  </Link>
                </td>
                <td className="px-2 py-1">{row.source_type ?? "—"}</td>
                <td className="truncate px-2 py-1">{row.unit_number ?? row.unit_id}</td>
                <td className="truncate px-2 py-1">{row.driver_name ?? "—"}</td>
                <td className="truncate px-2 py-1">{row.external_vendor_id ?? "—"}</td>
                <td className="truncate px-2 py-1">{row.status}</td>
                <td className="px-2 py-1">${Number((row as Record<string, unknown>).total_actual_cost ?? 0).toFixed(2)}</td>
                <td className="truncate px-2 py-1">{renderDuration(row)}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-2 py-3 text-center text-gray-500">
                  No work orders found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
          )}
        </TableSelection>
      </div>
    </div>
  );
}
