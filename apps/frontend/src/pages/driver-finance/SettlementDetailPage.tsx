/**
 * ROUND 443.293-A — the owner's eight-section settlement document, then the
 * ROUND 443.280-A board strip + 2×2 panels. Finalize / payment / deductions /
 * dispute live on SettlementStatementWorkflowPage (`?settlement_id=&workflow=1`).
 * JE opens /accounting/proof-trail/settlement/:id.
 */
import { settlementNumber } from "../../lib/settlementNumber";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams, useNavigate } from "react-router-dom";
import { getSettlement } from "../../api/driverFinance";
import { getDriver } from "../../api/mdata";
import { formatDateUS } from "../../lib/formatDate";
import { formatQueryErrorDetail } from "../../lib/tableError";
import { openCanonicalDocument, openPrintableDocument } from "../../lib/openPrintableDocument";
import { EntityLink } from "../../components/shared/EntityLink";
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
import { getCompanySettlementReport } from "../../api/accounting";
import { V3KpiTile } from "../../components/v3/V3KpiTile";
import { SettlementStatementBoardPanels } from "./components/SettlementStatementBoardPanels";
import { SettlementStatementDocument } from "./components/SettlementStatementDocument";
import {
  reverseSettlement,
  unlockSettlement,
} from "../../api/driverFinance";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

