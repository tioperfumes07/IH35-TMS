import { entityLabel } from "../../lib/entity-label";
import { formatDateUS } from "../../lib/formatDate";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EntityLink } from "../../components/shared/EntityLink";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { addInvoiceLine, deleteInvoiceLine, getAccountingSourceLineage, getInvoice, patchInvoiceLine, sendInvoice, voidInvoice, type InvoiceLine } from "../../api/accounting";
import { resolveApiUrl } from "../../api/client";
import { Button } from "../../components/Button";
import { VoidReasonModal } from "../../components/accounting/VoidReasonModal";
import { ListErrorState } from "../../components/ListErrorState";
import { DataPanel } from "../../components/layout/DataPanel";
import { DataPanelRow } from "../../components/layout/DataPanelRow";
import { PageHeader } from "../../components/forms/shared/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useToast } from "../../components/Toast";
import { RecordPaymentModal } from "./RecordPaymentModal";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { useUrlSort } from "../../hooks/useUrlSort";
import { userFacingApiError } from "../../lib/api-error-message";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

/** CUST-LINK-01 — Neon lucia invoice_lines density is sparse (~5 rows vs ~12k invoices). */
export const INVOICE_LINES_HONEST_EMPTY =
  "No invoice lines on this record. Production invoice_lines are sparse — most invoices have header totals only until line rows are posted.";

function factoringPillClass(status: string | null | undefined) {
  const base = "rounded-sm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide";
  if (status === "advanced") return `${base} bg-slate-100 text-slate-700 border border-slate-300`;
  if (status === "reserve_held" || status === "collected") return `${base} bg-slate-50 text-slate-600 border border-slate-200`;
  if (status === "released") return `${base} bg-slate-100 text-slate-700 border border-slate-200`;
  if (status === "recourse_returned") return `${base} bg-red-50 text-red-700 border border-red-200`;
  return `${base} bg-slate-50 text-slate-700 border border-slate-200`;
}

