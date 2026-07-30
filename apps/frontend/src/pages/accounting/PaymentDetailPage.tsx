import { formatDateUS } from "../../lib/formatDate";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { applyPayment, getPayment, listInvoices, unapplyPayment, voidPayment, type PaymentApplication } from "../../api/accounting";
import { Button } from "../../components/Button";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { VoidReasonModal } from "../../components/accounting/VoidReasonModal";
import { ListErrorState } from "../../components/ListErrorState";
import { DataPanel } from "../../components/layout/DataPanel";
import { DataPanelRow } from "../../components/layout/DataPanelRow";
import { PageHeader } from "../../components/forms/shared/PageHeader";
import { StatusBadge } from "../../components/layout/StatusBadge";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { PaymentApplyModal } from "./PaymentApplyModal";
import { EntityLink } from "../../components/shared/EntityLink";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { useToast } from "../../components/Toast";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

export function PaymentDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompanyContext();
  const { pushToast } = useToast();
  const [applyOpen, setApplyOpen] = useState(false);

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
      const res = await listInvoices(selectedCompanyId!, {
        customer_id: payment.customer_id,
        has_balance: true,
        limit: 300,
      });
      return res.invoices ?? [];
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
    },
    onError: (error) => pushToast(String((error as Error)?.message ?? "Failed to apply payment"), "error"),
  });

  const unapplyMutation = useMutation({
    mutationFn: (applicationId: string) => unapplyPayment(id, applicationId, selectedCompanyId!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["accounting", "payment", selectedCompanyId, id] });
      void queryClient.invalidateQueries({ queryKey: ["accounting", "payments"] });
      void queryClient.invalidateQueries({ queryKey: ["accounting", "invoice"] });
    },
    onError: (error) => pushToast(String((error as Error)?.message ?? "Failed to unapply payment"), "error"),
  });

  const voidMutation = useMutation({
    mutationFn: (reason: string) => voidPayment(id, selectedCompanyId!, reason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["accounting", "payment", selectedCompanyId, id] });
      void queryClient.invalidateQueries({ queryKey: ["accounting", "payments"] });
      void queryClient.invalidateQueries({ queryKey: ["accounting", "invoice"] });
    },
    onError: (error) => pushToast(String((error as Error)?.message ?? "Failed to void payment"), "error"),
  });

  const [voidOpen, setVoidOpen] = useState(false);

  // Display-only ParityTable migration: columns/order/formatting mirror the former
  // hand-rolled table 1:1 (Invoice # / Applied amount / Open after / Applied at / Actions).
  const applicationColumns: Array<ParityColumn<PaymentApplication>> = [
    {
      key: "invoice_display_id",
      label: "Invoice #",
      sortable: true,
      render: (app) => (
        <span className="text-gray-900">
          <EntityLink kind="invoice" id={app.invoice_id ?? undefined} label={app.invoice_display_id ?? app.invoice_id?.slice(0, 8)} />
        </span>
      ),
    },
    {
      key: "amount_cents",
      label: "Applied amount",
      sortable: true,
      render: (app) => <span className="text-gray-700">{money(app.amount_cents)}</span>,
    },
    {
      key: "invoice_amount_open_cents",
      label: "Open after",
      sortable: true,
      sortValue: (app) => Math.max(0, Number(app.invoice_amount_open_cents ?? 0)),
      render: (app) => <span className="text-gray-700">{money(Math.max(0, Number(app.invoice_amount_open_cents ?? 0)))}</span>,
    },
    {
      key: "applied_at",
      label: "Applied at",
      sortable: true,
      render: (app) => <span className="text-gray-700">{new Date(app.applied_at).toLocaleString()}</span>,
    },
    {
      key: "actions",
      label: "Actions",
      render: (app) => (
        <span className="text-gray-700">
          {!isVoided ? (
            <Button size="sm" variant="secondary" onClick={() => unapplyMutation.mutate(app.id)} loading={unapplyMutation.isPending}>
              Unapply
            </Button>
          ) : (
            "-"
          )}
        </span>
      ),
    },
  ];

  if (detailQuery.isLoading) return <div className="text-sm text-gray-500">Loading payment...</div>;
  if (detailQuery.isError)
    return (
      <ListErrorState
        title="Couldn't load payment"
        status={0}
        message={(detailQuery.error as Error | undefined)?.message}
        onRetry={() => void detailQuery.refetch()}
      />
    );
  if (!payment) return <div className="text-sm text-red-600">Payment not found.</div>;

  return (
    <AccountingSubNavWrapper>
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
              <>
                <Button variant="danger" onClick={() => setVoidOpen(true)}>
                  Void
                </Button>
                <VoidReasonModal
                  open={voidOpen}
                  title="Void Payment"
                  minLength={1}
                  onClose={() => setVoidOpen(false)}
                  onSubmit={async (reason) => {
                    await voidMutation.mutateAsync(reason);
                    setVoidOpen(false);
                  }}
                />
              </>
            ) : null}
          </div>
        }
      />

      <DataPanel title="Header">
        <DataPanelRow>
          <span className="text-xs font-semibold text-gray-600">Customer</span>
          <span className="text-sm text-gray-900">
            <EntityLink kind="customer" id={payment.customer_id} label={payment.customer_name ?? payment.customer_id?.slice(0, 8)} />
          </span>
        </DataPanelRow>
        <DataPanelRow>
          <span className="text-xs font-semibold text-gray-600">Date</span>
          <span className="text-sm text-gray-900">{formatDateUS(payment.payment_date)}</span>
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
          <span className="text-sm text-gray-900"><EntityLink kind="account" id={payment.deposited_to_account_id || undefined} label={payment.deposited_to_account_id ? payment.deposited_to_account_id.slice(0, 8) : "-"} /></span>
        </DataPanelRow>
        {payment.matched_bank_transaction_id ? (
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Bank transaction</span>
            <span className="text-sm text-gray-900">
              <EntityLink
                kind="bank_transaction"
                id={payment.matched_bank_transaction_id}
                label={payment.matched_bank_transaction_id.slice(0, 8)}
              />
            </span>
          </DataPanelRow>
        ) : null}
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
        <ParityTable<PaymentApplication>
          storageKey="payment-detail-applications"
          tableTestId="payment-detail-applications-table"
          columns={applicationColumns}
          rows={payment.applications ?? []}
          rowKey={(app) => app.id}
          emptyText="No applications yet."
        />
      </DataPanel>

      {payment.notes ? (
        <DataPanel title="Notes">
          <div className="text-sm text-gray-700">{payment.notes}</div>
        </DataPanel>
      ) : null}

      <div>
        <button
          type="button"
          className="text-xs font-semibold text-slate-700 underline"
          onClick={() =>
            navigate(
              `/accounting/audit-trail?source_type=customer_payment&source_id=${encodeURIComponent(payment.id)}`,
            )
          }
        >
          View audit log
        </button>
      </div>

      {openInvoicesQuery.isError ? (
        <ListErrorBanner
          message={`Failed to load open invoices for payment application: ${(openInvoicesQuery.error as Error)?.message ?? "Request failed"}`}
          onRetry={() => void openInvoicesQuery.refetch()}
        />
      ) : null}
      <PaymentApplyModal
        open={applyOpen}
        loading={applyMutation.isPending}
        unappliedCents={Number(payment.amount_unapplied_cents ?? 0)}
        invoices={openInvoicesQuery.data ?? []}
        onClose={() => setApplyOpen(false)}
        onSubmit={(payload) => applyMutation.mutate(payload)}
      />
    </AccountingSubNavWrapper>
  );
}
