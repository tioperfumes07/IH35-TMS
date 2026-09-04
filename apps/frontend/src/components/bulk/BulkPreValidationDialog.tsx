import { Modal } from "../Modal";
import { EntityLink, type EntityKind } from "../shared/EntityLink";
import type { BulkFailure } from "./BulkProgressDialog";

export type BulkPreValidationDialogProps = {
  open: boolean;
  blocked: BulkFailure[];
  voidableCount: number;
  actionLabel?: string;
  entityKind: EntityKind;
  onCancel: () => void;
  /** Proceed with voidable rows only (blocked stay selected for manual deselect). */
  onProceedVoidable: () => void;
};

/**
 * SEL-03 — surfaces rows that cannot be voided BEFORE the bulk API runs.
 * Backend pre-validation remains the trust gate; this prevents a blind submit.
 */
export function BulkPreValidationDialog({
  open,
  blocked,
  voidableCount,
  actionLabel = "Void",
  entityKind,
  onCancel,
  onProceedVoidable,
}: BulkPreValidationDialogProps) {
  return (
    <Modal open={open} onClose={onCancel} title={`${actionLabel} pre-check`}>
      <div className="space-y-4 text-xs">
        <p className="text-slate-800" data-testid="bulk-prevalidation-summary">
          <strong>{blocked.length}</strong> selected row{blocked.length === 1 ? "" : "s"} cannot be{" "}
          {actionLabel.toLowerCase()}ed. Deselect them or proceed with the{" "}
          <strong>{voidableCount}</strong> voidable row{voidableCount === 1 ? "" : "s"}.
        </p>
        <div className="max-h-48 overflow-y-auto rounded-sm border border-slate-300 bg-slate-100 p-2">
          <p className="mb-2 text-xs font-semibold uppercase text-slate-800">Blocked before submit</p>
          <ul className="space-y-1 text-xs text-slate-900">
            {blocked.map((item) => {
              const display = item.label ?? item.id;
              return (
                <li key={item.id}>
                  <EntityLink kind={entityKind} id={item.id} label={display} />
                  {": "}
                  {item.message}
                </li>
              );
            })}
          </ul>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            className="rounded-sm border border-slate-300 px-3 py-1.5 text-xs text-slate-700"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-sm bg-[#1F2A44] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            disabled={voidableCount <= 0}
            data-testid="bulk-prevalidation-proceed"
            onClick={onProceedVoidable}
          >
            {voidableCount > 0 ? `${actionLabel} ${voidableCount} voidable` : "Nothing voidable"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