export function InvoiceDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompanyContext();
  const { pushToast } = useToast();
  // BANK-SORT-ROLLOUT-ACCT: invoice line grid sort persists in URL (?sort=&dir=).
  const { sortKey, sortDirection, onSortChange } = useUrlSort();
  const [recordPaymentOpen, setRecordPaymentOpen] = useState(false);
  // M-1: inline QBO money entry for invoice lines (replaces window.prompt). unit_amount stays CENTS.
  const [newLineDesc, setNewLineDesc] = useState("");
  const [newLineCents, setNewLineCents] = useState<number | null>(null);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [editingCents, setEditingCents] = useState<number | null>(null);

  const detailQuery = useQuery({
    queryKey: ["accounting", "invoice", selectedCompanyId, id],
    queryFn: () => getInvoice(id, selectedCompanyId!),
    enabled: Boolean(id && selectedCompanyId),
  });

  // Law §9 / P-INVOICE P0: Invoice → JE forward EntityLink via source lineage.
  const lineageQuery = useQuery({
    queryKey: ["accounting", "invoice-source-lineage", selectedCompanyId, id],
    queryFn: () =>
      getAccountingSourceLineage(selectedCompanyId!, {
        source_transaction_type: "invoice",
        source_transaction_id: id,
        limit: 50,
      }),
    enabled: Boolean(id && selectedCompanyId),
  });

  const sendMutation = useMutation({
    mutationFn: () => sendInvoice(id, selectedCompanyId!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["accounting", "invoice", selectedCompanyId, id] });
      void queryClient.invalidateQueries({ queryKey: ["accounting", "invoices"] });
    },
    onError: (error) => pushToast(userFacingApiError(error, "Failed to send invoice"), "error"),
  });

  const voidMutation = useMutation({
    mutationFn: (reason?: string) => voidInvoice(id, selectedCompanyId!, reason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["accounting", "invoice", selectedCompanyId, id] });
      void queryClient.invalidateQueries({ queryKey: ["accounting", "invoices"] });
    },
    onError: (error) => pushToast(userFacingApiError(error, "Failed to void invoice"), "error"),
  });

  const [voidOpen, setVoidOpen] = useState(false);

  const addLineMutation = useMutation({
    mutationFn: (payload: { description: string; unit_amount_cents: number }) =>
      addInvoiceLine(id, selectedCompanyId!, {
        line_type: "linehaul",
        quantity: 1,
        description: payload.description,
        unit_amount_cents: payload.unit_amount_cents,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["accounting", "invoice", selectedCompanyId, id] });
      void queryClient.invalidateQueries({ queryKey: ["accounting", "invoices"] });
    },
    onError: (error) => pushToast(userFacingApiError(error, "Failed to add invoice line"), "error"),
  });

  const patchLineMutation = useMutation({
    mutationFn: ({ lineId, unit_amount_cents }: { lineId: string; unit_amount_cents: number }) =>
      patchInvoiceLine(id, lineId, selectedCompanyId!, { unit_amount_cents }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["accounting", "invoice", selectedCompanyId, id] });
      void queryClient.invalidateQueries({ queryKey: ["accounting", "invoices"] });
    },
    onError: (error) => pushToast(userFacingApiError(error, "Failed to update invoice line"), "error"),
  });

  const deleteLineMutation = useMutation({
    mutationFn: (lineId: string) => deleteInvoiceLine(id, lineId, selectedCompanyId!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["accounting", "invoice", selectedCompanyId, id] });
      void queryClient.invalidateQueries({ queryKey: ["accounting", "invoices"] });
    },
    onError: (error) => pushToast(userFacingApiError(error, "Failed to delete invoice line"), "error"),
  });

  const invoice = detailQuery.data;
  const isDraft = invoice?.status === "draft";
  const canRecordPayment = invoice?.status === "sent" || invoice?.status === "partial";
  const lineCount = invoice?.lines?.length ?? 0;

  // LV-SEND-NOREASON: a disabled primary action must announce why to users and assistive tech.
  const sendDisabledReason = (() => {
    if (!invoice) return undefined;
    if (lineCount === 0) return "Add at least one line item before sending the invoice.";
    if (!isDraft) return `This invoice is ${invoice.status.replaceAll("_", " ")}. Only draft invoices can be sent.`;
    return undefined;
  })();
  const sendButtonId = "invoice-send-disabled-reason";

  const journalEntryIds = useMemo(() => {
    const rows = lineageQuery.data?.rows ?? [];
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const row of rows) {
      const jeId = String(row.journal_entry_id ?? "").trim();
      if (!jeId || seen.has(jeId)) continue;
      seen.add(jeId);
      ids.push(jeId);
    }
    return ids;
  }, [lineageQuery.data?.rows]);

  const totals = useMemo(
    () => ({
      subtotal: money(Number(invoice?.subtotal_cents ?? 0)),
      tax: money(Number(invoice?.tax_cents ?? 0)),
      total: money(Number(invoice?.total_cents ?? 0)),
      open: money(Number(invoice?.amount_open_cents ?? 0)),
    }),
    [invoice]
  );

  if (detailQuery.isLoading) return <div className="text-sm text-gray-500">Loading invoice...</div>;
  if (detailQuery.isError)
    return (
      <ListErrorState
        title="Couldn't load invoice"
        status={0}
        message={(detailQuery.error as Error | undefined)?.message}
        onRetry={() => void detailQuery.refetch()}
      />
    );
  if (!invoice) return <div className="text-sm text-red-600">Invoice not found.</div>;

  // QBO-parity grid — columns, order, and the inline draft edit/delete actions preserved verbatim
  // from the former hand-rolled table.
  const lineColumns: Array<ParityColumn<InvoiceLine>> = [
    { key: "line_type", label: "Type", sortable: true },
    { key: "description", label: "Description", sortable: true },
    {
      key: "account_id",
      label: "Income account",
      sortable: true,
      sortValue: (line) => entityLabel(line.income_account_name, line.account_id, "Account"),
      render: (line) => {
        if (!line.account_id) return <span className="text-gray-400">—</span>;
        const label =
          line.income_account_number && line.income_account_name
            ? `${line.income_account_number} - ${line.income_account_name}`
            : entityLabel(line.income_account_name, line.account_id, "Account");
        return (
          <Link
            to={`/accounting/chart-of-accounts/register/${line.account_id}`}
            className="text-slate-700 hover:underline"
            onClick={(event) => event.stopPropagation()}
          >
            {label}
          </Link>
        );
      },
    },
    { key: "quantity", label: "Qty", sortable: true },
    { key: "unit_amount_cents", label: "Unit", sortable: true, render: (line) => money(line.unit_amount_cents) },
    { key: "line_total_cents", label: "Total", sortable: true, render: (line) => money(line.line_total_cents) },
    {
      key: "actions",
      label: "Actions",
      render: (line) => {
        if (!isDraft) return "-";
        if (editingLineId === line.id) {
          // M-1: inline QBO MoneyInput edit (cents-mode) — replaces window.prompt("…cents").
          return (
            <div className="flex items-center gap-1">
              <MoneyInput valueCents={editingCents} onChangeCents={setEditingCents} className="w-24" ariaLabel="Edit unit amount" />
              <Button
                size="sm"
                onClick={() => {
                  patchLineMutation.mutate({ lineId: line.id, unit_amount_cents: Math.trunc(editingCents ?? 0) });
                  setEditingLineId(null);
                }}
              >
                Save
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setEditingLineId(null)}>
                Cancel
              </Button>
            </div>
          );
        }
        return (
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setEditingLineId(line.id);
                setEditingCents(line.unit_amount_cents);
              }}
            >
              Edit
            </Button>
            <Button size="sm" variant="danger" onClick={() => deleteLineMutation.mutate(line.id)}>
              Delete
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <AccountingSubNavWrapper>
      <PageHeader
        title={invoice.display_id}
        backHref="/accounting/invoices"
        breadcrumb={[
          { label: "Accounting", href: "/accounting" },
          { label: "Invoices", href: "/accounting/invoices" },
          { label: invoice.display_id },
        ]}
        subtitle={entityLabel(invoice.customer_name, invoice.customer_id, "Customer")}
        actions={
          <div className="flex gap-2">
            {canRecordPayment ? (
              <Button variant="secondary" onClick={() => setRecordPaymentOpen(true)}>
                Record Payment
              </Button>
            ) : null}
            <Button variant="secondary" onClick={() => window.print()}>
              Print
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                window.open(
                  resolveApiUrl(
                    `/api/v1/accounting/invoices/${encodeURIComponent(id)}.html?operating_company_id=${encodeURIComponent(selectedCompanyId!)}`
                  ),
                  "_blank",
                  "noopener,noreferrer"
                )
              }
            >
              View invoice PDF
            </Button>
            <span className="inline-flex items-center gap-2">
              <Button
                onClick={() => sendMutation.mutate()}
                loading={sendMutation.isPending}
                disabled={!isDraft || lineCount === 0}
                aria-disabled={(!isDraft || lineCount === 0) ? "true" : undefined}
                aria-describedby={sendDisabledReason ? sendButtonId : undefined}
                title={sendDisabledReason ?? "Send invoice to customer"}
              >
                Send
              </Button>
              {sendDisabledReason ? (
                <span id={sendButtonId} className="text-xs text-gray-600">
                  {sendDisabledReason}
                </span>
              ) : null}
            </span>
            <Button
              variant="danger"
              onClick={() => setVoidOpen(true)}
              disabled={invoice.status === "paid" || invoice.status === "void"}
            >
              Void
            </Button>
            <VoidReasonModal
              open={voidOpen}
              title="Void Invoice"
              minLength={1}
              onClose={() => setVoidOpen(false)}
              onSubmit={async (reason) => {
                await voidMutation.mutateAsync(reason);
                setVoidOpen(false);
              }}
            />
          </div>
        }
      />

      {invoice.source_load_chargeback_requested ? (
        <div className="rounded-sm border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-800">
          <div className="font-semibold uppercase tracking-wide">Chargeback flag</div>
          <div>{invoice.source_load_chargeback_reason || "This invoice is tied to a load marked for customer chargeback review."}</div>
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-3">
        <DataPanel title="Header">
          <DataPanelRow>
            <span className="text-xs text-gray-600">Customer</span>
            <span className="text-sm text-gray-900">
              <EntityLink
                kind="customer"
                id={invoice.customer_id}
                label={entityLabel(invoice.customer_name, invoice.customer_id, "Customer")}
              />
            </span>
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs text-gray-600">Status</span>
            <span className="text-sm font-semibold text-gray-900">{invoice.status}</span>
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs text-gray-600">Issue Date</span>
            <span className="text-sm text-gray-900">{formatDateUS(invoice.issue_date)}</span>
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs text-gray-600">Due Date</span>
            <span className="text-sm text-gray-900">{formatDateUS(invoice.due_date)}</span>
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs text-gray-600">Source Load</span>
            <span className="text-sm text-gray-900">
              <EntityLink
                kind="load"
                id={invoice.source_load_id ?? undefined}
                label={
                  invoice.source_load_id
                    ? entityLabel(invoice.source_load_number, invoice.source_load_id, "Load")
                    : "-"
                }
              />
            </span>
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs text-gray-600">Journal Entry</span>
            <span className="text-sm text-gray-900" data-testid="invoice-journal-entry-links">
              {lineageQuery.isError ? (
                <span className="text-red-600">Could not load JE links</span>
              ) : journalEntryIds.length === 0 ? (
                <span className="text-gray-500">—</span>
              ) : (
                <span className="inline-flex flex-wrap gap-2">
                  {journalEntryIds.map((jeId) => (
                    <EntityLink key={jeId} kind="journal_entry" id={jeId} label={entityLabel(null, jeId, "Journal entry")} />
                  ))}
                </span>
              )}
            </span>
          </DataPanelRow>
        </DataPanel>

        <DataPanel title="Totals">
          <DataPanelRow>
            <span className="text-xs text-gray-600">Subtotal</span>
            <span className="text-sm text-gray-900">{totals.subtotal}</span>
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs text-gray-600">Tax</span>
            <span className="text-sm text-gray-900">{totals.tax}</span>
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs text-gray-600">Total</span>
            <span className="text-sm font-semibold text-gray-900">{totals.total}</span>
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs text-gray-600">Open</span>
            <span className="text-sm text-gray-900">{totals.open}</span>
          </DataPanelRow>
        </DataPanel>

        <DataPanel title="Notes">
          <div className="space-y-2 text-sm text-gray-700">
            <div>
              <div className="text-xs font-semibold text-gray-500">Internal notes</div>
              <div>{invoice.internal_notes || "-"}</div>
            </div>
            <div>
              <div className="text-xs font-semibold text-gray-500">Customer notes</div>
              <div>{invoice.customer_notes || "-"}</div>
            </div>
            <button
              className="text-xs font-semibold text-slate-700 underline"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                navigate(`/accounting/audit-trail?source_type=invoice&source_id=${encodeURIComponent(invoice.id)}`);
              }}
              type="button"
            >
              View audit log
            </button>
          </div>
        </DataPanel>
      </div>

      <DataPanel title="GL / Journal entries">
        {(invoice.journal_entries ?? []).length === 0 ? (
          <div className="text-sm text-gray-600" data-testid="invoice-journal-entries-empty">
            No journal entries linked yet (unposted or posting reversed).
          </div>
        ) : (
          <div className="space-y-2" data-testid="invoice-journal-entries">
            {(invoice.journal_entries ?? []).map((je) => (
              <DataPanelRow key={`${je.journal_entry_id}-${je.source_transaction_type}`}>
                <span className="text-xs text-gray-600">
                  <span className="mr-2 font-semibold uppercase tracking-wide text-gray-500">
                    {je.source_transaction_type ?? "source"}
                  </span>
                  <EntityLink kind="journal_entry" id={je.journal_entry_id} label={entityLabel(null, je.journal_entry_id, "Journal entry")} />
                </span>
                <span className="text-sm text-gray-900">
                  {je.entry_date ? formatDateUS(je.entry_date) : "—"}
                  {je.status ? ` · ${je.status}` : ""}
                </span>
              </DataPanelRow>
            ))}
          </div>
        )}
      </DataPanel>

      {invoice.factoring_advance_id ? (
        <DataPanel title="Factoring">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <div className="text-gray-700">
              This invoice is part of <EntityLink kind="factoring_advance" id={invoice.factoring_advance_id ?? undefined} label={entityLabel(invoice.factoring_display_id, invoice.factoring_advance_id, "Factoring batch")} />.
              {invoice.factoring_status ? (
                <span className={`ml-2 ${factoringPillClass(invoice.factoring_status)}`}>{invoice.factoring_status.replaceAll("_", " ")}</span>
              ) : null}
            </div>
            <Button size="sm" variant="secondary" onClick={() => navigate(`/accounting/factoring/${invoice.factoring_advance_id}`)}>
              View batch
            </Button>
          </div>
        </DataPanel>
      ) : null}

      <DataPanel title={`Lines (${lineCount})`}>
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs text-gray-600">Line items and billable components</div>
          {isDraft ? (
            // M-1: replace the window.prompt("…cents") with an inline QBO MoneyInput (cents-mode — the user
            // types dollars, unit_amount_cents stored stays cents; no money-math change vs the prompt).
            <div className="flex items-end gap-2">
              <label className="text-xs text-gray-600">
                Description
                <input
                  value={newLineDesc}
                  onChange={(e) => setNewLineDesc(e.target.value)}
                  placeholder="Line description"
                  className="mt-1 h-9 w-48 rounded-sm border border-gray-300 px-2 text-xs"
                />
              </label>
              <label className="text-xs text-gray-600">
                Unit amount
                <MoneyInput valueCents={newLineCents} onChangeCents={setNewLineCents} className="mt-1 w-28" ariaLabel="Unit amount" />
              </label>
              <Button
                size="sm"
                disabled={!newLineDesc.trim() || newLineCents == null}
                loading={addLineMutation.isPending}
                onClick={() => {
                  addLineMutation.mutate({ description: newLineDesc.trim(), unit_amount_cents: Math.trunc(newLineCents ?? 0) });
                  setNewLineDesc("");
                  setNewLineCents(null);
                }}
              >
                + Create Line
              </Button>
            </div>
          ) : null}
        </div>
        {lineCount === 0 ? (
          <div className="rounded-sm border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700" data-testid="invoice-lines-honest-empty">
            <p>{INVOICE_LINES_HONEST_EMPTY}</p>
            {isDraft ? (
              <p className="mt-1 text-xs text-gray-600">Use + Create Line above to add the first line item on this draft invoice.</p>
            ) : null}
          </div>
        ) : (
          <ParityTable<InvoiceLine>
            columns={lineColumns}
            rows={invoice.lines ?? []}
            rowKey={(line) => line.id}
            loading={detailQuery.isFetching && !detailQuery.data}
            emptyText={INVOICE_LINES_HONEST_EMPTY}
            density="compact"
            storageKey="invoice-detail-lines"
            sortKey={sortKey}
            sortDirection={sortDirection}
            onSortChange={onSortChange}
          />
        )}
      </DataPanel>

      <DataPanel title="Payment Applications">
        {(invoice.payment_applications ?? []).length === 0 ? (
          <div className="text-sm text-gray-600">No payments applied yet.</div>
        ) : (
          <div className="space-y-2">
            {(invoice.payment_applications ?? []).map((application) => (
              <DataPanelRow key={application.id}>
                <span className="text-xs text-gray-600"><EntityLink kind="payment" id={application.payment_id ?? undefined} label={entityLabel(application.payment_display_id, application.payment_id, "Payment")} /></span>
                <span className="text-sm text-gray-900">
                  {money(application.amount_cents)} · {new Date(application.applied_at).toLocaleString()}
                </span>
              </DataPanelRow>
            ))}
          </div>
        )}
      </DataPanel>

      {selectedCompanyId ? (
        <RecordPaymentModal
          open={recordPaymentOpen}
          operatingCompanyId={selectedCompanyId}
          prefillCustomerId={invoice.customer_id}
          prefillAmountCents={invoice.amount_open_cents}
          prefillInvoiceId={invoice.id}
          onClose={() => setRecordPaymentOpen(false)}
          onRecorded={() => {
            setRecordPaymentOpen(false);
            void queryClient.invalidateQueries({ queryKey: ["accounting", "invoice", selectedCompanyId, id] });
            void queryClient.invalidateQueries({ queryKey: ["accounting", "invoices"] });
          }}
        />
      ) : null}
    </AccountingSubNavWrapper>
  );
}
