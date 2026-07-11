import { useMemo } from "react";
import type { VendorOption } from "../../api/mdata";
import { vendorQualityKind, vendorQualityClass } from "../../lib/quality-badge";
import { ResizableTable } from "../../components/shared/ResizableTable";
import { CardLink } from "../../components/shared/CardLink";
import { SidebarPagination } from "../../components/shared/SidebarPagination";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import { useListState, type ListQueryStatus } from "../../components/list-state";
import { formatUsdCents } from "../../lib/money";

function fmtMoney(cents: number) {
  return formatUsdCents(cents);
}

function vendorQualityLabel(notes: string | null | undefined) {
  // VEND-5: rate only from real data; no vendor-profile block → neutral "No history" (was defaulting to amber "Medium").
  const kind = vendorQualityKind(notes);
  const label = kind === "good" ? "Good" : kind === "medium" ? "Medium" : kind === "bad" ? "Bad" : "No history";
  return { label, className: vendorQualityClass(kind) };
}

type Props = {
  vendors: VendorOption[];
  /** Roster query status so the empty state renders only once the fetch settles. */
  status: ListQueryStatus;
  totalCount: number;
  page: number;
  pageSize: number;
  search: string;
  sortByName: "name_asc" | "name_desc";
  selectedVendorId: string;
  openByVendorId: Map<string, number>;
  onSearchChange: (value: string) => void;
  onSortChange: (value: "name_asc" | "name_desc") => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onSelectVendor: (vendorId: string) => void;
};

export function VendorListSidebar({
  vendors,
  status,
  totalCount,
  page,
  pageSize,
  search,
  sortByName,
  selectedVendorId,
  openByVendorId,
  onSearchChange,
  onSortChange,
  onPageChange,
  onPageSizeChange,
  onSelectVendor,
}: Props) {
  const sortedVendors = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = vendors.filter((vendor) => {
      if (!q) return true;
      return (
        vendor.name.toLowerCase().includes(q) ||
        String(vendor.vendor_code ?? "").toLowerCase().includes(q) ||
        String(vendor.email ?? "").toLowerCase().includes(q)
      );
    });
    rows.sort((a, b) => {
      const cmp = a.name.localeCompare(b.name);
      return sortByName === "name_asc" ? cmp : -cmp;
    });
    return rows;
  }, [vendors, search, sortByName]);

  // PAGER-SERVERTOTAL-01: the pager count/totalPages reflect the server roster total
  // (totalCount prop, e.g. "440 of 490"), NOT the current in-memory array length.
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pageStart = (safePage - 1) * pageSize;
  const pagedVendors = useMemo(
    () => sortedVendors.slice(pageStart, pageStart + pageSize),
    [pageStart, pageSize, sortedVendors]
  );

  // LIST-EMPTY-1: the empty message is reachable ONLY once the roster fetch
  // settles; while loading the sidebar shows a loading message, never a false
  // empty + "0-0 of 0".
  const listState = useListState(status, pagedVendors.length === 0);

  return (
    <aside className="w-full min-w-[300px] max-w-[560px] shrink-0 rounded-sm border border-gray-200 bg-white p-2" data-vendor-list-sidebar="true">
      <SidebarPagination
        page={safePage}
        pageSize={pageSize}
        totalCount={totalCount}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
        loading={listState.isLoading}
      />
      <input
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder="Search by name or details"
        className="mb-2 mt-2 w-full rounded-sm border border-gray-300 px-2 py-1 text-sm"
      />
      <SelectCombobox
        value={sortByName}
        onChange={(event) => onSortChange(event.target.value as "name_asc" | "name_desc")}
        className="mb-2 w-full rounded-sm border border-gray-300 px-2 py-1 text-sm"
      >
        <option value="name_asc">Sort by name</option>
        <option value="name_desc">Sort by name (Z-A)</option>
      </SelectCombobox>
      {/* QBO columnar list: resizable, per-user-persisted column widths (shared ResizableTable/ResizableTh). */}
      <div className="max-h-[760px] overflow-y-auto">
        <ResizableTable
          tableId="vendors-master-list"
          columns={[
            { id: "name", label: "Name", defaultWidth: 180, align: "left" },
            { id: "open_balance", label: "Open Balance", defaultWidth: 110, align: "right" },
            { id: "status", label: "Status", defaultWidth: 100, align: "left" },
          ]}
        >
          {(widths) => (
            <tbody>
              {pagedVendors.map((vendor) => {
                const rating = vendorQualityLabel(vendor.notes);
                const selected = selectedVendorId === vendor.id;
                return (
                  <tr
                    key={vendor.id}
                    className={`border-b border-gray-100 ${selected ? "bg-slate-100" : "hover:bg-gray-50"}`}
                  >
                    <td style={{ width: widths.name }} className="max-w-0 truncate px-2 py-1.5">
                      {/* Anchor navigation (cmd-click / keyboard) via CardLink; also selects the master-detail row. */}
                      <CardLink href={`/vendors/${vendor.id}`} onNavigate={() => onSelectVendor(vendor.id)} className="block truncate text-sm font-medium text-gray-900 hover:underline">
                        {vendor.name}
                      </CardLink>
                    </td>
                    <td style={{ width: widths.open_balance }} className="px-2 py-1.5 text-right text-xs tabular-nums text-gray-700">{fmtMoney(openByVendorId.get(vendor.id) ?? 0)}</td>
                    <td style={{ width: widths.status }} className="px-2 py-1.5">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${rating.className}`}>{rating.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          )}
        </ResizableTable>
        {listState.isLoading ? <p className="px-1 py-2 text-xs text-slate-500">Loading vendors…</p> : null}
        {listState.isEmpty ? <p className="px-1 py-2 text-xs text-slate-500">No vendors found.</p> : null}
      </div>
      <div className="mt-2">
        <SidebarPagination
          page={safePage}
          pageSize={pageSize}
          totalCount={totalCount}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
          loading={listState.isLoading}
        />
      </div>
    </aside>
  );
}
