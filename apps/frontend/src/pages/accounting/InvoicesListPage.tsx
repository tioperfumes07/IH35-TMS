import { formatDateUS } from "../../lib/formatDate";
import { useEffect, useMemo, useState } from "react";
import { DatePicker } from "../../components/forms/DatePicker";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { EntityLink } from "../../components/shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";
import { ArrowRightCircle } from "lucide-react";
import { listInvoices, type Invoice, type InvoiceStatus } from "../../api/accounting";
import { listAllCustomers } from "../../api/mdata";
import { Button } from "../../components/Button";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { CustomerAdjustmentModal } from "./modals/CustomerAdjustmentModal";
import { DriverDamageInvoiceModal } from "./modals/DriverDamageInvoiceModal";
import { DriverMiscInvoiceModal } from "./modals/DriverMiscInvoiceModal";
import { ManualInvoiceModal } from "./modals/ManualInvoiceModal";
import { VendorChargebackModal } from "./modals/VendorChargebackModal";
import { InvoiceCreateModal } from "./InvoiceCreateModal";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { SelectCombobox } from "../../components/Combobox";
import { ReferenceSelect, type ReferenceOption } from "../../components/parity/ReferenceSelect";
import { customerFilterReferenceOptions } from "../../components/parity/referenceOptionLabels";
import { BulkActionModal, BulkProgressDialog } from "../../components/bulk";
import { bulkRowLabelsFromRows, invoiceBulkRowLabel } from "../../components/bulk/bulkRowLabels";
import { useEntityBulkAction } from "../../components/bulk/useEntityBulkAction";
import { useToast } from "../../components/Toast";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { CollapsedListFilters, useStagedListFilters } from "../../components/table";
import { useUrlSort } from "../../hooks/useUrlSort";
import { EntityPicker } from "../../components/EntityPicker";
import { userFacingApiError } from "../../lib/api-error-message";
import { VoidReasonModal } from "../../components/accounting/VoidReasonModal";
import { StatusBadge } from "../../components/layout/StatusBadge";

// INVOICE-LISTFILTER-01: real InvoiceStatus values go to the backend `status` param.
// "with_balance" is a UI label for server-side has_balance=true (aging-compatible open AR).
// "not_sent" remains a client-side derived filter over the fetched page (no server contract).
// NOTE: QBO's "Viewed" filter is intentionally NOT offered — accounting.invoices has no read-receipt /
// viewed_at tracking field, so a "Viewed" option would silently return nothing (do not fabricate).
type InvoiceListFilter = "" | InvoiceStatus | "not_sent" | "with_balance" | "active" | "posted";

const REAL_INVOICE_STATUSES: InvoiceStatus[] = ["draft", "sent", "partial", "paid", "void", "factored"];
function isRealInvoiceStatus(value: string): value is InvoiceStatus {
  return (REAL_INVOICE_STATUSES as string[]).includes(value);
}

const STATUS_OPTIONS: Array<{ value: InvoiceListFilter; label: string }> = [
  { value: "active", label: "Active (hide voided)" },
  { value: "", label: "All statuses (include voided)" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "partial", label: "Partial" },
  { value: "paid", label: "Paid" },
  { value: "posted", label: "Posted (GL)" },
  { value: "void", label: "Void" },
  { value: "factored", label: "Factored" },
  { value: "not_sent", label: "Not sent" },
  { value: "with_balance", label: "With balance" },
];

import { formatUsdCents } from "../../lib/money";

// GLB-05 -- delegates to the canonical formatter instead of reimplementing an identical
// local currency formatter (same shape lib/money.ts already covers).
function money(cents: number) {
  return formatUsdCents(cents);
}

/** LV-AR-OPEN-INCLUDES-VOIDED / ACCT-F5027 — void paper is not billed A/R. */
export function isVoidInvoice(row: Pick<Invoice, "status" | "voided_at">): boolean {
  return row.status === "void" || Boolean(row.voided_at);
}

/** amount_open_cents is GENERATED (total − paid) and stays non-zero after void — UI must force $0.
 * CUST-AR-AGING: drafts are not A/R (QBO + `getCustomerBillingSummary` `status IN ('sent','partial')`). */
