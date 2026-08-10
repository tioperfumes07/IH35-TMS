import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  acknowledgeSettlement,
  finalizeSettlement,
  openSettlementDispute,
  getSettlementPaymentEvents,
  getSettlement,
  getOpenDriverBills,
  markSettlementBounced,
  markSettlementCleared,
  markSettlementPaidManually,
  markSettlementSent,
  queueSettlementPayment,
  type SettlementDisputeCategory,
  type OpenDriverBill,
} from "../../api/driverFinance";
import { resolveApiUrl } from "../../api/client";
import { formatUsdCents } from "../../lib/money";
import { EntityLink } from "../../components/shared/EntityLink";
import { PageHeader } from "../../components/layout/PageHeader";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { Button } from "../../components/Button";
import { BackButton } from "../../components/shared/BackButton";
import { Breadcrumb } from "../../components/shared/Breadcrumb";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useAuth } from "../../auth/useAuth";
import { previewTeamSettlementSplit } from "../../api/mdata";
import { DebtBanner } from "./components/DebtBanner";
import { DeductionsSection, type DeductionRow } from "./components/DeductionsSection";
import { EarningsSection } from "./components/EarningsSection";
import { EscrowVisualizer } from "./components/EscrowVisualizer";
import { SETTLEMENT_DISPUTE_CATEGORY_OPTIONS } from "./settlementDisputeCategories";
import { ExtraPaySection } from "./components/ExtraPaySection";
import { FinalizeBlock } from "./components/FinalizeBlock";
import { HoldDeductionModal } from "./components/HoldDeductionModal";
import { LiabilityBreakdownModal } from "./components/LiabilityBreakdownModal";
import { NetPaySummary } from "./components/NetPaySummary";
import { PendingAckNotice } from "./components/PendingAckNotice";
import { ReimbursementsSection } from "./components/ReimbursementsSection";
import { SettlementHeader } from "./components/SettlementHeader";
import { useLiveDebt } from "./hooks/useLiveDebt";
import { PayRunClosePanel } from "./components/PayRunClosePanel";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import { userFacingApiError } from "../../lib/api-error-message";

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
  const auth = useAuth();
  const { pushToast } = useToast();
  const navigate = useNavigate();
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
  const [disputeCategory, setDisputeCategory] = useState("missing_pay");
  const [disputeAmount, setDisputeAmount] = useState("");
  const [disputeDescription, setDisputeDescription] = useState("");

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
  const canOpenDispute = auth.user?.role === "Owner" || auth.user?.role === "Administrator" || auth.user?.role === "Driver";

  async function refreshSettlementViews() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["driver-finance"] }),
      queryClient.invalidateQueries({ queryKey: ["driver-finance", "settlement-detail", settlementId, companyId] }),
      queryClient.invalidateQueries({ queryKey: ["driver-finance", "settlement-payment-events", settlementId, companyId] }),
    ]);
  }

  const driverId = settlement.driver_id ? String(settlement.driver_id) : null;
  const openBillsQuery = useQuery({
    queryKey: ["driver-finance", "open-driver-bills", companyId, driverId],
    queryFn: () => getOpenDriverBills(companyId, driverId ?? undefined),
    enabled: Boolean(companyId && driverId),
  });
  const debt = useLiveDebt(driverId, companyId || null);
  const lines = (settlement.lines as Array<Record<string, unknown>> | undefined) ?? [];
  const hasEngineTeamSplitLines = useMemo(
    () => lines.some((line) => ["team_split_primary", "team_split_secondary"].includes(String(line.line_type))),
    [lines]
  );
  const settlementLoadId =
    (typeof settlement.load_id === "string" ? settlement.load_id : null) ??
    (typeof (lines[0] as Record<string, unknown> | undefined)?.load_id === "string"
      ? String((lines[0] as Record<string, unknown>).load_id)
      : null);

  // LAW OF THE LAND §9 (2026-07-22): "Loads in cycle" reverse-link — distinct load ids carried
  // directly on settlement_lines.load_id (Jorge LOCKED 2026-06-27 direct-trace column), not just the
  // header's single settlementLoadId (a settlement may cover multiple loads for a driver's period).
  // SETTLEMENT-DETAIL-SHOWS-RAW-UUID: carry the load NUMBER alongside the id. The line already has it
  // (`line.load_number`), so the header no longer has to print a uuid fragment for a load it can name.
  const settlementLoadIds = useMemo(() => {
    const byId = new Map<string, string | null>();
    for (const line of lines) {
      const loadId = (line as Record<string, unknown>).load_id;
      if (typeof loadId !== "string" || !loadId) continue;
      const num = (line as Record<string, unknown>).load_number;
      const number = typeof num === "string" && num ? num : null;
      // First non-null number wins; a later line without one must not erase it.
      if (!byId.has(loadId) || (byId.get(loadId) === null && number !== null)) byId.set(loadId, number);
    }
    return Array.from(byId, ([id, number]) => ({ id, number }));
  }, [lines]);

  const teamSplitQuery = useQuery({
    queryKey: ["driver-finance", "team-settlement-split", settlementLoadId, companyId],
    queryFn: () => previewTeamSettlementSplit(settlementLoadId!, companyId),
    enabled: Boolean(settlementLoadId && companyId),
  });

  const earnings = lines.filter((line) => String(line.line_type) === "earnings").map((line) => ({
    id: String(line.id),
    // C5 — the load was carried on the line and then dropped here, which is why the Earnings
    // "Load" column had nothing but the line id to show.
    load_id: typeof line.load_id === "string" ? line.load_id : null,
    load_number: typeof line.load_number === "string" ? line.load_number : null,
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
    // DD2 / NO-WINDOW — this excluded any pending_ack deduction from the total, so a real deduction the
    // ledger already holds showed as $0 on screen. That is both a missing window over driver money and the
    // `pending_acknowledgment` blocking pattern §9.5 forbids outright: the SIGNED HIRE CONTRACT authorizes
    // settlement deductions, there is NO separate driver e-sign and no per-expense acknowledgment gate.
    // Every deduction now counts toward the total; pending_ack stays as a DISCLOSURE (badge + its own
    // subtotal below), which is the company-user sign-off control MUST 3.4.2(d)(e) actually requires.
    const deductionTotal = deductions.reduce((sum, row) => sum + row.this_period_amount, 0);
    const pendingAckTotal = deductions.reduce((sum, row) => sum + (row.pending_ack ? row.this_period_amount : 0), 0);
    return { earningsTotal, extraTotal, reimbTotal, deductionTotal, pendingAckTotal };
  }, [deductions, earnings, extra, reimbursements]);

  if (!settlementId) {
    return (
      <div className="space-y-3">
        <PageHeader title="Settlement Detail" subtitle="Select a settlement from list view" />
        <div className="rounded-sm border border-gray-200 bg-white p-3 text-sm text-gray-600">No settlement selected.</div>
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
      <PageHeader
        title="Settlement Detail"
        subtitle="Debt-alert invariant enforced"
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              window.open(
                resolveApiUrl(
                  `/api/v1/driver-finance/settlements/${encodeURIComponent(settlementId)}.html?operating_company_id=${encodeURIComponent(companyId)}`
                ),
                "_blank",
                "noopener,noreferrer"
              )
            }
          >
            View settlement PDF
          </Button>
        }
      />
      {hasEngineTeamSplitLines ? (
        <div className="mb-3 inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-400">
          Team split lines detected (primary/co-driver)
        </div>
      ) : null}
      <SettlementHeader
        driverId={driverId}
        driverName={String(settlement.driver_full_name ?? "-")}
        periodStart={String(settlement.period_start ?? "-")}
        periodEnd={String(settlement.period_end ?? "-")}
        status={String(settlement.status ?? "-")}
        computedAt={debt.computedAt}
        loadIds={settlementLoadIds}
        onRefresh={() => void debt.refresh()}
      />
      {canOpenDispute ? (
        <div className="rounded-sm border border-slate-200 bg-slate-100 p-3 text-xs">
          <p className="mb-2 font-semibold text-slate-700">Open Dispute</p>
          <div className="grid gap-2 md:grid-cols-3">
            <SelectCombobox
              value={disputeCategory}
              onChange={(event) => setDisputeCategory(event.target.value)}
              className="rounded-sm border border-slate-300 bg-white px-2 py-1"
              data-testid="settlement-detail-dispute-category"
            >
              {/* SETL-PICK-03: same options module as SettlementDisputeModal (DB CHECK). */}
              {SETTLEMENT_DISPUTE_CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectCombobox>
            {/* M-1: dollars-mode QBO money entry; bridged so Math.round(disputeAmount*100) is byte-for-byte. */}
            <MoneyInput
              valueDollars={disputeAmount ? Number(disputeAmount) : null}
              onChangeDollars={(d) => setDisputeAmount(d == null ? "" : String(d))}
              ariaLabel="Disputed amount (USD, optional)"
              placeholder="Disputed amount (USD, optional)"
            />
            <Button
              size="sm"
              onClick={() => {
                if (!companyId || !settlement.driver_id) return;
                const trimmed = disputeDescription.trim();
                if (trimmed.length < 20) {
                  pushToast("Dispute description must be at least 20 characters", "error");
                  return;
                }
                void openSettlementDispute({
                  operating_company_id: companyId,
                  settlement_id: settlementId,
                  driver_id: String(settlement.driver_id),
                  dispute_category: disputeCategory as SettlementDisputeCategory,
                  dispute_description: trimmed,
                  disputed_amount_cents: disputeAmount.trim()
                    ? Math.max(0, Math.round(Number(disputeAmount) * 100)) || undefined
                    : undefined,
                })
                  .then(() => {
                    pushToast("Dispute opened", "success");
                    setDisputeDescription("");
                    setDisputeAmount("");
                  })
                  .catch((error) => pushToast(userFacingApiError(error, "Request failed"), "error"));
              }}
            >
              Open Dispute
            </Button>
          </div>
          <textarea
            value={disputeDescription}
            onChange={(event) => setDisputeDescription(event.target.value)}
            className="mt-2 min-h-[80px] w-full rounded-sm border border-slate-300 bg-white px-2 py-1"
            placeholder="Describe the settlement issue (minimum 20 characters)."
          />
        </div>
      ) : null}

      <DebtBanner
        totalActiveDebt={debt.isStale ? "Refreshing..." : debt.debt?.total_active_debt ?? 0}
        pendingAckCount={debt.debt?.pending_ack_count ?? 0}
        pendingAckTotal={debt.debt?.pending_ack_total ?? 0}
        proposedDeductions={summary.deductionTotal}
        isRefreshing={debt.isStale}
        onOpenBreakdown={() => setLiabilityOpen(true)}
        onOpenEscrow={() => {
          // ACCT-SURF-09: settlement → Accounting Escrow (canonical books surface), not toast/banking-only.
          // Banking Driver Escrow remains reachable as a second hop from Accounting Escrow / Banking Home.
          const q = new URLSearchParams();
          if (driverId) q.set("holder_id", driverId);
          navigate(`/accounting/escrow${q.toString() ? `?${q.toString()}` : ""}`);
        }}
      />
      <PendingAckNotice pendingAckCount={debt.debt?.pending_ack_count ?? 0} />
      {teamSplitQuery.data && Array.isArray((teamSplitQuery.data as Record<string, unknown>).splits) ? (
        <div className="rounded-sm border border-slate-300 bg-slate-100 p-3 text-xs">
          <p className="mb-1 font-semibold text-slate-700">Team Split</p>
          <div className="space-y-1">
            {((teamSplitQuery.data as Record<string, unknown>).splits as Array<Record<string, unknown>>).map((split, index) => (
              <div key={`${index}-${String(split.driver_id ?? "")}`} className="rounded-sm border border-slate-300 bg-white px-2 py-1">
                Driver {String(split.driver_id ?? "—")} · Role {String(split.pay_role ?? "—")} ·
                Share {Number(split.share_pct ?? 0)}% ·
                Pay ${((Number(split.driver_pay_cents ?? 0) || 0) / 100).toFixed(2)}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.5fr_1fr]">
        <div className="space-y-2">
          <EarningsSection lines={earnings} />
          <ExtraPaySection lines={extra} />
          <ReimbursementsSection lines={reimbursements} />
          <DeductionsSection rows={deductions} onHold={(row) => setHoldTarget(row)} />
          <OpenDriverBillsSection
            loading={openBillsQuery.isPending}
            driverId={driverId}
            items={(openBillsQuery.data?.open_driver_bills?.items ?? []) as OpenDriverBill[]}
            totalCount={openBillsQuery.data?.open_driver_bills?.total_count ?? 0}
            totalGrossCents={openBillsQuery.data?.open_driver_bills?.total_gross_cents ?? 0}
          />
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
            onOpenTimeline={() => {
              // ACCT-SURF-09: timeline opens Accounting Escrow for this driver — no toast dead-end.
              const q = new URLSearchParams();
              if (driverId) q.set("holder_id", driverId);
              navigate(`/accounting/escrow${q.toString() ? `?${q.toString()}` : ""}`);
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
            onSaveDraft={() => pushToast("Draft persistence is not available yet", "info")}
            onFinalize={() => {
              if (!companyId) return;
              void finalizeSettlement(settlementId, companyId)
                .then(() => {
                  pushToast("Settlement finalized", "success");
                  void refreshSettlementViews();
                })
                .catch((error) => pushToast(userFacingApiError(error, "Finalize blocked"), "error"));
            }}
          />
          {companyId ? (
            <PayRunClosePanel
              settlementId={settlementId}
              companyId={companyId}
              userRole={auth.user?.role}
              settlementStatus={String(settlement.status ?? "")}
              onPosted={() => void refreshSettlementViews()}
            />
          ) : null}
          {isFinalSettlement ? (
            <div className="rounded-sm border border-gray-200 bg-white p-3 text-sm">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Payment Status</p>
                <span className="rounded-sm bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">{paymentState}</span>
              </div>
              <div className="space-y-2">
                {paymentState === "unpaid" ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <input
                        value={manualPaymentMethod}
                        onChange={(event) => setManualPaymentMethod(event.target.value)}
                        placeholder="Payment method (e.g. check)"
                        className="w-full rounded-sm border border-gray-300 px-2 py-1 text-xs"
                      />
                      <input
                        value={manualReference}
                        onChange={(event) => setManualReference(event.target.value)}
                        placeholder="Manual payment reference"
                        className="w-full rounded-sm border border-gray-300 px-2 py-1 text-xs"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-sm bg-[#1F2A44] px-2 py-1 text-xs text-white"
                      onClick={() =>
                        void queueSettlementPayment(settlementId)
                          .then(() => {
                            pushToast("Settlement payment queued", "success");
                            void refreshSettlementViews();
                          })
                          .catch((error) => pushToast(userFacingApiError(error, "Queue failed"), "error"))
                      }
                    >
                      Queue Payment
                    </button>
                    <button
                      type="button"
                      className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
                      onClick={() =>
                        void markSettlementPaidManually(settlementId, {
                          payment_method: manualPaymentMethod,
                          reference: manualReference || undefined,
                        })
                          .then(() => {
                            pushToast("Marked paid manually", "success");
                            void refreshSettlementViews();
                          })
                          .catch((error) => pushToast(userFacingApiError(error, "Mark manual failed"), "error"))
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
                      className="w-full rounded-sm border border-gray-300 px-2 py-1 text-xs"
                    />
                    <button
                      type="button"
                      className="rounded-sm bg-[#1F2A44] px-2 py-1 text-xs text-white"
                      onClick={() =>
                        void markSettlementSent(settlementId, bankReference || "manual-bank-reference")
                          .then(() => {
                            pushToast("Marked sent to bank", "success");
                            void refreshSettlementViews();
                          })
                          .catch((error) => pushToast(userFacingApiError(error, "Mark sent failed"), "error"))
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
                        className="rounded-sm bg-slate-600 px-2 py-1 text-xs text-white"
                        onClick={() =>
                          void markSettlementCleared(settlementId)
                            .then(() => {
                              pushToast("Marked cleared", "success");
                              void refreshSettlementViews();
                            })
                            .catch((error) => pushToast(userFacingApiError(error, "Mark cleared failed"), "error"))
                        }
                      >
                        Mark Cleared
                      </button>
                    </div>
                    <input
                      value={bounceReason}
                      onChange={(event) => setBounceReason(event.target.value)}
                      placeholder="Bounce reason"
                      className="w-full rounded-sm border border-gray-300 px-2 py-1 text-xs"
                    />
                    <button
                      type="button"
                      className="rounded-sm border border-red-300 px-2 py-1 text-xs text-red-700"
                      onClick={() =>
                        void markSettlementBounced(settlementId, bounceReason || "Bank return")
                          .then(() => {
                            pushToast("Marked bounced", "success");
                            void refreshSettlementViews();
                          })
                          .catch((error) => pushToast(userFacingApiError(error, "Mark bounced failed"), "error"))
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
                        className="w-full rounded-sm border border-gray-300 px-2 py-1 text-xs"
                      />
                      <input
                        value={manualReference}
                        onChange={(event) => setManualReference(event.target.value)}
                        placeholder="Manual payment reference"
                        className="w-full rounded-sm border border-gray-300 px-2 py-1 text-xs"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-sm bg-[#1F2A44] px-2 py-1 text-xs text-white"
                      onClick={() =>
                        void queueSettlementPayment(settlementId)
                          .then(() => {
                            pushToast("Retry queued", "success");
                            void refreshSettlementViews();
                          })
                          .catch((error) => pushToast(userFacingApiError(error, "Retry failed"), "error"))
                      }
                    >
                      Retry
                    </button>
                    <button
                      type="button"
                      className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
                      onClick={() =>
                        void markSettlementPaidManually(settlementId, {
                          payment_method: manualPaymentMethod,
                          reference: manualReference || undefined,
                        })
                          .then(() => {
                            pushToast("Marked paid manually", "success");
                            void refreshSettlementViews();
                          })
                          .catch((error) => pushToast(userFacingApiError(error, "Mark manual failed"), "error"))
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
                    <div key={event.id} className="rounded-sm border border-gray-100 px-2 py-1 text-xs">
                      <p className="font-semibold text-gray-800">{event.event_type}</p>
                      <p className="text-gray-500">{new Date(event.created_at).toLocaleString()}</p>
                    </div>
                  ))}
                  {/* LV-SETTLEMENT-DETAIL-CALLS-REFUSED-ROUTE — this query had NO error branch, so a failed
                      fetch left `data` undefined, fell into `length === 0`, and the panel asserted
                      "No payment events yet." as FACT. On a settlement that is a money-adjacent surface
                      telling whoever decides whether a driver was paid that no payments exist, when the
                      truth is the data was never obtainable. The endpoint is on the deliberate-refusal
                      registry ("settlement-payment moves money"), so today it always 404s — but the bug is
                      the silent false negative, not the 404, and it would outlive any routing decision.
                      An honest "couldn't load" is strictly safer than a confident wrong "none". */}
                  {paymentEventsQuery.isError ? (
                    <p className="text-xs text-[#dc2626]" data-testid="settlement-payment-events-error">
                      Couldn't load payment events — this is not the same as “none”. Retry or check with
                      accounting before concluding the driver was unpaid.
                    </p>
                  ) : paymentEventsQuery.isLoading ? (
                    <p className="text-xs text-gray-500">Loading payment events…</p>
                  ) : (paymentEventsQuery.data?.events ?? []).length === 0 ? (
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

function OpenDriverBillsSection({
  loading,
  driverId,
  items,
  totalCount,
  totalGrossCents,
}: {
  loading: boolean;
  driverId: string | null;
  items: OpenDriverBill[];
  totalCount: number;
  totalGrossCents: number;
}) {
  if (!driverId) return null;
  if (loading) {
    return (
      <section className="rounded-sm border border-slate-200 bg-slate-50 p-2">
        <h3 className="mb-1 text-xs font-semibold uppercase text-slate-800">Open Driver Bills</h3>
        <p className="text-xs text-gray-500">Loading open driver bills…</p>
      </section>
    );
  }
  return (
    <section className="rounded-sm border border-slate-200 bg-slate-50 p-2">
      <h3 className="mb-1 text-xs font-semibold uppercase text-slate-800">
        Open Driver Bills · {totalCount} · {formatUsdCents(totalGrossCents)}
      </h3>
      {items.length === 0 ? (
        <p className="text-xs text-gray-500">No open driver bills for this driver — all pay is either settled or not yet booked.</p>
      ) : (
        <div className="space-y-1">
          {items.map((bill) => (
            <div key={bill.id} className="flex items-center justify-between text-sm">
              <EntityLink kind="load" id={bill.load_id ?? ""} label={bill.load_number ?? bill.load_id ?? "—"} />
              <span className="font-semibold">{formatUsdCents(bill.gross_amount_cents)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
