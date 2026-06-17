import { useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { VendorOption } from "../../api/mdata";
import { bulkUpdate } from "../../api/bulk";
import { BulkActionBar } from "../../components/bulk/BulkActionBar";
import { TableSelection, TableSelectionHeader } from "../../components/bulk/TableSelection";
import { TableControls, Paginator, TableHeaderCell, useTableController, type TableColumn } from "../../components/table";
import { useToast } from "../../components/Toast";
import { useBulkSelection } from "../../hooks/useBulkSelection";
import { parseVendorNotes } from "../../lib/vendorProfileMeta";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function fmtMoney(cents: number) {
  return usd.format(cents / 100);
}

function vendorQualityLabel(notes: string | null | undefined) {
  const rating = parseVendorNotes(notes).meta.qualityRating;
  if (rating === "good") return { label: "Good", className: "bg-emerald-100 text-emerald-800" };
  if (rating === "bad") return { label: "Bad", className: "bg-red-100 text-red-800" };
  return { label: "Medium", className: "bg-amber-100 text-amber-800" };
}

// Shared data-grid columns (GLOBAL-TABLE-CONTROLS). "Name" is the always-visible anchor.
const COLUMNS: TableColumn[] = [
  { key: "name", label: "Name", alwaysVisible: true },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "vendor_type", label: "Vendor Type" },
  { key: "open_balance", label: "Open Balance" },
  { key: "quality", label: "Quality" },
  { key: "fmcsa", label: "FMCSA Authority" },
  { key: "last_txn", label: "Last Transaction" },
  { key: "created", label: "Created" },
];

function vendorSearchText(v: VendorOption): string {
  return [v.name, v.email, v.vendor_code].filter(Boolean).join(" ");
}

function isCarrier(v: VendorOption): boolean {
  return String(v.vendor_type ?? "").toLowerCase().includes("carrier");
}

type Props = {
  companyId: string;
  vendors: VendorOption[];
  openByVendorId: Map<string, number>;
  onSelectVendor?: (vendorId: string) => void;
};

