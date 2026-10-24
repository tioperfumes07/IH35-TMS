/**
 * ROUND 443.293-A — Statement tab = owner eight-section settlement document (5753 layout).
 * Finalize / payment / deductions / dispute live on SettlementStatementWorkflowPage
 * (`?settlement_id=&workflow=1`). JE opens /accounting/proof-trail/settlement/:id.
 */
import { settlementNumber } from "../../lib/settlementNumber";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams, useNavigate } from "react-router-dom";
import { getSettlement } from "../../api/driverFinance";
import { formatQueryErrorDetail } from "../../lib/tableError";
import { openCanonicalDocument, openPrintableDocument } from "../../lib/openPrintableDocument";
import { ListErrorState } from "../../components/ListErrorState";
import { OnlineBankingMatchBanner } from "../../components/accounting/OnlineBankingMatchBanner";
import { PageHeader } from "../../components/layout/PageHeader";
import { VoidedBanner } from "../../components/accounting/VoidedBanner";
import { VoidReasonModal } from "../../components/accounting/VoidReasonModal";
import { Button } from "../../components/Button";
import { BackButton } from "../../components/shared/BackButton";
import { Breadcrumb } from "../../components/shared/Breadcrumb";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useAuth } from "../../auth/useAuth";
import { userFacingApiError } from "../../lib/api-error-message";
import { getTourReadout } from "../../api/tourReadout";
import { companySettlementHtmlUrl, getCompanySettlementReport } from "../../api/accounting";
import { SettlementStatementDocumentBody } from "./components/SettlementStatementDocumentBody";
import { reverseSettlement, unlockSettlement } from "../../api/driverFinance";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

