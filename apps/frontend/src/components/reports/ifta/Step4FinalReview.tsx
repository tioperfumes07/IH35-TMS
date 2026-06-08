import { useEffect, useState } from "react";
import { Button } from "../../Button";
import { Modal } from "../../Modal";
import type { IftaFiling } from "../../../api/reports-ifta";

type Props = {
  filing: IftaFiling;
  isOwner: boolean;
  onOwnerApprove: (payload: { wf064_confirm: true; confirm_phrase: "APPROVE"; hold_seconds_elapsed: number }) => Promise<void>;
  onMarkFiled: (confirmationNumber: string) => Promise<void>;
  approving?: boolean;
  filingPending?: boolean;
};

function fmtMoney(value: number) {
  return value.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export function Step4FinalReview({ filing, isOwner, onOwnerApprove, onMarkFiled, approving, filingPending }: Props) {
  const data = filing.filing_data;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [holdProgress, setHoldProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const [confirmationNumber, setConfirmationNumber] = useState("");

  useEffect(() => {
    if (!confirmOpen) {
      setTyped("");
      setHoldProgress(0);
      setHolding(false);
    }
  }, [confirmOpen]);

  useEffect(() => {
    if (!holding) return;
    const started = Date.now();
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - started;
      setHoldProgress(Math.min(100, (elapsed / 5000) * 100));
      if (elapsed >= 5000) window.clearInterval(timer);
    }, 100);
    return () => window.clearInterval(timer);
  }, [holding]);

  const typedOk = typed.trim().toUpperCase() === "APPROVE";
  const holdOk = holdProgress >= 100;
  const canApprove = filing.status === "draft" || filing.status === "review";
  const canMarkFiled = filing.status === "owner_approved";

  const submitApprove = async () => {
    await onOwnerApprove({
      wf064_confirm: true,
      confirm_phrase: "APPROVE",
      hold_seconds_elapsed: 5,
    });
    setConfirmOpen(false);
  };

  return (
    <section className="rounded border border-amber-200 bg-white" data-ifta-step="4">
      <div className="border-b border-amber-200 bg-amber-50 px-3 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-900">Step 4 · Final review</h3>
        <p className="text-xs text-amber-800">Owner-only confirmation required before filing submission.</p>
      </div>
      <div className="space-y-3 px-3 py-3 text-xs">
        <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
          <div>
            <span className="font-semibold text-slate-700">Quarter:</span> {filing.quarter}
          </div>
          <div>
            <span className="font-semibold text-slate-700">Status:</span> {filing.status}
          </div>
          <div>
            <span className="font-semibold text-slate-700">Total net tax:</span> {fmtMoney(data.total_tax_owed ?? 0)}
          </div>
          <div>
            <span className="font-semibold text-slate-700">Jurisdictions:</span> {data.jurisdiction_rows?.length ?? 0}
          </div>
        </div>

        {!isOwner ? (
          <p className="rounded border border-amber-200 bg-amber-50 px-2 py-2 text-amber-900">
            Owner role required to approve and mark this IFTA filing as filed.
          </p>
        ) : null}

        {isOwner && canApprove ? (
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded border border-amber-500 bg-amber-100 px-3 py-2 font-semibold text-amber-900 disabled:opacity-50"
            disabled={approving}
            onClick={() => setConfirmOpen(true)}
            data-ifta-wf064-trigger="true"
          >
            <span aria-hidden>⚡</span> Owner approve filing
          </button>
        ) : null}

        {isOwner && canMarkFiled ? (
          <div className="space-y-2 rounded border border-green-200 bg-green-50 px-3 py-2">
            <p className="font-semibold text-green-900">Owner approved — record state filing confirmation</p>
            <label className="block text-green-900">
              Confirmation number
              <input
                className="mt-1 w-full rounded border border-green-300 px-2 py-1"
                value={confirmationNumber}
                onChange={(event) => setConfirmationNumber(event.target.value)}
                data-testid="ifta-confirmation-number"
              />
            </label>
            <button
              type="button"
              className="rounded border border-green-500 bg-green-100 px-3 py-1.5 font-semibold text-green-900 disabled:opacity-50"
              disabled={!confirmationNumber.trim() || filingPending}
              onClick={() => void onMarkFiled(confirmationNumber.trim())}
            >
              {filingPending ? "Saving…" : "Mark as filed"}
            </button>
          </div>
        ) : null}

        {filing.status === "filed" ? (
          <p className="rounded border border-green-300 bg-green-50 px-2 py-2 text-green-800">
            Filed {filing.filed_at ? new Date(filing.filed_at).toLocaleString() : ""}
            {filing.confirmation_number ? ` · Confirmation #${filing.confirmation_number}` : ""}
          </p>
        ) : null}
      </div>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="⚡ Owner approve IFTA filing">
        <div className="space-y-3 text-sm" data-ifta-wf064-confirm-modal="true">
          <p className="text-gray-700">
            Two-step confirmation: type APPROVE and hold the confirm button for 5 seconds. This records owner approval
            before external IFTA submission.
          </p>
          <label className="block text-xs font-semibold text-gray-700">
            Type APPROVE to confirm
            <input
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              data-testid="ifta-wf064-typed-confirm"
            />
          </label>
          <div>
            <Button
              variant="danger"
              disabled={!typedOk || approving}
              onMouseDown={() => setHolding(true)}
              onMouseUp={() => setHolding(false)}
              onMouseLeave={() => setHolding(false)}
            >
              Hold 5 seconds to confirm ({Math.round(holdProgress)}%)
            </Button>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={!typedOk || !holdOk || approving}
              onClick={() => void submitApprove()}
              data-testid="ifta-wf064-final-confirm"
            >
              {approving ? "Approving…" : "Yes — approve filing"}
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
