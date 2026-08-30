import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { listAllCustomers } from "../../api/mdata";
import { listInvoices, type Invoice } from "../../api/accounting";
import {
  applyCreditMemo,
  createCreditMemo,
  getCreditMemo,
  listCreditMemos,
  voidCreditMemo,
  CREDIT_MEMO_REASONS,
  type CreditMemo,
  type CreditMemoApplication,
  type CreditMemoReason,
  type CreditMemoStatus,
} from "../../api/credit-memos";
import { Button } from "../../components/Button";
import { VoidReasonModal } from "../../components/accounting/VoidReasonModal";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityDrawer } from "../../components/parity/ParityDrawer";
import { EntityPicker } from "../../components/parity/EntityPicker";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { ReferenceSelect } from "../../components/parity/ReferenceSelect";
import { EntityLink } from "../../components/shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import { CollapsedListFilters, useStagedListFilters } from "../../components/table";
import { useToast } from "../../components/Toast";
import { CappedListNotice } from "../../components/CappedListNotice";
import { useAuth } from "../../auth/useAuth";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { formatDateUS } from "../../lib/formatDate";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";

// ACCT-F5606 — AR mirror of VendorCreditsPage.tsx's proven AP shape.

const WRITE_ROLES = new Set(["Owner", "Administrator", "Manager", "Accountant"]);

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

