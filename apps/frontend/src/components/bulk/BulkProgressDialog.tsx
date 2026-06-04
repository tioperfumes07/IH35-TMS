import { useMemo } from "react";
import { Modal } from "../Modal";

export type BulkFailure = {
  id: string;
  message: string;
  code?: string;
};

export type BulkProgressResult = {
  requested: number;
  succeeded: number;
  failed: BulkFailure[];
  bulk_call_id?: string;
};

export type BulkProgressDialogProps = {
  open: boolean;
  loading?: boolean;
  requested: number;
  succeeded: number;
  failed: BulkFailure[];
  bulk_call_id?: string;
  result?: BulkProgressResult;
  onClose: () => void;
  onRetryFailed?: () => void;
  resolveRowHref?: (id: string) => string | undefined;
};

export function BulkProgressDialog({
  open,
  loading = false,
  requested,
  succeeded,
  failed,
  bulk_call_id,
  onClose,
  onRetryFailed,
  resolveRowHref,
}: BulkProgressDialogProps) {
  const failedCount = failed.length;
  const progressPct = useMemo(() => {
    if (loading) return requested > 0 ? Math.min(95, Math.round((succeeded / requested) * 100)) : 10;
    if (requested <= 0) return 0;
    return Math.round(((succeeded + failedCount) / requested) * 100);
  }, [failedCount, loading, requested, succeeded]);

  return (
    <Modal open={open} onClose={onClose} title="Bulk update progress">
      <div className="space-y-4 text-sm">
        <div className="h-2 overflow-hidden rounded bg-gray-200">
          <div
            className="h-full bg-blue-600 transition-all duration-300"
            style={{ width: `${progressPct}%` }}
            role="progressbar"
            aria-valuenow={progressPct}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
        {loading ? (
          <p className="text-gray-700">Applying bulk update…</p>
        ) : (
          <div className="space-y-1 text-gray-800">
            <p>
              <strong>{succeeded}</strong> of <strong>{requested}</strong> succeeded
              {failedCount > 0 ? (
                <>
                  ; <strong className="text-red-700">{failedCount}</strong> failed
                </>
              ) : null}
            </p>
            {bulk_call_id ? (
              <p className="text-xs text-gray-500">
                Bulk call ID: <code>{bulk_call_id}</code>
              </p>
            ) : null}
          </div>
        )}
        {!loading && failedCount > 0 ? (
          <div className="max-h-48 overflow-y-auto rounded border border-red-100 bg-red-50 p-2">
            <p className="mb-2 text-xs font-semibold uppercase text-red-800">Failures</p>
            <ul className="space-y-1 text-xs text-red-900">
              {failed.map((item) => {
                const href = resolveRowHref?.(item.id);
                return (
                  <li key={item.id}>
                    {href ? (
                      <a href={href} className="font-mono underline">
                        {item.id.slice(0, 8)}…
                      </a>
                    ) : (
                      <span className="font-mono">{item.id.slice(0, 8)}…</span>
                    )}
                    {": "}
                    {item.message}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
        <div className="flex justify-end gap-2 pt-2">
          {!loading && failedCount > 0 && onRetryFailed ? (
            <button
              type="button"
              className="rounded border border-blue-300 px-3 py-1.5 text-sm text-blue-800"
              onClick={onRetryFailed}
            >
              Retry failed
            </button>
          ) : null}
          <button
            type="button"
            className="rounded bg-blue-700 px-3 py-1.5 text-sm font-semibold text-white"
            onClick={onClose}
            disabled={loading}
          >
            {loading ? "Please wait…" : "Close"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
