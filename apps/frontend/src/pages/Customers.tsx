import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { listInvoices } from "../api/accounting";
import { getCustomerBillingSummary, listCustomers } from "../api/mdata";
import { ActionButton } from "../components/shared/ActionButton";
import { SelectCombobox } from "../components/shared/SelectCombobox";
import { SecondaryNavTabs } from "../components/shared/SecondaryNavTabs";
import { PageHeader } from "../components/layout/PageHeader";
import { useCompanyContext } from "../contexts/CompanyContext";

type CustomerTabId =
  | "transaction_list"
  | "activity_feed"
  | "statements"
  | "recurring_transactions"
  | "projects"
  | "customer_details"
  | "late_fees"
  | "notes"
  | "tasks"
  | "opportunities"
  | "conversations";

const CUSTOMER_TABS: Array<{ id: CustomerTabId; label: string }> = [
  { id: "transaction_list", label: "Transaction List" },
  { id: "activity_feed", label: "Activity Feed" },
  { id: "statements", label: "Statements" },
  { id: "recurring_transactions", label: "Recurring Transactions" },
  { id: "projects", label: "Projects" },
  { id: "customer_details", label: "Customer Details" },
  { id: "late_fees", label: "Late Fees" },
  { id: "notes", label: "Notes" },
  { id: "tasks", label: "Tasks" },
  { id: "opportunities", label: "Opportunities" },
  { id: "conversations", label: "Conversations" },
];

type ColumnKey =
  | "date"
  | "type"
  | "doc_no"
  | "status"
  | "amount"
  | "balance"
  | "load_no"
  | "settlement_no"
  | "truck_no"
  | "pickup_date"
  | "delivery_date"
  | "loaded_miles";

const COLUMN_OPTIONS: Array<{ key: ColumnKey; label: string; defaultOn: boolean }> = [
  { key: "date", label: "Date", defaultOn: true },
  { key: "type", label: "Type", defaultOn: true },
  { key: "doc_no", label: "Doc #", defaultOn: true },
  { key: "status", label: "Status", defaultOn: true },
  { key: "amount", label: "Amount", defaultOn: true },
  { key: "balance", label: "Balance", defaultOn: true },
  { key: "load_no", label: "Load #", defaultOn: true },
  { key: "settlement_no", label: "Settlement #", defaultOn: false },
  { key: "truck_no", label: "Truck #", defaultOn: false },
  { key: "pickup_date", label: "Pick-up date", defaultOn: false },
  { key: "delivery_date", label: "Delivery date", defaultOn: false },
  { key: "loaded_miles", label: "Loaded miles", defaultOn: false },
];

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function fmtMoney(cents: number | null | undefined) {
  return usd.format((Number(cents ?? 0) || 0) / 100);
}