export function invoiceOpenCentsForDisplay(row: Pick<Invoice, "status" | "voided_at" | "amount_open_cents">): number {
  if (isVoidInvoice(row)) return 0;
  if (row.status !== "sent" && row.status !== "partial") return 0;
  return Number(row.amount_open_cents ?? 0) || 0;
}

export function invoiceTotalCentsForAggregate(row: Pick<Invoice, "status" | "voided_at" | "total_cents">): number {
  if (isVoidInvoice(row)) return 0;
  return Number(row.total_cents ?? 0) || 0;
}

/** VIS-02 — void as first-class Status column badge (gear-togglable via ParityTable). */
export function invoiceStatusBadge(row: Pick<Invoice, "status" | "voided_at">) {
  if (isVoidInvoice(row)) {
    return <StatusBadge variant="neutral">voided</StatusBadge>;
  }
  const variant =
    row.status === "paid"
      ? "positive"
      : row.status === "draft"
        ? "info"
        : row.status === "partial"
          ? "warn"
          : "neutral";
  return <StatusBadge variant={variant}>{row.status}</StatusBadge>;
}

// A4 (STANDING-DIRECTIVES-2026-09-05.md §CC-1, OWNER-ISSUE-INVENTORY inv #14): "Need a Factored
// column." factoring_status/factor_profile_id/factoring_advance_id already existed on every real
// invoice (accounting.invoices) but rendered nowhere. accounting.invoices_factoring_status_check's
// real live CHECK constraint permits 7 states — richer than a rough "Not factored/Submitted/
// Advanced/Settled" paraphrase — every one is labeled honestly here rather than force-collapsed.
// Dash-never-blank: every branch (including an unrecognized future value) returns real text.
const FACTORING_STATUS_LABEL: Record<string, string> = {
  not_factored: "Not factored",
  submitted: "Submitted",
  advanced: "Advanced",
  reserve_held: "Reserve held",
  collected: "Collected",
  released: "Released",
  recourse_returned: "Recourse returned",
};

export function invoiceFactoredBadge(row: Pick<Invoice, "factoring_status" | "factor_profile_name" | "factoring_display_id">) {
  const status = row.factoring_status ?? "not_factored";
  const label = FACTORING_STATUS_LABEL[status] ?? status;
  const variant = status === "not_factored" ? "neutral" : status === "recourse_returned" ? "warn" : "info";
  return (
    <span className="inline-flex flex-col gap-0.5">
      <StatusBadge variant={variant}>{label}</StatusBadge>
      {row.factor_profile_name ? <span className="text-xs text-slate-500">{row.factor_profile_name}</span> : null}
    </span>
  );
}

function invoiceFilterFromSearchParams(searchParams: URLSearchParams): {
  customerId: string;
  status: InvoiceListFilter;
  hasBalance: boolean;
} {
  const customerId = searchParams.get("customer_id") ?? "";
  const hasBalanceParam = searchParams.get("has_balance") === "true";
  const statusRaw = searchParams.get("status") ?? "";
  // Legacy deep-link status=with_balance → treat as has_balance (UI still shows "With balance").
  const hasBalance = hasBalanceParam || statusRaw === "with_balance";
  let status: InvoiceListFilter = "active";
  if (hasBalance) status = "with_balance";
  else if (statusRaw === "not_sent") status = "not_sent";
  else if (statusRaw === "active") status = "active";
  else if (statusRaw === "posted") status = "posted";
  else if (statusRaw === "all") status = "";
  else if (isRealInvoiceStatus(statusRaw)) status = statusRaw;
  else if (statusRaw === "") status = "";
  return { customerId, status, hasBalance };
}

