import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../Button";
import { ParityDrawer } from "../parity/ParityDrawer";
import { ApiError } from "../../api/client";
import { listVoidCancelReasons, type VoidCancelReason } from "../../api/catalogs";
import { useCompanyContext } from "../../contexts/CompanyContext";

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

function composeVoidReason(selected: VoidCancelReason | null, memo: string): string {
  const label = selected?.reason_label?.trim() || selected?.reason_code?.trim() || "";
  const note = memo.trim();
  if (label && note) return `${label}: ${note}`;
  if (label) return label;
  return note;
}

type Props = {
  open: boolean;
  title: string;
  entityRef?: string;
  minLength?: number;
  postsReversingEntry?: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
  submitLabel?: string;
};

/** VOID-REASON-CATALOG-01 — catalogs.void_cancel_reasons dropdown + optional memo. */
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
  const { selectedCompanyId } = useCompanyContext();
  const [reasonId, setReasonId] = useState("");
  const [memo, setMemo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const reasonsQuery = useQuery({
    queryKey: ["void-cancel-reasons", selectedCompanyId, "void-modal"],
    queryFn: () => listVoidCancelReasons(selectedCompanyId!, false),
    enabled: Boolean(open && selectedCompanyId),
  });

  const reasons = useMemo(
    () => (reasonsQuery.data?.reasons ?? []).filter((r) => r.is_active).sort((a, b) => a.sort_order - b.sort_order),
    [reasonsQuery.data?.reasons]
  );

  const selected = reasons.find((r) => r.id === reasonId) ?? null;
  const catalogAvailable = reasons.length > 0;
  const composed = composeVoidReason(selected, memo);
  const needsMemo = Boolean(selected?.requires_note);
  const valid = catalogAvailable
    ? Boolean(selected) && (!needsMemo || memo.trim().length >= minLength) && composed.trim().length >= minLength
    : composed.trim().length >= minLength;

  useEffect(() => {
    if (!open) return;
    setReasonId("");
    setMemo("");
    setSubmitError(null);
  }, [open]);

  const close = () => {
    setReasonId("");
    setMemo("");
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
            await onSubmit(composed.trim());
            setReasonId("");
            setMemo("");
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

        {catalogAvailable ? (
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600" htmlFor="void-reason-code">
              Reason <span className="text-red-600">*</span>
            </label>
            <select
              id="void-reason-code"
              value={reasonId}
              onChange={(event) => setReasonId(event.target.value)}
              className="w-full rounded-sm border border-gray-300 px-2 py-1.5 text-[13px]"
              autoFocus
            >
              <option value="">Select a reason…</option>
              {reasons.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.reason_label}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-600" htmlFor="void-reason">
            {catalogAvailable ? (
              <>
                Memo {needsMemo ? <span className="text-red-600">*</span> : <span className="font-normal text-gray-500">(optional)</span>}
              </>
            ) : (
              <>
                Reason <span className="text-red-600">*</span>
              </>
            )}
          </label>
          <textarea
            id="void-reason"
            rows={3}
            value={memo}
            onChange={(event) => setMemo(event.target.value)}
            className="w-full rounded-sm border border-gray-300 px-2 py-1.5 text-[13px]"
            placeholder={
              catalogAvailable
                ? needsMemo
                  ? `Required note (min ${minLength} chars)`
                  : "Optional note"
                : `Required reason (min ${minLength} chars)`
            }
            autoFocus={!catalogAvailable}
          />
        </div>

        {!valid ? (
          <p className="text-[11px] text-gray-500">
            {!catalogAvailable && composed.trim().length === 0
              ? "A reason is required to void."
              : catalogAvailable && !selected
                ? "Select a void reason."
                : needsMemo && memo.trim().length < minLength
                  ? `Add ${minLength - memo.trim().length} more character(s) to the note.`
                  : `Add ${minLength - composed.trim().length} more character(s) to enable Void.`}
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
