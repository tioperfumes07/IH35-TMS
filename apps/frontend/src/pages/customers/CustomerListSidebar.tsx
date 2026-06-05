import { useMemo } from "react";
import type { Customer } from "../../api/mdata";
import { CardLink } from "../../components/shared/CardLink";
import { SidebarPagination } from "../../components/shared/SidebarPagination";
import { SelectCombobox } from "../../components/shared/SelectCombobox";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function fmtMoney(cents: number) {
  return usd.format(cents / 100);
}

function customerQualityRating(paymentScore: string | null | undefined, overallFlag: "preferred" | "standard" | "caution" | "avoid") {
  const numeric = Number(paymentScore ?? "");
  if (Number.isFinite(numeric)) {
    if (numeric >= 90) return { label: "Good", className: "bg-emerald-100 text-emerald-800" };
    if (numeric >= 70) return { label: "Watch", className: "bg-amber-100 text-amber-800" };
    return { label: "Late-pay", className: "bg-red-100 text-red-800" };
  }
  if (overallFlag === "preferred") return { label: "Good", className: "bg-emerald-100 text-emerald-800" };
  if (overallFlag === "caution") return { label: "Watch", className: "bg-amber-100 text-amber-800" };
  if (overallFlag === "avoid") return { label: "Late-pay", className: "bg-red-100 text-red-800" };
  return { label: "Watch", className: "bg-amber-100 text-amber-800" };
}

type Props = {
  customers: Customer[];
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
  totalCount,
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

  return (
    <aside className="w-[216px] flex-shrink-0 rounded border border-gray-200 bg-white p-2" data-customer-list-sidebar="true">
      <SidebarPagination
        page={page}
        pageSize={pageSize}
        totalCount={totalCount}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />
      <input
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder="Search by name or details"
        className="mb-2 mt-2 w-full rounded border border-gray-300 px-2 py-1 text-sm"
      />
      <SelectCombobox
        value={sortByName}
        onChange={(event) => onSortChange(event.target.value as "name_asc" | "name_desc")}
        className="mb-2 w-full rounded border border-gray-300 px-2 py-1 text-sm"
      >
        <option value="name_asc">Sort by name</option>
        <option value="name_desc">Sort by name (Z-A)</option>
      </SelectCombobox>
      <div className="max-h-[760px] space-y-1 overflow-y-auto">
        {sortedCustomers.map((customer) => (
          <CardLink
            key={customer.id}
            href={`/customers/${customer.id}`}
            onNavigate={() => onSelectCustomer(customer.id)}
            className={`block w-full rounded border px-2 py-2 text-left ${
              selectedCustomerId === customer.id ? "border-blue-500 bg-blue-50" : "border-transparent hover:bg-gray-50"
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
        {sortedCustomers.length === 0 ? <p className="px-1 py-2 text-xs text-gray-500">No customers found.</p> : null}
      </div>
      <div className="mt-2">
        <SidebarPagination
          page={page}
          pageSize={pageSize}
          totalCount={totalCount}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
        />
      </div>
    </aside>
  );
}