function payBasisPlainEnglish(payBasis: string | null | undefined): string {
  if (payBasis === "practical_miles") return "paid on practical miles";
  if (payBasis === "short_miles") return "paid on short miles";
  return payBasis ? `paid on ${String(payBasis).replace(/_/g, " ")}` : "—";
}

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
  const driverQuery = useQuery({
    queryKey: ["mdata", "driver", driverId, companyId],
    queryFn: () => getDriver(driverId!, companyId),
    enabled: Boolean(driverId && companyId),
  });
  const payBasisSub = payBasisPlainEnglish(
    driverQuery.data?.pay_basis ?? (typeof settlement.pay_basis === "string" ? settlement.pay_basis : null)
  );

  const paymentState = String(settlement.payment_state ?? "unpaid");
  const settlementDisplayId =
    settlementNumber(settlement) ?? (settlement.is_presettlement === true ? "PENDING" : null);
  const companySettlementLabel = (() => {
    const t = String(readout?.company_settlement?.display_id ?? settlementDisplayId ?? "").trim();
    return t ? `Company settlement ${t}` : "Company settlement";
  })();
  const settlementIsCancelled = String(settlement.status ?? "") === "cancelled";
  const settlementIsLocked = Boolean(settlement.locked_at) && !settlementIsCancelled;
  const settlementIsPaid = String(settlement.status ?? "") === "paid";
  const canVoidSettlement = auth.user?.role === "Owner" || auth.user?.role === "Accountant";
  const showManualPaidDraftBanner = paymentState === "manual_paid";

  const lines = (settlement.lines as Array<Record<string, unknown>> | undefined) ?? [];
  const activeLines = useMemo(
    () => lines.filter((line) => !line.voided_at && line.is_active !== false),
    [lines]
  );

  const earnings = activeLines
    .filter((line) => String(line.line_type) === "earnings")
    .map((line) => ({
      id: String(line.id),
      load_id: typeof line.load_id === "string" ? line.load_id : null,
      load_number: typeof line.load_number === "string" ? line.load_number : null,
      origin_city: typeof line.origin_city === "string" ? line.origin_city : null,
      origin_state: typeof line.origin_state === "string" ? line.origin_state : null,
      dest_city: typeof line.dest_city === "string" ? line.dest_city : null,
      dest_state: typeof line.dest_state === "string" ? line.dest_state : null,
      miles: line.miles == null ? undefined : Number(line.miles),
      rate: line.rate_cents == null ? undefined : Number(line.rate_cents) / 100,
      amount: Number(line.amount ?? 0),
    }));

  const summary = useMemo(() => {
    const earningsTotal = earnings.reduce((sum, row) => sum + row.amount, 0);
    const deadheadTotal = activeLines
      .filter((line) => String(line.line_type) === "deadhead_pay")
      .reduce((sum, line) => sum + Number(line.amount ?? 0), 0);
    const extraTotal = activeLines
      .filter((line) => String(line.line_type) === "extra_pay")
      .reduce((sum, line) => sum + Number(line.amount ?? 0), 0);
    const reimbTotal = activeLines
      .filter((line) => String(line.line_type) === "reimbursement")
      .reduce((sum, line) => sum + Number(line.amount ?? 0), 0);
    const deductionTotal = activeLines
      .filter((line) => ["deduction", "escrow_contribution"].includes(String(line.line_type)))
      .reduce((sum, line) => sum + Number(line.amount ?? 0), 0);
    return { earningsTotal, deadheadTotal, extraTotal, reimbTotal, deductionTotal };
  }, [activeLines, earnings]);

  const driverNetCents = Math.round(
    (summary.earningsTotal +
      summary.deadheadTotal +
      summary.extraTotal +
      summary.reimbTotal -
      summary.deductionTotal) *
      100
  );

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

  function openFuelFills() {
    openWorkflow();
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

  return (
    <div className="space-y-3" data-testid="settlement-detail-approved-design" data-surface="settlement-statement-board">
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
        subtitle="Board statement — finalize and payment on Settlement workflow"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                openPrintableDocument(
                  `/api/v1/driver-finance/settlements/${encodeURIComponent(settlementId)}.html?operating_company_id=${encodeURIComponent(companyId)}`
                )
              }
            >
              Print statement
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                openCanonicalDocument(
                  `/api/v1/driver-finance/settlements/${encodeURIComponent(settlementId)}.html?operating_company_id=${encodeURIComponent(companyId)}`
                )
              }
            >
              Download PDF
            </Button>
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
      <div
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 8 }}
        data-testid="settlements-statement-v3-kpis"
        data-settlements-statement-v3-kpis="1"
      >
        <V3KpiTile
          label="Settlement"
          value={settlementDisplayId ?? "—"}
          sub={
            companySettlementId ? (
              <EntityLink
                kind="company_settlement"
                id={companySettlementId}
                label={companySettlementLabel}
              />
            ) : (
              "Company settlement"
            )
          }
          testId="settlement-statement-kpi-number"
        />
        <V3KpiTile
          label="Driver · Unit"
          value={String(settlement.driver_full_name ?? "—")}
          sub={
            readout?.tour?.unit_number
              ? `${readout.tour.unit_number} · ${payBasisSub}`
              : payBasisSub
          }
          testId="settlement-statement-kpi-driver-unit"
        />
        <V3KpiTile
          label="Tour"
          value={
            settlement.period_start || settlement.period_end
              ? `${formatDateUS(String(settlement.period_start ?? "")) || "—"} → ${formatDateUS(String(settlement.period_end ?? "")) || "—"}`
              : "—"
          }
          sub={
            readout && readout.legs.length > 0
              ? readout.legs.map((leg) => `${leg.trip_type ?? ""} ${leg.load_number}`.trim()).join(" · ")
              : "—"
          }
          testId="settlement-statement-kpi-tour"
        />
        <V3KpiTile
          label="Status"
          value={
            settlementIsCancelled
              ? "Voided"
              : settlementIsPaid
                ? "Closed · paid"
                : String(settlement.status ?? "—")
          }
          tone={settlementIsCancelled ? "red" : settlementIsPaid ? "green" : "ink"}
          sub={
            settlementIsCancelled
              ? "Reversal on file"
              : settlementIsPaid
                ? "Signed PDF on file"
                : paymentState
          }
          testId="settlement-statement-kpi-status"
        />
      </div>
      {settlementId && companyId ? (
        <>
          <SettlementStatementDocument
            settlementNumber={settlementDisplayId}
            periodStart={settlement.period_start ? String(settlement.period_start) : null}
            periodEnd={settlement.period_end ? String(settlement.period_end) : null}
            readout={readout}
            companyReport={companyReport}
          />
          <SettlementStatementBoardPanels
            settlementId={settlementId}
            companyId={companyId}
            settlementDisplayId={settlementDisplayId}
            earnings={earnings}
            deductionTotalDollars={summary.deductionTotal}
            reimbursementTotalDollars={summary.reimbTotal}
            driverNetCents={driverNetCents}
            readout={readout}
            companyReport={companyReport}
            matchedBankTransactionId={matchedBankTransactionId}
            onOpenJournalEntry={openJournalEntry}
            onOpenFuelFills={openFuelFills}
          />
        </>
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
