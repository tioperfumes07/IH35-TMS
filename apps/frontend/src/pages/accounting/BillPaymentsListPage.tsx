import { entityLabel, visibleDocumentLabel } from "../../lib/entity-label";
import { humanMemo } from "./ManualJEListPage";
import { formatDateUS } from "../../lib/formatDate";
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { EntityLink } from "../../components/shared/EntityLink";
import { DatePicker } from "../../components/forms/DatePicker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listBillPayments, listBills, type BillPayment, type VendorBill, voidVendorBillPayment } from "../../api/accounting";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useAuth } from "../../auth/useAuth";
import { Button } from "../../components/Button";
import { BulkProgressDialog } from "../../components/bulk";
import { billPaymentBulkRowLabel, bulkRowLabelsFromRows } from "../../components/bulk/bulkRowLabels";
import { useEntityBulkAction } from "../../components/bulk/useEntityBulkAction";
import { VoidReasonModal } from "../../components/accounting/VoidReasonModal";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { SelectCombobox } from "../../components/Combobox";
import { useToast } from "../../components/Toast";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { BillDetailPanel } from "./BillDetailPanel";
import { PayBillModal } from "./PayBillModal";
import { CCPaymentModal } from "./bill-payments/CCPaymentModal";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { MoneyListToolbar } from "../../components/table/MoneyListToolbar";
import { MultiSelectDropdown } from "../../components/forms/MultiSelectDropdown";
import { useUrlSort } from "../../hooks/useUrlSort";
import { EntityPicker } from "../../components/EntityPicker";
import { userFacingApiError } from "../../lib/api-error-message";
import { formatUsdCents } from "../../lib/money";

// BANKREC-LISTSTATUS-01: read-only badge derived from bank.reconciliation_matches (server-side).
// matched = green check, unmatched = neutral. Additive column only.
function ReconciledBadge({ isReconciled }: { isReconciled?: boolean }) {
  if (isReconciled) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#F7F8FA] px-2 py-0.5 text-xs font-medium text-[#1F2A44]">
        <svg aria-hidden="true" viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2.5 6.5l2.5 2.5 4.5-5" strokeLinecap="round" strokeLinejoin="round" /></svg> Matched
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
      Unmatched
    </span>
  );
}

// GLB-05 -- delegates to the canonical formatter instead of reimplementing an identical
// local currency formatter (same shape lib/money.ts already covers).
function money(cents: number) {
  return formatUsdCents(cents);
}

function displayBillLabel(bill: VendorBill) {
  const remaining = Math.max(0, Number(bill.amount_cents ?? 0) - Number(bill.paid_cents ?? 0));
  const billRef = visibleDocumentLabel(bill.bill_number, bill.id, "Bill");
  const vendor = entityLabel(bill.vendor_name, bill.vendor_id, "Vendor");
  return `${vendor} · ${billRef} · Due ${bill.due_date || "-"} · ${money(remaining)}`;
}

