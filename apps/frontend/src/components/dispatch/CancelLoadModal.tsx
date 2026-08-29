import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { listDispatchCancellationReasons } from "../../api/dispatch";
import { useAuth } from "../../auth/useAuth";
import { Button } from "../Button";
import { Modal } from "../Modal";
import { MoneyInput } from "../forms/MoneyInput";
import { ReferenceSelect } from "../parity/ReferenceSelect";
import { userFacingApiError } from "../../lib/api-error-message";
import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone";
import { ListErrorState } from "../ListErrorState";

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

  // DSP-MONEY-F7112 — CancelLoadModal is reused across loads/companies without remounting (the
  // parent toggles `open`, it does not remount by key), so without an explicit reset a reason/
  // notes/billable/charge draft typed for one load could silently carry into whichever load or
  // company the modal next opens for, and a submit already in flight when the modal is reassigned
  // to a different load could apply its result (or a stale error) to the wrong context. Reset the
  // full draft on every load/company/open transition, and snapshot the exact load/company this
  // submit was FOR so a late-arriving response for a since-abandoned load is discarded, not shown.
  const resetKey = `${operatingCompanyId}::${loadId ?? ""}::${open ? "open" : "closed"}`;
  // Lazy-init to the CURRENT key so mount itself never fires a reset (nothing to reset yet) —
  // only a genuine later transition (a different load/company, or a fresh re-open) does.
  const lastResetKey = useRef<string | null>(resetKey);
  useEffect(() => {
    if (!open) {
      lastResetKey.current = null;
      return;
    }
    if (lastResetKey.current === resetKey) return;
    lastResetKey.current = resetKey;
    setReasonCode(null);
    setNotes("");
    setBillable(false);
    setCharge("");
    setSubmitError(null);
    setCreatedReasons([]);
  }, [resetKey, open]);

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

  // DSP-MONEY-F7112 — live scope, read inside the async submit handler AFTER the await so a
  // response that lands once this modal has been reassigned to a different load/company is
  // detected and discarded rather than mutating state (or showing an error) for the wrong load.
  const liveScopeRef = useRef({ loadId, operatingCompanyId });
  liveScopeRef.current = { loadId, operatingCompanyId };

  // DSP-MONEY-F7112 — controls/dismissal locked pending: an in-flight cancel must not be
  // abandonable mid-request (Close button, Modal's own backdrop/Escape via onClose all route
  // through this guard).
  const guardedClose = () => {
    if (submitting) return;
    onClose();
  };

  return (
    <Modal open={open} onClose={guardedClose} title="Cancel Load">
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
          // DSP-MONEY-F7112 — snapshot exactly which load/company this request is FOR. If the
          // modal gets reassigned to a different load while this await is in flight (the parent
          // can do that without unmounting us), the response below must not be applied to it.
          const submittedFor = { loadId, operatingCompanyId };
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
            const stale =
              liveScopeRef.current.loadId !== submittedFor.loadId ||
              liveScopeRef.current.operatingCompanyId !== submittedFor.operatingCompanyId;
            if (stale) return;
            setReasonCode(null);
            setNotes("");
            setBillable(false);
            setCharge("");
            setCreatedReasons([]);
            onClose();
          } catch (err) {
            const stale =
              liveScopeRef.current.loadId !== submittedFor.loadId ||
              liveScopeRef.current.operatingCompanyId !== submittedFor.operatingCompanyId;
            if (stale) return;
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
            disabled={reasonsQuery.isLoading || reasonsQuery.isError}
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
          {reasonsQuery.isError ? (
            <ListErrorState
              status={0}
              message="Cancellation reasons unavailable."
              onRetry={() => void reasonsQuery.refetch()}
            />
          ) : null}
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
          <Button type="button" variant="secondary" onClick={guardedClose} disabled={submitting}>
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
