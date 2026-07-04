import { useEffect, useMemo, useState, type ReactNode } from "react";
import { DatePicker } from "../components/forms/DatePicker";
import { ListErrorState } from "../components/ListErrorState";
import { customerQualityKind, customerQualityClass } from "../lib/quality-badge";
import { formatUsdCents } from "../lib/money";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { listInvoices } from "../api/accounting";
import { ApiError } from "../api/client";
import { createCustomer, getCustomerBillingSummary, listCustomers, listPaymentTermOptions, type Customer, type CustomerBillingSummary } from "../api/mdata";
import {
  CustomerProfileForm,
  emptyCustomerProfileValues,
  profileValuesToCreatePayload,
  type CustomerProfileFormValues,
} from "../components/customers/CustomerProfileForm";
import { ActionButton } from "../components/shared/ActionButton";
import { SelectCombobox } from "../components/shared/SelectCombobox";
import { SecondaryNavTabs } from "../components/shared/SecondaryNavTabs";
import { PageHeader } from "../components/layout/PageHeader";
import { Modal } from "../components/Modal";
import { useToast } from "../components/Toast";
import { useCompanyContext } from "../contexts/CompanyContext";
import { displayEntityNotes } from "../lib/qboArchiveNotes";
import { CustomerCOITab } from "./customers/CustomerCOITab";
import { CustomerListSidebar } from "./customers/CustomerListSidebar";
import { CustomersListView } from "./customers/CustomersListView";
import { CustomersSyncPanel } from "./customers/CustomersSyncPanel";
import { useViewModePref } from "../hooks/useViewModePref";
import { useListState } from "../components/list-state";

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
  | "conversations"
  | "coi_requests";

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
  { id: "coi_requests", label: "COI Requests" },
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

function fmtMoney(cents: number | null | undefined) {
  return formatUsdCents(cents);
}

function customerQualityRating(paymentScore: string | null | undefined, overallFlag: "preferred" | "standard" | "caution" | "avoid") {
  // CUST-2: rate only from real data; no score/flag → neutral "No history" (was defaulting to amber "Watch").
  const kind = customerQualityKind(paymentScore, overallFlag);
  const label = kind === "good" ? "Good" : kind === "watch" ? "Watch" : kind === "late" ? "Late-pay" : "No history";
  return { label, className: customerQualityClass(kind) };
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-gray-100 py-1.5 text-sm last:border-b-0">
      <span className="shrink-0 text-xs font-semibold text-gray-500">{label}</span>
      <span className="min-w-0 break-words text-right text-gray-800">{value ?? "—"}</span>
    </div>
  );
}

// Q1 (V7): QBO-style "Customer Details" tab — fully wired from real mdata.customers fields.
function CustomerDetailsTab({
  customer,
  summary,
  onEdit,
}: {
  customer: Customer;
  summary: CustomerBillingSummary | undefined;
  onEdit: () => void;
}) {
  const dash = (v: string | number | null | undefined) => (v == null || v === "" ? "—" : String(v));
  const factoring = customer.factoring_eligible ? "Eligible" : "Not eligible";
  return (
    <div className="rounded-sm border border-gray-200 bg-white p-3">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Customer details</h3>
        <ActionButton onClick={onEdit}>Edit</ActionButton>
      </div>
      <div className="grid grid-cols-1 gap-x-6 gap-y-1 md:grid-cols-2">
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Contact info</h4>
          <DetailRow label="Customer" value={dash(customer.name)} />
          <DetailRow label="Type" value={dash(customer.customer_type)} />
          <DetailRow label="Email" value={dash(customer.email)} />
          <DetailRow label="Phone" value={dash(customer.phone)} />
          <DetailRow label="Mobile" value={dash(customer.main_contact_mobile)} />
          <DetailRow label="Fax" value={dash(customer.fax_phone)} />
          <DetailRow label="Website" value={dash(customer.website)} />
          <DetailRow label="Main contact" value={dash(customer.main_contact_name)} />
          <DetailRow label="A/R email" value={dash(customer.ar_email)} />
          <DetailRow label="A/P email" value={dash(customer.ap_email)} />
          <DetailRow label="Notes" value={dash(displayEntityNotes(customer.notes))} />
        </div>
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Additional info</h4>
          <DetailRow label="Billing address" value={dash(customer.billing_address)} />
          <DetailRow label="Billing state" value={dash(customer.billing_state)} />
          <DetailRow label="Credit limit" value={customer.credit_limit ? fmtMoney(Math.round(Number(customer.credit_limit) * 100)) : "—"} />
          <DetailRow label="Credit source" value={dash(customer.credit_limit_source)} />
          <DetailRow label="MC number" value={dash(customer.mc_number)} />
          <DetailRow label="DOT number" value={dash(customer.dot_number)} />
          <DetailRow label="Tax ID (EIN)" value={dash(customer.tax_id)} />
          <DetailRow label="Factoring" value={factoring} />
          <DetailRow label="Recourse type" value={dash(customer.factoring_recourse_type)} />
          <DetailRow label="Status" value={dash(customer.status)} />
          <DetailRow label="Open balance" value={fmtMoney(summary?.aging_buckets?.total_open ?? 0)} />
        </div>
      </div>
    </div>
  );
}