export function BillPaymentsListPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { selectedCompanyId } = useCompanyContext();
  const { user } = useAuth();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const companyId = selectedCompanyId ?? "";

  // ROUND 297 audit (drill): a vendor's A/P tab lands here on THAT vendor (?vendor_id=).
  const [vendorId, setVendorId] = useState(() => searchParams.get("vendor_id") ?? "");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  // 432-CUR #1 — status multi-select (Active / Voided); default Active = hide voided.
  const [statusFilter, setStatusFilter] = useState<string[]>(["active"]);
  const hideVoided = statusFilter.length === 1 && statusFilter[0] === "active";
  const [search, setSearch] = useState("");
  const [selectedBillId, setSelectedBillId] = useState("");
  // ACCT-F5057 — Topbar Create→Bill payment uses ?create=1 (opens PayBillModal; select unpaid bill on page).
  const payModalOpenFromDeepLink = searchParams.get("create") === "1";
  function clearPayModalDeepLink() {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.delete("create");
        return params;
      },
      { replace: true }
    );
  }
  // CC-BILL-PAY-RECORD-BUTTON-IGNORES-SELECTOR — the on-page "+ Record Bill Payment" button must NOT
  // route through setSearchParams: this page is wrapped in a <Suspense key={pathname+search}> (see
  // routes/manifest.tsx), so any search-param change fully remounts this component and wipes
  // selectedBillId, reopening the drawer with bill=null ("No bill selected.") even though a bill was
  // clearly selected right before the click. "Pay with CC" never hit this because ccModalOpen is plain
  // local state. Local state here preserves the current selection; the ?create=1 deep-link path
  // (topbar Create→Bill payment, which intentionally opens with no bill pre-selected) is untouched.
  const [payModalOpenLocal, setPayModalOpenLocal] = useState(false);
  const payModalOpen = payModalOpenFromDeepLink || payModalOpenLocal;
  function closePayModal() {
    if (payModalOpenFromDeepLink) clearPayModalDeepLink();
    setPayModalOpenLocal(false);
  }
  const [ccModalOpen, setCcModalOpen] = useState(false);

  // BANK-SORT-ROLLOUT-ACCT: ?sort=&dir= URL persistence (same as Bills/Expenses).
  const { sortKey, sortDirection, onSortChange } = useUrlSort();

  const paymentsQuery = useQuery({
    queryKey: ["accounting", "bill-payments-list", companyId, vendorId, dateFrom, dateTo, statusFilter, search, sortKey, sortDirection],
    queryFn: () =>
      listBillPayments(companyId, {
        vendor_id: vendorId || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        include_voided: hideVoided ? undefined : true,
        // SEARCH LAW — server true-field search (amount/date/vendor/bill/ref); not capped-page client filter.
        search: search.trim() || undefined,
        // SORT LAW — push URL sort into SQL ORDER BY; never reorder only the silent ≤300 page.
        sort: sortKey || undefined,
        dir: sortKey ? sortDirection : undefined,
        limit: 300,
      }),
    enabled: Boolean(companyId),
  });

  const unpaidBillsQuery = useQuery({
    queryKey: ["accounting", "bills-has-balance", companyId],
    queryFn: () =>
      listBills(companyId, {
        has_balance: true,
        include_balance: true,
        limit: 300,
      }),
    enabled: Boolean(companyId),
  });

  /** LV-PAYABLE-SELECTOR-OFFERS-VOIDED-BILLS — never offer void paper for payment (belt after API). */
  const unpaidBillsForSelector = useMemo(() => {
    return (unpaidBillsQuery.data?.rows ?? []).filter((bill) => bill.status !== "voided");
  }, [unpaidBillsQuery.data?.rows]);

  const rows = useMemo(() => {
    // SEARCH LAW — filtering is server-side via listBillPayments search=; do not re-filter the capped page.
    return paymentsQuery.data?.rows ?? [];
  }, [paymentsQuery.data?.rows]);

  const totals = useMemo(
    () => rows.reduce((sum, row) => sum + Number(row.amount_cents ?? 0), 0),
    [rows]
  );

  const selectedBill = useMemo(() => {
    if (!selectedBillId) return null;
    return unpaidBillsForSelector.find((bill) => bill.id === selectedBillId) ?? null;
  }, [selectedBillId, unpaidBillsForSelector]);

  const voidMutation = useMutation({
    mutationFn: ({ paymentId, reason }: { paymentId: string; reason: string }) => voidVendorBillPayment(paymentId, companyId, reason),
    onSuccess: () => {
      pushToast("Bill payment voided", "success");
      void queryClient.invalidateQueries({ queryKey: ["accounting", "bill-payments-list", companyId] });
      void queryClient.invalidateQueries({ queryKey: ["accounting", "vendor-balances", companyId] });
      void queryClient.invalidateQueries({ queryKey: ["accounting", "bills-has-balance", companyId] });
    },
    onError: (error) => pushToast(userFacingApiError(error, "Void failed"), "error"),
  });

  const [voidTarget, setVoidTarget] = useState<string | null>(null);
  const bulk = useEntityBulkAction();
  const [pendingVoidIds, setPendingVoidIds] = useState<string[]>([]);
  const [pendingVoidLabels, setPendingVoidLabels] = useState<Record<string, string>>({});
  const [batchVoidOpen, setBatchVoidOpen] = useState(false);

  const canVoid = user?.role === "Owner" || user?.role === "Administrator" || user?.role === "Accountant";

  const columns = useMemo<ParityColumn<BillPayment>[]>(
    () => [
      { key: "payment_date", label: "Payment date", sortable: true, render: (row) => formatDateUS(row.payment_date) },
      { key: "amount_cents", label: "Amount", sortable: true, className: "text-right", cellClass: "text-right tabular-nums", render: (row) => money(row.amount_cents) },
      { key: "payment_method", label: "Method", sortable: true },
      {
        key: "bill_id",
        label: "Bill ID",
        sortable: true,
        render: (row) => (
          <EntityLink kind="bill" id={row.bill_id} label={visibleDocumentLabel(row.bill_number, row.bill_id, "Bill")} />
        ),
      },
      { key: "vendor_id", label: "Vendor ID", sortable: true, sortValue: (row) => row.vendor_name ?? "", render: (row) => <EntityLink kind="vendor" id={row.mdata_vendor_id} label={entityLabel(row.vendor_name, row.vendor_id, "Vendor")} /> },
      { key: "reference_number", label: "Reference", sortable: true, sortValue: (row) => row.reference_number ?? row.check_number ?? "", render: (row) => row.reference_number ?? row.check_number ?? "-" },
      { key: "memo", label: "Memo", sortable: true, sortValue: (row) => row.memo ?? "", render: (row) => row.memo ?? "-" },
      {
        key: "journal_entry_id",
        label: "JE",
        sortable: true,
        render: (row) => (
          <EntityLink
            kind="journal_entry"
            id={row.journal_entry_id ?? undefined}
            label={
              row.journal_entry_id
                ? [
                    row.journal_entry_date ? formatDateUS(row.journal_entry_date) : null,
                    humanMemo(row.journal_entry_memo),
                  ]
                    .filter((part) => part && part !== "—")
                    .join(" — ") || entityLabel(row.journal_entry_memo, row.journal_entry_id, "Journal entry")
                : undefined
            }
          />
        ),
      },
      {
        key: "matched_bank_transaction_id",
        label: "Bank transaction",
        sortable: true,
        render: (row) => (
          <EntityLink
            kind="bank_transaction"
            id={row.matched_bank_transaction_id ?? undefined}
            label={
              row.matched_bank_transaction_id
                ? row.matched_bank_transaction_date
                  ? `${formatDateUS(row.matched_bank_transaction_date)}${
                      row.matched_bank_transaction_description ? ` — ${row.matched_bank_transaction_description}` : ""
                    }`
                  : entityLabel(
                      row.matched_bank_transaction_description ?? null,
                      row.matched_bank_transaction_id,
                      "Bank transaction",
                    )
                : undefined
            }
          />
        ),
      },
      { key: "is_reconciled", label: "Reconciled", sortable: true, sortValue: (row) => (row.is_reconciled ? 1 : 0), render: (row) => <ReconciledBadge isReconciled={row.is_reconciled} /> },
      {
        // VIS-02 — void as first-class Status column (gear-togglable via ParityTable), not only Actions text.
        key: "status",
        label: "Status",
        sortable: true,
        sortValue: (row) => (row.revoked_at ? "voided" : "active"),
        render: (row) =>
          row.revoked_at ? (
            <span className="rounded-sm bg-[#E5E7EB] px-1.5 py-0.5 text-xs font-medium text-[#1F2A44]">Voided</span>
          ) : (
            <span className="rounded-sm bg-[#F7F8FA] px-1.5 py-0.5 text-xs font-medium text-[#1F2A44]">Active</span>
          ),
      },
      {
        key: "actions",
        label: "Actions",
        alwaysVisible: true,
        render: (row) =>
          canVoid && !row.revoked_at ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={(event) => {
                event.stopPropagation();
                setVoidTarget(row.id);
              }}
            >
              Void
            </Button>
          ) : row.revoked_at ? (
            <span className="text-xs font-medium text-[#6B7280]">Voided</span>
          ) : (
            "-"
          ),
      },
    ],
    [canVoid, voidMutation],
  );

  const billPayActiveFilterCount =
    (vendorId ? 1 : 0) +
    (dateFrom || dateTo ? 1 : 0) +
    (statusFilter.length === 1 && statusFilter[0] === "active" ? 0 : statusFilter.length ? 1 : 0);

  const filterBar = (
    <div className="space-y-2 w-full">
      {unpaidBillsQuery.isError ? (
        <ListErrorBanner
          message={`Failed to load unpaid bills: ${(unpaidBillsQuery.error as Error)?.message ?? "Request failed"}`}
          onRetry={() => void unpaidBillsQuery.refetch()}
        />
      ) : null}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600 min-w-[240px] flex-1">
          Unpaid bill selector
          <SelectCombobox
            className="h-9 rounded-sm border border-gray-300 px-2 text-xs"
            value={selectedBillId}
            onChange={(event) => setSelectedBillId(event.target.value)}
          >
            <option value="">Select bill to pay...</option>
            {(unpaidBillsForSelector).map((bill) => (
              <option key={bill.id} value={bill.id}>
                {displayBillLabel(bill)}
              </option>
            ))}
          </SelectCombobox>
        </label>
        <MoneyListToolbar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search payment rows"
          searchTestId="bill-payments-search-input"
          onClearAll={() => {
            setSearch("");
            setVendorId("");
            setDateFrom("");
            setDateTo("");
            setStatusFilter(["active"]);
            setSearchParams(
              (prev) => {
                const params = new URLSearchParams(prev);
                params.delete("vendor_id");
                return params;
              },
              { replace: true },
            );
          }}
          activeFilterCount={billPayActiveFilterCount}
          testIdPrefix="bill-payments"
        >
          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
            Vendor
            {/* C1 PICKER LAW: was a raw-UUID box. A list FILTER, so allowCreate={false} — vendor
                inline create already lives on ReferenceSelect (createKind="vendor") for the forms
                that need it, and C1 must extend that mechanism rather than duplicate it. */}
            <EntityPicker
              kind="vendor"
              operatingCompanyId={companyId}
              value={vendorId || null}
              onChange={(next) => {
                const id = next ?? "";
                setVendorId(id);
                setSearchParams(
                  (prev) => {
                    const params = new URLSearchParams(prev);
                    if (id) params.set("vendor_id", id);
                    else params.delete("vendor_id");
                    return params;
                  },
                  { replace: true },
                );
              }}
              allowCreate={false}
              placeholder="All vendors"
            />
          </label>
          <MultiSelectDropdown
            label="Status"
            options={[
              { value: "active", label: "Active (hide voided)" },
              { value: "voided", label: "Voided" },
            ]}
            selected={statusFilter}
            onChange={setStatusFilter}
            allLabel="All (include voided)"
            data-testid="bill-payments-status-filter"
          />
          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
            From
            <DatePicker className="h-9" value={dateFrom} onChange={setDateFrom} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
            To
            <DatePicker className="h-9" value={dateTo} onChange={setDateTo} />
          </label>
        </MoneyListToolbar>
        <div className="flex items-end text-xs text-gray-600 pb-1">
          {/* CLS-MONEY-KPI-FAKE-ZERO-REMAINDER-BILL-PAYMENTS — totals used paymentsQuery.data ?? []
              with no isError branch (ACCT-F5038). */}
          Total rows amount:{" "}
          <span className="ml-1 font-semibold text-gray-900">
            {paymentsQuery.isError ? "—" : money(totals)}
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <AccountingSubNavWrapper
      title="Bill Payments"
      subtitle="Vendor bill payment ledger"
      createControl={
        <div className="flex gap-2">
          <Button
            variant="secondary"
            disabled={!selectedBill}
            onClick={() => {
              if (!selectedBill) { pushToast("Select an unpaid bill first", "info"); return; }
              setPayModalOpenLocal(true);
            }}
          >
            + Record Bill Payment
          </Button>
          <Button
            variant="secondary"
            disabled={!selectedBill}
            onClick={() => {
              if (!selectedBill) { pushToast("Select an unpaid bill first", "info"); return; }
              setCcModalOpen(true);
            }}
          >
            Pay with CC
          </Button>
        </div>
      }
    >

      {paymentsQuery.isError ? <ListErrorBanner onRetry={() => void paymentsQuery.refetch()} /> : null}

      {selectedBill ? <BillDetailPanel bill={selectedBill} /> : null}

      <ParityTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        loading={paymentsQuery.isPending || (paymentsQuery.isFetching && rows.length === 0)}
        filterBar={filterBar}
        suppressToolbarSearch
        exportFilename="bill-payments"
        storageKey="bill-payments-list"
        initialPageSize={50}
        sortKey={sortKey}
        sortDirection={sortDirection}
        onSortChange={onSortChange}
        sortMode="external"
        onRowClick={(row) => navigate(`/accounting/bill-payments/${row.id}`)}
        selectable={canVoid}
        maxSelectable={200}
        onSelectionCapExceeded={() => pushToast("You can select up to 200 bill payments at once.", "error")}
        batchActions={(selected) =>
          canVoid ? (
            <button
              type="button"
              className="rounded-sm border border-[#E5E7EB] px-1.5 py-0.5 text-[#1F2A44]"
              onClick={() => {
                const voidable = selected.filter((row) => !row.revoked_at);
                setPendingVoidIds(voidable.map((row) => row.id));
                setPendingVoidLabels(bulkRowLabelsFromRows(voidable, billPaymentBulkRowLabel));
                setBatchVoidOpen(true);
              }}
            >
              {`Void ${selected.filter((row) => !row.revoked_at).length} selected`}
            </button>
          ) : null
        }
        emptyText="No bill payments found."
      />

      {companyId ? (
        <PayBillModal
          open={payModalOpen}
          operatingCompanyId={companyId}
          vendorName={entityLabel(selectedBill?.vendor_name, selectedBill?.vendor_id, "Vendor")}
          bill={selectedBill}
          onClose={closePayModal}
          onSaved={() => {
            closePayModal();
            pushToast("Bill payment recorded", "success");
            void queryClient.invalidateQueries({ queryKey: ["accounting", "bill-payments-list", companyId] });
            void queryClient.invalidateQueries({ queryKey: ["accounting", "vendor-balances", companyId] });
            void queryClient.invalidateQueries({ queryKey: ["accounting", "bills-has-balance", companyId] });
          }}
        />
      ) : null}

      {companyId ? (
        <CCPaymentModal
          open={ccModalOpen}
          operatingCompanyId={companyId}
          bill={selectedBill}
          onClose={() => setCcModalOpen(false)}
          onSaved={() => {
            setCcModalOpen(false);
            pushToast("CC bill payment recorded", "success");
            void queryClient.invalidateQueries({ queryKey: ["accounting", "bill-payments-list", companyId] });
            void queryClient.invalidateQueries({ queryKey: ["accounting", "vendor-balances", companyId] });
            void queryClient.invalidateQueries({ queryKey: ["accounting", "bills-has-balance", companyId] });
          }}
        />
      ) : null}
      <VoidReasonModal
        open={batchVoidOpen}
        title="Void bill payments"
        entityRef={`${pendingVoidIds.length} selected`}
        minLength={10}
        onClose={() => setBatchVoidOpen(false)}
        onSubmit={async (reason) => {
          if (!companyId || pendingVoidIds.length === 0) return;
          setBatchVoidOpen(false);
          await bulk.runBulk(
            {
              domain: "accounting",
              resource: "bill-payments",
              ids: pendingVoidIds,
              action: "void",
              reason,
              operatingCompanyId: companyId,
              invalidateKeys: [
                ["accounting", "bill-payments-list", companyId],
                ["accounting", "vendor-balances", companyId],
                ["accounting", "bills-has-balance", companyId],
              ],
              rowLabels: pendingVoidLabels,
            },
            () => {
              setPendingVoidIds([]);
              setPendingVoidLabels({});
            }
          );
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
      />
      <VoidReasonModal
        open={Boolean(voidTarget)}
        title="Void Bill Payment"
        minLength={3}
        onClose={() => setVoidTarget(null)}
        onSubmit={async (reason) => {
          if (!voidTarget) return;
          await voidMutation.mutateAsync({ paymentId: voidTarget, reason });
          setVoidTarget(null);
        }}
      />
    </AccountingSubNavWrapper>
  );
}
