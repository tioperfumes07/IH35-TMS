/**
 * FinesDeductionsCard — standalone drawer child (Lane A Block 13).
 *
 * Mount in LoadDetailDrawer's Settlement tab:
 *   <FinesDeductionsCard loadId={...} operatingCompanyId={...} canEdit={...} />
 *
 * Reuses existing driver-finance APIs only — no new backend services.
 */
import { entityLabel } from "../../../lib/entity-label";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EntityLinkOrTombstone } from "../../shared/EntityLinkOrTombstone";
import {
  approvePendingEscrowDeduction,
  getPreSettlementForDriver,
  getSettlementsForLoad,
  listPendingEscrowDeductions,
  rejectPendingEscrowDeduction,
  type EscrowPendingDeduction,
} from "../../../api/driverFinance";
import { useLoad } from "../../../api/loads";
import { useAuth } from "../../../auth/useAuth";
import { listAutoDeductionPolicies, type AutoDeductionPolicy } from "../../../hooks/useAutoDeductionPolicies";
import { Button } from "../../Button";
import { Modal } from "../../Modal";
import { formatUsd, formatUsdCents } from "../../../lib/money";
import { userFacingApiError } from "../../../lib/api-error-message";

export type FinesDeductionsCardProps = {
  loadId: string;
  operatingCompanyId: string;
  canEdit: boolean;
};

