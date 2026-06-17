import { useEffect, useMemo, useState } from "react";
import { DatePicker } from "../components/forms/DatePicker";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { listBills, listVendorBalances } from "../api/accounting";
import { listVendors, type VendorOption } from "../api/mdata";
import { Button } from "../components/Button";
import { ActionButton } from "../components/shared/ActionButton";
import { SelectCombobox } from "../components/shared/SelectCombobox";
import { SecondaryNavTabs } from "../components/shared/SecondaryNavTabs";
import { PageHeader } from "../components/layout/PageHeader";
import { useCompanyContext } from "../contexts/CompanyContext";
import { parseVendorNotes } from "../lib/vendorProfileMeta";
import { VendorsListView } from "./vendors/VendorsListView";
import { VendorListSidebar } from "./vendors/VendorListSidebar";
import { VendorsSyncPanel } from "./vendors/VendorsSyncPanel";
import { useViewModePref } from "../hooks/useViewModePref";

type VendorTabId = "transaction_list" | "vendor_details" | "notes";

const VENDOR_TABS: Array<{ id: VendorTabId; label: string }> = [
  { id: "transaction_list", label: "Transaction List" },
  { id: "vendor_details", label: "Vendor Details" },
  { id: "notes", label: "Notes" },
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

function buildAchDisplay(vendor: VendorOption) {
  const text = parseVendorNotes(vendor.notes).publicNotes.toLowerCase();
  if (text.includes("ach")) return "ACH on file";
  return "—";
}

function vendorQualityLabel(notes: string | null | undefined) {
  const rating = parseVendorNotes(notes).meta.qualityRating;
  if (rating === "good") return { label: "Good", className: "bg-emerald-100 text-emerald-800" };
  if (rating === "bad") return { label: "Bad", className: "bg-red-100 text-red-800" };
  return { label: "Medium", className: "bg-amber-100 text-amber-800" };
}

export function VendorsPage() {
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [search, setSearch] = useState("");
  const [sortByName, setSortByName] = useState<"name_asc" | "name_desc">("name_asc");
  const [activeTab, setActiveTab] = useState<VendorTabId>("transaction_list");
  const [selectedVendorId, setSelectedVendorId] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [listStatus, setListStatus] = useState<"active" | "inactive" | "all">("active");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [showFilterBox, setShowFilterBox] = useState(false);
  const [showColumnChooser, setShowColumnChooser] = useState(false);
  const [pageSize, setPageSize] = useState(50);
  const [currentPage, setCurrentPage] = useState(1);
  const [sidebarPage, setSidebarPage] = useState(1);
  const [sidebarPageSize, setSidebarPageSize] = useState(50);
  const [columns, setColumns] = useState<Record<ColumnKey, boolean>>(
    () => Object.fromEntries(COLUMN_OPTIONS.map((column) => [column.key, column.defaultOn])) as Record<ColumnKey, boolean>
  );
  // CLOSURE-31: default to the prior "master-detail" design; "list" is opt-in only.
  const { viewMode, setViewMode } = useViewModePref("vendors", "master-detail");

  const vendorsQuery = useQuery({
    queryKey: ["vendors", "page", companyId],
    queryFn: () => listVendors({ operating_company_id: companyId }).then((result) => result.vendors),
    enabled: Boolean(companyId),
  });
  const balancesQuery = useQuery({
    queryKey: ["accounting", "vendor-balances", companyId],
    queryFn: () => listVendorBalances(companyId, { all: true }),
    enabled: Boolean(companyId),
  });

  // Soft-delete (Active/Inactive) list filter — canonical deactivated_at semantics,
  // mirroring the Driver Deactivate pattern. Defaults to Active.
  const visibleVendors = useMemo(() => {
    const all = vendorsQuery.data ?? [];
    if (listStatus === "all") return all;
    if (listStatus === "inactive") return all.filter((vendor) => vendor.deactivated_at != null);
    return all.filter((vendor) => vendor.deactivated_at == null);
  }, [vendorsQuery.data, listStatus]);

  const vendorsSorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = visibleVendors.filter((vendor) => {
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
  }, [visibleVendors, search, sortByName]);

  const selectedVendor = useMemo(() => {
    const exact = vendorsSorted.find((vendor) => vendor.id === selectedVendorId);
    if (exact) return exact;
    return vendorsSorted[0] ?? null;
  }, [vendorsSorted, selectedVendorId]);
  const selectedVendorPublicNotes = useMemo(
    () => parseVendorNotes(selectedVendor?.notes).publicNotes,
    [selectedVendor?.notes]
  );

  const openByVendorId = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of balancesQuery.data?.rows ?? []) {
      map.set(row.vendor_id, Number(row.balance_cents ?? 0));
    }
    return map;
  }, [balancesQuery.data?.rows]);

  const billsQuery = useQuery({
    queryKey: ["vendors", "transactions", companyId, selectedVendor?.id ?? "", statusFilter, dateFrom, dateTo],
    queryFn: () =>
      listBills(companyId, {
        vendor_id: selectedVendor!.id,
        status: statusFilter === "unpaid" ? "unpaid" : (statusFilter as "open" | "partial" | "paid" | "voided" | undefined),
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      }),
    enabled: Boolean(companyId && selectedVendor?.id),
  });

  const txRows = useMemo(() => {
    return (billsQuery.data?.rows ?? []).filter((bill) => {
      if (typeFilter && "bill" !== typeFilter) return false;
      if (categoryFilter && !String(bill.memo ?? "").toLowerCase().includes(categoryFilter.toLowerCase())) return false;
      return true;
    });
  }, [billsQuery.data?.rows, typeFilter, categoryFilter]);

  const overdueCents = useMemo(() => {
    const now = new Date();
    return txRows.reduce((sum, bill) => {
      const due = bill.due_date ? new Date(`${bill.due_date}T00:00:00`) : null;
      const isOverdue = due != null && !Number.isNaN(due.getTime()) && due.getTime() < now.getTime();
      const balance = Number(bill.balance_cents ?? Number(bill.amount_cents ?? 0) - Number(bill.paid_cents ?? 0));
      return isOverdue ? sum + Math.max(balance, 0) : sum;
    }, 0);
  }, [txRows]);
  const totalRows = txRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStartIndex = (safeCurrentPage - 1) * pageSize;
  const pageRangeStart = totalRows === 0 ? 0 : pageStartIndex + 1;
  const pageRangeEnd = totalRows === 0 ? 0 : Math.min(pageStartIndex + pageSize, totalRows);
  const pagedRows = useMemo(
    () => txRows.slice(pageStartIndex, pageStartIndex + pageSize),
    [pageSize, pageStartIndex, txRows]
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, selectedVendor?.id, typeFilter, statusFilter, dateFrom, dateTo, categoryFilter, pageSize]);

  useEffect(() => {
    setSidebarPage(1);
  }, [search, sortByName, sidebarPageSize, companyId]);

  return (
    <div className="space-y-3">
      <PageHeader
        title="Vendors"
        subtitle="Vendor list and transactions"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded border border-gray-300 bg-white p-0.5 text-xs" data-view-mode-toggle="vendors">
              <button
                type="button"
                className={`rounded px-2 py-1 font-medium ${viewMode === "list" ? "bg-blue-600 text-white" : "text-gray-700 hover:bg-gray-50"}`}
                onClick={() => setViewMode("list")}
              >
                List view
              </button>
              <button
                type="button"
                className={`rounded px-2 py-1 font-medium ${viewMode === "master-detail" ? "bg-blue-600 text-white" : "text-gray-700 hover:bg-gray-50"}`}
                onClick={() => setViewMode("master-detail")}
              >
                Master-detail
              </button>
            </div>
            <div className="inline-flex rounded border border-gray-300 bg-white p-0.5 text-xs" data-list-status-filter="vendors">
              {(["active", "inactive", "all"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`rounded px-2 py-1 font-medium capitalize ${listStatus === value ? "bg-blue-600 text-white" : "text-gray-700 hover:bg-gray-50"}`}
                  onClick={() => setListStatus(value)}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
        }
      />
      {companyId ? <VendorsSyncPanel operatingCompanyId={companyId} /> : null}
      {viewMode === "list" ? (
        <VendorsListView
          companyId={companyId}
          vendors={vendorsSorted}
          openByVendorId={openByVendorId}
          onSelectVendor={(vendorId) => {
            setSelectedVendorId(vendorId);
            setViewMode("master-detail");
          }}
        />
      ) : (
      <div className="flex gap-3">
        <VendorListSidebar
          vendors={visibleVendors}
          totalCount={vendorsSorted.length}
          page={sidebarPage}
          pageSize={sidebarPageSize}
          search={search}
          sortByName={sortByName}
          selectedVendorId={selectedVendor?.id ?? ""}
          openByVendorId={openByVendorId}
          onSearchChange={setSearch}
          onSortChange={setSortByName}
          onPageChange={setSidebarPage}
          onPageSizeChange={setSidebarPageSize}
          onSelectVendor={setSelectedVendorId}
        />

        <main className="min-w-0 flex-1 space-y-3">
          {selectedVendor ? (
            <>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_320px]">
                <section className="rounded border border-gray-200 bg-white p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">{selectedVendor.name}</h2>
                      <p className="text-sm text-gray-500">{selectedVendor.vendor_code || "Vendor"} · {selectedVendor.vendor_type ?? "Type not set"}</p>
                      <p className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${vendorQualityLabel(selectedVendor.notes).className}`}>
                        Vendor quality: {vendorQualityLabel(selectedVendor.notes).label}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <ActionButton onClick={() => navigate(`/vendors/${selectedVendor.id}`)}>Edit</ActionButton>
                      <Button type="button" onClick={() => navigate(`/accounting/bills?vendor_id=${selectedVendor.id}`)}>
                        New transaction
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
                    <p><span className="font-semibold text-gray-600">Email:</span> {selectedVendor.email ?? "—"}</p>
                    <p><span className="font-semibold text-gray-600">Phone:</span> {selectedVendor.phone ?? "—"}</p>
                    <p><span className="font-semibold text-gray-600">Billing address:</span> {selectedVendor.address ?? "—"}</p>
                    <p><span className="font-semibold text-gray-600">Shipping address:</span> —</p>
                    <p><span className="font-semibold text-gray-600">Notes:</span> {selectedVendorPublicNotes || "—"}</p>
                    <p><span className="font-semibold text-gray-600">Custom fields:</span> —</p>
                    <p className="md:col-span-2"><span className="font-semibold text-gray-600">Bill Pay ACH info:</span> {buildAchDisplay(selectedVendor)}</p>
                  </div>
                </section>
                <section className="rounded border border-gray-200 bg-white p-3">
                  <h3 className="mb-2 text-sm font-semibold text-gray-900">Summary</h3>
                  <p className="text-sm text-gray-600">Open balance</p>
                  <p className="text-xl font-semibold text-gray-900">{fmtMoney(openByVendorId.get(selectedVendor.id) ?? 0)}</p>
                  <p className="mt-2 text-sm text-gray-600">Overdue payment</p>
                  <p className="text-lg font-semibold text-red-700">{fmtMoney(overdueCents)}</p>
                </section>
              </div>

              <SecondaryNavTabs tabs={VENDOR_TABS} activeId={activeTab} onChange={(id) => setActiveTab(id as VendorTabId)} />

              {activeTab === "transaction_list" ? (
                <div className="rounded border border-gray-200 bg-white p-3">
                  <div className="relative mb-2 flex flex-wrap items-center gap-2">
                    <SelectCombobox value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="rounded border border-gray-300 px-2 py-1 text-sm">
                      <option value="">Type: All</option>
                      <option value="bill">bill</option>
                    </SelectCombobox>
                    <ActionButton onClick={() => setShowFilterBox((open) => !open)}>Filter</ActionButton>
                    <span className="rounded border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-600">
                      {dateFrom || dateTo ? `Date: ${dateFrom || "…"} - ${dateTo || "…"}` : "Date: Any"}
                    </span>
                    <SelectCombobox value={String(pageSize)} onChange={(event) => setPageSize(Number(event.target.value) || 50)} className="h-8 min-w-[84px] text-xs">
                      <option value="50">50</option>
                      <option value="75">75</option>
                      <option value="100">100</option>
                      <option value="200">200</option>
                      <option value="300">300</option>
                    </SelectCombobox>
                    <button type="button" className="ml-auto rounded border border-gray-300 px-2 py-1 text-sm hover:bg-gray-50" onClick={() => setShowColumnChooser((open) => !open)}>⚙</button>
                    {showFilterBox ? (
                      <div className="absolute left-0 top-9 z-10 w-[320px] rounded border border-gray-200 bg-white p-2 shadow">
                        <label className="mb-1 block text-xs font-semibold text-gray-600">Status</label>
                        <SelectCombobox value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="mb-2 w-full rounded border border-gray-300 px-2 py-1 text-sm">
                          <option value="">All</option>
                          <option value="open">open</option>
                          <option value="partial">partial</option>
                          <option value="paid">paid</option>
                          <option value="voided">voided</option>
                          <option value="unpaid">unpaid</option>
                        </SelectCombobox>
                        <label className="mb-1 block text-xs font-semibold text-gray-600">Date range</label>
                        <div className="mb-2 grid grid-cols-2 gap-2">
                          <DatePicker value={dateFrom} onChange={setDateFrom} className="rounded border border-gray-300 px-2 py-1 text-sm" />
                          <DatePicker value={dateTo} onChange={setDateTo} className="rounded border border-gray-300 px-2 py-1 text-sm" />
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
                  <div className="overflow-hidden">
                    <table className="w-full table-fixed text-left text-sm">
                      <thead className="bg-gray-50 text-xs uppercase text-gray-600">
                        <tr>{COLUMN_OPTIONS.filter((column) => columns[column.key]).map((column) => <th key={column.key} className="px-2 py-1">{column.label}</th>)}</tr>
                      </thead>
                      <tbody>
                        {pagedRows.map((bill) => {
                          const open = Number(bill.balance_cents ?? Number(bill.amount_cents ?? 0) - Number(bill.paid_cents ?? 0));
                          const values: Record<ColumnKey, string> = {
                            date: bill.bill_date,
                            type: "bill",
                            doc_no: bill.bill_number ?? bill.id.slice(0, 8),
                            status: bill.status,
                            amount: fmtMoney(bill.amount_cents),
                            balance: fmtMoney(open),
                            load_no: "—",
                            settlement_no: "—",
                            truck_no: "—",
                            pickup_date: "—",
                            delivery_date: "—",
                            loaded_miles: "—",
                          };
                          return (
                            <tr key={bill.id} className="border-t border-gray-100">
                              {COLUMN_OPTIONS.filter((column) => columns[column.key]).map((column) => <td key={column.key} className="truncate px-2 py-1">{values[column.key]}</td>)}
                            </tr>
                          );
                        })}
                        {pagedRows.length === 0 ? (
                          <tr><td colSpan={COLUMN_OPTIONS.filter((column) => columns[column.key]).length} className="px-2 py-3 text-center text-sm text-gray-500">No transactions for current filters.</td></tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-600">
                    <span>{pageRangeStart}-{pageRangeEnd} of {totalRows}</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="rounded border border-gray-300 px-2 py-1 disabled:opacity-50"
                        disabled={safeCurrentPage <= 1}
                        onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                      >
                        Previous
                      </button>
                      <span>Page {safeCurrentPage} of {totalPages}</span>
                      <button
                        type="button"
                        className="rounded border border-gray-300 px-2 py-1 disabled:opacity-50"
                        disabled={safeCurrentPage >= totalPages}
                        onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </div>
              ) : activeTab === "vendor_details" ? (
                <div className="rounded border border-gray-200 bg-white p-3 text-sm text-gray-700">
                  Vendor details are shown in the header section for this layout.
                </div>
              ) : (
                <div className="rounded border border-gray-200 bg-white p-3 text-sm text-gray-500">{selectedVendorPublicNotes || "No notes."}</div>
              )}
            </>
          ) : (
            <div className="rounded border border-gray-200 bg-white p-4 text-sm text-gray-500">No vendor selected.</div>
          )}
        </main>
      </div>
      )}
    </div>
  );
}
