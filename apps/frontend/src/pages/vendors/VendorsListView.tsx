import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { VendorOption } from "../../api/mdata";
import { bulkUpdate } from "../../api/bulk";
import { BulkActionBar } from "../../components/bulk/BulkActionBar";
import { TableSelection, TableSelectionHeader } from "../../components/bulk/TableSelection";
import { ResizableTh } from "../../components/shared/ResizableTh";
import { useToast } from "../../components/Toast";
import { useBulkSelection } from "../../hooks/useBulkSelection";
import { useColumnWidths } from "../../hooks/useColumnWidths";
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

const COLUMNS = [
  { id: "name", label: "Name", defaultWidth: 180 },
  { id: "email", label: "Email", defaultWidth: 160 },
  { id: "phone", label: "Phone", defaultWidth: 120 },
  { id: "vendor_type", label: "Vendor Type", defaultWidth: 120 },
  { id: "open_balance", label: "Open Balance", defaultWidth: 110, align: "right" as const },
  { id: "quality", label: "Quality", defaultWidth: 100 },
  { id: "fmcsa", label: "FMCSA Authority", defaultWidth: 120 },
  { id: "last_txn", label: "Last Transaction", defaultWidth: 110 },
  { id: "created", label: "Created", defaultWidth: 100 },
];

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
  const [pageSize] = useState(50);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBalanceDesc, setSortBalanceDesc] = useState(true);

  const defaultWidths = Object.fromEntries(COLUMNS.map((c) => [c.id, c.defaultWidth]));
  const { widths, setWidth, minWidth, maxWidth } = useColumnWidths("vendors-list-view", defaultWidths);

  const sorted = useMemo(() => {
    const rows = [...vendors];
    rows.sort((a, b) => {
      const balA = openByVendorId.get(a.id) ?? 0;
      const balB = openByVendorId.get(b.id) ?? 0;
      return sortBalanceDesc ? balB - balA : balA - balB;
    });
    return rows;
  }, [vendors, openByVendorId, sortBalanceDesc]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pageRows = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);
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

  return (
    <div className="space-y-2" data-vendors-list-view="true" data-bulk-selectable="true" data-entity-type="vendors">
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

      <div className="flex justify-end">
        <button
          type="button"
          className="text-xs font-semibold text-sky-700 hover:underline"
          onClick={() => setSortBalanceDesc((prev) => !prev)}
        >
          Sort: Open Balance {sortBalanceDesc ? "↓" : "↑"}
        </button>
      </div>

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
                  {COLUMNS.map((col) => (
                    <ResizableTh
                      key={col.id}
                      columnId={col.id}
                      width={widths[col.id] ?? col.defaultWidth}
                      minWidth={minWidth}
                      maxWidth={maxWidth}
                      onWidthChange={(id, w) => setWidth(id, w)}
                      align={col.align}
                    >
                      {col.label}
                    </ResizableTh>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((vendor) => {
                  const quality = vendorQualityLabel(vendor.notes);
                  const open = openByVendorId.get(vendor.id) ?? 0;
                  const isCarrier = String(vendor.vendor_type ?? "").toLowerCase().includes("carrier");
                  return (
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
                      <td style={{ width: widths.name }} className="truncate px-2 py-2 font-medium">
                        <Link to={`/vendors/${vendor.id}`} className="text-sky-700 hover:underline" onClick={(e) => e.stopPropagation()}>
                          {vendor.name}
                        </Link>
                      </td>
                      <td style={{ width: widths.email }} className="truncate px-2 py-2">{vendor.email ?? "—"}</td>
                      <td style={{ width: widths.phone }} className="truncate px-2 py-2">{vendor.phone ?? "—"}</td>
                      <td style={{ width: widths.vendor_type }} className="truncate px-2 py-2">{vendor.vendor_type ?? "—"}</td>
                      <td style={{ width: widths.open_balance }} className="truncate px-2 py-2 text-right">{fmtMoney(open)}</td>
                      <td style={{ width: widths.quality }} className="truncate px-2 py-2">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${quality.className}`}>
                          {quality.label}
                        </span>
                      </td>
                      <td style={{ width: widths.fmcsa }} className="truncate px-2 py-2">
                        {isCarrier ? "Carrier" : "—"}
                      </td>
                      <td style={{ width: widths.last_txn }} className="truncate px-2 py-2">
                        {vendor.updated_at ? new Date(vendor.updated_at).toLocaleDateString() : "—"}
                      </td>
                      <td style={{ width: widths.created }} className="truncate px-2 py-2">
                        {vendor.created_at ? new Date(vendor.created_at).toLocaleDateString() : "—"}
                      </td>
                    </tr>
                  );
                })}
                {pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={COLUMNS.length + 1} className="px-3 py-6 text-center text-gray-500">
                      No vendors found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </TableSelection>

      <div className="flex items-center justify-between text-xs text-gray-600">
        <span>
          Showing {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, sorted.length)} of {sorted.length}
        </span>
        <div className="flex gap-2">
          <button type="button" className="rounded border px-2 py-1 disabled:opacity-40" disabled={safePage <= 1} onClick={() => setCurrentPage((p) => p - 1)}>
            Previous
          </button>
          <span>
            Page {safePage} / {totalPages}
          </span>
          <button type="button" className="rounded border px-2 py-1 disabled:opacity-40" disabled={safePage >= totalPages} onClick={() => setCurrentPage((p) => p + 1)}>
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
