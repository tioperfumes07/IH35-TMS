// TABLE_DATE_OMIT: this table has no date column by design — master-data roster (one row per vendor: name / open balance / status / quality), not a time series.
import { useMemo } from "react";
import { MoneyCell } from "../../components/shared/MoneyCell";
import type { VendorOption } from "../../api/mdata";
import { vendorQualityKind, vendorQualityClass } from "../../lib/quality-badge";
import { ParityTable } from "../../components/parity/ParityTable";
import { CardLink } from "../../components/shared/CardLink";
import { SidebarPagination } from "../../components/shared/SidebarPagination";
import { SelectCombobox } from "../../components/Combobox";
import { useListState, type ListQueryStatus } from "../../components/list-state";
import { formatUsdCents } from "../../lib/money";
import { MASTER_DETAIL } from "../../design/master-detail";
import { UnclearedDocumentsNote, type UnclearedDocumentNote } from "../../components/accounting/UnclearedDocumentsNote";

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
  sortByName: "name_asc" | "name_desc" | "balance_asc" | "balance_desc";
  selectedVendorId: string;
  openByVendorId: Map<string, number>;
  unclearedByVendorId?: Map<string, { uncleared_cents: number; uncleared_documents: UnclearedDocumentNote[] }>;
  onSearchChange: (value: string) => void;
  onSortChange: (value: "name_asc" | "name_desc" | "balance_asc" | "balance_desc") => void;
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
  unclearedByVendorId,
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
    // CUST-01 C4: default sidebar was name-only; balance sort existed only in the opt-in List
    // view (same gap, same fix as CustomerListSidebar). Reuses the already-fetched
    // openByVendorId map used for the Open Balance column.
    if (sortByName === "balance_asc" || sortByName === "balance_desc") {
      rows.sort((a, b) => {
        const cmp = (openByVendorId.get(a.id) ?? 0) - (openByVendorId.get(b.id) ?? 0);
        return sortByName === "balance_asc" ? cmp : -cmp;
      });
    } else {
      rows.sort((a, b) => {
        const cmp = a.name.localeCompare(b.name);
        return sortByName === "name_asc" ? cmp : -cmp;
      });
    }
    return rows;
  }, [vendors, search, sortByName, openByVendorId]);

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

  // MD-WIDTH-0 + C-16: explicit xl:w-[Npx] pin lives in MASTER_DETAIL.masterPaneClass (was hardcoded 440px).
  // C-03: surfaceClass is the locked pane edge (border + shadow), not a transparent flex child.
  return (
    <aside className={`${MASTER_DETAIL.masterPaneClass} ${MASTER_DETAIL.surfaceClass} p-2`} data-vendor-list-sidebar="true" data-master-detail-master="true">
      <SidebarPagination
        page={safePage}
        pageSize={pageSize}
        totalCount={totalCount}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
        allowAll
        loading={listState.isLoading}
      />
      <input
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        aria-label="Search vendors by name or details"
        placeholder="Search by name or details"
        className="mb-2 mt-2 w-full rounded-sm border border-gray-300 px-2 py-1 text-xs"
      />
      <SelectCombobox
        value={sortByName}
        onChange={(event) => onSortChange(event.target.value as "name_asc" | "name_desc" | "balance_asc" | "balance_desc")}
        className="mb-2 w-full rounded-sm border border-gray-300 px-2 py-1 text-xs"
      >
        <option value="name_asc">Sort by name</option>
        <option value="name_desc">Sort by name (Z-A)</option>
        <option value="balance_desc">Sort by balance (high-low)</option>
        <option value="balance_asc">Sort by balance (low-high)</option>
      </SelectCombobox>
      {/* LEAD 443.181 — the app's one table (ParityTable). The row opens the vendor: ParityTable clicks the row's CardLink,
          whose onNavigate selects the master-detail row in place (cmd/ctrl-click still opens the full page). Rows arrive
          pre-sorted and pre-paged by this sidebar, so the built-in pager is hidden (SidebarPagination owns it). */}
      <div className={MASTER_DETAIL.listScrollClass} data-c05-list-scroll="true">
        <ParityTable<VendorOption>
          tableTestId="vendors-master-list"
          storageKey="ih35.vendors.master-list.v1"
          rows={pagedVendors}
          rowKey={(vendor) => vendor.id}
          rowTestId={() => "vendors-master-list-row"}
          rowClassName={(vendor) => (selectedVendorId === vendor.id ? MASTER_DETAIL.rowSelectedClass : "")}
          loading={listState.isLoading}
          emptyText={listState.isEmpty ? "No vendors found." : ""}
          pageSize={Math.max(1, pagedVendors.length)}
          hidePager
          suppressToolbarSearch
          suppressToolbarRange
          embedded
          columns={[
            {
              key: "name",
              label: "Name",
              minWidth: 170,
              render: (vendor) => (
                <CardLink href={`/vendors/${vendor.id}`} onNavigate={() => onSelectVendor(vendor.id)} className="block truncate text-xs font-medium text-gray-900 hover:underline">
                  {/* invariant #23 (§7 owner-locked): the canonical `single-line-name` token + title for the full name. */}
                  <span title={vendor.name} className="single-line-name">{vendor.name}</span>
                </CardLink>
              ),
            },
            {
              key: "open_balance",
              label: "Open Balance",
              cellClass: "text-right tabular-nums",
              sortValue: (vendor) => (openByVendorId.get(vendor.id) ?? 0) + (unclearedByVendorId?.get(vendor.id)?.uncleared_cents ?? 0),
              render: (vendor) => (
                <>
                  Cleared{" "}
                  <MoneyCell
                    cents={(openByVendorId.get(vendor.id) ?? 0) + (unclearedByVendorId?.get(vendor.id)?.uncleared_cents ?? 0)}
                    format={fmtMoney}
                    className="inline"
                    drill={{ none: "Cleared balance = open bills + uncleared payments — open the vendor to see each" }}
                  />
                  <UnclearedDocumentsNote docs={unclearedByVendorId?.get(vendor.id)?.uncleared_documents ?? []} />
                </>
              ),
            },
            // VC-DETAIL-01 (owner ROUND 14, 2026-09-06): Status is active/inactive (deactivated_at), NOT the quality chip.
            {
              key: "status",
              label: "Status",
              sortValue: (vendor) => (vendor.deactivated_at != null ? "Inactive" : "Active"),
              render: (vendor) => {
                const isInactive = vendor.deactivated_at != null;
                return (
                  <span className={`inline-flex rounded-sm px-2 py-0.5 text-xs font-semibold ${isInactive ? "bg-gray-200 text-gray-700" : "bg-[#F7F8FA] text-[#1F2A44]"}`}>
                    {isInactive ? "Inactive" : "Active"}
                  </span>
                );
              },
            },
            {
              key: "quality",
              label: "Quality",
              sortValue: (vendor) => vendorQualityLabel(vendor.notes).label,
              render: (vendor) => {
                const rating = vendorQualityLabel(vendor.notes);
                return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${rating.className}`}>{rating.label}</span>;
              },
            },
          ]}
        />
      </div>
      <div className="mt-2">
        <SidebarPagination
          page={safePage}
          pageSize={pageSize}
          totalCount={totalCount}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
          allowAll
          loading={listState.isLoading}
        />
      </div>
    </aside>
  );
}