const COMING_STATE_COPY: Partial<Record<CustomerTabId, string>> = {
  activity_feed: "Activity Feed shows create/edit/payment events for this customer. It needs a customer-scoped activity endpoint (events.event_log by entity) — flagged as a follow-up.",
  statements: "Statements will render billing statements for a date range. Needs a customer statement generator endpoint — flagged as a follow-up.",
  recurring_transactions: "Recurring Transactions lists recurring invoice/charge templates for this customer. Needs a recurring-templates data source — flagged as a follow-up.",
  projects: "Projects groups loads/invoices under a customer project. Needs a projects data source — flagged as a follow-up.",
  late_fees: "Late Fees will show configured late-fee rules and applied fees. Needs a late-fee config/data source — flagged as a follow-up.",
  notes: "Notes will hold free-form customer notes and history. Needs a notes thread endpoint — flagged as a follow-up.",
  tasks: "Tasks will list follow-up tasks tied to this customer. Needs a customer-linked tasks source — flagged as a follow-up.",
  opportunities: "Opportunities tracks sales pipeline for this customer. Needs a CRM opportunities source — flagged as a follow-up.",
  conversations: "Conversations threads customer communications. Needs a conversations/messaging source — flagged as a follow-up.",
};

function CustomerTabComingState({ tab, label }: { tab: CustomerTabId; label: string }) {
  return (
    <div className="rounded-sm border border-dashed border-gray-300 bg-white p-6 text-center">
      <p className="text-sm font-semibold text-gray-700">{label}</p>
      <p className="mx-auto mt-1 max-w-md text-xs text-gray-500">
        {COMING_STATE_COPY[tab] ?? "No data source wired yet — flagged as a follow-up."}
      </p>
    </div>
  );
}

