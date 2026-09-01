import { entityLabel, visibleDocumentLabel } from "../../lib/entity-label";
import { formatDateUS } from "../../lib/formatDate";
import { useEffect, useMemo, useState } from "react";
import { DatePicker } from "../../components/forms/DatePicker";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { EntityLink } from "../../components/shared/EntityLink";
import { billVendorDrillId, listBills, listPaymentsForBill, type BillPayment, type BillStatus, type VendorBill } from "../../api/accounting";
import { listVendors } from "../../api/mdata";
import { BillAllocationPanel } from "../../components/allocation";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import { ReferenceSelect, type ReferenceOption } from "../../components/parity/ReferenceSelect";
import { vendorFilterReferenceOptions } from "../../components/parity/referenceOptionLabels";
import { BulkActionModal, BulkProgressDialog } from "../../components/bulk";
import { useEntityBulkAction } from "../../components/bulk/useEntityBulkAction";
import { VoidReasonModal } from "../../components/accounting/VoidReasonModal";
import { useToast } from "../../components/Toast";
import { TasksTab } from "../../components/tasks/TasksTab";
import { Button } from "../../components/Button";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { EntityPicker } from "../../components/parity/EntityPicker";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { CollapsedListFilters, useStagedListFilters } from "../../components/table";
import { useUrlSort } from "../../hooks/useUrlSort";
import { CappedListNotice } from "../../components/CappedListNotice";
import { CreateBillModal } from "../maintenance/components/CreateBillModal";
import { companyToday, addDaysIso, monthBoundsIso } from "../../lib/businessDate";
import { userFacingApiError } from "../../lib/api-error-message";

export const BILL_LIST_CATEGORIES = ["maintenance", "repair", "fuel", "driver"] as const;
export type BillListCategory = (typeof BILL_LIST_CATEGORIES)[number];

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

function statusBadgeClass(status: BillStatus) {
  if (status === "paid") return "bg-slate-100 text-slate-700";
  if (status === "partial") return "bg-slate-100 text-slate-800";
  if (status === "voided") return "bg-gray-200 text-gray-700";
  return "bg-red-50 text-red-800";
}

// BANKREC-LISTSTATUS-01: read-only badge derived from bank.reconciliation_matches (server-side,
// rolled up from bill_payments). matched = green check, unmatched = neutral. Additive column only.
function ReconciledBadge({ isReconciled }: { isReconciled?: boolean }) {
  if (isReconciled) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
        <svg aria-hidden="true" viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2.5 6.5l2.5 2.5 4.5-5" strokeLinecap="round" strokeLinejoin="round" /></svg> Matched
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
      Unmatched
    </span>
  );
}

function parseBillCategory(raw: string | null): BillListCategory | "" {
  if (!raw) return "";
  return (BILL_LIST_CATEGORIES as readonly string[]).includes(raw) ? (raw as BillListCategory) : "";
}

/** Bill type tab id for VendorBillForm when a category filter is active. */
export function billTypeForCategory(category: BillListCategory | ""): BillListCategory | "vendor" {
  if (category) return category;
  return "vendor";
}

function billMatchesCategory(bill: VendorBill, category: BillListCategory): boolean {
  const hay = `${bill.memo ?? ""} ${bill.bill_number ?? ""} ${bill.vendor_name ?? ""}`.toLowerCase();
  if (category === "maintenance") return /maint|shop|pm\b|work.?order/.test(hay);
  if (category === "repair") return /repair|roadside|breakdown/.test(hay);
  if (category === "fuel") return /fuel|diesel|loves|def\b/.test(hay);
  return /driver|settlement|advance|payroll|escrow/.test(hay);
}

function billBalanceCents(bill: VendorBill) {
  if (bill.balance_cents != null) return Number(bill.balance_cents);
  return Number(bill.amount_cents) - Number(bill.paid_cents ?? 0);
}

// BILLS-DUEBADGE-01: per-row Overdue / Due-soon(7d) badge. Reuses the SAME open+overdue predicate the
// KPI cards use (status open|partial AND balance>0 AND due_date < today). Due-soon = due within 7 days.
// Palette: Overdue = red (bg-red-50/text-red-800, matches statusBadgeClass), Due soon = slate. No orange.
function billDueStatus(bill: VendorBill): "overdue" | "due_soon" | null {
  const isOpenWithBalance = (bill.status === "open" || bill.status === "partial") && billBalanceCents(bill) > 0;
  if (!isOpenWithBalance) return null;
  const due = bill.due_date ?? "";
  if (!due) return null;
  const today = companyToday();
  if (due < today) return "overdue";
  const in7 = addDaysIso(today, 7);
  if (due <= in7) return "due_soon";
  return null;
}