function formatMoney(cents: number) {
  return formatUsdCents(cents);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

function policyProgress(policy: AutoDeductionPolicy) {
  const owed = Number(policy.total_owed_cents ?? 0);
  const deducted = Number(policy.deducted_so_far_cents ?? 0);
  const pct = owed > 0 ? Math.min(100, Math.round((deducted / owed) * 100)) : 0;
  return { owed, deducted, pct, remaining: Math.max(0, owed - deducted) };
}

export function FinesDeductionsCard({ loadId, operatingCompanyId, canEdit }: FinesDeductionsCardProps) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const loadQ = useLoad(loadId, operatingCompanyId);
  const driverId = loadQ.data?.assigned_primary_driver_id ?? "";

  const [selectedPending, setSelectedPending] = useState<EscrowPendingDeduction | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [actionError, setActionError] = useState("");

  const pendingEscrowQ = useQuery({
    queryKey: ["driver-finance", "escrow-pending", operatingCompanyId, loadId],
    queryFn: () => listPendingEscrowDeductions(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
  });

  const finePoliciesQ = useQuery({
    queryKey: ["auto-deduction-policies", operatingCompanyId, driverId, "fine"],
    queryFn: () => listAutoDeductionPolicies(operatingCompanyId, { driver_id: driverId }),
    enabled: Boolean(operatingCompanyId && driverId),
  });

  const preSettlementQ = useQuery({
    queryKey: ["pre-settlement", "by-driver", driverId, operatingCompanyId, "fines-card"],
    queryFn: () => getPreSettlementForDriver(driverId, operatingCompanyId),
    enabled: Boolean(driverId && operatingCompanyId),
    retry: false,
  });

  // LOAD-SETTLEMENT-TAB-SHOWS-OPEN-NOT-SETTLING / ACCT-F367 — this section's header used to name
  // ONLY the driver's currently-open pre-settlement (preSettlementQ above), even when THIS load was
  // actually paid on a different, already-locked settlement. Resolve the load-aware answer first
  // (bill-first COALESCE, same shape as the settlement DETAIL route) and prefer it whenever it
  // exists; the open pre-settlement is now shown ONLY as a fallback and labelled distinctly so an
  // empty open cycle can never again be mistaken for "this load was never settled".
  const settlementForLoadQ = useQuery({
    queryKey: ["settlement-for-load", loadId, operatingCompanyId],
    queryFn: () => getSettlementsForLoad(loadId, operatingCompanyId),
    enabled: Boolean(loadId && operatingCompanyId),
    retry: false,
  });
  const resolvedSettlement = settlementForLoadQ.data?.settlements?.[0] ?? null;
  const resolvedSettlementIsSettled = Boolean(resolvedSettlement && resolvedSettlement.status !== "open");

  const loadPendingRows = useMemo(
    () => (pendingEscrowQ.data?.data ?? []).filter((row) => row.load_id === loadId && row.status === "pending"),
    [pendingEscrowQ.data, loadId]
  );

  const finePolicies = useMemo(
    () => (finePoliciesQ.data?.rows ?? []).filter((row) => row.deduction_type === "fine"),
    [finePoliciesQ.data]
  );

  const activeFinePolicies = finePolicies.filter((row) => row.status === "active" || row.status === "paused");
  const historyFinePolicies = finePolicies.filter((row) => row.status === "completed");

  const settlementLines = preSettlementQ.data?.lines ?? [];
  const fineDeductionLines = settlementLines.filter(
    (line) => line.line_type === "auto_deduction" && /fine/i.test(line.description)
  );
  const otherDeductionLines = settlementLines.filter(
    (line) => line.line_type === "deduction" || (line.line_type === "auto_deduction" && !/fine/i.test(line.description))
  );

  const isOwner = auth.user?.role === "Owner";
  const canReviewEscrow = canEdit && isOwner;

  const invalidateAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["driver-finance", "escrow-pending", operatingCompanyId] }),
      queryClient.invalidateQueries({ queryKey: ["auto-deduction-policies", operatingCompanyId] }),
      queryClient.invalidateQueries({ queryKey: ["pre-settlement", "by-driver", driverId, operatingCompanyId] }),
    ]);
  };

  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPending) return;
      return approvePendingEscrowDeduction(selectedPending.id, {
        operating_company_id: operatingCompanyId,
        review_notes: reviewNotes.trim() || undefined,
      });
    },
    onSuccess: async () => {
      setSelectedPending(null);
      setReviewNotes("");
      setActionError("");
      await invalidateAll();
    },
    onError: (err) => {
      setActionError(userFacingApiError(err, "Request failed"));
    },
  });

  const deferMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPending) return;
      return rejectPendingEscrowDeduction(selectedPending.id, {
        operating_company_id: operatingCompanyId,
        review_notes: reviewNotes.trim(),
      });
    },
    onSuccess: async () => {
      setSelectedPending(null);
      setReviewNotes("");
      setActionError("");
      await invalidateAll();
    },
    onError: (err) => {
      setActionError(userFacingApiError(err, "Request failed"));
    },
  });

  if (loadQ.isLoading) {
    return (
      <div className="rounded-sm border border-gray-200 bg-gray-50 p-4 text-sm text-gray-500 animate-pulse" data-testid="drawer-fines-deductions-card">
        Loading fines &amp; deductions…
      </div>
    );
  }

  if (!loadQ.data) {
    return (
      <div className="rounded-sm border border-gray-200 p-4 text-sm text-gray-500" data-testid="drawer-fines-deductions-card">
        Load not found.
      </div>
    );
  }

  if (!driverId) {
    return (
      <div className="rounded-sm border border-dashed border-gray-200 bg-gray-50 p-3 text-sm text-gray-600" data-testid="drawer-fines-deductions-card">
        Assign a driver to this load to view fines and settlement deductions.
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="drawer-fines-deductions-card">
      <div className="rounded-sm border border-slate-200 bg-slate-50 p-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700">Fines &amp; Deductions</h3>
        <p className="mt-1 text-xs text-slate-700">
          Fine auto-deduction policies apply per settlement (net-floor cap; over-cap rolls to next period). Confirm or defer
          pending escrow proposals before they post.
        </p>
      </div>

      {/* Pending — confirm / defer per settlement */}
      <section className="rounded-sm border border-slate-200 bg-white p-3">
        <h4 className="mb-2 text-xs font-semibold uppercase text-slate-700">Pending review (this load)</h4>
        {!canReviewEscrow && loadPendingRows.length > 0 ? (
          <p className="mb-2 text-xs text-slate-700">Owner approval required to confirm or defer escrow deductions.</p>
        ) : null}
        <div className="space-y-2">
          {loadPendingRows.map((row) => (
            <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-slate-200 bg-slate-100 px-2 py-1.5 text-xs">
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-slate-700">{formatMoney(row.proposed_amount_cents)}</div>
                <div className="truncate text-slate-700" title={row.proposed_reason}>
                  {row.proposed_reason}
                </div>
                <div className="text-[10px] text-slate-700">Proposed {formatDateTime(row.proposed_at)} · expires {formatDateTime(row.expires_at)}</div>
              </div>
              {canReviewEscrow ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setSelectedPending(row);
                    setReviewNotes("");
                    setActionError("");
                  }}
                >
                  Review
                </Button>
              ) : (
                <span className="text-[10px] font-medium uppercase text-slate-700">Pending</span>
              )}
            </div>
          ))}
          {loadPendingRows.length === 0 ? <p className="text-xs text-gray-500">No pending deductions for this load.</p> : null}
        </div>
      </section>

      {/* Active fine policies */}
      <section className="rounded-sm border border-gray-200 bg-white p-3">
        <h4 className="mb-2 text-xs font-semibold uppercase text-gray-600">Active fine deduction policies</h4>
        <div className="space-y-2">
          {activeFinePolicies.map((policy) => {
            const { owed, deducted, pct, remaining } = policyProgress(policy);
            return (
              <div key={policy.id} className="rounded-sm border border-gray-100 bg-gray-50 px-2 py-1.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-gray-900">{formatMoney(remaining)} remaining</span>
                  <span className="rounded-sm bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-700">{policy.status}</span>
                </div>
                <div className="text-gray-600">
                  {formatMoney(deducted)} / {formatMoney(owed)} · max {formatMoney(policy.max_per_settlement_cents)} / settlement
                </div>
                {policy.memo ? <div className="text-gray-500">{policy.memo}</div> : null}
                <div className="mt-1 h-1.5 rounded-sm bg-gray-200">
                  <div className="h-1.5 rounded-sm bg-[#1F2A44]" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
          {activeFinePolicies.length === 0 ? <p className="text-xs text-gray-500">No active fine policies for this driver.</p> : null}
        </div>
      </section>

      {/* Settlement that actually covers this load — load-aware resolution wins over the driver's
          open pre-settlement cycle, per LOAD-SETTLEMENT-TAB-SHOWS-OPEN-NOT-SETTLING. */}
      {resolvedSettlementIsSettled && resolvedSettlement ? (
        <section className="rounded-sm border border-gray-200 bg-white p-3" data-testid="load-settlement-resolved">
          <h4 className="mb-2 text-xs font-semibold uppercase text-gray-600">
            Settlement for this load (
            <EntityLinkOrTombstone kind="settlement" id={resolvedSettlement.settlement_id} name={resolvedSettlement.display_id} noun="Record" />
            )
          </h4>
          <div className="flex items-center justify-between text-xs">
            <span className="rounded-sm bg-slate-100 px-1.5 py-0.5 font-semibold uppercase text-slate-700">
              {resolvedSettlement.status}
            </span>
            <span className="font-semibold text-gray-900">Net {formatUsd(resolvedSettlement.net_pay)}</span>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            This load's pay was settled here — open the settlement record above for full line detail.
          </p>
        </section>
      ) : preSettlementQ.data?.settlement ? (
        <section className="rounded-sm border border-gray-200 bg-white p-3">
          <h4 className="mb-2 text-xs font-semibold uppercase text-gray-600">
            Open pre-settlement, no lines yet (<EntityLinkOrTombstone kind="settlement" id={preSettlementQ.data.settlement.id} name={preSettlementQ.data.settlement.display_id} noun="Record" />)
          </h4>
          <p className="mb-2 text-xs text-slate-700">
            This is the driver's current open cycle — it does not necessarily mean this load is unpaid; check the
            load-settlement link above once it settles.
          </p>
          <div className="space-y-1">
            {fineDeductionLines.map((line) => (
              <div key={line.id} className="flex justify-between text-xs">
                <span className="text-gray-700">{line.description}</span>
                <span className="font-medium text-red-700">−${Math.abs(Number(line.amount)).toFixed(2)}</span>
              </div>
            ))}
            {otherDeductionLines.map((line) => (
              <div key={line.id} className="flex justify-between text-xs text-gray-500">
                <span>{line.description}</span>
                <span>−${Math.abs(Number(line.amount)).toFixed(2)}</span>
              </div>
            ))}
            {fineDeductionLines.length === 0 && otherDeductionLines.length === 0 ? (
              <p className="text-xs text-gray-500">No deduction lines on the open pre-settlement yet.</p>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* History */}
      <section className="rounded-sm border border-gray-200 bg-white p-3">
        <h4 className="mb-2 text-xs font-semibold uppercase text-gray-600">Deduction history</h4>
        <div className="space-y-1">
          {historyFinePolicies.map((policy) => {
            const { owed, deducted } = policyProgress(policy);
            return (
              <div key={policy.id} className="flex justify-between text-xs text-gray-600">
                <span className="truncate pr-2" title={policy.memo ?? undefined}>
                  Fine policy {entityLabel(policy.deduction_type_display_name, policy.id, "Policy")}{policy.memo ? ` · ${policy.memo}` : ""}
                </span>
                <span className="shrink-0 font-medium text-gray-800">
                  {formatMoney(deducted)} / {formatMoney(owed)}
                </span>
              </div>
            );
          })}
          {historyFinePolicies.length === 0 ? <p className="text-xs text-gray-500">No completed fine policies yet.</p> : null}
        </div>
      </section>

      <Modal
        open={Boolean(selectedPending)}
        onClose={() => {
          setSelectedPending(null);
          setReviewNotes("");
          setActionError("");
        }}
        title="Confirm or defer deduction"
      >
        {selectedPending ? (
          <div className="space-y-3 text-sm">
            <div className="rounded-sm border border-gray-200 bg-gray-50 p-3">
              <div>
                <span className="font-semibold">Amount:</span> {formatMoney(selectedPending.proposed_amount_cents)}
              </div>
              <div>
                <span className="font-semibold">Reason:</span> {selectedPending.proposed_reason}
              </div>
              <div className="text-xs text-gray-500">
                Driver:{" "}
                <EntityLinkOrTombstone kind="driver" id={selectedPending.driver_id} name={selectedPending.driver_name} noun="Driver" />
              </div>
            </div>
            <label className="block text-xs font-semibold uppercase text-gray-600">
              Review notes
              <textarea
                className="mt-1 min-h-24 w-full rounded-sm border border-gray-300 px-2 py-1 text-sm"
                value={reviewNotes}
                onChange={(event) => setReviewNotes(event.target.value)}
                placeholder="Required to defer (min 10 chars)…"
              />
            </label>
            {actionError ? <div className="rounded-sm border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">{actionError}</div> : null}
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="danger"
                disabled={reviewNotes.trim().length < 10}
                loading={deferMutation.isPending}
                onClick={() => void deferMutation.mutateAsync()}
              >
                Defer
              </Button>
              <Button
                size="sm"
                className="border-slate-200! bg-slate-600! hover:bg-slate-600!"
                loading={approveMutation.isPending}
                onClick={() => void approveMutation.mutateAsync()}
              >
                Confirm
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
