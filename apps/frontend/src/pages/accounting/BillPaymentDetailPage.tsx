import { entityLabel, visibleDocumentLabel } from "../../lib/entity-label";
import { humanMemo } from "./ManualJEListPage";
import { formatDateUS } from "../../lib/formatDate";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getBillPayment, voidVendorBillPayment } from "../../api/accounting";
import { ListErrorState } from "../../components/ListErrorState";
import { DataPanel } from "../../components/layout/DataPanel";
import { DataPanelRow } from "../../components/layout/DataPanelRow";
import { PageHeader } from "../../components/forms/shared/PageHeader";
import { StatusBadge } from "../../components/layout/StatusBadge";
import { Button } from "../../components/Button";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { MoneyProofTrailPanel } from "../../components/accounting/MoneyProofTrailPanel";
import { EntityLink } from "../../components/shared/EntityLink";
import { openPrintableDocument } from "../../lib/openPrintableDocument";
import { VoidedBanner } from "../../components/accounting/VoidedBanner";
import { VoidReasonModal } from "../../components/accounting/VoidReasonModal";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

export function BillPaymentDetailPage() {
  const { id = "" } = useParams();
  const { selectedCompanyId } = useCompanyContext();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [voidOpen, setVoidOpen] = useState(false);

  const detailQuery = useQuery({
    queryKey: ["accounting", "bill-payment", selectedCompanyId, id],
    queryFn: () => getBillPayment(id, selectedCompanyId!),
    enabled: Boolean(id && selectedCompanyId),
  });

  // VIS-03: a void endpoint (voidVendorBillPayment) already existed server-side (bills.routes.ts
  // POST .../bill-payments/:id/void) and had an FE client wrapper -- this page just never rendered
  // a trigger for it, so the only way to void a bill payment was BillsPage/BillPaymentsListPage's
  // list-row action, not "inside the transaction" (owner requirement 4.4).
  const voidMutation = useMutation({
    mutationFn: (reason: string) => voidVendorBillPayment(id, selectedCompanyId!, reason),
    onSuccess: () => {
      pushToast("Bill payment voided", "success");
      void queryClient.invalidateQueries({ queryKey: ["accounting", "bill-payment", selectedCompanyId, id] });
      void queryClient.invalidateQueries({ queryKey: ["accounting", "bill-payments"] });
    },
    onError: (error) => pushToast(userFacingApiError(error, "Failed to void bill payment"), "error"),
  });

  // LV-JE-DETAIL-COLD-NAV-FALSE-NOT-FOUND class fix: react-query v5 isLoading = isPending &&
  // isFetching, so a disabled query (selectedCompanyId not yet resolved on cold nav) reports
  // isLoading=false and falls through to "not found" for a real record. isPending is correct here —
  // see JournalEntryDetailPage.tsx for the full live-repro writeup. Do not revert to isLoading.
  if (detailQuery.isPending) return <div className="p-4 text-xs text-slate-500">Loading bill payment…</div>;
  if (detailQuery.isError) {
    return (
      <ListErrorState
        title="Couldn't load bill payment"
        status={0}
        message={(detailQuery.error as Error | undefined)?.message}
        onRetry={() => void detailQuery.refetch()}
      />
    );
  }

  const payment = detailQuery.data?.payment;
  if (!payment) return <div className="p-4 text-xs text-red-600">Bill payment not found.</div>;

  const displayId = entityLabel(payment.reference_number ?? payment.check_number, payment.id, "Payment");
  const isVoided = Boolean(payment.revoked_at);

  return (
    <AccountingSubNavWrapper>
      <VoidedBanner voidedAt={payment.revoked_at} voidReason={payment.revoked_reason} documentLabel="Bill payment" />
      <PageHeader
        title={displayId}
        backHref="/accounting/bill-payments"
        breadcrumb={[
          { label: "Accounting", href: "/accounting" },
          { label: "Bill payments", href: "/accounting/bill-payments" },
          { label: displayId },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge variant={isVoided ? "neutral" : "positive"}>{isVoided ? "voided" : "posted"}</StatusBadge>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                openPrintableDocument(
                  `/api/v1/accounting/bill-payments/${encodeURIComponent(id)}.html?operating_company_id=${encodeURIComponent(selectedCompanyId!)}`
                )
              }
            >
              Print
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => setVoidOpen(true)}
              disabled={isVoided}
              title={isVoided ? "Bill payment already voided." : undefined}
            >
              Void
            </Button>
          </div>
        }
      />

      <VoidReasonModal
        open={voidOpen}
        title="Void Bill Payment"
        entityRef={`${displayId} · ${money(payment.amount_cents)} · ${formatDateUS(payment.payment_date)}`}
        minLength={3}
        onClose={() => setVoidOpen(false)}
        onSubmit={async (reason) => {
          await voidMutation.mutateAsync(reason);
        }}
      />

      <div data-testid="bill-payment-detail">
      <DataPanel title="Bill payment">
        <DataPanelRow>
          <span className="text-xs font-semibold text-gray-600">Payment date</span>
          <span className="text-xs text-gray-900">{formatDateUS(payment.payment_date)}</span>
        </DataPanelRow>
        <DataPanelRow>
          <span className="text-xs font-semibold text-gray-600">Amount</span>
          <span className="text-xs text-gray-900">{money(payment.amount_cents)}</span>
        </DataPanelRow>
        <DataPanelRow>
          <span className="text-xs font-semibold text-gray-600">Method</span>
          <span className="text-xs text-gray-900">{payment.payment_method}</span>
        </DataPanelRow>
        {payment.bill_id ? (
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Bill</span>
            <EntityLink kind="bill" id={payment.bill_id} label={visibleDocumentLabel(payment.bill_number, payment.bill_id, "Bill")} />
          </DataPanelRow>
        ) : null}
        {payment.vendor_id ? (
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Vendor</span>
            <EntityLink kind="vendor" id={payment.mdata_vendor_id} label={entityLabel(payment.vendor_name, payment.vendor_id, "Vendor")} />
          </DataPanelRow>
        ) : null}
        {payment.journal_entry_id ? (
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Journal entry</span>
            <EntityLink
              kind="journal_entry"
              id={payment.journal_entry_id}
              label={
                [
                  payment.journal_entry_date ? formatDateUS(payment.journal_entry_date) : null,
                  humanMemo(payment.journal_entry_memo),
                ]
                  .filter((part) => part && part !== "—")
                  .join(" — ") || entityLabel(payment.journal_entry_memo, payment.journal_entry_id, "Journal entry")
              }
            />
          </DataPanelRow>
        ) : null}
        {payment.matched_bank_transaction_id ? (
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Bank transaction</span>
            <EntityLink
              kind="bank_transaction"
              id={payment.matched_bank_transaction_id}
              label={
                payment.matched_bank_transaction_date
                  ? `${formatDateUS(payment.matched_bank_transaction_date)}${
                      payment.matched_bank_transaction_description
                        ? ` — ${payment.matched_bank_transaction_description}`
                        : ""
                    }${
                      payment.matched_bank_transaction_amount_cents
                        ? ` (${money(Number(payment.matched_bank_transaction_amount_cents))})`
                        : ""
                    }`
                  : entityLabel(null, payment.matched_bank_transaction_id, "Bank transaction")
              }
            />
          </DataPanelRow>
        ) : null}
        {payment.reference_number ? (
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Reference</span>
            <span className="text-xs text-gray-900">{entityLabel(payment.reference_number, payment.id, "Reference")}</span>
          </DataPanelRow>
        ) : null}
        {payment.check_number ? (
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Check #</span>
            <span className="text-xs text-gray-900">{entityLabel(payment.check_number, payment.id, "Check")}</span>
          </DataPanelRow>
        ) : null}
        {payment.memo ? (
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Memo</span>
            <span className="text-xs text-gray-900">{payment.memo}</span>
          </DataPanelRow>
        ) : null}
        <DataPanelRow>
          <span className="text-xs font-semibold text-gray-600">Created</span>
          <span className="text-xs text-gray-900">{formatDateUS(payment.created_at)}</span>
        </DataPanelRow>
      </DataPanel>
      </div>
      <MoneyProofTrailPanel operatingCompanyId={selectedCompanyId!} documentType="bill_payment" documentId={id} />
    </AccountingSubNavWrapper>
  );
}