export function VendorsListView({ companyId, vendors, openByVendorId, onSelectVendor }: Props) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const selection = useBulkSelection();

  // Stable sort accessor (depends on the open-balance map).
  const sortValue = useCallback(
    (v: VendorOption, key: string): string | number | null => {
      switch (key) {
        case "name": return v.name ?? null;
        case "email": return v.email ?? null;
        case "phone": return v.phone ?? null;
        case "vendor_type": return v.vendor_type ?? null;
        case "open_balance": return openByVendorId.get(v.id) ?? 0;
        case "quality": return vendorQualityLabel(v.notes).label;
        case "fmcsa": return isCarrier(v) ? 1 : 0;
        case "last_txn": return v.updated_at ?? null;
        case "created": return v.created_at ?? null;
        default: return null;
      }
    },
    [openByVendorId]
  );

  const table = useTableController<VendorOption>({
    rows: vendors,
    columns: COLUMNS,
    tableKey: "vendors",
    searchText: vendorSearchText,
    sortValue,
    defaultPageSize: 50,
  });

  const pageRows = table.paged;
  const pageRowIds = pageRows.map((row) => row.id);

  const bulkMutation = useMutation({
    mutationFn: async ({ ids, action, payload, reason }: { ids: string[]; action: string; payload?: Record<string, unknown>; reason?: string }) =>
      bulkUpdate({ domain: "mdata", resource: "vendors", ids, action, payload, reason, operatingCompanyId: companyId }),
    onSuccess: async (result, vars) => {
      await queryClient.invalidateQueries({ queryKey: ["vendors"] });
      selection.clear();
      pushToast(`${result.succeeded.length} vendor(s) updated (${vars.action}).`, "success");
    },
    onError: (error) => pushToast(String((error as Error).message || "Bulk update failed"), "error"),
  });

  const selectedIds = () => Array.from(selection.selectedIds);

  const renderCell = (key: string, vendor: VendorOption) => {
    switch (key) {
      case "name":
        return (
          <Link to={`/vendors/${vendor.id}`} className="text-sky-700 hover:underline" onClick={(e) => e.stopPropagation()}>
            {vendor.name}
          </Link>
        );
      case "email": return vendor.email ?? "—";
      case "phone": return vendor.phone ?? "—";
      case "vendor_type": return vendor.vendor_type ?? "—";
      case "open_balance": return fmtMoney(openByVendorId.get(vendor.id) ?? 0);
      case "quality": {
        const q = vendorQualityLabel(vendor.notes);
        return <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${q.className}`}>{q.label}</span>;
      }
      case "fmcsa": return isCarrier(vendor) ? "Carrier" : "—";
      case "last_txn": return vendor.updated_at ? new Date(vendor.updated_at).toLocaleDateString() : "—";
      case "created": return vendor.created_at ? new Date(vendor.created_at).toLocaleDateString() : "—";
      default: return "—";
    }
  };

  return (
    <div className="space-y-2" data-vendors-list-view="true" data-bulk-selectable="true" data-entity-type="vendors">
      <TableControls
        search={table.search}
        onSearchChange={table.setSearch}
        searchPlaceholder="Search name, code, email…"
        filteredCount={table.filteredCount}
        totalCount={vendors.length}
        columns={COLUMNS}
        hidden={table.hidden}
        onToggleColumn={table.toggleColumn}
        pageSize={table.pageSize}
        onPageSizeChange={table.setPageSize}
      />

      <BulkActionBar
        {...selection.bulkActionBarProps(
          [
            {
              id: "deactivate",
              label: "Deactivate",
              destructive: true,
              action: "set_status",
              onClick: () =>
                bulkMutation.mutate({
                  ids: selectedIds(),
                  action: "set_status",
                  payload: { status: "inactive" },
                  reason: "Bulk deactivate from list view",
                }),
            },
            {
              id: "export",
              label: "Export CSV",
              onClick: () => pushToast(`Export queued for ${selection.count} vendor(s).`, "success"),
            },
          ],
          bulkMutation.isPending
        )}
      />

      <TableSelection
        rows={pageRows}
        getId={(row) => row.id}
        selectedIds={selection.selectedIds}
        onSelectionChange={selection.setSelectedIds}
        pageRowIds={pageRowIds}
        cap={selection.cap}
      >
        {({ isSelected, toggle }) => (
          <div className="overflow-x-auto rounded border border-gray-200 bg-white">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="w-8 px-2 py-2">
                    <TableSelectionHeader
                      selectedIds={selection.selectedIds}
                      pageRowIds={pageRowIds}
                      onSelectionChange={selection.setSelectedIds}
                      cap={selection.cap}
                    />
                  </th>
                  {table.visibleColumns.map((col) => (
                    <TableHeaderCell
                      key={col.key}
                      columnKey={col.key}
                      label={col.label}
                      sortKey={table.sortKey}
                      sortDir={table.sortDir}
                      onToggleSort={table.toggleSort}
                      width={table.widths[col.key]}
                      onResize={table.setColumnWidth}
                    />
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((vendor) => (
                  <tr
                    key={vendor.id}
                    className="cursor-pointer border-t border-gray-100 hover:bg-gray-50"
                    onClick={() => onSelectVendor?.(vendor.id)}
                  >
                    <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Select ${vendor.name}`}
                        checked={isSelected(vendor.id)}
                        onChange={() => toggle(vendor.id)}
                      />
                    </td>
                    {table.visibleColumns.map((col) => (
                      <td
                        key={col.key}
                        style={table.widths[col.key] ? { width: table.widths[col.key] } : undefined}
                        className={`truncate px-2 py-2 ${col.key === "open_balance" ? "text-right" : ""} ${col.key === "name" ? "font-medium" : ""}`}
                      >
                        {renderCell(col.key, vendor)}
                      </td>
                    ))}
                  </tr>
                ))}
                {pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={table.visibleColumns.length + 1} className="px-3 py-6 text-center text-gray-500">
                      No vendors found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </TableSelection>

      <Paginator page={table.page} pageCount={table.pageCount} onPageChange={table.setPage} />
    </div>
  );
}
