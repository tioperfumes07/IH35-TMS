import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { applyPayment, getPayment, listInvoices, unapplyPayment, voidPayment } from "../../api/accounting";
import { Button } from "../../components/Button";
import { DataPanel } from "../../components/layout/DataPanel";
import { DataPanelRow } from "../../components/layout/DataPanelRow";
import { PageHeader } from "../../components/forms/shared/PageHeader";
import { Modal } from "../../components/Modal";
import { StatusBadge } from "../../components/layout/StatusBadge";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { AccountingSubNav } from "./AccountingSubNav";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

export function PaymentDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompanyContext();
  const [applyOpen, setApplyOpen] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [applyAmountDollars, setApplyAmountDollars] = useState("");
  const [applySearch, setApplySearch] = useState("");

  const detailQuery = useQuery({
    queryKey: ["accounting", "payment", selectedCompanyId, id],
    queryFn: () => getPayment(id, selectedCompanyId!),
    enabled: Boolean(id && selectedCompanyId),
  });

  const payment = detailQuery.data;
  const isVoided = Boolean(payment?.voided_at);
  const canApply = Boolean(payment && !isVoided && Number(payment.amount_unapplied_cents ?? 0) > 0);

  const openInvoicesQuery = useQuery({
    queryKey: ["accounting", "payment-open-invoices", selectedCompanyId, payment?.customer_id],
    queryFn: async () => {
      if (!payment?.customer_id) return [];
      const [sent, partial] = await Promise.all([
        listInvoices(selectedCompanyId!, { customer_id: payment.customer_id, status: "sent" }).then((res) => res.invoices ?? []),
        listInvoices(selectedCompanyId!, { customer_id: payment.customer_id, status: "partial" }).then((res) => res.invoices ?? []),
      ]);
      const seen = new Set<string>();
      return [...sent, ...partial].filter((row) => {
        if (seen.has(row.id)) return false;
        seen.add(row.id);
        return Number(row.amount_open_cents ?? 0) > 0;
      });
    },
    enabled: Boolean(canApply && selectedCompanyId && payment?.customer_id),
  });

  const applyMutation = useMutation({
    mutationFn: (payload: { invoice_id: string; amount_cents: number }) => applyPayment(id, selectedCompanyId!, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["accounting", "payment", selectedCompanyId, id] });
      void queryClient.invalidateQueries({ queryKey: ["accounting", "payments"] });
      void queryClient.invalidateQueries({ queryKey: ["accounting", "invoice"] });
      setApplyOpen(false);
      setSelectedInvoiceId("");
      setApplyAmountDollars("");
      setApplySearch("");
    },
  });

  const unapplyMutation = useMutation({
    mutationFn: (applicationId: string) => unapplyPayment(id, applicationId, selectedCompanyId!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["accounting", "payment", selectedCompanyId, id] });
      void queryClient.invalidateQueries({ queryKey: ["accounting", "payments"] });
      void queryClient.invalidateQueries({ queryKey: ["accounting", "invoice"] });
    },
  });

  const voidMutation = useMutation({
    mutationFn: (reason: string) => voidPayment(id, selectedCompanyId!, reason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["accounting", "payment", selectedCompanyId, id] });
      void queryClient.invalidateQueries({ queryKey: ["accounting", "payments"] });
      void queryClient.invalidateQueries({ queryKey: ["accounting", "invoice"] });
    },
  });

  const filteredInvoices = useMemo(() => {
    const rows = openInvoicesQuery.data ?? [];
    if (!applySearch.trim()) return rows;
    const q = applySearch.toLowerCase();
    return rows.filter((row) => row.display_id.toLowerCase().includes(q) || (row.customer_name ?? "").toLowerCase().includes(q));
  }, [openInvoicesQuery.data, applySearch]);

  const selectedInvoice = filteredInvoices.find((row) => row.id === selectedInvoiceId) ?? null;

  if (detailQuery.isLoading) return <div className="text-sm text-gray-500">Loading payment...</div>;
  if (!payment) return <div className="text-sm text-red-600">Payment not found.</div>;

  return (
    <div className="space-y-3">
      <AccountingSubNav />
      <PageHeader
        title={payment.display_id}
        backHref="/accounting/payments"
        breadcrumb={[
          { label: "Accounting", href: "/accounting" },
          { label: "Payments", href: "/accounting/payments" },
          { label: payment.display_id },
        ]}
        actions={
          <div className="flex items-center gap-2">
            {isVoided ? <StatusBadge variant="neutral">voided</StatusBadge> : null}
            {!isVoided ? (
              <Button
                variant="danger"
                onClick={() => {
                  const reason = window.prompt("Void reason");
                  if (!reason) return;
                  voidMutation.mutate(reason);
                }}
                loading={voidMutation.isPending}
              >
                Void
              </Button>
            ) : null}
          </div>
        }
      />

      <DataPanel title="Header">
        <DataPanelRow>
          <span className="text-xs font-semibold text-gray-600">Customer</span>
          <span className="text-sm text-gray-900">{payment.customer_name}</span>
        </DataPanelRow>
        <DataPanelRow>
          <span className="text-xs font-semibold text-gray-600">Date</span>
          <span className="text-sm text-gray-900">{payment.payment_date}</span>
        </DataPanelRow>
        <DataPanelRow>
          <span className="text-xs font-semibold text-gray-600">Method</span>
          <span className="text-sm text-gray-900">{payment.payment_method}</span>
        </DataPanelRow>
        <DataPanelRow>
          <span className="text-xs font-semibold text-gray-600">Reference</span>
          <span className="text-sm text-gray-900">{payment.reference || "-"}</span>
        </DataPanelRow>
        <DataPanelRow>
          <span className="text-xs font-semibold text-gray-600">Amount</span>
          <span className="text-sm text-gray-900">{money(payment.amount_cents)}</span>
        </DataPanelRow>
        <DataPanelRow>
          <span className="text-xs font-semibold text-gray-600">Applied</span>
          <span className="text-sm text-gray-900">{money(payment.amount_applied_cents)}</span>
        </DataPanelRow>
        <DataPanelRow>
          <span className="text-xs font-semibold text-gray-600">Unapplied</span>
          <span className="text-sm text-gray-900">{money(payment.amount_unapplied_cents)}</span>
        </DataPanelRow>
        <DataPanelRow>
          <span className="text-xs font-semibold text-gray-600">Deposited to</span>
          <span className="text-sm text-gray-900">{payment.deposited_to_account_id || "-"}</span>
        </DataPanelRow>
      </DataPanel>

      <DataPanel title="Applications">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs text-gray-600">Payment applications to invoices</div>
          {canApply ? (
            <Button size="sm" onClick={() => setApplyOpen(true)}>
              + Apply to invoice
            </Button>
          ) : null}
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead>
              <tr className="border-b border-gray-200 text-gray-600">
                <th className="px-2 py-1.5 font-semibold">Invoice #</th>
                <th className="px-2 py-1.5 font-semibold">Applied amount</th>
                <th className="px-2 py-1.5 font-semibold">Open after</th>
                <th className="px-2 py-1.5 font-semibold">Applied at</th>
                <th className="px-2 py-1.5 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(payment.applications ?? []).map((app) => {
                const openAfter = Math.max(0, Number(app.invoice_amount_open_cents ?? 0));
                return (
                  <tr key={app.id} className="border-b border-gray-100">
                    <td className="px-2 py-1.5 text-gray-900">{app.invoice_display_id}</td>
                    <td className="px-2 py-1.5 text-gray-700">{money(app.amount_cents)}</td>
                    <td className="px-2 py-1.5 text-gray-700">{money(openAfter)}</td>
                    <td className="px-2 py-1.5 text-gray-700">{new Date(app.applied_at).toLocaleString()}</td>
                    <td className="px-2 py-1.5 text-gray-700">
                      {!isVoided ? (
                        <Button size="sm" variant="secondary" onClick={() => unapplyMutation.mutate(app.id)} loading={unapplyMutation.isPending}>
                          Unapply
                        </Button>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                );
              })}
              {(payment.applications ?? []).length === 0 ? (
                <tr>
                  <td className="px-2 py-2 text-gray-500" colSpan={5}>
                    No applications yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </DataPanel>

      {payment.notes ? (
        <DataPanel title="Notes">
          <div className="text-sm text-gray-700">{payment.notes}</div>
        </DataPanel>
      ) : null}

      <div>
        <button type="button" className="text-xs font-semibold text-blue-700 underline" onClick={() => navigate(`/reports?payment_id=${payment.id}`)}>
          View audit log
        </button>
      </div>

      <Modal open={applyOpen} onClose={() => setApplyOpen(false)} title="Apply to Invoice">
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            const cents = Math.round(Number(applyAmountDollars || "0") * 100);
            if (!selectedInvoiceId || !Number.isFinite(cents) || cents <= 0) return;
            applyMutation.mutate({ invoice_id: selectedInvoiceId, amount_cents: cents });
          }}
        >
          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
            Search
            <input value={applySearch} onChange={(event) => setApplySearch(event.target.value)} placeholder="Search invoice #" className="h-9 rounded border border-gray-300 px-2 text-[13px]" />
          </label>

          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
            Invoice
            <select
              value={selectedInvoiceId}
              onChange={(event) => {
                const nextId = event.target.value;
                setSelectedInvoiceId(nextId);
                const invoice = filteredInvoices.find((row) => row.id === nextId);
                if (!invoice) return;
                const nextDefault = Math.min(Number(payment.amount_unapplied_cents ?? 0), Number(invoice.amount_open_cents ?? 0));
                setApplyAmountDollars((nextDefault / 100).toFixed(2));
              }}
              className="h-9 rounded border border-gray-300 px-2 text-[13px]"
            >
              <option value="">Select invoice</option>
              {filteredInvoices.map((invoice) => (
                <option key={invoice.id} value={invoice.id}>
                  {invoice.display_id} · Open {money(invoice.amount_open_cents)}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
            Apply amount (USD)
            <input value={applyAmountDollars} onChange={(event) => setApplyAmountDollars(event.target.value)} inputMode="decimal" className="h-9 rounded border border-gray-300 px-2 text-[13px]" />
          </label>

          <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
            Unapplied available: {money(payment.amount_unapplied_cents)}
            {selectedInvoice ? ` · Invoice open: ${money(selectedInvoice.amount_open_cents)}` : ""}
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setApplyOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={applyMutation.isPending}>
              Apply
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
