import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { listDispatchCancellationReasons } from "../../api/dispatch";
import { useAuth } from "../../auth/useAuth";
import { Button } from "../Button";
import { Modal } from "../Modal";
import { MoneyInput } from "../forms/MoneyInput";
import { ReferenceSelect } from "../parity/ReferenceSelect";
import { userFacingApiError } from "../../lib/api-error-message";
import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone";

/** Pull a human message out of a cancel API failure (validation_error details, field message, or text). */
function extractCancelError(err: unknown): string {
  return userFacingApiError(err, "Cancel failed");
}

type Props = {
  open: boolean;
  operatingCompanyId: string;
  loadId?: string | null;
  loadNumber?: string | null;
  onClose: () => void;
  onSubmit: (payload: {
    // Canonical backend cancel contract (cancel-load.routes preValidation hook requires BOTH):
    cancel_reason_code: string; // the enum code from the reasons dropdown
    cancel_reason: string; // human text reason (the reason label)
    reason_code: string;
    cancellation_notes: string;
    billable_to_customer: boolean;
    cancellation_charge_cents?: number;
  }) => Promise<void>;
};

export function CancelLoadModal({ open, operatingCompanyId, loadId, loadNumber, onClose, onSubmit }: Props) {
  const [reasonCode, setReasonCode] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [billable, setBillable] = useState(false);
  const [charge, setCharge] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  /** Optimistic rows from inline "+ Create" so submit works before the list refetch lands. */
  const [createdReasons, setCreatedReasons] = useState<Array<Record<string, unknown>>>([]);
  const reasonsQuery = useQuery({
    queryKey: ["dispatch", "cancellation-reasons", operatingCompanyId],
    queryFn: () => listDispatchCancellationReasons(operatingCompanyId).then((value) => value.reasons),
    enabled: open && Boolean(operatingCompanyId),
  });

  const { user } = useAuth();
  // Mirrors the backend gate (cancellation.service.ts: isOwner(role) = role === "Owner"). An Owner's
  // cancel of an approval-required reason resolves INLINE (the backend flips status immediately); a
  // non-owner's becomes a "requested" cancellation pending an Owner's approval.
  const isOwner = String(user?.role ?? "") === "Owner";

  const reasons = (() => {
    const byCode = new Map<string, Record<string, unknown>>();
    for (const reason of [...(reasonsQuery.data ?? []), ...createdReasons]) {
      byCode.set(String(reason.reason_code), reason);
    }
    return [...byCode.values()];
  })();
  const selectedReason = reasons.find((reason) => String(reason.reason_code) === reasonCode) ?? null;
  const needsApproval = Boolean(selectedReason?.requires_owner_approval);
  const ownerInlineApprove = needsApproval && isOwner;
  const submitLabel = ownerInlineApprove ? "Approve & Cancel" : needsApproval ? "Submit cancel request" : "Confirm Cancel";

  return (
    <Modal open={open} onClose={onClose} title="Cancel Load">
      {loadId ? (
        <div className="mb-2 text-xs text-slate-600" data-testid="cancel-load-modal-entitylinks">
          Load:{" "}
          <EntityLinkOrTombstone kind="load" id={loadId} name={loadNumber} noun="Load" />
        </div>
      ) : null}
      <form
        className="space-y-3"
        onSubmit={async (event) => {
          event.preventDefault();
          setSubmitError(null);
          if (!selectedReason || notes.trim().length < 20) return;
          if (billable && !charge.trim()) return;
          setSubmitting(true);
          try {
            await onSubmit({
              cancel_reason_code: String(selectedReason.reason_code),
              cancel_reason: String(
                selectedReason.reason_label ?? selectedReason.display_name ?? selectedReason.reason_code
              ),
              reason_code: String(selectedReason.reason_code),
              cancellation_notes: notes.trim(),
              billable_to_customer: billable,
              cancellation_charge_cents: charge.trim() ? Math.round(Number(charge) * 100) : undefined,
            });
            setReasonCode(null);
            setNotes("");
            setBillable(false);
            setCharge("");
            setCreatedReasons([]);
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
          {/*
            LST-PICKER-01 slice: Cancel Load used a bare Combobox with no inline create, so operators
            had to leave the cancel flow and navigate to Lists → Load Cancellation Reasons. Wire the
            shared ReferenceSelect: "+ Create cancellation reason" is the permanent FIRST ROW inside
            the dropdown; create POSTs catalogs.load_cancellation_reasons (same table
            listDispatchCancellationReasons / cancelLoad read). Options are keyed by reason_code.
          */}
          <ReferenceSelect
            value={reasonCode}
            onChange={(nextCode) => setReasonCode(nextCode)}
            options={reasons.map((reason) => ({
              value: String(reason.reason_code),
              label: String(reason.reason_label ?? reason.display_name ?? reason.reason_code),
              type: `${String(reason.reason_code)}${reason.requires_owner_approval ? " · Owner approval" : ""}`,
            }))}
            createKind="load_cancellation_reason"
            operatingCompanyId={operatingCompanyId}
            createdValueField="code"
            placeholder="Select reason"
            loading={reasonsQuery.isLoading}
            onOptionCreated={(opt) => {
              setCreatedReasons((prev) => [
                ...prev,
                {
                  reason_code: opt.value,
                  reason_label: opt.label,
                  display_name: opt.label,
                  requires_owner_approval: false,
                },
              ]);
              void reasonsQuery.refetch();
            }}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-600">Notes</label>
          <textarea
            rows={3}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="w-full rounded-sm border border-gray-300 px-2 py-1.5 text-[13px]"
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
            <div className="rounded-sm border border-slate-200 bg-slate-100 px-2 py-1 text-xs text-slate-700">
              As Owner, confirming will approve &amp; cancel this load immediately.
            </div>
          ) : (
            <div className="rounded-sm border border-slate-200 bg-slate-100 px-2 py-1 text-xs text-slate-700">
              This will be submitted for Owner approval; the load isn&apos;t cancelled until an Owner approves.
            </div>
          )
        ) : null}
        {!selectedReason || notes.trim().length < 20 || (billable && !charge.trim()) ? (
          <p className="text-[11px] text-gray-500">
            {!selectedReason
              ? "Select a cancellation reason to continue."
              : notes.trim().length < 20
                ? `Add ${20 - notes.trim().length} more character(s) of notes to enable Confirm Cancel.`
                : "Enter a cancellation charge amount — billable to customer requires one."}
          </p>
        ) : null}
        {submitError ? (
          <div className="rounded-sm border border-red-300 bg-red-50 px-2 py-1.5 text-xs text-red-900" role="alert">
            {submitError}
          </div>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button
            type="submit"
            variant="danger"
            loading={submitting}
            disabled={!selectedReason || notes.trim().length < 20 || (billable && !charge.trim())}
          >
            {submitLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