export function CustomersPage() {
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [search, setSearch] = useState("");
  const [sortByName, setSortByName] = useState<"name_asc" | "name_desc">("name_asc");
  const [activeTab, setActiveTab] = useState<CustomerTabId>("transaction_list");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [showFilterBox, setShowFilterBox] = useState(false);
  const [showColumnChooser, setShowColumnChooser] = useState(false);
  const [columns, setColumns] = useState<Record<ColumnKey, boolean>>(
    () => Object.fromEntries(COLUMN_OPTIONS.map((column) => [column.key, column.defaultOn])) as Record<ColumnKey, boolean>
  );

  const customersQuery = useQuery({
    queryKey: ["customers", "page", companyId],
    queryFn: () => listCustomers({ operating_company_id: companyId }).then((result) => result.customers),
    enabled: Boolean(companyId),
  });
  const allInvoicesQuery = useQuery({
    queryKey: ["accounting", "invoices", "all", companyId],
    queryFn: () => listInvoices(companyId),
    enabled: Boolean(companyId),
  });

  const customersSorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = (customersQuery.data ?? []).filter((customer) => {
      if (!q) return true;
      return (
        customer.name.toLowerCase().includes(q) ||
        String(customer.customer_code ?? "").toLowerCase().includes(q) ||
        String(customer.main_contact_name ?? "").toLowerCase().includes(q)
      );
    });
    rows.sort((a, b) => {
      const cmp = a.name.localeCompare(b.name);
      return sortByName === "name_asc" ? cmp : -cmp;
    });
    return rows;
  }, [customersQuery.data, search, sortByName]);

  const selectedCustomer = useMemo(() => {
    const exact = customersSorted.find((customer) => customer.id === selectedCustomerId);
    if (exact) return exact;
    return customersSorted[0] ?? null;
  }, [customersSorted, selectedCustomerId]);

  const openByCustomerId = useMemo(() => {
    const map = new Map<string, number>();
    for (const invoice of allInvoicesQuery.data?.invoices ?? []) {
      const current = map.get(invoice.customer_id) ?? 0;
      map.set(invoice.customer_id, current + Number(invoice.amount_open_cents ?? 0));
    }
    return map;
  }, [allInvoicesQuery.data?.invoices]);

  const summaryQuery = useQuery({
    queryKey: ["customers", "billing-summary", companyId, selectedCustomer?.id ?? ""],
    queryFn: () => getCustomerBillingSummary(selectedCustomer!.id, companyId),
    enabled: Boolean(companyId && selectedCustomer?.id),
  });
  const invoicesQuery = useQuery({
    queryKey: ["customers", "transactions", companyId, selectedCustomer?.id ?? "", statusFilter, dateFrom, dateTo],
    queryFn: () =>
      listInvoices(companyId, {
        customer_id: selectedCustomer!.id,
        status: statusFilter || undefined,
        from_date: dateFrom || undefined,
        to_date: dateTo || undefined,
      }),
    enabled: Boolean(companyId && selectedCustomer?.id),
  });

  const txRows = useMemo(() => {
    return (invoicesQuery.data?.invoices ?? []).filter((invoice) => {
      if (typeFilter && String(invoice.invoice_type ?? "manual") !== typeFilter) return false;
      if (categoryFilter && !String(invoice.customer_notes ?? "").toLowerCase().includes(categoryFilter.toLowerCase())) return false;
      return true;
    });
  }, [invoicesQuery.data?.invoices, typeFilter, categoryFilter]);

  const overdue = Number(summaryQuery.data?.aging_buckets?.bucket_91_plus ?? 0);

  return (
    <div className="space-y-3">
      <PageHeader title="Customers" subtitle="Customer list and transactions" />
      <div className="flex gap-3">
        <aside className="w-[216px] flex-shrink-0 rounded border border-gray-200 bg-white p-2">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name or details"
            className="mb-2 w-full rounded border border-gray-300 px-2 py-1 text-sm"
          />
          <SelectCombobox
            value={sortByName}
            onChange={(event) => setSortByName(event.target.value as "name_asc" | "name_desc")}
            className="mb-2 w-full rounded border border-gray-300 px-2 py-1 text-sm"
          >
            <option value="name_asc">Sort by name</option>
            <option value="name_desc">Sort by name (Z-A)</option>
          </SelectCombobox>
          <div className="max-h-[760px] space-y-1 overflow-y-auto">
            {customersSorted.map((customer) => (
              <button
                key={customer.id}
                type="button"
                className={`w-full rounded border px-2 py-2 text-left ${selectedCustomer?.id === customer.id ? "border-blue-500 bg-blue-50" : "border-transparent hover:bg-gray-50"}`}
                onClick={() => setSelectedCustomerId(customer.id)}
              >
                <p className="truncate text-sm font-medium text-gray-900">{customer.name}</p>
                <p className="text-xs text-gray-600">Open balance {fmtMoney(openByCustomerId.get(customer.id) ?? 0)}</p>
              </button>
            ))}
            {customersSorted.length === 0 ? <p className="px-1 py-2 text-xs text-gray-500">No customers found.</p> : null}
          </div>
        </aside>

        <main className="min-w-0 flex-1 space-y-3">
          {selectedCustomer ? (
            <>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_320px]">
                <section className="rounded border border-gray-200 bg-white p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">{selectedCustomer.name}</h2>
                      <p className="text-sm text-gray-500">{selectedCustomer.customer_code || "Customer"} · {selectedCustomer.customer_type ?? "Type not set"}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <ActionButton onClick={() => navigate(`/customers/${selectedCustomer.id}`)}>Edit</ActionButton>
                      <ActionButton className="rounded border border-emerald-700 bg-emerald-700 px-3 py-1 text-white hover:bg-emerald-600" onClick={() => navigate(`/accounting/invoices?customer_id=${selectedCustomer.id}`)}>
                        New transaction
                      </ActionButton>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
                    <p><span className="font-semibold text-gray-600">Email:</span> {selectedCustomer.email ?? "—"}</p>
                    <p><span className="font-semibold text-gray-600">Phone:</span> {selectedCustomer.phone ?? "—"}</p>
                    <p><span className="font-semibold text-gray-600">Billing address:</span> {selectedCustomer.billing_address ?? "—"}</p>
                    <p><span className="font-semibold text-gray-600">Shipping address:</span> —</p>
                    <p><span className="font-semibold text-gray-600">Notes:</span> {selectedCustomer.notes ?? "—"}</p>
                    <p><span className="font-semibold text-gray-600">Custom fields:</span> —</p>
                  </div>
                </section>
                <section className="rounded border border-gray-200 bg-white p-3">
                  <h3 className="mb-2 text-sm font-semibold text-gray-900">Financial summary</h3>
                  <p className="text-sm text-gray-600">Open balance</p>
                  <p className="text-xl font-semibold text-gray-900">{fmtMoney(summaryQuery.data?.aging_buckets?.total_open ?? 0)}</p>
                  <p className="mt-2 text-sm text-gray-600">Overdue payment</p>
                  <p className="text-lg font-semibold text-red-700">{fmtMoney(overdue)}</p>
                </section>
              </div>

              <SecondaryNavTabs tabs={CUSTOMER_TABS} activeId={activeTab} onChange={(id) => setActiveTab(id as CustomerTabId)} />

              {activeTab === "transaction_list" ? (
                <div className="rounded border border-gray-200 bg-white p-3">
                  <div className="relative mb-2 flex flex-wrap items-center gap-2">
                    <SelectCombobox value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="rounded border border-gray-300 px-2 py-1 text-sm">
                      <option value="">Type: All</option>
                      <option value="from_load">from_load</option>
                      <option value="driver_damage">driver_damage</option>
                      <option value="driver_misc">driver_misc</option>
                      <option value="vendor_chargeback">vendor_chargeback</option>
                      <option value="customer_adjustment">customer_adjustment</option>
                      <option value="manual">manual</option>
                    </SelectCombobox>
                    <ActionButton onClick={() => setShowFilterBox((open) => !open)}>Filter</ActionButton>
                    <span className="rounded border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-600">
                      {dateFrom || dateTo ? `Date: ${dateFrom || "…"} - ${dateTo || "…"}` : "Date: Any"}
                    </span>
                    <button type="button" className="ml-auto rounded border border-gray-300 px-2 py-1 text-sm hover:bg-gray-50" onClick={() => setShowColumnChooser((open) => !open)}>⚙</button>
                    {showFilterBox ? (
                      <div className="absolute left-0 top-9 z-10 w-[320px] rounded border border-gray-200 bg-white p-2 shadow">
                        <label className="mb-1 block text-xs font-semibold text-gray-600">Status</label>
                        <SelectCombobox value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="mb-2 w-full rounded border border-gray-300 px-2 py-1 text-sm">
                          <option value="">All</option>
                          <option value="draft">draft</option>
                          <option value="sent">sent</option>
                          <option value="partial">partial</option>
                          <option value="paid">paid</option>
                          <option value="void">void</option>
                          <option value="factored">factored</option>
                        </SelectCombobox>
                        <label className="mb-1 block text-xs font-semibold text-gray-600">Date range</label>
                        <div className="mb-2 grid grid-cols-2 gap-2">
                          <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="rounded border border-gray-300 px-2 py-1 text-sm" />
                          <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="rounded border border-gray-300 px-2 py-1 text-sm" />
                        </div>
                        <label className="mb-1 block text-xs font-semibold text-gray-600">Category</label>
                        <input value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="w-full rounded border border-gray-300 px-2 py-1 text-sm" placeholder="Category text" />
                      </div>
                    ) : null}
                    {showColumnChooser ? (
                      <div className="absolute right-0 top-9 z-10 w-[220px] rounded border border-gray-200 bg-white p-2 shadow">
                        {COLUMN_OPTIONS.map((column) => (
                          <label key={column.key} className="flex items-center gap-2 py-0.5 text-xs">
                            <input
                              type="checkbox"
                              checked={columns[column.key]}
                              onChange={(event) => setColumns((prev) => ({ ...prev, [column.key]: event.target.checked }))}
                            />
                            {column.label}
                          </label>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-[1200px] w-full text-left text-sm">
                      <thead className="bg-gray-50 text-xs uppercase text-gray-600">
                        <tr>{COLUMN_OPTIONS.filter((column) => columns[column.key]).map((column) => <th key={column.key} className="px-2 py-1">{column.label}</th>)}</tr>
                      </thead>
                      <tbody>
                        {txRows.map((invoice) => {
                          const values: Record<ColumnKey, string> = {
                            date: invoice.issue_date,
                            type: String(invoice.invoice_type ?? "manual"),
                            doc_no: invoice.display_id,
                            status: invoice.status,
                            amount: fmtMoney(invoice.total_cents),
                            balance: fmtMoney(invoice.amount_open_cents),
                            load_no: invoice.source_load_id ?? "—",
                            settlement_no: "—",
                            truck_no: "—",
                            pickup_date: "—",
                            delivery_date: "—",
                            loaded_miles: "—",
                          };
                          return (
                            <tr key={invoice.id} className="border-t border-gray-100">
                              {COLUMN_OPTIONS.filter((column) => columns[column.key]).map((column) => <td key={column.key} className="px-2 py-1">{values[column.key]}</td>)}
                            </tr>
                          );
                        })}
                        {txRows.length === 0 ? (
                          <tr><td colSpan={COLUMN_OPTIONS.filter((column) => columns[column.key]).length} className="px-2 py-3 text-center text-sm text-gray-500">No transactions for current filters.</td></tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="rounded border border-gray-200 bg-white p-3 text-sm text-gray-500">No rows for this tab yet.</div>
              )}
            </>
          ) : (
            <div className="rounded border border-gray-200 bg-white p-4 text-sm text-gray-500">No customer selected.</div>
          )}
        </main>
      </div>
    </div>
  );
}
