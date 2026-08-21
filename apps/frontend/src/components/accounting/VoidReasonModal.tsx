import { useState } from "react";
import { Button } from "../Button";
import { ParityDrawer } from "../parity/ParityDrawer";
import { ApiError } from "../../api/client";

/** Human-readable message out of a void API failure (validation details / field message / text). */
function extractVoidError(err: unknown): string {
  if (err instanceof ApiError) {
    const data = (err.data as Record<string, unknown>) ?? {};
    const details = data.details as Record<string, unknown> | undefined;
    if (details) {
      if (typeof details.message === "string") return details.message;
      const fieldErrors = details.fieldErrors as Record<string, string[]> | undefined;
      const firstField = fieldErrors ? Object.values(fieldErrors).flat()[0] : undefined;
      if (firstField) return firstField;
    }
    if (typeof data.message === "string") return data.message;
    if (typeof data.error === "string") return `Void failed: ${data.error}`;
    return `Void failed (HTTP ${err.status}).`;
  }
  return err instanceof Error ? err.message : "Void failed. Please try again.";
}

type Props = {
  open: boolean;
  /** Modal title, e.g. "Void Journal Entry". */
  title: string;
  /** One-line reference shown to the user: entity #, amount, and period. */
  entityRef?: string;
  /** Minimum reason length (matches the backend contract; JE void requires min 3). */
  minLength?: number;
  /** Show the audit note that voiding posts an equal-and-opposite reversing entry. Default true. */
  postsReversingEntry?: boolean;
  onClose: () => void;
  /** Perform the void with the captured reason. Reject to surface an error and keep the form open. */
  onSubmit: (reason: string) => Promise<void>;
  /** Footer submit label. Default Void; Revoke/Dismiss/Archive reuse the same reason shell. */
  submitLabel?: string;
};

/**
 * In-app VOID/reversal shell for a financial action — replaces native window.prompt()/confirm() on money
 * actions. QuickBooks/NetSuite parity: states what is being voided (ref + amount + period), REQUIRES a
 * reason (an audit-trail requirement), and states that a reversing entry will be posted. Submit is
 * disabled until the reason meets the minimum length; API errors are surfaced instead of hanging.
 *
 * CHROME-14: outer shell swapped from centered Modal to ParityDrawer (QBO side-panel chrome), with the
 * Cancel/Void buttons in the drawer's sticky footer (form id "void-reason-form" wires the submit button
 * across the footer/body boundary — CHROME-13 pattern). Presentational only; every caller (JE void,
 * payment-method void, bill-payment void, invoice void, etc.) keeps its existing onSubmit contract.
 */
export function VoidReasonModal({
  open,
  title,
  entityRef,
  minLength = 3,
  postsReversingEntry = true,
  onClose,
  onSubmit,
  submitLabel = "Void",
}: Props) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const trimmed = reason.trim();
  const valid = trimmed.length >= minLength;

  const close = () => {
    setReason("");
    setSubmitError(null);
    onClose();
  };

  return (
    <ParityDrawer
      open={open}
      onClose={close}
      title={title}
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" form="void-reason-form" variant="danger" loading={submitting} disabled={!valid}>
            {submitLabel}
          </Button>
        </div>
      }
    >
      <form
        id="void-reason-form"
        className="space-y-3"
        onSubmit={async (event) => {
          event.preventDefault();
          setSubmitError(null);
          if (!valid) return;
          setSubmitting(true);
          try {
            await onSubmit(trimmed);
            setReason("");
            close();
          } catch (err) {
            setSubmitError(extractVoidError(err));
          } finally {
            setSubmitting(false);
          }
        }}
      >
        {entityRef ? <div className="rounded-sm border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs text-gray-700">{entityRef}</div> : null}
        {postsReversingEntry ? (
          <p className="text-xs text-gray-600">
            Voiding posts an equal-and-opposite <span className="font-semibold">reversing entry</span> and keeps the audit trail. This can&apos;t be undone.
          </p>
        ) : null}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-600" htmlFor="void-reason">
            Reason <span className="text-red-600">*</span>
          </label>
          <textarea
            id="void-reason"
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="w-full rounded-sm border border-gray-300 px-2 py-1.5 text-[13px]"
            placeholder={`Required reason (min ${minLength} chars)`}
            autoFocus
          />
        </div>
        {!valid ? (
          <p className="text-[11px] text-gray-500">
            {trimmed.length === 0
              ? "A reason is required to void."
              : `Add ${minLength - trimmed.length} more character(s) to enable Void.`}
          </p>
        ) : null}
        {submitError ? (
          <div className="rounded-sm border border-red-300 bg-red-50 px-2 py-1.5 text-xs text-red-900" role="alert">
            {submitError}
          </div>
        ) : null}
      </form>
    </ParityDrawer>
  );
}