function BillDueBadge({ bill }: { bill: VendorBill }) {
  const s = billDueStatus(bill);
  if (s === "overdue") {
    return <span className="ml-1 inline-flex rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-800">Overdue</span>;
  }
  if (s === "due_soon") {
    return <span className="ml-1 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">Due soon</span>;
  }
  return null;
}

function monthStartIso() {
  return monthBoundsIso(companyToday()).start;
}

function daysAgoIso(days: number) {
  return addDaysIso(companyToday(), -days);
}

// CLS-MONEY-KPI-FAKE-ZERO-ON-FAILURE: billKpis is a useMemo derived purely from billsQuery.data,
// which defaults to [] the moment the query errors — so every tile silently rendered a real-looking
// "$0.00 · 0 open" instead of surfacing the failure the list banner (line ~589) already knows about.
// Callers must pass hasError so a failed fetch shows "—" / "Error loading", never a fabricated zero.
function billKpiCard(label: string, value: string, sublabel: string, tone: "neutral" | "warn" | "danger" = "neutral") {
  const toneClass =
    tone === "danger" ? "border-l-4 border-l-red-500" : tone === "warn" ? "border-l-4 border-l-slate-400" : "border-l-4 border-l-slate-300";
  return (
    <div className={`rounded-sm border border-gray-200 bg-white px-3 py-2 ${toneClass}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-lg font-semibold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500">{sublabel}</p>
    </div>
  );
}

// Display-only ParityTable migration of the former hand-rolled payments sub-table. The canonical
// payment drill is intentionally first: a bill's reverse Payments section must not terminate at a
// dead display row. Read-only — no actions, no posting.
const BILL_PAYMENT_COLUMNS: ParityColumn<BillPayment>[] = [
  {
    key: "id",
    label: "Payment",
    sortable: true,
    render: (p) => (
      <EntityLink
        kind="bill_payment"
        id={p.id}
        label={entityLabel(p.reference_number ?? p.check_number, p.id, "Payment")}
      />
    ),
  },
  { key: "payment_date", label: "Payment date", sortable: true, render: (p) => formatDateUS(p.payment_date) },
  { key: "amount_cents", label: "Amount", sortable: true, className: "text-right", cellClass: "text-right", render: (p) => money(p.amount_cents) },
  {
    key: "from_bank_account_id",
    label: "Bank account",
    sortable: true,
    cellClass: "font-mono text-[10px]",
    render: (p) => (
      <EntityLink
        kind="bank_account"
        id={p.from_bank_account_id ?? undefined}
        label={p.from_bank_account_id ? entityLabel(p.from_bank_account_name, p.from_bank_account_id, "Bank account") : undefined}
      />
    ),
  },
  { key: "memo", label: "Memo", sortable: true, cellClass: "text-gray-700", render: (p) => p.memo || p.reference_number || "—" },
];

function BillPaymentsSubTable({ billId, companyId }: { billId: string; companyId: string }) {
  const paymentsQuery = useQuery({
    queryKey: ["accounting", "bill-payments", companyId, billId],
    queryFn: () => listPaymentsForBill(billId, companyId),
    enabled: Boolean(companyId && billId),
  });
  const payments = paymentsQuery.data?.payments ?? [];
  if (paymentsQuery.isLoading) return <div className="text-xs text-gray-500">Loading payments…</div>;
  if (paymentsQuery.isError) {
    return (
      <ListErrorBanner
        message={`Failed to load bill payments: ${(paymentsQuery.error as Error)?.message ?? "Request failed"}`}
        onRetry={() => void paymentsQuery.refetch()}
      />
    );
  }
  if (payments.length === 0) return null;
  return (
    <ParityTable
      columns={BILL_PAYMENT_COLUMNS}
      rows={payments}
      rowKey={(p) => p.id}
      storageKey="bill-payments-subtable"
      tableTestId="bill-payments-subtable"
      emptyText="No payments recorded."
    />
  );
}

export function BillsPage() {
  const { selectedCompanyId } = useCompanyContext();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const bulk = useEntityBulkAction();
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [batchVoidOpen, setBatchVoidOpen] = useState(false);
  const [scheduledDate, setScheduledDate] = useState("");
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [tableResetKey, setTableResetKey] = useState(0);
  const companyId = selectedCompanyId ?? "";
  const [searchParams, setSearchParams] = useSearchParams();
  // BANK-SORT-ROLLOUT-ACCT: every visible column header sorts ASC/DESC; sort persists in the URL
  // (?sort=&dir=) so it survives reload / is shareable, same as the Banking register.
  const { sortKey, sortDirection, onSortChange } = useUrlSort();
  const category = parseBillCategory(searchParams.get("category"));
  const createOpen = searchParams.get("create") === "1";
  const createBillType = billTypeForCategory(category);
  // Audit 14-MAINTENANCE / 99-CROSSCUTTING: WO + legacy links use ?bill_id= — honor it (highlight + select).
  // EntityLink kind="bill" still prefers /accounting/bills/:id (BillDetailPage); this covers list deep-links.
  const deepLinkBillId = searchParams.get("bill_id");
  const [highlightedBillId, setHighlightedBillId] = useState<string | null>(() => deepLinkBillId);
  // RPT-155 / RPT-PAR-1: honor deep-link ?status=&vendor_id=&has_balance= so A/P Aging drill
  // (has_balance=true — includes partial) and legacy Pay-now unpaid land pre-filtered.
  const STATUS_FILTER_VALUES = new Set(["unpaid", "partial", "paid", "voided"]);
  const initialStatus = searchParams.get("status");
  const [status, setStatus] = useState<"" | BillStatus | "unpaid">(
    initialStatus && STATUS_FILTER_VALUES.has(initialStatus) ? (initialStatus as BillStatus | "unpaid") : ""
  );
  const hasBalance = searchParams.get("has_balance") === "true";
  // BILLS-DATERANGE-01: From/To bill_date filter (server-side via listBills date_from/date_to).
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  // CLS-BILLS-CHROME-TOOLBAR-SEARCH: chrome.toolbar_search (Required qbo_chrome) had no search
  // input on this page's own surface — every sibling accounting list (Receipts/Payments/Bill
  // Payments/Invoices/etc.) has one. Client-side over the already-loaded rows (server list caps at
  // 200, same rows already in memory) — bill number, vendor name, memo.
  const [search, setSearch] = useState("");
  // BILLS-VENDORFILTER-01: server-side vendor filter (listBills already accepts vendor_id).
  // Keep vendor_id URL-synced for aging drill same-route / back-forward.
  const vendorId = searchParams.get("vendor_id") ?? "";
  // ACCT-F5049 — reverse Open Bills carries claim/unit/load; listBills already accepts these.
  // LINK-F5171 — legal matter Open Bills carries legal_matter_id.
  const deepLinkInsuranceClaimId = searchParams.get("insurance_claim_id");
  const deepLinkLegalMatterId = searchParams.get("legal_matter_id");
  const deepLinkUnitId = searchParams.get("unit_id");
  const deepLinkLoadId = searchParams.get("load_id");
  const [allocationBillId, setAllocationBillId] = useState<string | null>(() => deepLinkBillId);

  function setVendorId(next: string) {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (next) params.set("vendor_id", next);
        else params.delete("vendor_id");
        return params;
      },
      { replace: true }
    );
  }
  // LST-F5198 — unit/load reverse filters commit via staged Apply (no silent URL helper).

  useEffect(() => {
    if (!deepLinkBillId) return;
    setHighlightedBillId(deepLinkBillId);
    setAllocationBillId(deepLinkBillId);
  }, [deepLinkBillId]);

  // Vendor picker options — pass limit:200 (endpoint defaults to 50, would silently truncate).
  const vendorsQuery = useQuery({
    queryKey: ["mdata", "vendors", "bills-filter", companyId],
    queryFn: () => listVendors({ operating_company_id: companyId, limit: 1000 }),
    enabled: Boolean(companyId),
  });
  const vendorOptions = vendorsQuery.data?.vendors ?? [];
  // BILLS-VENDORFILTER-01: ReferenceSelect options for the filter dropdown — "All vendors" (empty
  // value clears the server-side filter) plus the canonical vendor list ReferenceSelect reads/writes.
  const vendorFilterOptions = useMemo<ReferenceOption[]>(
    () => vendorFilterReferenceOptions(vendorOptions),
    [vendorOptions]
  );

  const billsQuery = useQuery({
    queryKey: [
      "accounting",
      "bills",
      companyId,
      status,
      hasBalance,
      category,
      dateFrom,
      dateTo,
      vendorId,
      deepLinkInsuranceClaimId,
      deepLinkLegalMatterId,
      deepLinkUnitId,
      deepLinkLoadId,
    ],
    queryFn: () =>
      listBills(companyId, {
        include_balance: true,
        status: status || undefined,
        has_balance: hasBalance || undefined,
        vendor_id: vendorId || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        insurance_claim_id: deepLinkInsuranceClaimId || undefined,
        legal_matter_id: deepLinkLegalMatterId || undefined,
        unit_id: deepLinkUnitId || undefined,
        load_id: deepLinkLoadId || undefined,
        limit: 200,
      }),
    enabled: Boolean(companyId),
  });

  const rows = useMemo(() => {
    const all = billsQuery.data?.rows ?? [];
    // Keep deep-linked bill visible even when a category chip would filter it out.
    let next = category
      ? all.filter((bill) => bill.id === deepLinkBillId || billMatchesCategory(bill, category))
      : [...all];
    const trimmedSearch = search.trim().toLowerCase();
    if (trimmedSearch) {
      next = next.filter((bill) => {
        if (bill.id === deepLinkBillId) return true;
        return [bill.bill_number, bill.vendor_name, bill.memo]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(trimmedSearch));
      });
    }
    if (deepLinkBillId) {
      const idx = next.findIndex((bill) => bill.id === deepLinkBillId);
      if (idx > 0) {
        const [hit] = next.splice(idx, 1);
        next = [hit, ...next];
      }
    }
    return next;
  }, [billsQuery.data?.rows, category, deepLinkBillId, search]);

  const billKpis = useMemo(() => {
    const all = billsQuery.data?.rows ?? [];
    const mtdStart = monthStartIso();
    const past90Start = daysAgoIso(90);
    const openBills = all.filter((bill) => (bill.status === "open" || bill.status === "partial") && billBalanceCents(bill) > 0);
    const mtdBills = all.filter((bill) => (bill.bill_date ?? "") >= mtdStart);
    const overdueBills = openBills.filter((bill) => (bill.due_date ?? "") < companyToday());
    const past90Bills = all.filter((bill) => (bill.bill_date ?? "") >= past90Start);
    return {
      openAmount: openBills.reduce((sum, bill) => sum + billBalanceCents(bill), 0),
      openCount: openBills.length,
      mtdAmount: mtdBills.reduce((sum, bill) => sum + Number(bill.amount_cents ?? 0), 0),
      mtdCount: mtdBills.length,
      overdueAmount: overdueBills.reduce((sum, bill) => sum + billBalanceCents(bill), 0),
      overdueCount: overdueBills.length,
      past90Amount: past90Bills.reduce((sum, bill) => sum + Number(bill.amount_cents ?? 0), 0),
      past90Count: past90Bills.length,
    };
  }, [billsQuery.data?.rows]);

  const runScheduleBulk = async () => {
    if (!companyId) {
      pushToast("Select an operating company before bulk updates.", "error");
      return;
    }
    if (!scheduledDate) {
      pushToast("Choose a scheduled payment date.", "error");
      return;
    }
    setScheduleModalOpen(false);
    try {
      await bulk.runBulk(
        {
          domain: "accounting",
          resource: "bills",
          ids: pendingIds,
          action: "mark_scheduled",
          payload: { scheduled_date: scheduledDate },
          operatingCompanyId: companyId,
          invalidateKeys: [["accounting", "bills", companyId]],
        },
        () => {
          setPendingIds([]);
          setTableResetKey((k) => k + 1);
          void queryClient.invalidateQueries({ queryKey: ["accounting", "bills"] });
        }
      );
    } catch (error) {
      pushToast(userFacingApiError(error, "Bulk bill update failed"), "error");
    }
  };

  const allocationBill = useMemo(() => rows.find((b) => b.id === allocationBillId) ?? null, [rows, allocationBillId]);

  function setCategory(next: BillListCategory | "") {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (!next) params.delete("category");
        else params.set("category", next);
        return params;
      },
      { replace: false }
    );
  }
  const staged = useStagedListFilters({
    applied: {
      category,
      status,
      vendorId,
      dateFrom,
      dateTo,
      unitId: deepLinkUnitId || "",
      loadId: deepLinkLoadId || "",
    },
    empty: {
      category: "" as const,
      status: "" as const,
      vendorId: "",
      dateFrom: "",
      dateTo: "",
      unitId: "",
      loadId: "",
    },
    onApply: (next) => {
      setCategory(next.category);
      setStatus(next.status);
      setVendorId(next.vendorId);
      setDateFrom(next.dateFrom);
      setDateTo(next.dateTo);
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          if (next.unitId) params.set("unit_id", next.unitId);
          else params.delete("unit_id");
          if (next.loadId) params.set("load_id", next.loadId);
          else params.delete("load_id");
          return params;
        },
        { replace: true },
      );
    },
  });

  function setCreateOpen(next: boolean) {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (next) params.set("create", "1");
        else params.delete("create");
        return params;
      },
      { replace: true }
    );
  }

  const columns = useMemo<ParityColumn<VendorBill>[]>(
    () => [
      { key: "vendor_name", label: "Vendor", sortable: true, render: (bill) => <EntityLink kind="vendor" id={billVendorDrillId(bill)} label={entityLabel(bill.vendor_name, bill.vendor_id, "Vendor")} /> },
      {
        key: "bill_number",
        label: "Bill #",
        sortable: true,
        // F-18 / LV-BILLS-NULL-BILL-NUMBER. entityLabel(name, id, noun) answers "can this record be
        // NAMED?" and falls back to "<noun> — not visible", which is the right words for a row whose
        // record the caller cannot see. It is the WRONG words here: the bill IS visible — the operator
        // is looking straight at its row — it simply has no document number yet. Telling an A/P clerk a
        // bill is "not visible" while showing it to them is a false statement about their own data.
        // PROD-VERIFIED 2026-08-11 via psql as neondb_owner (same-statement control, accounting.bills =
        // 16,294): USMCA holds 47 bills and exactly ONE carries bill_number IS NULL, so this is a real
        // row, not a hypothetical. It is currently voided, which is why the list does not show it today.
        // The shared helper is deliberately NOT changed — its wording is correct for the question it
        // answers, and it is used across many surfaces and guarded by
        // verify-entity-label-rejects-uuid-shaped-name. The distinction is made HERE, where the two
        // cases are actually distinguishable.
        render: (bill) => {
          const number = typeof bill.bill_number === "string" ? bill.bill_number.trim() : "";
          return (
            <EntityLink
              kind="bill"
              id={bill.id}
              label={number !== "" ? number : "No bill #"}
            />
          );
        },
      },
      { key: "bill_date", label: "Date", sortable: true, render: (bill) => formatDateUS(bill.bill_date) },
      { key: "amount_cents", label: "Original", sortable: true, className: "text-right", cellClass: "text-right", render: (bill) => money(bill.amount_cents) },
      { key: "paid_cents", label: "Paid", sortable: true, className: "text-right", cellClass: "text-right", render: (bill) => money(bill.paid_cents) },
      {
        key: "balance",
        label: "Balance",
        sortable: true,
        sortValue: (bill) => billBalanceCents(bill),
        className: "text-right",
        cellClass: "text-right font-semibold",
        render: (bill) => money(bill.balance_cents ?? Math.max(0, bill.amount_cents - bill.paid_cents)),
      },
      {
        key: "status",
        label: "Status",
        sortable: true,
        render: (bill) => <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${statusBadgeClass(bill.status)}`}>{bill.status}</span>,
      },
      {
        key: "is_reconciled",
        label: "Reconciled",
        sortable: true,
        defaultHidden: true,
        sortValue: (bill) => (bill.is_reconciled ? 1 : 0),
        render: (bill) => <ReconciledBadge isReconciled={bill.is_reconciled} />,
      },
      {
        key: "due_date",
        label: "Due date",
        sortable: true,
        render: (bill) => (
          <span className="inline-flex items-center whitespace-nowrap">
            {bill.due_date ? formatDateUS(bill.due_date) : "—"}
            <BillDueBadge bill={bill} />
          </span>
        ),
      },
      {
        key: "insurance_claim_id",
        label: "Claim",
        sortable: true,
        defaultHidden: true,
        sortValue: (bill) => bill.insurance_claim_number || bill.insurance_claim_id || "",
        render: (bill) =>
          bill.insurance_claim_id ? (
            <EntityLink
              kind="claim"
              id={bill.insurance_claim_id}
              label={entityLabel(bill.insurance_claim_number, bill.insurance_claim_id, "Claim")}
            />
          ) : (
            "—"
          ),
      },
      {
        key: "linked_work_order_uuid",
        label: "Work order",
        sortable: true,
        defaultHidden: true,
        sortValue: (bill) => bill.linked_work_order_display_id || bill.linked_work_order_uuid || "",
        render: (bill) =>
          bill.linked_work_order_uuid ? (
            <EntityLink
              kind="work_order"
              id={bill.linked_work_order_uuid}
              label={entityLabel(bill.linked_work_order_display_id, bill.linked_work_order_uuid, "Work order")}
            />
          ) : (
            "—"
          ),
      },
      {
        key: "memo",
        label: "Memo",
        sortable: true,
        defaultHidden: true,
        render: (bill) => (
          <span className="single-line-name" title={bill.memo ?? undefined}>
            {bill.memo || "—"}
          </span>
        ),
      },
      {
        key: "allocate",
        label: "Allocate",
        alwaysVisible: true,
        render: (bill) =>
          bill.status === "voided" ? (
            "—"
          ) : (
            <button
              type="button"
              className={`rounded border px-2 py-0.5 text-[11px] font-medium ${
                allocationBillId === bill.id
                  ? "border-slate-300 bg-slate-100 text-slate-700"
                  : "border-gray-300 bg-white text-gray-800 hover:bg-gray-50"
              }`}
              onClick={() => setAllocationBillId((current) => (current === bill.id ? null : bill.id))}
            >
              {allocationBillId === bill.id ? "Selected" : "Allocate"}
            </button>
          ),
      },
    ],
    [allocationBillId],
  );

  const billsActiveFilterCount =
    (category ? 1 : 0) +
    (status ? 1 : 0) +
    (vendorId ? 1 : 0) +
    (dateFrom || dateTo ? 1 : 0) +
    (deepLinkUnitId ? 1 : 0) +
    (deepLinkLoadId ? 1 : 0);

  const filterBar = (
    <div className="flex flex-col gap-2 w-full">
      {vendorsQuery.isError ? (
        <ListErrorBanner
          message={`Failed to load vendor filters: ${(vendorsQuery.error as Error)?.message ?? "Request failed"}`}
          onRetry={() => void vendorsQuery.refetch()}
        />
      ) : null}
      <CollapsedListFilters
        activeFilterCount={billsActiveFilterCount}
        onApply={staged.apply} onReset={staged.reset} onCancel={staged.cancel} applyDisabled={!staged.dirty}
        testIdPrefix="bills"
        dataAttributes={{ "data-bills-filter-toolbar": "collapsed" }}
        searchSlot={
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Bill # or vendor"
            className="min-h-12 h-12 w-56 rounded-sm border border-gray-300 px-2 text-[13px]"
            aria-label="Search bills"
            data-testid="bills-search-input"
          />
        }
      >
        <div className="flex flex-wrap items-end gap-3" data-testid="bills-entity-filters">
          <label className="text-[11px] text-slate-600">
            Unit
            <EntityPicker
              kind="unit"
              operatingCompanyId={companyId}
              value={staged.draft.unitId || null}
              onChange={(next) => staged.setDraft({ ...staged.draft, unitId: next ?? "" })}
              allowCreate={false}
              placeholder="All units"
              className="mt-1"
              dataTestId="bills-filter-unit"
            />
          </label>
          <label className="text-[11px] text-slate-600">
            Load
            <EntityPicker
              kind="load"
              operatingCompanyId={companyId}
              value={staged.draft.loadId || null}
              onChange={(next) => staged.setDraft({ ...staged.draft, loadId: next ?? "" })}
              allowCreate={false}
              placeholder="All loads"
              className="mt-1"
              dataTestId="bills-filter-load"
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-gray-600">Category:</span>
          <button
            type="button"
            className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${!staged.draft.category ? "border-slate-300 bg-slate-100 text-slate-700" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"}`}
            onClick={() => staged.setDraft({ ...staged.draft, category: "" })}
          >
            All
          </button>
          {BILL_LIST_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${
                staged.draft.category === cat ? "border-slate-300 bg-slate-100 text-slate-700" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
              }`}
              onClick={() => staged.setDraft({ ...staged.draft, category: cat })}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-gray-600">Status:</span>
          <SelectCombobox className="rounded-sm border border-gray-300 px-2 py-1" value={staged.draft.status} onChange={(e) => staged.setDraft({ ...staged.draft, status: e.target.value as typeof status })}>
            <option value="">All open items</option>
            <option value="unpaid">Unpaid</option>
            <option value="partial">Partial</option>
            <option value="paid">Paid</option>
            <option value="voided">Voided</option>
          </SelectCombobox>
          <span className="text-gray-600">Vendor:</span>
          {/* A3/FIX-06: shared ReferenceSelect gives the vendor FILTER the inline "+ Add new vendor" row
              too (writes to canonical mdata.vendors — same table vendorOptions reads from). */}
          <div className="w-56">
            <ReferenceSelect
              value={staged.draft.vendorId || null}
              onChange={(next) => staged.setDraft({ ...staged.draft, vendorId: next ?? "" })}
              options={vendorFilterOptions}
              createKind="vendor"
              operatingCompanyId={companyId}
              placeholder="All vendors"
              disabled={!companyId}
            />
            <CappedListNotice
              shown={vendorOptions.length}
              limit={1000}
              total={vendorsQuery.data?.total ?? null}
              hint="Narrow by typing in the vendor field."
              className="mt-1 text-[11px] text-slate-600"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-gray-600">From:</span>
          <DatePicker value={staged.draft.dateFrom} onChange={(next) => staged.setDraft({ ...staged.draft, dateFrom: next })} max={staged.draft.dateTo || undefined} className="w-36" />
          <span className="text-gray-600">To:</span>
          <DatePicker value={staged.draft.dateTo} onChange={(next) => staged.setDraft({ ...staged.draft, dateTo: next })} min={staged.draft.dateFrom || undefined} className="w-36" />
          {staged.draft.dateFrom || staged.draft.dateTo ? (
            <button
              type="button"
              className="rounded-full border border-gray-300 bg-white px-2.5 py-0.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              onClick={() => {
                staged.setDraft({ ...staged.draft, dateFrom: "", dateTo: "" });
              }}
            >
              Clear dates
            </button>
          ) : null}
        </div>
      </CollapsedListFilters>
    </div>
  );

  return (
    <AccountingSubNavWrapper
      title="Bills"
      subtitle="Vendor bills with paid balance and partial payment history"
      createControl={
        <Button type="button" data-testid="bills-create-cta" onClick={() => setCreateOpen(true)} disabled={!companyId}>
          + Create
        </Button>
      }
      kpiStrip={
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {billsQuery.isError ? (
            <>
              {billKpiCard("Open Bills", "—", "Error loading")}
              {billKpiCard("MTD Bills", "—", "Error loading")}
              {billKpiCard("Overdue Bills", "—", "Error loading")}
              {billKpiCard("Past 90 days", "—", "Error loading")}
            </>
          ) : (
            <>
              {billKpiCard("Open Bills", money(billKpis.openAmount), `${billKpis.openCount} open`, billKpis.openCount ? "danger" : "neutral")}
              {billKpiCard("MTD Bills", money(billKpis.mtdAmount), `${billKpis.mtdCount} bills`, "warn")}
              {billKpiCard("Overdue Bills", money(billKpis.overdueAmount), `${billKpis.overdueCount} overdue`, billKpis.overdueCount ? "danger" : "neutral")}
              {billKpiCard("Past 90 days", money(billKpis.past90Amount), `${billKpis.past90Count} bills`)}
            </>
          )}
        </div>
      }
    >
    <CreateBillModal
      open={createOpen}
      operatingCompanyId={companyId}
      initialBillType={createBillType}
      onClose={() => setCreateOpen(false)}
      onCreated={(billId) => {
        void queryClient.invalidateQueries({ queryKey: ["accounting", "bills"] });
        // LINK-F5188: CreateBillModal already hands back the real created accounting.bills id —
        // this callback used to discard it. Reuse the existing deep-link banner + row-highlight
        // mechanism (driven by highlightedBillId) instead of inventing new UI: the Bill # column
        // below already renders a real EntityLink kind="bill" per row, so highlighting the new
        // row makes it immediately drillable.
        if (billId) setHighlightedBillId(billId);
      }}
    />
    <div className="space-y-3">
      {!companyId ? <p className="text-sm text-red-600">Select an operating company.</p> : null}
      {billsQuery.isError ? <ListErrorBanner onRetry={() => void billsQuery.refetch()} /> : null}
      {highlightedBillId ? (
        <p
          className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700"
          data-testid="bills-deeplink-banner"
        >
          Deep-link bill <span className="font-mono font-semibold">{entityLabel(rows.find((r) => r.id === highlightedBillId)?.bill_number, highlightedBillId, "Bill")}</span>
          {rows.some((bill) => bill.id === highlightedBillId)
            ? " — highlighted and selected for allocation below."
            : " — not in the current filter window (widen status/vendor/dates or confirm company)."}
        </p>
      ) : null}

      <ParityTable
        key={tableResetKey}
        columns={columns}
        rows={rows}
        rowKey={(bill) => bill.id}
        loading={billsQuery.isPending || (billsQuery.isFetching && rows.length === 0)}
        filterBar={filterBar}
        exportFilename="bills"
        storageKey="bills-list"
        initialPageSize={50}
        sortKey={sortKey}
        sortDirection={sortDirection}
        onSortChange={onSortChange}
        selectable
        maxSelectable={200}
        onSelectionCapExceeded={() => pushToast("You can select up to 200 bills at once.", "error")}
        onRowClick={(bill) => {
          setHighlightedBillId(bill.id);
          setAllocationBillId(bill.id);
          const next = new URLSearchParams(searchParams);
          next.set("bill_id", bill.id);
          void navigate(`/accounting/bills?${next.toString()}`, { replace: true });
        }}
        rowClassName={(bill) => (highlightedBillId === bill.id ? "bg-slate-100" : "")}
        batchActions={(selected) => (
          <>
            <Button
              size="sm"
              variant="secondary"
              type="button"
              onClick={() => {
                setPendingIds(selected.map((bill) => bill.id));
                setScheduleModalOpen(true);
              }}
            >
              Mark scheduled
            </Button>
            <Button
              size="sm"
              variant="danger"
              type="button"
              onClick={() => {
                setPendingIds(selected.map((bill) => bill.id));
                setBatchVoidOpen(true);
              }}
            >
              Void
            </Button>
          </>
        )}
        renderExpanded={(bill) => (
          <div className="space-y-3">
            {bill.status === "partial" ? <BillPaymentsSubTable billId={bill.id} companyId={companyId} /> : null}
            <TasksTab
              operatingCompanyId={companyId}
              targetType="bill"
              targetId={bill.id}
              targetLabel={visibleDocumentLabel(bill.bill_number, bill.id, "Bill")}
            />
          </div>
        )}
        emptyText="No bills found."
      />

      <VoidReasonModal
        open={batchVoidOpen}
        title="Void bills"
        entityRef={`${pendingIds.length} selected`}
        minLength={10}
        onClose={() => setBatchVoidOpen(false)}
        onSubmit={async (reason) => {
          if (!companyId) return;
          setBatchVoidOpen(false);
          await bulk.runBulk(
            {
              domain: "accounting",
              resource: "bills",
              ids: pendingIds,
              action: "void",
              reason,
              operatingCompanyId: companyId,
              invalidateKeys: [["accounting", "bills", companyId]],
            },
            () => setPendingIds([])
          );
        }}
      />

      <BulkActionModal
        open={scheduleModalOpen}
        actionLabel="Mark scheduled"
        affectedCount={pendingIds.length}
        description="Set a scheduled payment date on selected open bills."
        payloadFields={
          <label className="block text-sm text-gray-700">
            Scheduled date
            <DatePicker
              className="mt-1 w-full"
              value={scheduledDate}
              onChange={(next) => setScheduledDate(next)}
            />
          </label>
        }
        onCancel={() => setScheduleModalOpen(false)}
        onConfirm={() => void runScheduleBulk()}
      />

      <BulkProgressDialog
        open={bulk.progressOpen}
        loading={bulk.progressLoading}
        requested={bulk.progress.requested}
        succeeded={bulk.progress.succeeded}
        failed={bulk.progress.failed}
        bulk_call_id={bulk.progress.bulk_call_id}
        onClose={() => bulk.setProgressOpen(false)}
        resolveRowHref={(id) => `/accounting/bills/${encodeURIComponent(id)}`}
      />

      {allocationBill && companyId ? (
        <BillAllocationPanel
          companyId={companyId}
          billId={allocationBill.id}
          billLabel={`${entityLabel(allocationBill.vendor_name, allocationBill.vendor_id, "Vendor")} · ${visibleDocumentLabel(allocationBill.bill_number, allocationBill.id, "Bill")}`}
          billAmountCents={allocationBill.amount_cents}
        />
      ) : null}
    </div>
    </AccountingSubNavWrapper>
  );
}