export function SettlementDetailPage() {
  const { selectedCompanyId } = useCompanyContext();
  const auth = useAuth();
  const { pushToast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const companyId = selectedCompanyId ?? "";
  const settlementId = searchParams.get("settlement_id");
  const [reverseBusy, setReverseBusy] = useState(false);
  const [unlockBusy, setUnlockBusy] = useState(false);
  const [reverseReasonOpen, setReverseReasonOpen] = useState(false);
  const [unlockReasonOpen, setUnlockReasonOpen] = useState(false);

  const detailQuery = useQuery({
    queryKey: ["driver-finance", "settlement-detail", settlementId, companyId],
    queryFn: () => getSettlement(settlementId!, companyId),
    enabled: Boolean(settlementId && companyId),
  });

  const readoutQuery = useQuery({
    queryKey: ["tour-readout", "settlement", companyId, settlementId],
    queryFn: () => getTourReadout(settlementId!, companyId),
    enabled: Boolean(settlementId && companyId),
  });
  const readout = readoutQuery.data;

  const companySettlementId = readout?.company_settlement?.id ?? null;
  const companyReportQuery = useQuery({
    queryKey: ["company-settlement-report", companyId, companySettlementId],
    queryFn: () => getCompanySettlementReport(companySettlementId!, companyId),
    enabled: Boolean(companySettlementId && companyId),
  });
  const companyReport = companyReportQuery.data;

  const settlement = (detailQuery.data ?? {}) as Record<string, unknown>;
  const driverId = settlement.driver_id ? String(settlement.driver_id) : null;

  const paymentState = String(settlement.payment_state ?? "unpaid");
  const settlementDisplayId =
    settlementNumber(settlement) ?? (settlement.is_presettlement === true ? "PENDING" : null);
  const settlementIsCancelled = String(settlement.status ?? "") === "cancelled";
  const settlementIsLocked = Boolean(settlement.locked_at) && !settlementIsCancelled;
  const settlementIsPaid = String(settlement.status ?? "") === "paid";
  const canVoidSettlement = auth.user?.role === "Owner" || auth.user?.role === "Accountant";
  const showManualPaidDraftBanner = paymentState === "manual_paid";

  async function refreshSettlementViews() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["driver-finance"] }),
      queryClient.invalidateQueries({
        queryKey: ["driver-finance", "settlement-detail", settlementId, companyId],
      }),
    ]);
  }

  function openJournalEntry() {
    if (!settlementId) return;
    navigate(`/accounting/proof-trail/settlement/${encodeURIComponent(settlementId)}`);
  }

  function openWorkflow() {
    if (!settlementId) return;
    const next = new URLSearchParams(searchParams);
    next.set("settlement_id", settlementId);
    next.set("workflow", "1");
    navigate(`/driver-finance/settlements?${next.toString()}`);
  }

  async function submitReverseReason(reason: string) {
    if (!settlementId || !companyId) return;
    const trimmed = reason.trim();
    if (!trimmed) {
      pushToast("A reason is required to reverse a settlement", "error");
      return;
    }
    setReverseBusy(true);
    try {
      const result = await reverseSettlement(settlementId, companyId, trimmed);
      pushToast(
        result.bank_transaction_unmatched
          ? "Settlement reversed — linked bank transaction returned to review"
          : "Settlement reversed",
        "success"
      );
      await refreshSettlementViews();
      setReverseReasonOpen(false);
    } catch (error) {
      pushToast(userFacingApiError(error, "Reverse blocked"), "error");
    } finally {
      setReverseBusy(false);
    }
  }

  async function submitUnlockReason(reason: string) {
    if (!settlementId || !companyId) return;
    const trimmed = reason.trim();
    if (!trimmed) {
      pushToast("A reason is required to unlock a settlement", "error");
      return;
    }
    setUnlockBusy(true);
    try {
      await unlockSettlement(settlementId, companyId, trimmed);
      pushToast("Settlement unlocked", "success");
      await refreshSettlementViews();
      setUnlockReasonOpen(false);
    } catch (error) {
      pushToast(userFacingApiError(error, "Unlock failed"), "error");
    } finally {
      setUnlockBusy(false);
    }
  }

  if (!settlementId) {
    return (
      <div className="space-y-3">
        <PageHeader title="Settlement statement" subtitle="Select a settlement from the list" />
        <div className="rounded-sm border border-gray-200 bg-white p-3 text-xs text-gray-600">
          No settlement selected.
        </div>
      </div>
    );
  }

  if (detailQuery.isError) {
    return (
      <div className="space-y-3">
        <BackButton label="Driver Settlements" fallbackTo="/driver-finance/settlements" />
        <PageHeader title="Settlement statement" />
        <ListErrorState
          title="Couldn't load this settlement"
          {...formatQueryErrorDetail(detailQuery.error)}
          onRetry={() => void detailQuery.refetch()}
        />
      </div>
    );
  }

  if (
    detailQuery.data &&
    String((detailQuery.data as Record<string, unknown>).id ?? "") !== String(settlementId)
  ) {
    return (
      <div className="space-y-3">
        <BackButton label="Driver Settlements" fallbackTo="/driver-finance/settlements" />
        <PageHeader title="Settlement statement" subtitle="Loading…" />
      </div>
    );
  }

  const matchedBankTransactionId =
    typeof settlement.matched_bank_transaction_id === "string"
      ? settlement.matched_bank_transaction_id
      : null;

  const driverStatementHtml = `/api/v1/driver-finance/settlements/${encodeURIComponent(settlementId)}.html?operating_company_id=${encodeURIComponent(companyId)}`;

  return (
    <div className="space-y-3" data-testid="settlement-detail-approved-design" data-surface="settlement-statement-document">
      <BackButton label="Driver Settlements" fallbackTo="/driver-finance/settlements" />
      <Breadcrumb
        items={[
          { label: "Driver Settlements", href: "/driver-finance/settlements" },
          { label: "Statement" },
        ]}
      />
      {matchedBankTransactionId && companyId ? (
        <OnlineBankingMatchBanner
          companyId={companyId}
          bankTransactionId={matchedBankTransactionId}
          txnDate={
            typeof settlement.matched_bank_transaction_date === "string"
              ? settlement.matched_bank_transaction_date
              : null
          }
          description={
            typeof settlement.matched_bank_transaction_description === "string"
              ? settlement.matched_bank_transaction_description
              : null
          }
          amountCents={
            settlement.matched_bank_transaction_amount_cents != null
              ? (settlement.matched_bank_transaction_amount_cents as string | number)
              : null
          }
          invalidateKeys={[["driver-finance", "settlement-detail", settlementId, companyId]]}
        />
      ) : null}
      <PageHeader
        title={settlementDisplayId ? `Settlement ${settlementDisplayId}` : "Settlement statement"}
        subtitle="Full settlement document — finalize and payment on Settlement workflow"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => openPrintableDocument(driverStatementHtml)}>
              Print statement
            </Button>
            <Button variant="secondary" size="sm" onClick={() => openCanonicalDocument(driverStatementHtml)}>
              Download PDF
            </Button>
            {companySettlementId ? (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  data-testid="settlement-company-print-pdf"
                  onClick={() =>
                    openPrintableDocument(companySettlementHtmlUrl(companyId, companySettlementId))
                  }
                >
                  Print company settlement
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  data-testid="settlement-company-download-pdf"
                  onClick={() =>
                    openCanonicalDocument(companySettlementHtmlUrl(companyId, companySettlementId))
                  }
                >
                  Company settlement PDF
                </Button>
              </>
            ) : null}
            <Button variant="secondary" size="sm" onClick={openJournalEntry}>
              Open journal entry
            </Button>
            <Button variant="secondary" size="sm" onClick={openWorkflow} data-testid="settlement-open-workflow">
              Settlement workflow
            </Button>
            {!settlementIsCancelled ? (
              settlementIsLocked ? (
                canVoidSettlement ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={unlockBusy}
                    onClick={() => setUnlockReasonOpen(true)}
                  >
                    {unlockBusy ? "Unlocking…" : "Unlock to reverse"}
                  </Button>
                ) : (
                  <Button variant="secondary" size="sm" disabled title="Requires Owner or Accountant">
                    Locked
                  </Button>
                )
              ) : canVoidSettlement ? (
                <Button
                  variant="danger"
                  size="sm"
                  disabled={reverseBusy || settlementIsPaid}
                  title={
                    settlementIsPaid
                      ? "Already paid out to the driver — cannot reverse via this path"
                      : undefined
                  }
                  onClick={() => setReverseReasonOpen(true)}
                >
                  {reverseBusy ? "Reversing…" : "Reverse settlement"}
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled
                  title="Reversing a settlement requires Owner or Accountant"
                >
                  Reverse settlement
                </Button>
              )
            ) : null}
          </div>
        }
      />
      <VoidedBanner
        voidedAt={settlement.voided_at as string | null | undefined}
        voidReason={settlement.void_reason as string | null | undefined}
        voidedByUserId={settlement.voided_by_user_id as string | null | undefined}
        documentLabel="Settlement"
      />
      {showManualPaidDraftBanner ? (
        <div
          role="status"
          className="rounded border border-slate-200 bg-slate-100 px-3 py-2 text-xs text-slate-700"
          data-testid="settlement-manual-paid-banner"
        >
          This settlement was marked as paid manually. Confirm the payment cleared your bank before closing the period.
        </div>
      ) : null}
      {settlementId && companyId ? (
        <SettlementStatementDocumentBody
          settlementId={settlementId}
          companyId={companyId}
          settlement={settlement}
          settlementDisplayId={settlementDisplayId}
          readout={readout}
          companyReport={companyReport}
          driverId={driverId}
        />
      ) : null}
      <VoidReasonModal
        open={reverseReasonOpen}
        title="Reverse settlement"
        entityRef={
          settlement?.source_document_ref ? `Settlement ${settlement.source_document_ref}` : undefined
        }
        submitLabel="Reverse"
        postsReversingEntry={true}
        onClose={() => setReverseReasonOpen(false)}
        onSubmit={submitReverseReason}
      />
      <VoidReasonModal
        open={unlockReasonOpen}
        title="Unlock settlement"
        entityRef={
          settlement?.source_document_ref ? `Settlement ${settlement.source_document_ref}` : undefined
        }
        submitLabel="Unlock"
        postsReversingEntry={false}
        onClose={() => setUnlockReasonOpen(false)}
        onSubmit={submitUnlockReason}
      />
    </div>
  );
}
