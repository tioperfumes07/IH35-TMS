import { useState } from "react";

type Props = {
  loadUuid: string;
  newStatus: string;
  reason: string;
  onConfirm?: () => void | Promise<void>;
  onDispute?: () => void | Promise<void>;
};

export function AutoStatusNotice({ loadUuid, newStatus, reason, onConfirm, onDispute }: Props) {
  const [busy, setBusy] = useState<"confirm" | "dispute" | null>(null);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  async function handleConfirm() {
    setBusy("confirm");
    try {
      await onConfirm?.();
      setDismissed(true);
    } finally {
      setBusy(null);
    }
  }

  async function handleDispute() {
    setBusy("dispute");
    try {
      await onDispute?.();
      setDismissed(true);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      className="mb-3 rounded-lg border border-amber-400/60 bg-amber-50 px-3 py-3 text-sm text-amber-950"
      role="status"
      aria-live="polite"
      data-load-uuid={loadUuid}
      data-new-status={newStatus}
    >
      <p className="font-semibold">Load status updated automatically</p>
      <p className="mt-1 text-amber-900">{reason}</p>
      <p className="mt-1 text-xs text-amber-800">New status: {newStatus.replaceAll("_", " ")}</p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
          onClick={() => void handleConfirm()}
          disabled={busy !== null}
        >
          {busy === "confirm" ? "Confirming..." : "Confirm"}
        </button>
        <button
          type="button"
          className="rounded-md border border-amber-500 px-3 py-1.5 text-xs font-semibold text-amber-900 disabled:opacity-60"
          onClick={() => void handleDispute()}
          disabled={busy !== null}
        >
          {busy === "dispute" ? "Sending..." : "Dispute"}
        </button>
      </div>
    </div>
  );
}
