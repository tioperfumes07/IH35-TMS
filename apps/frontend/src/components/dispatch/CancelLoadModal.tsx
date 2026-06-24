import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { listDispatchCancellationReasons } from "../../api/dispatch";
import { useAuth } from "../../auth/useAuth";
import { Button } from "../Button";
import { Combobox } from "../Combobox";
import { Modal } from "../Modal";
import { MoneyInput } from "../forms/MoneyInput";
import { ApiError } from "../../api/client";

/** Pull a human message out of a cancel API failure (validation_error details, field message, or text). */
function extractCancelError(err: unknown): string {
  if (err instanceof ApiError) {
    const data = (err.data as Record<string, unknown>) ?? {};
    const details = data.details as Record<string, unknown> | undefined;
    if (details) {
      if (typeof details.message === "string") return details.message;
      // zod flatten shape: { fieldErrors: { field: [msg] }, formErrors: [...] }
      const fieldErrors = details.fieldErrors as Record<string, string[]> | undefined;
      const firstField = fieldErrors ? Object.values(fieldErrors).flat()[0] : undefined;
      if (firstField) return firstField;
    }
    if (typeof data.message === "string") return data.message;
    if (typeof data.error === "string") return `Cancel failed: ${data.error}`;
    return `Cancel failed (HTTP ${err.status}).`;
  }
  return err instanceof Error ? err.message : "Cancel failed. Please try again.";
}

type Props = {
  open: boolean;
  operatingCompanyId: string;
  onClose: () => void;
  onSubmit: (payload: {
    // Canonical backend cancel contract (cancel-load.routes preValidation hook requires BOTH):
    cancel_reason_code: string; // the enum code from the reasons dropdown
    cancel_reason: string; // human text reason (the reason label)
    reason_code: string; // kept for the legacy cancelMutation status flip
    cancellation_notes: string;
    billable_to_customer: boolean;
    cancellation_charge_cents?: number;
  }) => Promise<void>;
};

export function CancelLoadModal({ open, operatingCompanyId, onClose, onSubmit }: Props) {
  const [reasonCode, setReasonCode] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [billable, setBillable] = useState(false);
  const [charge, setCharge] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const reasonsQuery = useQuery({
    queryKey: ["dispatch", "cancellation-reasons"],
    queryFn: () => listDispatchCancellationReasons().then((value) => value.reasons),
    enabled: open && Boolean(operatingCompanyId),
  });

  const { user } = useAuth();
  // Mirrors the backend gate (cancellation.service.ts: isOwner(role) = role === "Owner"). An Owner's
  // cancel of an approval-required reason resolves INLINE (the backend flips status immediately); a
  // non-owner's becomes a "requested" cancellation pending an Owner's approval.
  const isOwner = String(user?.role ?? "") === "Owner";

  const reasons = reasonsQuery.data ?? [];
  const selectedReason = reasons.find((reason) => String(reason.reason_code) === reasonCode) ?? null;
  const needsApproval = Boolean(selectedReason?.requires_owner_approval);
  const ownerInlineApprove = needsApproval && isOwner;
  const submitLabel = ownerInlineApprove ? "Approve & Cancel" : needsApproval ? "Submit cancel request" : "Confirm Cancel";

  return (
    <Modal open={open} onClose={onClose} title="Cancel Load">
      <form
        className="space-y-3"
        onSubmit={async (event) => {
          event.preventDefault();
          setSubmitError(null);
          if (!selectedReason || notes.trim().length < 20) return;
          setSubmitting(true);
          try {
            await onSubmit({
              cancel_reason_code: String(selectedReason.reason_code),
              cancel_reason: String(selectedReason.reason_label ?? selectedReason.reason_code),
              reason_code: String(selectedReason.reason_code),
              cancellation_notes: notes.trim(),
              billable_to_customer: billable,
              cancellation_charge_cents: charge.trim() ? Math.round(Number(charge) * 100) : undefined,
            });
            setReasonCode(null);
            setNotes("");
            setBillable(false);
            setCharge("");
            onClose();
          } catch (err) {
            // Surface the API error instead of silently hanging (the original bug); keep the form editable.
            setSubmitError(extractCancelError(err));
          } finally {
            setSubmitting(false);
          }
        }}
      >
        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-600">Cancellation Reason</label>
          <Combobox
            options={reasons.map((reason) => ({
              value: String(reason.reason_code),
              label: String(reason.reason_label),
              sublabel: `${String(reason.reason_code)}${reason.requires_owner_approval ? " · Owner approval" : ""}`,
            }))}
            value={reasonCode}
            onChange={(nextCode) => setReasonCode(nextCode)}
            placeholder="Select reason"
            loading={reasonsQuery.isLoading}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-600">Notes</label>
          <textarea
            rows={3}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-[13px]"
            placeholder="Required notes (min 20 chars)"
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-gray-700">
          <input type="checkbox" checked={billable} onChange={(event) => setBillable(event.target.checked)} />
          Billable to customer
        </label>
        {/* M-1: dollars-mode; Math.round(charge*100)=cancellation_charge_cents byte-for-byte. */}
        <MoneyInput
          valueDollars={charge ? Number(charge) : null}
          onChangeDollars={(d) => setCharge(d == null ? "" : String(d))}
          ariaLabel="Cancellation charge (USD, optional)"
          placeholder="Cancellation charge (USD, optional)"
          className="w-full"
        />
        {needsApproval ? (
          ownerInlineApprove ? (
            <div className="rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs text-emerald-900">
              As Owner, confirming will approve &amp; cancel this load immediately.
            </div>
          ) : (
            <div className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-900">
              This will be submitted for Owner approval; the load isn&apos;t cancelled until an Owner approves.
            </div>
          )
        ) : null}
        {!selectedReason || notes.trim().length < 20 ? (
          <p className="text-[11px] text-gray-500">
            {!selectedReason
              ? "Select a cancellation reason to continue."
              : `Add ${20 - notes.trim().length} more character(s) of notes to enable Confirm Cancel.`}
          </p>
        ) : null}
        {submitError ? (
          <div className="rounded border border-red-300 bg-red-50 px-2 py-1.5 text-xs text-red-900" role="alert">
            {submitError}
          </div>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button type="submit" variant="danger" loading={submitting} disabled={!selectedReason || notes.trim().length < 20}>
            {submitLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
