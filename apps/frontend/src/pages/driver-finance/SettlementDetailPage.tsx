import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  acknowledgeSettlement,
  finalizeSettlement,
  getEscrowTimeline,
  getSettlementPaymentEvents,
  getSettlement,
  markSettlementBounced,
  markSettlementCleared,
  markSettlementPaidManually,
  markSettlementSent,
  queueSettlementPayment,
} from "../../api/driverFinance";
import { PageHeader } from "../../components/layout/PageHeader";
import { BackButton } from "../../components/shared/BackButton";
import { Breadcrumb } from "../../components/shared/Breadcrumb";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { DebtBanner } from "./components/DebtBanner";
import { DeductionsSection, type DeductionRow } from "./components/DeductionsSection";
import { EarningsSection } from "./components/EarningsSection";
import { EscrowVisualizer } from "./components/EscrowVisualizer";
import { ExtraPaySection } from "./components/ExtraPaySection";
import { FinalizeBlock } from "./components/FinalizeBlock";
import { HoldDeductionModal } from "./components/HoldDeductionModal";
import { LiabilityBreakdownModal } from "./components/LiabilityBreakdownModal";
import { NetPaySummary } from "./components/NetPaySummary";
import { PendingAckNotice } from "./components/PendingAckNotice";
import { ReimbursementsSection } from "./components/ReimbursementsSection";
import { SettlementHeader } from "./components/SettlementHeader";
import { useLiveDebt } from "./hooks/useLiveDebt";

function toDeductionRows(lines: Array<Record<string, unknown>>): DeductionRow[] {
  return lines
    .filter((line) => String(line.line_type) === "deduction")
    .map((line) => ({
      id: String(line.id),
      description: String(line.description ?? "Deduction"),
      balance_left: Number(line.balance_left ?? line.amount ?? 0),
      this_period_amount: Number(line.amount ?? 0),
      is_held: Boolean(line.is_held),
      held_by_user: line.held_by_user_id ? String(line.held_by_user_id) : null,
      pending_ack: Boolean(line.pending_ack),
    }));
}

