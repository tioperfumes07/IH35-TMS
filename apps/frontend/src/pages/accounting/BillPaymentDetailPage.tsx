import { entityLabel } from "../../lib/entity-label";
import { humanMemo } from "./ManualJEListPage";
import { formatDateUS } from "../../lib/formatDate";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getBillPayment } from "../../api/accounting";
import { ListErrorState } from "../../components/ListErrorState";
import { DataPanel } from "../../components/layout/DataPanel";
import { DataPanelRow } from "../../components/layout/DataPanelRow";
import { PageHeader } from "../../components/forms/shared/PageHeader";
import { StatusBadge } from "../../components/layout/StatusBadge";
import { Button } from "../../components/Button";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { EntityLink } from "../../components/shared/EntityLink";
import { openPrintableDocument } from "../../lib/openPrintableDocument";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

export function BillPaymentDetailPage() {
  const { id = "" } = useParams();
  const { selectedCompanyId } = useCompanyContext();

  const detailQuery = useQuery({
    queryKey: ["accounting", "bill-payment", selectedCompanyId, id],
    queryFn: () => getBillPayment(id, selectedCompanyId!),
    enabled: Boolean(id && selectedCompanyId),
  });

  // LV-JE-DETAIL-COLD-NAV-FALSE-NOT-FOUND class fix: react-query v5 isLoading = isPending &&
  // isFetching, so a disabled query (selectedCompanyId not yet resolved on cold nav) reports
  // isLoading=false and falls through to "not found" for a real record. isPending is correct here —
  // see JournalEntryDetailPage.tsx for the full live-repro writeup. Do not revert to isLoading.
  if (detailQuery.isPending) return <div className="p-4 text-sm text-slate-500">Loading bill payment…</div>;
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
  if (!payment) return <div className="p-4 text-sm text-red-600">Bill payment not found.</div>;

  const displayId = entityLabel(payment.reference_number ?? payment.check_number, payment.id, "Payment");
  const isVoided = Boolean(payment.revoked_at);

  return (
    <AccountingSubNavWrapper>
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
          </div>
        }
      />

      <div data-testid="bill-payment-detail">
      <DataPanel title="Bill payment">
        <DataPanelRow>
          <span className="text-xs font-semibold text-gray-600">Payment date</span>
          <span className="text-sm text-gray-900">{formatDateUS(payment.payment_date)}</span>
        </DataPanelRow>
        <DataPanelRow>
          <span className="text-xs font-semibold text-gray-600">Amount</span>
          <span className="text-sm text-gray-900">{money(payment.amount_cents)}</span>
        </DataPanelRow>
        <DataPanelRow>
          <span className="text-xs font-semibold text-gray-600">Method</span>
          <span className="text-sm text-gray-900">{payment.payment_method}</span>
        </DataPanelRow>
        {payment.bill_id ? (
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Bill</span>
            <EntityLink kind="bill" id={payment.bill_id} label={entityLabel(payment.bill_number, payment.bill_id, "Bill")} />
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
            <span className="text-sm text-gray-900">{entityLabel(payment.reference_number, payment.id, "Reference")}</span>
          </DataPanelRow>
        ) : null}
        {payment.check_number ? (
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Check #</span>
            <span className="text-sm text-gray-900">{entityLabel(payment.check_number, payment.id, "Check")}</span>
          </DataPanelRow>
        ) : null}
        {payment.memo ? (
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Memo</span>
            <span className="text-sm text-gray-900">{payment.memo}</span>
          </DataPanelRow>
        ) : null}
        <DataPanelRow>
          <span className="text-xs font-semibold text-gray-600">Created</span>
          <span className="text-sm text-gray-900">{formatDateUS(payment.created_at)}</span>
        </DataPanelRow>
      </DataPanel>
      </div>
    </AccountingSubNavWrapper>
  );
}
