import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { addInvoiceLine, deleteInvoiceLine, getInvoice, patchInvoiceLine, sendInvoice, voidInvoice } from "../../api/accounting";
import { Button } from "../../components/Button";
import { BackButton } from "../../components/shared/BackButton";
import { DataPanel } from "../../components/layout/DataPanel";
import { DataPanelRow } from "../../components/layout/DataPanelRow";
import { PageHeader } from "../../components/layout/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { RecordPaymentModal } from "./RecordPaymentModal";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

function factoringPillClass(status: string | null | undefined) {
  const base = "rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide";
  if (status === "advanced") return `${base} bg-blue-50 text-blue-700 border border-blue-200`;
  if (status === "reserve_held" || status === "collected") return `${base} bg-amber-50 text-amber-700 border border-amber-200`;
  if (status === "released") return `${base} bg-emerald-50 text-emerald-700 border border-emerald-200`;
  if (status === "recourse_returned") return `${base} bg-red-50 text-red-700 border border-red-200`;
  return `${base} bg-slate-50 text-slate-700 border border-slate-200`;
}

export function InvoiceDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompanyContext();
  const [recordPaymentOpen, setRecordPaymentOpen] = useState(false);

  const detailQuery = useQuery({
    queryKey: ["accounting", "invoice", selectedCompanyId, id],
    queryFn: () => getInvoice(id, selectedCompanyId!),
    enabled: Boolean(id && selectedCompanyId),
  });

  const sendMutation = useMutation({
    mutationFn: () => sendInvoice(id, selectedCompanyId!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["accounting", "invoice", selectedCompanyId, id] });
      void queryClient.invalidateQueries({ queryKey: ["accounting", "invoices"] });
    },
  });

  const voidMutation = useMutation({
    mutationFn: (reason?: string) => voidInvoice(id, selectedCompanyId!, reason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["accounting", "invoice", selectedCompanyId, id] });
      void queryClient.invalidateQueries({ queryKey: ["accounting", "invoices"] });
    },
  });

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
  });

  const patchLineMutation = useMutation({
    mutationFn: ({ lineId, unit_amount_cents }: { lineId: string; unit_amount_cents: number }) =>
      patchInvoiceLine(id, lineId, selectedCompanyId!, { unit_amount_cents }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["accounting", "invoice", selectedCompanyId, id] });
      void queryClient.invalidateQueries({ queryKey: ["accounting", "invoices"] });
    },
  });

  const deleteLineMutation = useMutation({
    mutationFn: (lineId: string) => deleteInvoiceLine(id, lineId, selectedCompanyId!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["accounting", "invoice", selectedCompanyId, id] });
      void queryClient.invalidateQueries({ queryKey: ["accounting", "invoices"] });
    },
  });

  const invoice = detailQuery.data;
  const isDraft = invoice?.status === "draft";
  const canRecordPayment = invoice?.status === "sent" || invoice?.status === "partial";
  const lineCount = invoice?.lines?.length ?? 0;

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
  if (!invoice) return <div className="text-sm text-red-600">Invoice not found.</div>;

  return (
    <div className="space-y-3">
      <BackButton />
      <PageHeader
        title={invoice.display_id}
        subtitle={invoice.customer_name ?? "Invoice detail"}
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
              onClick={() => sendMutation.mutate()}
              loading={sendMutation.isPending}
              disabled={!isDraft || lineCount === 0}
            >
              Send
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                const reason = window.prompt("Void reason");
                if (!reason) return;
                voidMutation.mutate(reason);
              }}
              loading={voidMutation.isPending}
              disabled={invoice.status === "paid" || invoice.status === "void"}
            >
              Void
            </Button>
          </div>
        }
      />

      {invoice.source_load_chargeback_requested ? (
        <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <div className="font-semibold uppercase tracking-wide">Chargeback flag</div>
          <div>{invoice.source_load_chargeback_reason || "This invoice is tied to a load marked for customer chargeback review."}</div>
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-3">
        <DataPanel title="Header">
          <DataPanelRow>
            <span className="text-xs text-gray-600">Status</span>
            <span className="text-sm font-semibold text-gray-900">{invoice.status}</span>
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs text-gray-600">Issue Date</span>
            <span className="text-sm text-gray-900">{invoice.issue_date}</span>
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs text-gray-600">Due Date</span>
            <span className="text-sm text-gray-900">{invoice.due_date}</span>
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs text-gray-600">Source Load</span>
            <span className="text-sm text-gray-900">{invoice.source_load_id ?? "-"}</span>
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
            <button className="text-xs font-semibold text-blue-700 underline" onClick={() => navigate(`/reports?invoice_id=${invoice.id}`)} type="button">
              View audit log
            </button>
          </div>
        </DataPanel>
      </div>

      {invoice.factoring_advance_id ? (
        <DataPanel title="Factoring">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <div className="text-gray-700">
              This invoice is part of {invoice.factoring_display_id ?? "a factoring batch"}.
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
            <Button
              size="sm"
              onClick={() => {
                const description = window.prompt("Line description");
                if (!description) return;
                const amount = Number(window.prompt("Unit amount (cents)") ?? "0");
                if (!Number.isFinite(amount) || amount < 0) return;
                addLineMutation.mutate({ description, unit_amount_cents: Math.trunc(amount) });
              }}
              loading={addLineMutation.isPending}
            >
              + Create Line
            </Button>
          ) : null}
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead>
              <tr className="border-b border-gray-200 text-gray-600">
                <th className="px-2 py-1.5 font-semibold">Type</th>
                <th className="px-2 py-1.5 font-semibold">Description</th>
                <th className="px-2 py-1.5 font-semibold">Qty</th>
                <th className="px-2 py-1.5 font-semibold">Unit</th>
                <th className="px-2 py-1.5 font-semibold">Total</th>
                <th className="px-2 py-1.5 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(invoice.lines ?? []).map((line) => (
                <tr key={line.id} className="border-b border-gray-100">
                  <td className="px-2 py-1.5 text-gray-700">{line.line_type}</td>
                  <td className="px-2 py-1.5 text-gray-900">{line.description}</td>
                  <td className="px-2 py-1.5 text-gray-700">{line.quantity}</td>
                  <td className="px-2 py-1.5 text-gray-700">{money(line.unit_amount_cents)}</td>
                  <td className="px-2 py-1.5 text-gray-700">{money(line.line_total_cents)}</td>
                  <td className="px-2 py-1.5 text-gray-700">
                    {isDraft ? (
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            const amount = Number(window.prompt("New unit amount (cents)", String(line.unit_amount_cents)) ?? "0");
                            if (!Number.isFinite(amount) || amount < 0) return;
                            patchLineMutation.mutate({ lineId: line.id, unit_amount_cents: Math.trunc(amount) });
                          }}
                        >
                          Edit
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => deleteLineMutation.mutate(line.id)}>
                          Delete
                        </Button>
                      </div>
                    ) : (
                      "-"
                    )}
                  </td>
                </tr>
              ))}
              {(invoice.lines ?? []).length === 0 ? (
                <tr>
                  <td className="px-2 py-2 text-gray-500" colSpan={6}>
                    No lines yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </DataPanel>

      <DataPanel title="Payment Applications">
        {(invoice.payment_applications ?? []).length === 0 ? (
          <div className="text-sm text-gray-600">No payments applied yet.</div>
        ) : (
          <div className="space-y-2">
            {(invoice.payment_applications ?? []).map((application) => (
              <DataPanelRow key={application.id}>
                <span className="text-xs text-gray-600">{application.payment_display_id ?? application.payment_id}</span>
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
    </div>
  );
}