export function InvoicesListPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const { selectedCompanyId } = useCompanyContext();
  const bulk = useEntityBulkAction();
  const { sortKey, sortDirection, onSortChange } = useUrlSort();
  const [sentModalOpen, setSentModalOpen] = useState(false);
  const [factoredModalOpen, setFactoredModalOpen] = useState(false);
  const [voidModalOpen, setVoidModalOpen] = useState(false);
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [pendingVoidLabels, setPendingVoidLabels] = useState<Record<string, string>>({});
  const [batchId, setBatchId] = useState("");
  // Bidirectional URL sync: customer_id / status / has_balance are searchParams-driven so
  // same-route updates and browser back/forward stay truthful (no local-only stale seed).
  const { customerId, status, hasBalance } = invoiceFilterFromSearchParams(searchParams);
  // ACCT-F5049 — reverse Open Invoices keeps source_load_id (listInvoices already filters).
  const deepLinkSourceLoadId = searchParams.get("source_load_id");
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // One-shot migrate legacy ?status=with_balance → ?has_balance=true (replace, no history spam).
  useEffect(() => {
    if (searchParams.get("status") !== "with_balance") return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("status");
        next.set("has_balance", "true");
        return next;
      },
      { replace: true }
    );
  }, [searchParams, setSearchParams]);

  // LST-F5199 — source_load reverse filter writes URL (folded into the single combined write below).
  // LV-INVOICES-FILTER-APPLY-DROPS-FIELDS — react-router's setSearchParams closes over the
  // `searchParams` snapshot from the CURRENT render (chunk-7XGYIT3M.js:729-738), it does not chain
  // like React's useState updater across multiple synchronous calls. Calling setStatus, then
  // setCustomerId, then setSourceLoadId back-to-back each recomputed from the SAME pre-Apply prev,
  // so only the last call's diff survived — Apply silently dropped every field but one. One combined
  // write fixes it; setFromDate/setToDate stay separate since they are plain local useState (not
  // searchParams), which React's own batching composes correctly.
  function applyUrlFilters(next: { status: InvoiceListFilter; customerId: string; sourceLoadId: string }) {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.delete("status");
        params.delete("has_balance");
        if (next.status === "with_balance") params.set("has_balance", "true");
        else if (next.status === "") params.set("status", "all");
        else if (next.status === "active") params.set("status", "active");
        else if (next.status) params.set("status", next.status);
        if (next.customerId) params.set("customer_id", next.customerId);
        else params.delete("customer_id");
        if (next.sourceLoadId) params.set("source_load_id", next.sourceLoadId);
        else params.delete("source_load_id");
        return params;
      },
      { replace: true }
    );
  }
  const staged = useStagedListFilters({
    applied: { status, customerId, fromDate, toDate, sourceLoadId: deepLinkSourceLoadId || "" },
    empty: { status: "active" as InvoiceListFilter, customerId: "", fromDate: "", toDate: "", sourceLoadId: "" },
    onApply: (next) => {
      applyUrlFilters({ status: next.status, customerId: next.customerId, sourceLoadId: next.sourceLoadId });
      setFromDate(next.fromDate);
      setToDate(next.toDate);
    },
  });

  // Customer picker options — pass limit:200 (endpoint defaults to 50, would silently truncate).
  const customersQuery = useQuery({
    queryKey: ["mdata", "customers", "invoice-filter", selectedCompanyId],
    // SAF-B29: was limit 200. PROD HAS 2,693 CUSTOMERS, so this silently returned the first 200
    // alphabetically and dropped 92% of them — with no empty state, no warning, nothing to
    // indicate the list was cut. 5000 matches the convention already used by Customers.tsx,
    // CustomerDetail.tsx and NewCustomerDrawerForm. Server-side type-ahead remains B29's target
    // shape; this removes the live truncation now rather than leaving it until then.
    queryFn: () => listAllCustomers({ operating_company_id: selectedCompanyId! }),
    enabled: Boolean(selectedCompanyId),
  });
  const customerOptions = customersQuery.data?.customers ?? [];
  // FIX-06: ReferenceSelect options for the filter dropdown — "All customers" (empty value clears
  // the server-side filter) plus the canonical customer list ReferenceSelect reads/writes.
  const customerFilterOptions = useMemo<ReferenceOption[]>(
    () => customerFilterReferenceOptions(customerOptions),
    [customerOptions]
  );
  const [createType, setCreateType] = useState<"driver_damage" | "driver_misc" | "vendor_chargeback" | "customer_adjustment" | "manual" | "from_load">("from_load");
  const [openModalType, setOpenModalType] = useState<null | "driver_damage" | "driver_misc" | "vendor_chargeback" | "customer_adjustment" | "manual">(null);
  const [createFlowOpen, setCreateFlowOpen] = useState(false);
  const [tableResetKey, setTableResetKey] = useState(0);

  // ACCT-F5053 — Topbar Create→Invoice lands with ?create=1 (Bills parity); open the active create path.
  const createDeepLink = searchParams.get("create") === "1";

  function clearCreateDeepLink() {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.delete("create");
        return params;
      },
      { replace: true }
    );
  }

  useEffect(() => {
    if (!createDeepLink) return;
    if (!selectedCompanyId) return;
    if (createType === "from_load") {
      setCreateFlowOpen(true);
      return;
    }
    setOpenModalType(createType);
  }, [createDeepLink, createType, selectedCompanyId]);

  const query = useQuery({
    queryKey: [
      "accounting",
      "invoices",
      selectedCompanyId,
      status,
      hasBalance,
      customerId,
      search,
      fromDate,
      toDate,
      deepLinkSourceLoadId,
      // SORT-02 — sort/dir are part of the query identity so changing the active column refetches
      // with the new server ORDER BY instead of silently reordering a stale cached page in memory.
      sortKey,
      sortDirection,
    ],
    queryFn: () =>
      listInvoices(selectedCompanyId!, {
        status:
          status === "active"
            ? "active"
            : status === "posted"
              ? "posted"
            : status === "" || status === "not_sent" || status === "with_balance"
              ? undefined
              : isRealInvoiceStatus(status)
                ? status
                : undefined,
        has_balance: hasBalance || undefined,
        customer_id: customerId || undefined,
        search: search || undefined,
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
        source_load_id: deepLinkSourceLoadId || undefined,
        // SORT LAW — push URL sort into SQL ORDER BY; never reorder only the silent ≤100 page.
        sort: sortKey || undefined,
        dir: sortKey ? sortDirection : undefined,
        limit: 100,
        offset: 0,
      }),
    enabled: Boolean(selectedCompanyId),
  });

  const invoices = useMemo(() => {
    const all = query.data?.invoices ?? [];
    // Client-side QBO pseudo-filter only for not_sent (no server contract).
    // with_balance / has_balance is server-filtered before LIMIT — do not re-slice a page.
    if (status === "not_sent") return all.filter((row) => row.status === "draft" || !row.sent_at);
    return all;
  }, [query.data?.invoices, status]);

  const listMeta = useMemo(
    () => ({
      total: query.data?.total,
      hasMore: query.data?.has_more,
    }),
    [query.data?.total, query.data?.has_more]
  );

  const runInvoiceBulk = async (
    action: "mark_sent" | "mark_factored" | "void",
    payload?: Record<string, unknown>,
    reason?: string,
    rowLabels?: Record<string, string>
  ) => {
    if (!selectedCompanyId) {
      pushToast("Select an operating company before bulk updates.", "error");
      return;
    }
    try {
      await bulk.runBulk(
        {
          domain: "accounting",
          resource: "invoices",
          ids: pendingIds,
          action,
          payload,
          reason,
          operatingCompanyId: selectedCompanyId,
          invalidateKeys: [["accounting", "invoices", selectedCompanyId]],
          rowLabels,
        },
        () => {
          setPendingIds([]);
          setPendingVoidLabels({});
          setTableResetKey((k) => k + 1);
          void queryClient.invalidateQueries({ queryKey: ["accounting", "invoices"] });
        }
      );
    } catch (error) {
      pushToast(userFacingApiError(error, "Bulk invoice update failed"), "error");
    }
  };

  const totals = useMemo(() => {
    return invoices.reduce(
      (acc, row) => {
        // LV-AR-OPEN-INCLUDES-VOIDED: exclude void from both "Total billed" and "Open".
        // MONEY COLUMN LAW: Total / Open / Variance. Variance = Total - Paid - Open, should be 0.
        const total = invoiceTotalCentsForAggregate(row);
        const open = invoiceOpenCentsForDisplay(row);
        const paid = isVoidInvoice(row) ? 0 : Number(row.amount_paid_cents ?? 0) || 0;
        acc.total += total;
        acc.open += open;
        acc.variance += total - paid - open;
        return acc;
      },
      { total: 0, open: 0, variance: 0 }
    );
  }, [invoices]);

  const columns = useMemo<ParityColumn<Invoice>[]>(
    () => [
      {
        key: "display_id",
        label: "Invoice",
        sortable: true,
        render: (row) => (
          <span className="inline-flex items-center gap-1">
            <EntityLink kind="invoice" id={row.id} label={entityLabel(row.display_id, row.id, "Invoice")} />
            {row.factoring_advance_id ? <ArrowRightCircle className="h-3.5 w-3.5 text-slate-600" /> : null}
          </span>
        ),
      },
      {
        key: "customer_name",
        label: "Customer",
        sortable: true,
        sortValue: (row) => entityLabel(row.customer_name, row.customer_id, "Customer"),
        render: (row) => {
          const label = entityLabel(row.customer_name, row.customer_id, "Customer");
          return (
          <span title={label} className="single-line-name">
            <EntityLink kind="customer" id={row.customer_id} label={label} />
          </span>
          );
        },
      },
      { key: "issue_date", label: "Issue", sortable: true, render: (row) => formatDateUS(row.issue_date) },
      { key: "due_date", label: "Due", sortable: true, render: (row) => formatDateUS(row.due_date) },
      {
        // VIS-02 — void as first-class Status column (gear-togglable via ParityTable), not only filter text.
        key: "status",
        label: "Status",
        sortable: true,
        render: (row) => invoiceStatusBadge(row),
      },
      {
        // A4 (inv #14) — real factoring_status + factor name, dash-never-blank.
        key: "factoring_status",
        label: "Factored",
        sortable: true,
        render: (row) => invoiceFactoredBadge(row),
      },
      {
        key: "source_load_chargeback_requested",
        label: "Chargeback flag",
        sortable: true,
        sortValue: (row) => (row.source_load_chargeback_requested ? 1 : 0),
        render: (row) =>
          row.source_load_chargeback_requested ? (
            <span className="rounded-sm border border-slate-300 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-700">
              flagged
            </span>
          ) : (
            "—"
          ),
      },
      { key: "total_cents", label: "Total", sortable: true, className: "text-right", cellClass: "text-right tabular-nums", render: (row) => money(invoiceTotalCentsForAggregate(row)) },
      {
        key: "amount_open_cents",
        label: "Open",
        sortable: true,
        className: "text-right",
        cellClass: "text-right tabular-nums",
        sortValue: (row) => invoiceOpenCentsForDisplay(row),
        render: (row) => money(invoiceOpenCentsForDisplay(row)),
      },
      {
        key: "variance_cents",
        label: "Variance",
        sortable: true,
        className: "text-right",
        cellClass: "text-right tabular-nums",
        sortValue: (row) => {
          const total = invoiceTotalCentsForAggregate(row);
          const open = invoiceOpenCentsForDisplay(row);
          const paid = isVoidInvoice(row) ? 0 : Number(row.amount_paid_cents ?? 0) || 0;
          return total - paid - open;
        },
        render: (row) => {
          const total = invoiceTotalCentsForAggregate(row);
          const open = invoiceOpenCentsForDisplay(row);
          const paid = isVoidInvoice(row) ? 0 : Number(row.amount_paid_cents ?? 0) || 0;
          const variance = total - paid - open;
          return (
            <span className={`font-semibold ${variance !== 0 ? "text-red-700" : "text-slate-400"}`}>
              {money(variance)}
            </span>
          );
        },
      },
      {
        key: "source_load_id",
        label: "Load #",
        sortable: true,
        sortValue: (row) => row.source_load_id ?? "",
        render: (row) =>
          row.source_load_id ? (
            <EntityLink
              kind="load"
              id={row.source_load_id}
              label={entityLabel(row.source_load_number, row.source_load_id, "Load")}
            />
          ) : (
            "—"
          ),
      },
      {
        key: "memo",
        label: "Memo",
        sortable: true,
        sortValue: (row) => row.internal_notes ?? row.customer_notes ?? "",
        render: (row) => {
          const memo = row.internal_notes ?? row.customer_notes;
          return (
            <span title={memo ?? undefined} className="single-line-name">
              {memo || "—"}
            </span>
          );
        },
      },
    ],
    [],
  );

  const invoicesActiveFilterCount =
    (status ? 1 : 0) + (customerId ? 1 : 0) + (fromDate || toDate ? 1 : 0) + (deepLinkSourceLoadId ? 1 : 0);

  const filterBar = (
    <div className="space-y-2">
      {customersQuery.isError ? (
        <ListErrorBanner
          message={`Failed to load customer filters: ${(customersQuery.error as Error)?.message ?? "Request failed"}`}
          onRetry={() => void customersQuery.refetch()}
        />
      ) : null}
      <CollapsedListFilters
        activeFilterCount={invoicesActiveFilterCount}
        onApply={staged.apply} onReset={staged.reset} onCancel={staged.cancel} applyDisabled={!staged.dirty}
        testIdPrefix="invoices"
        dataAttributes={{ "data-invoices-filter-toolbar": "collapsed" }}
        searchSlot={
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="INV-2026-00001 or customer"
            className="min-h-12 h-12 w-56 rounded-sm border border-gray-300 px-2 text-xs"
            aria-label="Search invoices"
          />
        }
      >
        <div className="grid gap-2 md:grid-cols-4" data-testid="invoices-entity-filters">
          <label className="flex flex-col gap-1 text-[11px] text-slate-600">
            Load
            <EntityPicker
              kind="load"
              operatingCompanyId={selectedCompanyId ?? ""}
              value={staged.draft.sourceLoadId || null}
              onChange={(next) => staged.setDraft({ ...staged.draft, sourceLoadId: next ?? "" })}
              allowCreate={false}
              placeholder="All loads"
              dataTestId="invoices-filter-load"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
            Status
            <SelectCombobox value={staged.draft.status} onChange={(event) => staged.setDraft({ ...staged.draft, status: event.target.value as InvoiceListFilter })} className="h-9 rounded-sm border border-gray-300 px-2 text-xs">
              {STATUS_OPTIONS.map((option) => (
                <option key={option.label} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectCombobox>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600 md:col-span-2">
            Customer
            {/* A3/FIX-06: shared ReferenceSelect gives the customer FILTER the inline "+ Add new
                customer" row too (writes to canonical mdata.customers — same table customerOptions
                reads from). */}
            <ReferenceSelect
              value={staged.draft.customerId || null}
              onChange={(next) => staged.setDraft({ ...staged.draft, customerId: next ?? "" })}
              options={customerFilterOptions}
              createKind="customer"
              operatingCompanyId={selectedCompanyId ?? ""}
              placeholder="All customers"
              disabled={!selectedCompanyId}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
            From issue date
            <DatePicker value={staged.draft.fromDate} onChange={(next) => staged.setDraft({ ...staged.draft, fromDate: next })} className="h-9" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
            To issue date
            <DatePicker value={staged.draft.toDate} onChange={(next) => staged.setDraft({ ...staged.draft, toDate: next })} className="h-9" />
          </label>
        </div>
      </CollapsedListFilters>
      <div className="flex items-center gap-3 text-xs text-gray-600">
        {/* CLS-MONEY-KPI-FAKE-ZERO-REMAINDER — totals used to compute straight from query.data with
            no isError awareness, so a failed fetch fabricated a real-looking "$0.00" here even while
            the ListErrorBanner below correctly showed the failure. Same class already fixed for
            Bills/Settlements (ACCT-F370, PR #6024); this generalizes it here too. */}
        <span>Total billed: {query.isError ? "—" : money(totals.total)}</span>
        <span>Open: {query.isError ? "—" : money(totals.open)}</span>
        <span className={totals.variance !== 0 ? "font-semibold text-red-700" : ""}>
          Variance: {query.isError ? "—" : money(totals.variance)}
        </span>
        <span>
          Rows: {invoices.length}
          {typeof listMeta.total === "number" ? ` of ${listMeta.total}` : ""}
          {listMeta.hasMore ? " (more available)" : ""}
        </span>
      </div>
    </div>
  );

  return (
    <AccountingSubNavWrapper
      title="Invoices"
      subtitle="Accounts receivable invoice list"
      createControl={
        <div className="flex items-center gap-2">
          <SelectCombobox
            value={createType}
            onChange={(event) => setCreateType(event.target.value as typeof createType)}
            className="h-8 text-xs"
          >
            <option value="from_load">From load</option>
            <option value="driver_damage">Driver damage</option>
            <option value="driver_misc">Driver misc</option>
            <option value="vendor_chargeback">Vendor chargeback</option>
            <option value="customer_adjustment">Customer adjustment</option>
            <option value="manual">Manual</option>
          </SelectCombobox>
          <Button
            onClick={() => {
              if (createType === "from_load") {
                setCreateFlowOpen(true);
                return;
              }
              setOpenModalType(createType);
            }}
          >
            + Create
          </Button>
        </div>
      }
    >
      {query.isError ? <ListErrorBanner onRetry={() => void query.refetch()} /> : null}

      <ParityTable
        key={tableResetKey}
        columns={columns}
        rows={invoices}
        rowKey={(row) => row.id}
        loading={query.isPending || (query.isFetching && invoices.length === 0)}
        onRowClick={(row) => navigate(`/accounting/invoices/${row.id}`)}
        filterBar={filterBar}
        suppressToolbarSearch
        exportFilename="invoices"
        storageKey="invoices-list"
        initialPageSize={50}
        sortKey={sortKey}
        sortDirection={sortDirection}
        onSortChange={onSortChange}
        // SORT-02 — rows now arrive pre-ordered by the server (INVOICE_LIST_SORT_SQL ORDER BY);
        // "external" stops ParityTable's own internal re-sort, which previously reordered only
        // the already-fetched page and silently disagreed with the true population order.
        // REMAINING (disclosed, not fixed here): correct only for the fetched page — an entity
        // with more invoices than the fetch limit (has_more=true) still only gets a correctly
        // ordered PARTIAL population until real offset-paged fetching is also wired.
        sortMode="external"
        selectable
        maxSelectable={200}
        onSelectionCapExceeded={() => pushToast("You can select up to 200 invoices at once.", "error")}
        batchActions={(selected) => (
          <>
            <Button
              size="sm"
              variant="secondary"
              type="button"
              onClick={() => {
                setPendingIds(selected.map((row) => row.id));
                setSentModalOpen(true);
              }}
            >
              Mark sent
            </Button>
            <Button
              size="sm"
              variant="secondary"
              type="button"
              onClick={() => {
                setPendingIds(selected.map((row) => row.id));
                setFactoredModalOpen(true);
              }}
            >
              Mark factored
            </Button>
            <Button
              size="sm"
              variant="danger"
              type="button"
              onClick={() => {
                setPendingIds(selected.map((row) => row.id));
                setPendingVoidLabels(bulkRowLabelsFromRows(selected, invoiceBulkRowLabel));
                setVoidModalOpen(true);
              }}
            >
              {`Void ${selected.length} selected`}
            </Button>
          </>
        )}
        emptyText="No invoices found for the selected filters."
      />

      <BulkActionModal
        open={sentModalOpen}
        actionLabel="Mark sent"
        affectedCount={pendingIds.length}
        description="Mark selected draft invoices as sent."
        onCancel={() => setSentModalOpen(false)}
        onConfirm={() => {
          setSentModalOpen(false);
          void runInvoiceBulk("mark_sent");
        }}
      />

      <BulkActionModal
        open={factoredModalOpen}
        actionLabel="Mark factored"
        affectedCount={pendingIds.length}
        description="Attach selected invoices to a factoring batch."
        payloadFields={
          <label className="block text-xs text-gray-700">
            Factoring batch
            {/* C1 PICKER LAW: was a raw-UUID box on a BULK action — one mistyped id attaches every
                selected invoice to the wrong factoring batch. Read-only pick: creating an advance is
                a money document submitted to the factor, never an inline dropdown act. */}
            <EntityPicker
              kind="factoring_advance"
              operatingCompanyId={selectedCompanyId ?? ""}
              value={batchId || null}
              onChange={(next) => setBatchId(next ?? "")}
              enabled={factoredModalOpen}
              placeholder="Select factoring batch"
              className="mt-1"
            />
          </label>
        }
        onCancel={() => setFactoredModalOpen(false)}
        onConfirm={() => {
          setFactoredModalOpen(false);
          void runInvoiceBulk("mark_factored", { batch_id: batchId.trim() });
        }}
      />

      <VoidReasonModal
        open={voidModalOpen}
        title="Void invoices"
        entityRef={`${pendingIds.length} selected`}
        minLength={10}
        onClose={() => setVoidModalOpen(false)}
        onSubmit={async (reason) => {
          setVoidModalOpen(false);
          await runInvoiceBulk("void", {}, reason, pendingVoidLabels);
        }}
      />

      <BulkProgressDialog
        open={bulk.progressOpen}
        loading={bulk.progressLoading}
        requested={bulk.progress.requested}
        succeeded={bulk.progress.succeeded}
        failed={bulk.progress.failed}
        bulk_call_id={bulk.progress.bulk_call_id}
        onClose={() => bulk.setProgressOpen(false)}
        resolveRowHref={(id) => `/accounting/invoices/${encodeURIComponent(id)}`}
      />

      {selectedCompanyId ? (
        <>
          <DriverDamageInvoiceModal
            open={openModalType === "driver_damage"}
            operatingCompanyId={selectedCompanyId}
            onClose={() => {
              setOpenModalType(null);
              clearCreateDeepLink();
            }}
            onCreated={(invoiceId) => {
              setOpenModalType(null);
              clearCreateDeepLink();
              void query.refetch();
              navigate(`/accounting/invoices/${invoiceId}`);
            }}
          />
          <DriverMiscInvoiceModal
            open={openModalType === "driver_misc"}
            operatingCompanyId={selectedCompanyId}
            onClose={() => {
              setOpenModalType(null);
              clearCreateDeepLink();
            }}
            onCreated={(invoiceId) => {
              setOpenModalType(null);
              clearCreateDeepLink();
              void query.refetch();
              navigate(`/accounting/invoices/${invoiceId}`);
            }}
          />
          <VendorChargebackModal
            open={openModalType === "vendor_chargeback"}
            operatingCompanyId={selectedCompanyId}
            onClose={() => {
              setOpenModalType(null);
              clearCreateDeepLink();
            }}
            onCreated={(invoiceId) => {
              setOpenModalType(null);
              clearCreateDeepLink();
              void query.refetch();
              navigate(`/accounting/invoices/${invoiceId}`);
            }}
          />
          <CustomerAdjustmentModal
            open={openModalType === "customer_adjustment"}
            operatingCompanyId={selectedCompanyId}
            onClose={() => {
              setOpenModalType(null);
              clearCreateDeepLink();
            }}
            onCreated={(invoiceId) => {
              setOpenModalType(null);
              clearCreateDeepLink();
              void query.refetch();
              navigate(`/accounting/invoices/${invoiceId}`);
            }}
          />
          <ManualInvoiceModal
            open={openModalType === "manual"}
            operatingCompanyId={selectedCompanyId}
            onClose={() => {
              setOpenModalType(null);
              clearCreateDeepLink();
            }}
            onCreated={(invoiceId) => {
              setOpenModalType(null);
              clearCreateDeepLink();
              void query.refetch();
              navigate(`/accounting/invoices/${invoiceId}`);
            }}
          />
          <InvoiceCreateModal
            open={createFlowOpen && Boolean(selectedCompanyId)}
            operatingCompanyId={selectedCompanyId ?? ""}
            onClose={() => {
              setCreateFlowOpen(false);
              clearCreateDeepLink();
            }}
          />
        </>
      ) : null}
    </AccountingSubNavWrapper>
  );
}
