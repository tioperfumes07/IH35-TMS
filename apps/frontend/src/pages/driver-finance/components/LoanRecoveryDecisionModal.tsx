import { useEffect, useState } from "react";
import { Modal } from "../../../components/Modal";
import { Button } from "../../../components/Button";
import { MoneyInput } from "../../../components/forms/MoneyInput";
import type { OutstandingLoanDecisionDetails } from "../../../api/driverFinance";

type Props = {
  open: boolean;
  details: OutstandingLoanDecisionDetails | null;
  onClose: () => void;
  /** Fires with the decision to attach to a re-submitted close call. Never auto-submits — the panel owns the retry. */
  onDecide: (decision: { mode: "full" | "partial"; partial_cents: number | null; reason: string | null }) => void;
};

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * 00_LOCKED_DECISIONS 9.2/9.3 — LOAN POP-UP AT CLOSE. "If the driver has ANY outstanding loan or
 * debt... a window MUST appear and ask. IT CANNOT BE DEFERRED and the decision MUST BE REGISTERED
 * AT THAT MOMENT with who decided and when." Before this modal existed, closeSettlementPayRun's
 * OUTSTANDING_LOAN_DECISION_REQUIRED refusal had NO frontend surface at all — PayRunClosePanel just
 * dropped it into the generic error banner with no Accept / Edit-amount control, so the operator was
 * simply stuck (the backend gate was correct; nothing let a human satisfy it). This is that control:
 * Accept recovers the full computed amount (mode:"full"); Edit amount caps this close's recovery at
 * a typed cents figure (mode:"partial", partial_cents) — the remainder stays on the advance's
 * outstanding_balance and rolls forward, asked again next settlement. decided_by_user_id is stamped
 * server-side from the authed close call, never client-supplied.
 */
export function LoanRecoveryDecisionModal({ open, details, onClose, onDecide }: Props) {
  const [editing, setEditing] = useState(false);
  const [amountCents, setAmountCents] = useState<number | null>(null);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open && details) {
      setEditing(false);
      setAmountCents(details.total_recoverable_cents);
      setReason("");
    }
  }, [open, details]);

  if (!details) return null;

  const totalCents = details.total_recoverable_cents;
  const editedCents = amountCents ?? 0;
  const editedValid = editing ? Number.isFinite(editedCents) && editedCents >= 0 && editedCents <= totalCents : true;
  const canConfirmEdit = editing ? editedValid && reason.trim().length >= 10 : true;

  function acceptFull() {
    onDecide({ mode: "full", partial_cents: null, reason: null });
  }

  function confirmEdit() {
    if (!canConfirmEdit) return;
    onDecide({ mode: "partial", partial_cents: editedCents, reason: reason.trim() });
  }

  return (
    <Modal open={open} onClose={onClose} title="Outstanding loan / advance recovery">
      <div className="space-y-3 text-xs" data-testid="loan-recovery-decision-modal">
        <p className="text-gray-700">
          This driver carries {details.recoverable_advances.length} outstanding advance/loan row
          {details.recoverable_advances.length === 1 ? "" : "s"} totaling{" "}
          <span className="font-semibold">{formatCents(totalCents)}</span>. Closing this settlement
          requires a decision on how much to recover now — this cannot be deferred, and who decided
          is recorded on the close.
        </p>

        <div className="rounded-sm border border-gray-200 bg-gray-50 p-2">
          {details.recoverable_advances.map((a) => (
            <div key={a.id} className="flex items-center justify-between">
              <span>{a.display_id ?? a.id}</span>
              <span className="tabular-nums">{formatCents(a.amount_cents)}</span>
            </div>
          ))}
        </div>

        {!editing ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={acceptFull} data-testid="loan-recovery-accept-full">
              Accept — recover full {formatCents(totalCents)}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)} data-testid="loan-recovery-edit-amount">
              Edit amount
            </Button>
            <Button size="sm" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <label className="block">
              <span className="mb-1 block font-medium text-gray-600">
                Recover this close (max {formatCents(totalCents)}; the remainder stays outstanding and rolls to the next settlement)
              </span>
              <div data-testid="loan-recovery-partial-amount">
                <MoneyInput
                  valueCents={amountCents}
                  onChangeCents={setAmountCents}
                  ariaLabel="Recover this close"
                  className="w-full"
                />
              </div>
              {!editedValid ? <span className="mt-1 block text-red-700">Amount must be between $0 and {formatCents(totalCents)}.</span> : null}
            </label>
            <label className="block">
              <span className="mb-1 block font-medium text-gray-600">Reason (min 10 chars)</span>
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={2}
                className="w-full rounded-sm border border-gray-300 px-2 py-1 text-xs"
                data-testid="loan-recovery-partial-reason"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={confirmEdit} disabled={!canConfirmEdit} data-testid="loan-recovery-confirm-partial">
                Confirm partial recovery
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setEditing(false)}>
                Back
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
