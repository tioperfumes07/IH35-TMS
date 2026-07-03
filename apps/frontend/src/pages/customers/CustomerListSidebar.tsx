import { useMemo } from "react";
import type { Customer } from "../../api/mdata";
import { customerQualityKind, customerQualityClass } from "../../lib/quality-badge";
import { CardLink } from "../../components/shared/CardLink";
import { SidebarPagination } from "../../components/shared/SidebarPagination";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import { useListState, type ListQueryStatus } from "../../components/list-state";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function fmtMoney(cents: number) {
  return usd.format(cents / 100);
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
  sortByName: "name_asc" | "name_desc";
  selectedCustomerId: string;
  openByCustomerId: Map<string, number>;
  onSearchChange: (value: string) => void;
  onSortChange: (value: "name_asc" | "name_desc") => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onSelectCustomer: (customerId: string) => void;
};

export function CustomerListSidebar({
  customers,
  status,
  totalCount: _totalCount,
  page,
  pageSize,
  search,
  sortByName,
  selectedCustomerId,
  openByCustomerId,
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
    rows.sort((a, b) => {
      const cmp = a.name.localeCompare(b.name);
      return sortByName === "name_asc" ? cmp : -cmp;
    });
    return rows;
  }, [customers, search, sortByName]);

  const filteredCount = sortedCustomers.length;
  const totalPages = Math.max(1, Math.ceil(filteredCount / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pageStart = (safePage - 1) * pageSize;
  const pagedCustomers = useMemo(
    () => sortedCustomers.slice(pageStart, pageStart + pageSize),
    [pageStart, pageSize, sortedCustomers]
  );

  // LIST-EMPTY-1: the empty message renders only after the roster settles.
  const listState = useListState(status, pagedCustomers.length === 0);

  return (
    <aside className="w-[216px] shrink-0 rounded-sm border border-gray-200 bg-white p-2" data-customer-list-sidebar="true">
      <SidebarPagination
        page={safePage}
        pageSize={pageSize}
        totalCount={filteredCount}
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
      <div className="max-h-[760px] space-y-1 overflow-y-auto">
        {pagedCustomers.map((customer) => (
          <CardLink
            key={customer.id}
            href={`/customers/${customer.id}`}
            onNavigate={() => onSelectCustomer(customer.id)}
            className={`block w-full rounded border px-2 py-2 text-left ${
              selectedCustomerId === customer.id ? "border-slate-300 bg-slate-100" : "border-transparent hover:bg-gray-50"
            }`}
          >
            <p className="truncate text-sm font-medium text-gray-900">{customer.name}</p>
            <p className="text-xs text-gray-600">Open balance {fmtMoney(openByCustomerId.get(customer.id) ?? 0)}</p>
            <p
              className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                customerQualityRating(customer.quality_payment_score, customer.quality_overall_flag).className
              }`}
            >
              {customerQualityRating(customer.quality_payment_score, customer.quality_overall_flag).label}
            </p>
          </CardLink>
        ))}
        {listState.isLoading ? <p className="px-1 py-2 text-xs text-slate-500">Loading customers…</p> : null}
        {listState.isEmpty ? <p className="px-1 py-2 text-xs text-slate-500">No customers found.</p> : null}
      </div>
      <div className="mt-2">
        <SidebarPagination
          page={safePage}
          pageSize={pageSize}
          totalCount={filteredCount}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
          loading={listState.isLoading}
        />
      </div>
    </aside>
  );
}