export function CustomersPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [search, setSearch] = useState("");
  const [sortByName, setSortByName] = useState<"name_asc" | "name_desc">("name_asc");
  const [activeTab, setActiveTab] = useState<CustomerTabId>("transaction_list");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [listStatus, setListStatus] = useState<"active" | "inactive" | "all">("active");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  // V8 — roster-level filters for the LEFT customer list (distinct from the transaction
  // filter box, which scopes the SELECTED customer's invoices). rosterType = broker/direct_shipper;
  // rosterCreditStatus = the business `status` field (credit_hold/blacklist), separate from the
  // Active/Inactive soft-delete tabs (deactivated_at). Both default to "" = no filter.
  const [rosterType, setRosterType] = useState<"" | "broker" | "direct_shipper">("");
  const [rosterCreditStatus, setRosterCreditStatus] = useState<"" | "active" | "inactive" | "credit_hold" | "blacklist">("");
  const [showFilterBox, setShowFilterBox] = useState(false);
  const [showColumnChooser, setShowColumnChooser] = useState(false);
  const [pageSize, setPageSize] = useState(50);
  const [currentPage, setCurrentPage] = useState(1);
  const [sidebarPage, setSidebarPage] = useState(1);
  const [sidebarPageSize, setSidebarPageSize] = useState(50);
  const [columns, setColumns] = useState<Record<ColumnKey, boolean>>(
    () => Object.fromEntries(COLUMN_OPTIONS.map((column) => [column.key, column.defaultOn])) as Record<ColumnKey, boolean>
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [createValues, setCreateValues] = useState<CustomerProfileFormValues>(emptyCustomerProfileValues);
  const [createFormError, setCreateFormError] = useState("");
  const [createFieldErrors, setCreateFieldErrors] = useState<{ legal_name?: string; mc_number?: string }>({});
  // CLOSURE-31: default to the prior "master-detail" design; "list" is opt-in only.
  const { viewMode, setViewMode } = useViewModePref("customers", "master-detail");

  const createMutation = useMutation({
    mutationFn: async () => {
      const legalName = createValues.name.trim();
      if (!legalName) {
        const error = new Error("Customer legal name is required.");
        (error as Error & { code?: string }).code = "legal_name_required";
        throw error;
      }
      return createCustomer(profileValuesToCreatePayload(createValues, companyId));
    },
    onSuccess: async (customer) => {
      await queryClient.invalidateQueries({ queryKey: ["customers", "page", companyId] });
      setCreateOpen(false);
      setCreateValues(emptyCustomerProfileValues());
      setCreateFormError("");
      setCreateFieldErrors({});
      pushToast("Customer created.", "success");
      if (customer?.id) navigate(`/customers/${customer.id}`);
    },
    onError: (error) => {
      setCreateFormError("");
      setCreateFieldErrors({});
      if ((error as Error & { code?: string }).code === "legal_name_required") {
        setCreateFieldErrors({ legal_name: "Legal name is required" });
        return;
      }
      const err = error as ApiError;
      if (err instanceof ApiError && err.status === 409) {
        setCreateFormError("Could not save customer.");
        setCreateFieldErrors({ mc_number: "Already in use" });
        pushToast("Could not save customer: duplicate customer record.", "error");
        return;
      }
      setCreateFormError("Could not save customer.");
      pushToast(String((error as Error)?.message || "Could not save customer."), "error");
    },
  });

  const customersQuery = useQuery({
    queryKey: ["customers", "page", companyId],
    // CUST-1: load the FULL customer roster (the client-side table below paginates/searches over it).
    // Without an explicit limit the endpoint returns only the default 50, hiding the rest of the roster.
    queryFn: () => listCustomers({ operating_company_id: companyId, limit: 5000 }).then((result) => result.customers),
    enabled: Boolean(companyId),
  });
  const allInvoicesQuery = useQuery({
    queryKey: ["accounting", "invoices", "all", companyId],
    queryFn: () => listInvoices(companyId),
    enabled: Boolean(companyId),
  });
  const paymentTermsQuery = useQuery({
    queryKey: ["payment-term-options"],
    queryFn: () => listPaymentTermOptions().then((r) => r.payment_terms),
    enabled: createOpen,
  });
  // LIST-EMPTY-1: shared list-state status — children render "No customers found."
  // only once this settles, never during the roster fetch.
  const customersStatus = {
    isPending: customersQuery.isPending,
    isError: customersQuery.isError,
    isFetching: customersQuery.isFetching,
  };

  // Soft-delete (Active/Inactive) list filter — canonical deactivated_at semantics,
  // mirroring the Driver Deactivate pattern. Defaults to Active.
  const visibleCustomers = useMemo(() => {
    let all = customersQuery.data ?? [];
    if (listStatus === "inactive") all = all.filter((customer) => customer.deactivated_at != null);
    else if (listStatus !== "all") all = all.filter((customer) => customer.deactivated_at == null);
    // V8 roster filters — applied here so BOTH the sidebar (visibleCustomers) and the
    // customersSorted consumers (list view, totalCount, selection) stay in sync.
    if (rosterType) all = all.filter((customer) => customer.customer_type === rosterType);
    if (rosterCreditStatus) all = all.filter((customer) => customer.status === rosterCreditStatus);
    return all;
  }, [customersQuery.data, listStatus, rosterType, rosterCreditStatus]);

  const customersSorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = visibleCustomers.filter((customer) => {
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
  }, [visibleCustomers, search, sortByName]);

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
  // Route the transactions empty state through the shared primitive so it renders
  // only once the invoices query settles, never during the in-flight fetch.
  const invoicesListState = useListState(invoicesQuery, pagedRows.length === 0);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, selectedCustomer?.id, typeFilter, statusFilter, dateFrom, dateTo, categoryFilter, pageSize]);

  useEffect(() => {
    setSidebarPage(1);
  }, [search, sortByName, sidebarPageSize, companyId, rosterType, rosterCreditStatus]);

  // AUTO-13: honest error state instead of a blank list when the customers fetch 500s.
  if (customersQuery.isError) {
    return (
      <div className="p-3">
        <ListErrorState title="Couldn't load customers" status={0} message={(customersQuery.error as Error)?.message} onRetry={() => void customersQuery.refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <PageHeader
        title="Customers"
        subtitle="Customer list and transactions"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-sm border border-gray-300 bg-white p-0.5 text-xs" data-view-mode-toggle="customers">
              <button
                type="button"
                className={`rounded-sm px-2 py-1 font-medium ${viewMode === "list" ? "bg-[#1F2A44] text-white" : "text-gray-700 hover:bg-gray-50"}`}
                onClick={() => setViewMode("list")}
              >
                List view
              </button>
              <button
                type="button"
                className={`rounded-sm px-2 py-1 font-medium ${viewMode === "master-detail" ? "bg-[#1F2A44] text-white" : "text-gray-700 hover:bg-gray-50"}`}
                onClick={() => setViewMode("master-detail")}
              >
                Master-detail
              </button>
            </div>
            <div className="inline-flex rounded-sm border border-gray-300 bg-white p-0.5 text-xs" data-list-status-filter="customers">
              {(["active", "inactive", "all"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`rounded-sm px-2 py-1 font-medium capitalize ${listStatus === value ? "bg-[#1F2A44] text-white" : "text-gray-700 hover:bg-gray-50"}`}
                  onClick={() => setListStatus(value)}
                >
                  {value}
                </button>
              ))}
            </div>
            {/* V8 — roster Type + Credit-status filters (filter the left customer list, not transactions). */}
            <SelectCombobox
              value={rosterType}
              onChange={(event) => setRosterType(event.target.value as typeof rosterType)}
              className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
              aria-label="Filter customers by type"
            >
              <option value="">All types</option>
              <option value="broker">Broker</option>
              <option value="direct_shipper">Direct shipper</option>
            </SelectCombobox>
            <SelectCombobox
              value={rosterCreditStatus}
              onChange={(event) => setRosterCreditStatus(event.target.value as typeof rosterCreditStatus)}
              className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
              aria-label="Filter customers by credit status"
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="credit_hold">Credit hold</option>
              <option value="blacklist">Blacklist</option>
            </SelectCombobox>
            <ActionButton onClick={() => setCreateOpen(true)}>
              + Create Customer
            </ActionButton>
          </div>
        }
      />
      {companyId ? <CustomersSyncPanel operatingCompanyId={companyId} /> : null}
      {viewMode === "list" ? (
        <CustomersListView
          companyId={companyId}
          customers={customersSorted}
          status={customersStatus}
          openByCustomerId={openByCustomerId}
          onSelectCustomer={(customerId) => {
            setSelectedCustomerId(customerId);
            setViewMode("master-detail");
          }}
        />
      ) : (
      <div className="flex gap-3">
        <CustomerListSidebar
          customers={visibleCustomers}
          status={customersStatus}
          totalCount={customersSorted.length}
          page={sidebarPage}
          pageSize={sidebarPageSize}
          search={search}
          sortByName={sortByName}
          selectedCustomerId={selectedCustomer?.id ?? ""}
          openByCustomerId={openByCustomerId}
          onSearchChange={setSearch}
          onSortChange={setSortByName}
          onPageChange={setSidebarPage}
          onPageSizeChange={setSidebarPageSize}
          onSelectCustomer={setSelectedCustomerId}
        />

        <main className="min-w-0 flex-1 space-y-3">
          {selectedCustomer ? (
            <>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_320px]">
                <section className="rounded-sm border border-gray-200 bg-white p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">{selectedCustomer.name}</h2>
                      <p className="text-sm text-gray-500">{selectedCustomer.customer_code || "Customer"} — {selectedCustomer.customer_type ?? "Type not set"}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            customerQualityRating(selectedCustomer.quality_payment_score, selectedCustomer.quality_overall_flag).className
                          }`}
                        >
                          {customerQualityRating(selectedCustomer.quality_payment_score, selectedCustomer.quality_overall_flag).label}
                        </span>
                        <span className="text-xs text-gray-500">
                          FMCSA: {selectedCustomer.fmcsa_authority_status_at_verification ?? "Not verified"}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <ActionButton onClick={() => navigate(`/customers/${selectedCustomer.id}`)}>Edit</ActionButton>
                      <ActionButton className="rounded-sm border border-emerald-700 bg-emerald-700 px-3 py-1 text-white hover:bg-emerald-600" onClick={() => navigate(`/accounting/invoices?customer_id=${selectedCustomer.id}`)}>
                        New transaction
                      </ActionButton>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
                    <p><span className="font-semibold text-gray-600">Email:</span> {selectedCustomer.email ?? "—"}</p>
                    <p><span className="font-semibold text-gray-600">Phone:</span> {selectedCustomer.phone ?? "—"}</p>
                    <p><span className="font-semibold text-gray-600">Billing address:</span> {selectedCustomer.billing_address ?? "—"}</p>
                    <p><span className="font-semibold text-gray-600">Shipping address:</span> —</p>
                    <p><span className="font-semibold text-gray-600">Notes:</span> {displayEntityNotes(selectedCustomer.notes) || "—"}</p>
                    <p><span className="font-semibold text-gray-600">Custom fields:</span> —</p>
                  </div>
                </section>
                <section className="rounded-sm border border-gray-200 bg-white p-3">
                  <h3 className="mb-2 text-sm font-semibold text-gray-900">Financial summary</h3>
                  <p className="text-sm text-gray-600">Open balance</p>
                  <p className="text-xl font-semibold text-gray-900">{fmtMoney(summaryQuery.data?.aging_buckets?.total_open ?? 0)}</p>
                  <p className="mt-2 text-sm text-gray-600">Overdue payment</p>
                  <p className="text-lg font-semibold text-red-700">{fmtMoney(overdue)}</p>
                </section>
              </div>

              <SecondaryNavTabs tabs={CUSTOMER_TABS} activeId={activeTab} onChange={(id) => setActiveTab(id as CustomerTabId)} />

              {activeTab === "transaction_list" ? (
                <div className="rounded-sm border border-gray-200 bg-white p-3">
                  <div className="relative mb-2 flex flex-wrap items-center gap-2">
                    <SelectCombobox value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="rounded-sm border border-gray-300 px-2 py-1 text-sm">
                      <option value="">Type: All</option>
                      <option value="from_load">from_load</option>
                      <option value="driver_damage">driver_damage</option>
                      <option value="driver_misc">driver_misc</option>
                      <option value="vendor_chargeback">vendor_chargeback</option>
                      <option value="customer_adjustment">customer_adjustment</option>
                      <option value="manual">manual</option>
                    </SelectCombobox>
                    <ActionButton onClick={() => setShowFilterBox((open) => !open)}>Filter</ActionButton>
                    <span className="rounded-sm border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-600">
                      {dateFrom || dateTo ? `Date: ${dateFrom || "…"} - ${dateTo || "…"}` : "Date: Any"}
                    </span>
                    <SelectCombobox value={String(pageSize)} onChange={(event) => setPageSize(Number(event.target.value) || 50)} className="h-8 min-w-[84px] text-xs">
                      <option value="50">50</option>
                      <option value="75">75</option>
                      <option value="100">100</option>
                      <option value="200">200</option>
                      <option value="300">300</option>
                    </SelectCombobox>
                    <button type="button" aria-label="Columns" className="ml-auto rounded-sm border border-gray-300 px-2 py-1 text-sm hover:bg-gray-50" onClick={() => setShowColumnChooser((open) => !open)}>Columns</button>
                    {showFilterBox ? (
                      <div className="absolute left-0 top-9 z-10 w-[320px] rounded-sm border border-gray-200 bg-white p-2 shadow-sm">
                        <label className="mb-1 block text-xs font-semibold text-gray-600">Status</label>
                        <SelectCombobox value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="mb-2 w-full rounded-sm border border-gray-300 px-2 py-1 text-sm">
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
                          <DatePicker value={dateFrom} onChange={setDateFrom} className="rounded-sm border border-gray-300 px-2 py-1 text-sm" />
                          <DatePicker value={dateTo} onChange={setDateTo} className="rounded-sm border border-gray-300 px-2 py-1 text-sm" />
                        </div>
                        <label className="mb-1 block text-xs font-semibold text-gray-600">Category</label>
                        <input value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="w-full rounded-sm border border-gray-300 px-2 py-1 text-sm" placeholder="Category text" />
                      </div>
                    ) : null}
                    {showColumnChooser ? (
                      <div className="absolute right-0 top-9 z-10 w-[220px] rounded-sm border border-gray-200 bg-white p-2 shadow-sm">
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
                        {pagedRows.map((invoice) => {
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
                              {COLUMN_OPTIONS.filter((column) => columns[column.key]).map((column) => <td key={column.key} className="truncate px-2 py-1">{values[column.key]}</td>)}
                            </tr>
                          );
                        })}
                        {invoicesListState.isEmpty ? (
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
                        className="rounded-sm border border-gray-300 px-2 py-1 disabled:opacity-50"
                        disabled={safeCurrentPage <= 1}
                        onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                      >
                        Previous
                      </button>
                      <span>Page {safeCurrentPage} of {totalPages}</span>
                      <button
                        type="button"
                        className="rounded-sm border border-gray-300 px-2 py-1 disabled:opacity-50"
                        disabled={safeCurrentPage >= totalPages}
                        onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </div>
              ) : activeTab === "coi_requests" ? (
                <CustomerCOITab
                  customerId={selectedCustomer.id}
                  customerName={selectedCustomer.name}
                  operatingCompanyId={companyId || undefined}
                />
              ) : activeTab === "customer_details" ? (
                <CustomerDetailsTab
                  customer={selectedCustomer}
                  summary={summaryQuery.data}
                  onEdit={() => navigate(`/customers/${selectedCustomer.id}`)}
                />
              ) : (
                <CustomerTabComingState
                  tab={activeTab}
                  label={CUSTOMER_TABS.find((t) => t.id === activeTab)?.label ?? "Coming soon"}
                />
              )}
            </>
          ) : (
            <div className="rounded-sm border border-gray-200 bg-white p-4 text-sm text-gray-500">No customer selected.</div>
          )}
        </main>
      </div>
      )}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create Customer" modalKind="customer-create" sizePreset="xl">
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            setCreateFormError("");
            setCreateFieldErrors({});
            createMutation.mutate();
          }}
        >
          {createFormError ? (
            <div role="alert" className="rounded-sm border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
              {createFormError}
            </div>
          ) : null}
          {createFieldErrors.legal_name ? (
            <span id="legal_name-error" className="block text-xs text-red-700">
              {createFieldErrors.legal_name}
            </span>
          ) : null}
          <CustomerProfileForm
            values={createValues}
            onPatch={(patch) => setCreateValues((current) => ({ ...current, ...patch }))}
            operatingCompanyId={companyId}
            mode="create"
            paymentTermOptions={paymentTermsQuery.data ?? []}
            onPaymentTermCreated={() => void paymentTermsQuery.refetch()}
          />
          {createFieldErrors.mc_number ? (
            <span id="mc_number-error" className="block text-xs text-red-700">
              {createFieldErrors.mc_number}
            </span>
          ) : null}
          <div className="flex justify-end gap-2 border-t border-gray-200 pt-3">
            <ActionButton type="button" onClick={() => setCreateOpen(false)}>
              Cancel
            </ActionButton>
            <ActionButton type="submit" disabled={createMutation.isPending || !companyId}>
              {createMutation.isPending ? "Saving..." : "Save"}
            </ActionButton>
          </div>
        </form>
      </Modal>
    </div>
  );
}
