import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { WorkOrder } from "../../../api/maintenance";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { Button } from "../../../components/Button";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";
import { useToast } from "../../../components/Toast";

type Props = {
  rows: WorkOrder[];
  sourceTypeFilter: string;
  externalVendorFilter: string;
  onSourceTypeChange: (value: string) => void;
  onExternalVendorChange: (value: string) => void;
};

const LINK = "text-slate-700 hover:underline";

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

function money(value: unknown) {
  return `$${Number(value ?? 0).toFixed(2)}`;
}

export function WorkOrdersTable({
  rows,
  sourceTypeFilter,
  externalVendorFilter,
  onSourceTypeChange,
  onExternalVendorChange,
}: Props) {
  const { pushToast } = useToast();
  const [search, setSearch] = useState("");

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.display_id, r.id, r.unit_number, r.driver_id, r.external_vendor_id, r.status, r.source_type].some((v) =>
        String(v ?? "").toLowerCase().includes(q),
      ),
    );
  }, [rows, search]);

  // Universal-list columns — every record cell links to its detail per 00-MASTER-LINK-MAP.
  // external_vendor_id is a QBO id (no internal /vendors route) → shown as text, not a dead link.
  const columns: Array<ParityColumn<WorkOrder>> = [
    {
      key: "display_id",
      label: "WO #",
      sortable: true,
      render: (row) => (
        <Link to={`/maintenance/work-orders/${row.id}`} className={`${LINK} font-medium`}>
          {row.display_id ?? row.id.slice(0, 8)}
        </Link>
      ),
    },
    { key: "source_type", label: "Source", sortable: true, render: (row) => row.source_type ?? "—" },
    {
      key: "unit_number",
      label: "Unit",
      sortable: true,
      render: (row) => (
        <Link to={`/fleet/${row.unit_id}`} className={LINK}>
          {row.unit_number ?? row.unit_id.slice(0, 8)}
        </Link>
      ),
    },
    {
      key: "driver_id",
      label: "Driver",
      render: (row) =>
        row.driver_id ? (
          <Link to={`/drivers/${row.driver_id}`} className={LINK}>
            {row.driver_id.slice(0, 8)}
          </Link>
        ) : (
          "—"
        ),
    },
    { key: "external_vendor_id", label: "Vendor", render: (row) => row.external_vendor_id ?? "—" },
    { key: "status", label: "Status", sortable: true },
    { key: "total_actual_cost", label: "Cost", sortable: true, render: (row) => money((row as Record<string, unknown>).total_actual_cost) },
    { key: "timing", label: "Timing", render: (row) => renderDuration(row) },
  ];

  return (
    <div className="space-y-2">
      <ParityTable<WorkOrder>
        columns={columns}
        rows={filteredRows}
        rowKey={(row) => row.id}
        emptyText="No work orders found."
        storageKey="maint-active-wos"
        exportFilename="active-work-orders"
        selectable
        batchActions={(selected) => (
          <>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => pushToast(`Close ${selected.length} WO(s) — bulk endpoint pending.`, "success")}
            >
              Close selected
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => pushToast(`Export ${selected.length} WO(s) queued.`, "success")}
            >
              Export selected
            </Button>
          </>
        )}
        filterBar={
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1 text-xs text-gray-600">
              <span>Source type</span>
              <SelectCombobox
                className="min-h-12 rounded border border-gray-300 px-2 text-sm sm:h-9 sm:min-h-0"
                value={sourceTypeFilter}
                onChange={(e) => onSourceTypeChange(e.target.value)}
              >
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
            <input
              className="min-h-12 rounded border border-gray-300 px-2 text-sm sm:h-9 sm:min-h-0"
              value={externalVendorFilter}
              onChange={(e) => onExternalVendorChange(e.target.value)}
              placeholder="External vendor id…"
            />
            <input
              className="min-h-12 w-full max-w-xs rounded border border-gray-300 px-2 text-sm sm:h-9 sm:min-h-0"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search WO / unit / driver / status…"
            />
          </div>
        }
      />
    </div>
  );
}