export function CreditMemosPage() {
  const { selectedCompanyId } = useCompanyContext();
  const { user } = useAuth();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const companyId = selectedCompanyId ?? "";
  const canWrite = WRITE_ROLES.has(user?.role ?? "");

  const customerFilter = searchParams.get("customer_id") ?? "";
  function setCustomerFilter(next: string) {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (next) params.set("customer_id", next);
        else params.delete("customer_id");
        return params;
      },
      { replace: true }
    );
  }
  const deepLinkCreditMemoId = searchParams.get("credit_memo_id");
  const [statusFilter, setStatusFilter] = useState<CreditMemoStatus | "">("");
  const staged = useStagedListFilters({
    applied: { statusFilter, customerId: customerFilter },
    empty: { statusFilter: "" as const, customerId: "" },
    onApply: (next) => {
      setStatusFilter(next.statusFilter);
      setCustomerFilter(next.customerId);
    },
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedCreditMemoId, setSelectedCreditMemoId] = useState<string | null>(deepLinkCreditMemoId);
  const [applyOpen, setApplyOpen] = useState(false);
  const [applyInvoiceId, setApplyInvoiceId] = useState<string | null>(null);
  const [applyAmountCents, setApplyAmountCents] = useState<number | null>(null);
  const [voidOpen, setVoidOpen] = useState(false);
  const [createCustomerId, setCreateCustomerId] = useState<string | null>(customerFilter || null);
  const [createAmountCents, setCreateAmountCents] = useState<number | null>(null);
  const [createReason, setCreateReason] = useState<CreditMemoReason>("other");
  const [createNotes, setCreateNotes] = useState("");

  const customersQuery = useQuery({
    queryKey: ["customers", "picker", companyId],
    queryFn: () => listAllCustomers({ operating_company_id: companyId }),
    enabled: Boolean(companyId),
  });
  const customerOptions = useMemo(
    () =>
      (customersQuery.data?.customers ?? []).map((c) => ({
        value: c.id,
        label: c.name ?? c.id,
      })),
    [customersQuery.data?.customers],
  );

  const creditMemosQuery = useQuery({
    queryKey: ["accounting", "credit-memos", companyId, customerFilter, statusFilter],
    queryFn: () =>
      listCreditMemos(companyId, {
        customer_id: customerFilter || undefined,
        status: statusFilter || undefined,
      }),
    enabled: Boolean(companyId),
  });
  const selectedCreditMemo = useMemo(
    () => (creditMemosQuery.data?.credit_memos ?? []).find((c) => c.id === selectedCreditMemoId) ?? null,
    [creditMemosQuery.data?.credit_memos, selectedCreditMemoId],
  );
  const creditMemoDetailQuery = useQuery({
    queryKey: ["accounting", "credit-memo", companyId, selectedCreditMemoId],
    queryFn: () => getCreditMemo(companyId, selectedCreditMemoId!),
    enabled: Boolean(companyId && selectedCreditMemoId),
  });
  const creditMemo = creditMemoDetailQuery.data?.credit_memo ?? selectedCreditMemo;
  const openInvoicesQuery = useQuery({
    queryKey: ["accounting", "credit-memo-open-invoices", companyId, creditMemo?.customer_id],
    queryFn: () => listInvoices(companyId, { customer_id: creditMemo!.customer_id, has_balance: true, limit: 500 }),
    enabled: Boolean(companyId && creditMemo?.customer_id && applyOpen),
  });

  const createMut = useMutation({
    mutationFn: () =>
      createCreditMemo(companyId, {
        customer_id: createCustomerId as string,
        amount_cents: createAmountCents as number,
        reason: createReason,
        notes: createNotes.trim() || undefined,
      }),
    onSuccess: async () => {
      pushToast("Credit memo created", "success");
      setCreateOpen(false);
      setCreateAmountCents(null);
      setCreateReason("other");
      setCreateNotes("");
      await queryClient.invalidateQueries({ queryKey: ["accounting", "credit-memos", companyId] });
    },
    onError: (err) => pushToast(err instanceof Error ? err.message : "Create failed", "error"),
  });
  const applyMut = useMutation({
    mutationFn: () =>
      applyCreditMemo(companyId, selectedCreditMemoId!, [
        { invoice_id: applyInvoiceId as string, applied_cents: applyAmountCents as number },
      ]),
    onSuccess: async () => {
      pushToast("Credit memo applied to invoice", "success");
      setApplyOpen(false);
      setApplyInvoiceId(null);
      setApplyAmountCents(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["accounting", "credit-memos", companyId] }),
        queryClient.invalidateQueries({ queryKey: ["accounting", "credit-memo", companyId, selectedCreditMemoId] }),
        queryClient.invalidateQueries({ queryKey: ["accounting", "invoices"] }),
      ]);
    },
    onError: (err) => pushToast(err instanceof Error ? err.message : "Apply failed", "error"),
  });
  const voidMut = useMutation({
    mutationFn: (reason: string) => voidCreditMemo(companyId, selectedCreditMemoId!, reason),
    onSuccess: async () => {
      pushToast("Credit memo voided", "success");
      setVoidOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["accounting", "credit-memos", companyId] }),
        queryClient.invalidateQueries({ queryKey: ["accounting", "credit-memo", companyId, selectedCreditMemoId] }),
        queryClient.invalidateQueries({ queryKey: ["accounting", "invoices"] }),
      ]);
    },
    onError: (err) => pushToast(err instanceof Error ? err.message : "Void failed", "error"),
  });

  const columns = useMemo<Array<ParityColumn<CreditMemo>>>(
    () => [
      {
        key: "display_id",
        label: "Credit memo #",
        sortable: true,
        render: (row) => entityLabel(row.display_id, row.id, "Credit memo"),
      },
      {
        key: "customer_id",
        label: "Customer",
        sortable: true,
        render: (row) => (
          <EntityLink kind="customer" id={row.customer_id} label={entityLabel(row.customer_name, row.customer_id, "Customer")} />
        ),
      },
      {
        key: "issue_date",
        label: "Issue date",
        sortable: true,
        render: (row) => formatDateUS(row.issue_date),
      },
      {
        key: "amount_cents",
        label: "Amount",
        sortable: true,
        className: "text-right",
        cellClass: "text-right tabular-nums",
        render: (row) => money(row.amount_cents),
      },
      {
        key: "amount_unapplied_cents",
        label: "Unapplied",
        sortable: true,
        className: "text-right",
        cellClass: "text-right tabular-nums font-semibold",
        render: (row) => money(row.amount_unapplied_cents),
      },
      { key: "status", label: "Status", sortable: true },
    ],
    [],
  );

  // CREDIT-MEMOS-FILTER-BADGE-FALSE-NOT-VISIBLE: this used to derive the filter-badge name ONLY from
  // creditMemosQuery's data -- which is ALREADY filtered to this same customer_id. Any customer with
  // zero credit memos (the overwhelmingly common case) made .find() return undefined, so a perfectly
  // valid, visible customer rendered as "Customer — not visible" -- a label entity-label.ts reserves
  // for a real RLS/deactivation signal (a row entity-scoped joins can't resolve). customerOptions
  // (from listAllCustomers, unfiltered by credit-memo activity) is the complete roster for this
  // company, so check it first; only fall back to the credit-memos row if the id is somehow absent
  // from the roster too (that IS a genuine not-visible signal).
  const filterCustomerName = useMemo(() => {
    if (!customerFilter) return null;
    const fromRoster = customerOptions.find((c) => c.value === customerFilter)?.label ?? null;
    if (fromRoster) return fromRoster;
    return (creditMemosQuery.data?.credit_memos ?? []).find((c) => c.customer_id === customerFilter)?.customer_name ?? null;
  }, [customerOptions, creditMemosQuery.data?.credit_memos, customerFilter]);

  const filterBar = (
    <div className="flex flex-wrap items-end gap-3" data-credit-memos-filter-toolbar="collapsed">
      <CollapsedListFilters activeFilterCount={(statusFilter ? 1 : 0) + (customerFilter ? 1 : 0)} testIdPrefix="credit-memos" onApply={staged.apply} onReset={staged.reset} onCancel={staged.cancel} applyDisabled={!staged.dirty}>
        <div className="flex flex-wrap gap-2">
          <label className="text-[11px] text-slate-600">
            Customer
            <EntityPicker
              kind="customer"
              operatingCompanyId={companyId}
              value={staged.draft.customerId || null}
              onChange={(next) => staged.setDraft({ ...staged.draft, customerId: next ?? "" })}
              allowCreate={false}
              placeholder="All customers"
              className="mt-1"
              dataTestId="credit-memos-filter-customer"
            />
          </label>
          <select
            value={staged.draft.statusFilter}
            onChange={(e) => staged.setDraft({ ...staged.draft, statusFilter: e.target.value as CreditMemoStatus | "" })}
            className="rounded-sm border border-gray-300 px-3 py-1.5 text-sm"
            aria-label="Credit memo status filter"
          >
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="issued">Issued</option>
            <option value="applied">Applied</option>
            <option value="voided">Voided</option>
          </select>
        </div>
      </CollapsedListFilters>
      {customerFilter ? (
        <span className="text-xs text-gray-600">
          Filtered to customer{" "}
          <EntityLink kind="customer" id={customerFilter} label={entityLabel(filterCustomerName, customerFilter, "Customer")} />
        </span>
      ) : null}
    </div>
  );

  return (
    <AccountingSubNavWrapper
      title="Credit memos"
      subtitle="Issued credit memos reduce A/R when applied to invoices (data-only until GL flags advance)"
      actions={
        canWrite ? (
          <Button
            onClick={() => {
              setCreateCustomerId(customerFilter || null);
              setCreateOpen(true);
            }}
          >
            + Create
          </Button>
        ) : null
      }
    >
      {creditMemosQuery.isError ? (
        <ListErrorState
          title="Couldn't load credit memos"
          status={0}
          message={(creditMemosQuery.error as Error)?.message}
          onRetry={() => void creditMemosQuery.refetch()}
        />
      ) : (
        <ParityTable
          rows={creditMemosQuery.data?.credit_memos ?? []}
          columns={columns}
          rowKey={(row) => row.id}
          loading={creditMemosQuery.isLoading}
          filterBar={filterBar}
          storageKey="accounting-credit-memos"
          tableTestId="credit-memos-table"
          emptyText="No credit memos found."
          onRowClick={(row) => setSelectedCreditMemoId(row.id)}
        />
      )}

      {/* CHROME-12: money creator -> ParityDrawer side panel (never a centered Modal), matching
          VendorCreditsPage's own layout for the same reason: a centered modal would invert the
          nested Create-customer InlineCreateDrawer opened by the ReferenceSelect below. */}
      <ParityDrawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create credit memo"
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!createCustomerId || createAmountCents == null || createAmountCents <= 0 || createMut.isPending}
              loading={createMut.isPending}
              onClick={() => createMut.mutate()}
            >
              Save
            </Button>
          </div>
        }
      >
        <div className="space-y-3 text-sm">
          <label className="block">
            <span className="text-xs font-medium text-gray-600">Customer *</span>
            <div className="mt-1">
              <ReferenceSelect
                value={createCustomerId}
                onChange={setCreateCustomerId}
                options={customerOptions}
                createKind="customer"
                operatingCompanyId={companyId}
                placeholder="Select customer"
                disabled={!companyId}
              />
              <CappedListNotice
                shown={customerOptions.length}
                limit={1000}
                total={customersQuery.data?.total ?? null}
                hint="Type in the customer field to search the full roster."
                className="mt-1 text-[11px] text-slate-600"
              />
            </div>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600">Amount *</span>
            <div className="mt-1">
              <MoneyInput
                valueCents={createAmountCents}
                onChangeCents={setCreateAmountCents}
                ariaLabel="Credit memo amount"
              />
            </div>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600">Reason *</span>
            <SelectCombobox
              value={createReason}
              onChange={(e) => setCreateReason(e.target.value as CreditMemoReason)}
              aria-label="Credit memo reason"
              className="mt-1"
            >
              {CREDIT_MEMO_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </SelectCombobox>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600">Notes</span>
            <textarea
              className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1"
              rows={2}
              value={createNotes}
              onChange={(e) => setCreateNotes(e.target.value)}
            />
          </label>
        </div>
      </ParityDrawer>

      <ParityDrawer
        open={Boolean(selectedCreditMemoId)}
        onClose={() => setSelectedCreditMemoId(null)}
        title={creditMemo ? entityLabel(creditMemo.display_id, creditMemo.id, "Credit memo") : "Credit memo"}
        size="wide"
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setSelectedCreditMemoId(null)}>
              Close
            </Button>
            {canWrite && creditMemo && creditMemo.status !== "voided" && Number(creditMemo.amount_unapplied_cents) > 0 ? (
              <Button type="button" onClick={() => setApplyOpen(true)}>
                Apply to invoice
              </Button>
            ) : null}
            {canWrite && creditMemo && creditMemo.status !== "voided" ? (
              <Button type="button" variant="danger" onClick={() => setVoidOpen(true)}>
                Void
              </Button>
            ) : null}
          </div>
        }
      >
        {creditMemoDetailQuery.isLoading ? <p className="text-sm text-slate-500">Loading credit memo...</p> : null}
        {creditMemoDetailQuery.isError ? (
          <ListErrorState
            title="Couldn't load credit memo"
            status={0}
            message={(creditMemoDetailQuery.error as Error)?.message}
            onRetry={() => void creditMemoDetailQuery.refetch()}
          />
        ) : null}
        {creditMemo ? (
          <div className="space-y-4 text-sm">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-sm border border-slate-200 bg-slate-50 p-3">
              <div>
                <dt className="text-xs font-semibold text-slate-600">Customer</dt>
                <dd className="mt-0.5">
                  <EntityLink
                    kind="customer"
                    id={creditMemo.customer_id}
                    label={entityLabel(creditMemo.customer_name, creditMemo.customer_id, "Customer")}
                  />
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-slate-600">Issue date</dt>
                <dd className="mt-0.5 text-slate-900">{formatDateUS(creditMemo.issue_date)}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-slate-600">Credit amount</dt>
                <dd className="mt-0.5 font-semibold text-slate-900">{money(creditMemo.amount_cents)}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-slate-600">Unapplied</dt>
                <dd className="mt-0.5 font-semibold text-slate-900">{money(creditMemo.amount_unapplied_cents)}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-slate-600">Reason</dt>
                <dd className="mt-0.5 text-slate-900">
                  {CREDIT_MEMO_REASONS.find((r) => r.value === creditMemo.reason)?.label ?? creditMemo.reason}
                </dd>
              </div>
            </dl>
            {creditMemo.notes ? (
              <div>
                <h3 className="text-xs font-semibold text-slate-600">Notes</h3>
                <p className="mt-1 whitespace-pre-wrap text-slate-800">{creditMemo.notes}</p>
              </div>
            ) : null}
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Applied invoices</h3>
              <CreditMemoApplications applications={creditMemoDetailQuery.data?.applications ?? []} />
            </div>
          </div>
        ) : null}
      </ParityDrawer>

      <ParityDrawer
        open={applyOpen}
        onClose={() => {
          setApplyOpen(false);
          setApplyInvoiceId(null);
          setApplyAmountCents(null);
        }}
        title="Apply credit memo to invoice"
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setApplyOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              loading={applyMut.isPending}
              disabled={!applyInvoiceId || !applyAmountCents || applyAmountCents <= 0 || applyMut.isPending}
              onClick={() => applyMut.mutate()}
            >
              Apply credit
            </Button>
          </div>
        }
      >
        <div className="space-y-3 text-sm">
          <p className="text-slate-600">
            Available credit: <span className="font-semibold text-slate-900">{money(Number(creditMemo?.amount_unapplied_cents ?? 0))}</span>
          </p>
          {openInvoicesQuery.isError ? (
            <ListErrorState
              title="Couldn't load open invoices"
              status={0}
              message={(openInvoicesQuery.error as Error)?.message}
              onRetry={() => void openInvoicesQuery.refetch()}
            />
          ) : null}
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Open invoice *</span>
            <div className="mt-1">
              <SelectCombobox
                value={applyInvoiceId ?? ""}
                onChange={(event) => setApplyInvoiceId(event.target.value || null)}
                disabled={openInvoicesQuery.isLoading}
                aria-label="Open invoice"
              >
                <option value="">Select an open invoice</option>
                {(openInvoicesQuery.data?.invoices ?? []).map((invoice: Invoice) => (
                  <option key={invoice.id} value={invoice.id}>
                    {entityLabel(invoice.display_id, invoice.id, "Invoice")} — {money(Math.max(0, Number(invoice.total_cents) - Number(invoice.amount_paid_cents)))}
                  </option>
                ))}
              </SelectCombobox>
            </div>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Apply amount *</span>
            <div className="mt-1">
              <MoneyInput valueCents={applyAmountCents} onChangeCents={setApplyAmountCents} ariaLabel="Credit memo apply amount" />
            </div>
          </label>
          <p className="text-xs text-slate-500">
            The server verifies both the remaining credit and the selected invoice&apos;s remaining balance before recording the application.
          </p>
        </div>
      </ParityDrawer>

      <VoidReasonModal
        open={voidOpen}
        title="Void credit memo"
        entityRef={
          creditMemo
            ? `${entityLabel(creditMemo.display_id, creditMemo.id, "Credit memo")} · ${money(creditMemo.amount_cents)}`
            : undefined
        }
        minLength={1}
        postsReversingEntry={false}
        onClose={() => setVoidOpen(false)}
        onSubmit={async (reason) => {
          await voidMut.mutateAsync(reason);
        }}
      />
    </AccountingSubNavWrapper>
  );
}

function CreditMemoApplications({ applications }: { applications: CreditMemoApplication[] }) {
  if (applications.length === 0) {
    return <p className="mt-1 text-sm text-slate-500">No invoices have been credited yet.</p>;
  }
  return (
    <div className="mt-2 space-y-2">
      {applications.map((application) => (
        <div key={application.id} className="flex items-center justify-between gap-3 rounded-sm border border-slate-200 px-3 py-2">
          <EntityLink kind="invoice" id={application.invoice_id} label={entityLabel(application.invoice_display_id, application.invoice_id, "Invoice")} />
          <div className="text-right text-xs text-slate-600">
            <div className="font-semibold text-slate-900">{money(application.applied_cents)}</div>
            <div>{application.voided_at ? "Voided application" : `Applied ${formatDateUS(application.applied_at)}`}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