export function SettlementDetailPage() {
  const { selectedCompanyId } = useCompanyContext();
  const { pushToast } = useToast();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const companyId = selectedCompanyId ?? "";
  const settlementId = searchParams.get("settlement_id");
  const [ackChecked, setAckChecked] = useState(false);
  const [liabilityOpen, setLiabilityOpen] = useState(false);
  const [holdTarget, setHoldTarget] = useState<DeductionRow | null>(null);
  const [bankReference, setBankReference] = useState("");
  const [bounceReason, setBounceReason] = useState("");
  const [manualPaymentMethod, setManualPaymentMethod] = useState("check");
  const [manualReference, setManualReference] = useState("");

  const detailQuery = useQuery({
    queryKey: ["driver-finance", "settlement-detail", settlementId, companyId],
    queryFn: () => getSettlement(settlementId!, companyId),
    enabled: Boolean(settlementId && companyId),
  });
  const paymentEventsQuery = useQuery({
    queryKey: ["driver-finance", "settlement-payment-events", settlementId, companyId],
    queryFn: () => getSettlementPaymentEvents(settlementId!, companyId),
    enabled: Boolean(settlementId && companyId),
  });

  const settlement = (detailQuery.data ?? {}) as Record<string, unknown>;
  const paymentState = String(settlement.payment_state ?? "unpaid");
  const isFinalSettlement = String(settlement.status ?? "") === "locked" || String(settlement.status ?? "") === "final";

  async function refreshSettlementViews() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["driver-finance"] }),
      queryClient.invalidateQueries({ queryKey: ["driver-finance", "settlement-detail", settlementId, companyId] }),
      queryClient.invalidateQueries({ queryKey: ["driver-finance", "settlement-payment-events", settlementId, companyId] }),
    ]);
  }

  const driverId = settlement.driver_id ? String(settlement.driver_id) : null;
  const debt = useLiveDebt(driverId, companyId || null);
  const lines = (settlement.lines as Array<Record<string, unknown>> | undefined) ?? [];

  const earnings = lines.filter((line) => String(line.line_type) === "earnings").map((line) => ({
    id: String(line.id),
    description: String(line.description ?? ""),
    miles: Number(line.miles ?? 0),
    rate: Number(line.rate ?? 0),
    amount: Number(line.amount ?? 0),
  }));
  const extra = lines.filter((line) => String(line.line_type) === "extra_pay").map((line) => ({
    id: String(line.id),
    code: String(line.code ?? "EXTRA"),
    description: String(line.description ?? ""),
    amount: Number(line.amount ?? 0),
  }));
  const reimbursements = lines.filter((line) => String(line.line_type) === "reimbursement").map((line) => ({
    id: String(line.id),
    date: String(line.created_at ?? ""),
    description: String(line.description ?? ""),
    receipt: String(line.receipt_number ?? "receipt"),
    amount: Number(line.amount ?? 0),
  }));
  const deductions = toDeductionRows(lines);

  const summary = useMemo(() => {
    const earningsTotal = earnings.reduce((sum, row) => sum + row.amount, 0);
    const extraTotal = extra.reduce((sum, row) => sum + row.amount, 0);
    const reimbTotal = reimbursements.reduce((sum, row) => sum + row.amount, 0);
    const deductionTotal = deductions.reduce((sum, row) => sum + (row.pending_ack ? 0 : row.this_period_amount), 0);
    const pendingAckTotal = deductions.reduce((sum, row) => sum + (row.pending_ack ? row.this_period_amount : 0), 0);
    return { earningsTotal, extraTotal, reimbTotal, deductionTotal, pendingAckTotal };
  }, [deductions, earnings, extra, reimbursements]);

  if (!settlementId) {
    return (
      <div className="space-y-3">
        <PageHeader title="Settlement Detail" subtitle="Select a settlement from list view" />
        <div className="rounded border border-gray-200 bg-white p-3 text-sm text-gray-600">No settlement selected.</div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <BackButton label="Driver Settlements" />
      <Breadcrumb
        items={[
          { label: "Driver Settlements", href: "/driver-finance/settlements" },
          { label: "Settlement Detail" },
        ]}
      />
      <PageHeader title="Settlement Detail" subtitle="Debt-alert invariant enforced" />
      <SettlementHeader
        driverName={String(settlement.driver_full_name ?? "-")}
        driverDisplayId={String(settlement.driver_display_id ?? "-")}
        periodStart={String(settlement.period_start ?? "-")}
        periodEnd={String(settlement.period_end ?? "-")}
        status={String(settlement.status ?? "-")}
        computedAt={debt.computedAt}
        onRefresh={() => void debt.refresh()}
      />

      <DebtBanner
        totalActiveDebt={debt.isStale ? "Refreshing..." : debt.debt?.total_active_debt ?? 0}
        pendingAckCount={debt.debt?.pending_ack_count ?? 0}
        pendingAckTotal={debt.debt?.pending_ack_total ?? 0}
        proposedDeductions={summary.deductionTotal}
        isRefreshing={debt.isStale}
        onOpenBreakdown={() => setLiabilityOpen(true)}
        onOpenEscrow={() => pushToast("Escrow timeline drawer stub; see side card action.", "info")}
      />
      <PendingAckNotice pendingAckCount={debt.debt?.pending_ack_count ?? 0} />

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.5fr_1fr]">
        <div className="space-y-2">
          <EarningsSection lines={earnings} />
          <ExtraPaySection lines={extra} />
          <ReimbursementsSection lines={reimbursements} />
          <DeductionsSection rows={deductions} onHold={(row) => setHoldTarget(row)} />
        </div>
        <div className="space-y-2">
          <NetPaySummary
            earnings={summary.earningsTotal}
            extraPay={summary.extraTotal}
            reimbursements={summary.reimbTotal}
            deductions={summary.deductionTotal}
            pendingAckDeductions={summary.pendingAckTotal}
          />
          <EscrowVisualizer
            preClause={debt.debt?.escrow_pre_clause ?? 0}
            postClause={debt.debt?.escrow_post_clause ?? 0}
            onOpenTimeline={async () => {
              if (!driverId || !companyId) return;
              const timeline = await getEscrowTimeline(driverId, companyId);
              pushToast(`Escrow timeline rows: ${timeline.timeline.length}`, "info");
            }}
          />
          <FinalizeBlock
            checked={ackChecked}
            pendingAcks={(debt.debt?.pending_ack_count ?? 0) > 0 || Boolean(settlement.has_pending_acks)}
            staleDebt={debt.isStale}
            onCheckedChange={(checked) => {
              setAckChecked(checked);
              if (!checked || !companyId) return;
              void acknowledgeSettlement(settlementId, companyId)
                .then(() => pushToast("Debt summary acknowledged", "success"))
                .catch(() => pushToast("Failed to acknowledge settlement", "error"));
            }}
            onSaveDraft={() => pushToast("Draft saved", "success")}
            onFinalize={() => {
              if (!companyId) return;
              void finalizeSettlement(settlementId, companyId)
                .then(() => {
                  pushToast("Settlement finalized", "success");
                  void refreshSettlementViews();
                })
                .catch((error) => pushToast(`Finalize blocked: ${String((error as Error).message || error)}`, "error"));
            }}
          />
          {isFinalSettlement ? (
            <div className="rounded border border-gray-200 bg-white p-3 text-sm">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Payment Status</p>
                <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">{paymentState}</span>
              </div>
              <div className="space-y-2">
                {paymentState === "unpaid" ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <input
                        value={manualPaymentMethod}
                        onChange={(event) => setManualPaymentMethod(event.target.value)}
                        placeholder="Payment method (e.g. check)"
                        className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                      />
                      <input
                        value={manualReference}
                        onChange={(event) => setManualReference(event.target.value)}
                        placeholder="Manual payment reference"
                        className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded bg-blue-600 px-2 py-1 text-xs text-white"
                      onClick={() =>
                        void queueSettlementPayment(settlementId)
                          .then(() => {
                            pushToast("Settlement payment queued", "success");
                            void refreshSettlementViews();
                          })
                          .catch((error) => pushToast(String((error as Error).message || "Queue failed"), "error"))
                      }
                    >
                      Queue Payment
                    </button>
                    <button
                      type="button"
                      className="rounded border border-gray-300 px-2 py-1 text-xs"
                      onClick={() =>
                        void markSettlementPaidManually(settlementId, {
                          payment_method: manualPaymentMethod,
                          reference: manualReference || undefined,
                        })
                          .then(() => {
                            pushToast("Marked paid manually", "success");
                            void refreshSettlementViews();
                          })
                          .catch((error) => pushToast(String((error as Error).message || "Mark manual failed"), "error"))
                      }
                    >
                      Mark Paid Manually
                    </button>
                    </div>
                  </div>
                ) : null}

                {paymentState === "queued" ? (
                  <div className="space-y-2">
                    <input
                      value={bankReference}
                      onChange={(event) => setBankReference(event.target.value)}
                      placeholder="Bank reference"
                      className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                    />
                    <button
                      type="button"
                      className="rounded bg-blue-600 px-2 py-1 text-xs text-white"
                      onClick={() =>
                        void markSettlementSent(settlementId, bankReference || "manual-bank-reference")
                          .then(() => {
                            pushToast("Marked sent to bank", "success");
                            void refreshSettlementViews();
                          })
                          .catch((error) => pushToast(String((error as Error).message || "Mark sent failed"), "error"))
                      }
                    >
                      Mark Sent to Bank
                    </button>
                  </div>
                ) : null}

                {paymentState === "sent_to_bank" ? (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded bg-green-600 px-2 py-1 text-xs text-white"
                        onClick={() =>
                          void markSettlementCleared(settlementId)
                            .then(() => {
                              pushToast("Marked cleared", "success");
                              void refreshSettlementViews();
                            })
                            .catch((error) => pushToast(String((error as Error).message || "Mark cleared failed"), "error"))
                        }
                      >
                        Mark Cleared
                      </button>
                    </div>
                    <input
                      value={bounceReason}
                      onChange={(event) => setBounceReason(event.target.value)}
                      placeholder="Bounce reason"
                      className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                    />
                    <button
                      type="button"
                      className="rounded border border-red-300 px-2 py-1 text-xs text-red-700"
                      onClick={() =>
                        void markSettlementBounced(settlementId, bounceReason || "Bank return")
                          .then(() => {
                            pushToast("Marked bounced", "success");
                            void refreshSettlementViews();
                          })
                          .catch((error) => pushToast(String((error as Error).message || "Mark bounced failed"), "error"))
                      }
                    >
                      Mark Bounced
                    </button>
                  </div>
                ) : null}

                {paymentState === "bounced" ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <input
                        value={manualPaymentMethod}
                        onChange={(event) => setManualPaymentMethod(event.target.value)}
                        placeholder="Payment method (e.g. check)"
                        className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                      />
                      <input
                        value={manualReference}
                        onChange={(event) => setManualReference(event.target.value)}
                        placeholder="Manual payment reference"
                        className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded bg-blue-600 px-2 py-1 text-xs text-white"
                      onClick={() =>
                        void queueSettlementPayment(settlementId)
                          .then(() => {
                            pushToast("Retry queued", "success");
                            void refreshSettlementViews();
                          })
                          .catch((error) => pushToast(String((error as Error).message || "Retry failed"), "error"))
                      }
                    >
                      Retry
                    </button>
                    <button
                      type="button"
                      className="rounded border border-gray-300 px-2 py-1 text-xs"
                      onClick={() =>
                        void markSettlementPaidManually(settlementId, {
                          payment_method: manualPaymentMethod,
                          reference: manualReference || undefined,
                        })
                          .then(() => {
                            pushToast("Marked paid manually", "success");
                            void refreshSettlementViews();
                          })
                          .catch((error) => pushToast(String((error as Error).message || "Mark manual failed"), "error"))
                      }
                    >
                      Mark Paid Manually
                    </button>
                    </div>
                  </div>
                ) : null}

                <div className="space-y-1 border-t border-gray-100 pt-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Payment Events</p>
                  {(paymentEventsQuery.data?.events ?? []).map((event) => (
                    <div key={event.id} className="rounded border border-gray-100 px-2 py-1 text-xs">
                      <p className="font-semibold text-gray-800">{event.event_type}</p>
                      <p className="text-gray-500">{new Date(event.created_at).toLocaleString()}</p>
                    </div>
                  ))}
                  {(paymentEventsQuery.data?.events ?? []).length === 0 ? (
                    <p className="text-xs text-gray-500">No payment events yet.</p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <LiabilityBreakdownModal
        open={liabilityOpen}
        liabilities={(debt.debt?.source_liabilities as Array<any> | undefined)?.map((item, idx) => ({
          id: String(item.id ?? idx),
          type: String(item.type ?? "Liability"),
          source_description: String(item.source_description ?? item.description ?? "-"),
          original: Number(item.original ?? 0),
          paid: Number(item.paid ?? 0),
          balance: Number(item.balance ?? 0),
          schedule: String(item.schedule ?? "-"),
          pending_ack: Boolean(item.pending_ack),
        })) ?? []}
        onClose={() => setLiabilityOpen(false)}
      />

      <HoldDeductionModal
        open={Boolean(holdTarget)}
        deduction={holdTarget}
        operatingCompanyId={companyId}
        onClose={() => setHoldTarget(null)}
        onHeld={() => {
          void queryClient.invalidateQueries({ queryKey: ["driver-finance", "settlement-detail", settlementId, companyId] });
        }}
      />
    </div>
  );
}
