import { useEffect, useState } from "react";
import { Modal } from "../../components/Modal";
import { Button } from "../../components/Button";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";
import type { SettlementDisputeRow } from "../../hooks/useSettlementDisputes";

// DRV-MONEY-F7314 — the canonical review route (PATCH /api/v1/settlement-disputes/:id/review,
// apps/backend/src/settlements/disputes/disputes.routes.ts) already fully supports approved/
// denied/partial with a durable corrective JE + settlement_lines dispute_adjustment row when money
// is owed, owner-only enforcement, and an immutable-once-closed guard. SettlementDisputeList.tsx
// only ever called it with status:"in_review" (the submitted -> in_review transition) — an
// in_review row had no UI path to reach any of the three real outcomes at all, stranding it forever.
// This modal is the missing UI for that existing, already-correct backend contract; it invents no
// new money logic.

type Outcome = "approved" | "denied" | "partial";

const OUTCOMES: Array<{ id: Outcome; label: string }> = [
  { id: "approved", label: "Approve (full amount)" },
  { id: "partial", label: "Partial approval" },
  { id: "denied", label: "Deny" },
];

function money(cents: number | null | undefined) {
  return `$${((Number(cents ?? 0) || 0) / 100).toFixed(2)}`;
}

export type ResolveDisputeInput = {
  id: string;
  status: Outcome;
  resolution_amount_cents?: number;
  resolution_notes: string;
};

type SettlementDisputeResolveModalProps = {
  dispute: SettlementDisputeRow | null;
  onClose: () => void;
  onResolve: (input: ResolveDisputeInput) => Promise<unknown>;
};

export function SettlementDisputeResolveModal({ dispute, onClose, onResolve }: SettlementDisputeResolveModalProps) {
  const { pushToast } = useToast();
  const [outcome, setOutcome] = useState<Outcome>("approved");
  const [amountDollars, setAmountDollars] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Reset the form every time a different dispute is opened for review — reusing stale state from
  // a previously-resolved row across opens would risk submitting the wrong amount/outcome.
  useEffect(() => {
    if (!dispute) return;
    setOutcome("approved");
    // Pre-fill with the claimed amount for a full approval so the operator sees what will actually
    // post before confirming; the backend itself defaults to claimed_amount_cents when omitted, so
    // this is display-only convenience, not a new default being invented here.
    setAmountDollars(dispute.claimed_amount_cents / 100);
    setNotes("");
  }, [dispute]);

  if (!dispute) return null;

  const needsAmount = outcome === "approved" || outcome === "partial";
  const amountCents = amountDollars != null ? Math.round(amountDollars * 100) : null;
  const notesValid = notes.trim().length >= 10;
  const amountValid = !needsAmount || (amountCents != null && amountCents > 0);
  const canSubmit = notesValid && amountValid && !submitting;

  async function handleSubmit() {
    if (!dispute || !canSubmit) return;
    setSubmitting(true);
    try {
      await onResolve({
        id: dispute.id,
        status: outcome,
        resolution_amount_cents: needsAmount ? (amountCents ?? undefined) : undefined,
        resolution_notes: notes.trim(),
      });
      pushToast(
        outcome === "denied" ? "Dispute denied" : `Dispute ${outcome === "partial" ? "partially approved" : "approved"}`,
        "success"
      );
      onClose();
    } catch (error) {
      pushToast(userFacingApiError(error, "Could not resolve dispute"), "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={Boolean(dispute)} onClose={onClose} title="Resolve settlement dispute">
      <div className="space-y-3 text-sm" data-testid="settlement-dispute-resolve-modal">
        <div className="rounded-sm border border-gray-200 bg-gray-50 p-2 text-xs text-gray-700">
          Claimed: <span className="font-semibold">{money(dispute.claimed_amount_cents)}</span> — {dispute.dispute_type}
        </div>

        <div className="block space-y-1">
          <span className="font-medium">Outcome</span>
          <div className="flex flex-wrap gap-2" data-testid="settlement-dispute-resolve-outcome">
            {OUTCOMES.map((o) => (
              <button
                key={o.id}
                type="button"
                data-testid={`settlement-dispute-resolve-outcome-${o.id}`}
                onClick={() => setOutcome(o.id)}
                className={`rounded border px-2 py-1 text-xs font-medium ${
                  outcome === o.id ? "border-slate-300 bg-slate-100 text-slate-700" : "border-gray-300 bg-white text-gray-700"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {needsAmount ? (
          <label className="block space-y-1">
            <span className="font-medium">Resolution amount (USD)</span>
            <MoneyInput
              valueDollars={amountDollars}
              onChangeDollars={setAmountDollars}
              ariaLabel="Resolution amount (USD)"
            />
          </label>
        ) : null}

        <label className="block space-y-1">
          <span className="font-medium">Resolution notes</span>
          <textarea
            className="min-h-24 w-full rounded-sm border border-gray-300 px-2 py-1"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Explain the resolution (min 10 characters)"
            data-testid="settlement-dispute-resolve-notes"
          />
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!canSubmit}
            loading={submitting}
            data-testid="settlement-dispute-resolve-submit"
            onClick={() => void handleSubmit()}
          >
            Confirm {outcome === "denied" ? "denial" : outcome === "partial" ? "partial approval" : "approval"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
