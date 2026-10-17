// TABLE_DATE_OMIT: this table has no date column by design — master-data roster (one row per customer: name / open balance / status / quality), not a time series.
import { useMemo } from "react";
import { MoneyCell } from "../../components/shared/MoneyCell";
import type { Customer } from "../../api/mdata";
import { customerQualityKind, customerQualityClass } from "../../lib/quality-badge";
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

function customerQualityRating(paymentScore: string | null | undefined, overallFlag: "preferred" | "standard" | "caution" | "avoid") {
  // CUST-2: rate only from real data; no score/flag → neutral "No history" (was defaulting to amber "Watch").
  const kind = customerQualityKind(paymentScore, overallFlag);
  const label = kind === "good" ? "Good" : kind === "watch" ? "Watch" : kind === "late" ? "Late-pay" : "No history";
  return { label, className: customerQualityClass(kind) };
}

type Props = {
  customers: Customer[];
  /** Roster query status so the empty state renders only once the fetch settles. */
  status: ListQueryStatus;
  totalCount: number;
  page: number;
  pageSize: number;
  search: string;
  sortByName: "name_asc" | "name_desc" | "balance_asc" | "balance_desc";
  selectedCustomerId: string;
  openByCustomerId: Map<string, number>;
  unclearedByCustomerId?: Map<string, { uncleared_cents: number; uncleared_documents: UnclearedDocumentNote[] }>;
  openBalancesAvailable: boolean;
  onSearchChange: (value: string) => void;
  onSortChange: (value: "name_asc" | "name_desc" | "balance_asc" | "balance_desc") => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onSelectCustomer: (customerId: string) => void;
};

export function CustomerListSidebar({
  customers,
  status,
  totalCount,
  page,
  pageSize,
  search,
  sortByName,
  selectedCustomerId,
  openByCustomerId,
  unclearedByCustomerId,
  openBalancesAvailable,
  onSearchChange,
  onSortChange,
  onPageChange,
  onPageSizeChange,
  onSelectCustomer,
}: Props) {
  const sortedCustomers = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = customers.filter((customer) => {
      if (!q) return true;
      return (
        customer.name.toLowerCase().includes(q) ||
        String(customer.customer_code ?? "").toLowerCase().includes(q) ||
        String(customer.email ?? "").toLowerCase().includes(q)
      );
    });
    // CUST-01 C4: default sidebar was name-only; balance sort existed only in the opt-in List
    // view. Reuses the same openByCustomerId map already fetched for the Open Balance column.
    if (sortByName === "balance_asc" || sortByName === "balance_desc") {
      rows.sort((a, b) => {
        const cmp = (openByCustomerId.get(a.id) ?? 0) - (openByCustomerId.get(b.id) ?? 0);
        return sortByName === "balance_asc" ? cmp : -cmp;
      });
    } else {
      rows.sort((a, b) => {
        const cmp = a.name.localeCompare(b.name);
        return sortByName === "name_asc" ? cmp : -cmp;
      });
    }
    return rows;
  }, [customers, search, sortByName, openByCustomerId]);

  // PAGER-SERVERTOTAL-01: the pager count/totalPages reflect the server roster total
  // (totalCount prop, e.g. "440 of 490"), NOT the current in-memory array length.
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pageStart = (safePage - 1) * pageSize;
  const pagedCustomers = useMemo(
    () => sortedCustomers.slice(pageStart, pageStart + pageSize),
    [pageStart, pageSize, sortedCustomers]
  );

  // LIST-EMPTY-1: the empty message renders only after the roster settles.
  const listState = useListState(status, pagedCustomers.length === 0);

  // MD-WIDTH-0 + C-16: explicit xl:w-[Npx] pin lives in MASTER_DETAIL.masterPaneClass (was hardcoded 440px).
  // C-03: surfaceClass is the locked pane edge (border + shadow), not a transparent flex child.
  return (
    <aside className={`${MASTER_DETAIL.masterPaneClass} ${MASTER_DETAIL.surfaceClass} p-2`} data-customer-list-sidebar="true" data-master-detail-master="true">
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
      {/* LEAD 443.181 — the app's one table (ParityTable). The row opens the customer: ParityTable clicks the row's CardLink,
          whose onNavigate selects the master-detail row in place (cmd/ctrl-click still opens the full page). Rows arrive
          pre-sorted and pre-paged by this sidebar, so the built-in pager is hidden (SidebarPagination owns it). */}
      <div className={MASTER_DETAIL.listScrollClass} data-c05-list-scroll="true">
        <ParityTable<Customer>
          tableTestId="customers-master-list"
          storageKey="ih35.customers.master-list.v1"
          rows={pagedCustomers}
          rowKey={(customer) => customer.id}
          rowTestId={() => "customers-master-list-row"}
          rowClassName={(customer) => (selectedCustomerId === customer.id ? MASTER_DETAIL.rowSelectedClass : "")}
          loading={listState.isLoading}
          emptyText={listState.isEmpty ? "No customers found." : ""}
          pageSize={Math.max(1, pagedCustomers.length)}
          hidePager
          suppressToolbarSearch
          suppressToolbarRange
          embedded
          columns={[
            {
              key: "name",
              label: "Name",
              minWidth: 170,
              render: (customer) => (
                <CardLink href={`/customers/${customer.id}`} onNavigate={() => onSelectCustomer(customer.id)} className="block truncate text-xs font-medium text-gray-900 hover:underline">
                  {/* invariant #23 (§7 owner-locked): the canonical `single-line-name` token + title for the full name. */}
                  <span title={customer.name} className="single-line-name">{customer.name}</span>
                </CardLink>
              ),
            },
            {
              key: "open_balance",
              label: "Open Balance",
              cellClass: "text-right tabular-nums",
              sortValue: (customer) => (openByCustomerId.get(customer.id) ?? 0) + (unclearedByCustomerId?.get(customer.id)?.uncleared_cents ?? 0),
              render: (customer) => (
                <>
                  {openBalancesAvailable ? (
                    <>
                      Cleared{" "}
                      <MoneyCell
                        cents={(openByCustomerId.get(customer.id) ?? 0) + (unclearedByCustomerId?.get(customer.id)?.uncleared_cents ?? 0)}
                        format={fmtMoney}
                        className="inline"
                        drill={{ none: "Cleared balance = open invoices + uncleared payments — open the customer to see each" }}
                      />
                    </>
                  ) : (
                    "Unavailable"
                  )}
                  <UnclearedDocumentsNote docs={unclearedByCustomerId?.get(customer.id)?.uncleared_documents ?? []} />
                </>
              ),
            },
            // VC-DETAIL-01 (owner ROUND 14, 2026-09-06): Status is active/inactive (deactivated_at), NOT the quality chip.
            {
              key: "status",
              label: "Status",
              sortValue: (customer) => (customer.deactivated_at != null ? "Inactive" : "Active"),
              render: (customer) => {
                const isInactive = customer.deactivated_at != null;
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
              sortValue: (customer) => customerQualityRating(customer.quality_payment_score, customer.quality_overall_flag).label,
              render: (customer) => {
                const rating = customerQualityRating(customer.quality_payment_score, customer.quality_overall_flag);
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
