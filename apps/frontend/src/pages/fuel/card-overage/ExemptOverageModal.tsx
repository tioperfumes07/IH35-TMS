import { useEffect, useState } from "react";
import { Button } from "../../../components/Button";
import { Modal } from "../../../components/Modal";
import { EntityPicker } from "../../../components/EntityPicker";
import { closeUnlessPending } from "../../../components/shared/ConfirmModal";

export type ExemptOverageInput = {
  reason: "repair" | "authorized_spend";
  work_order_id: string | null;
  note: string;
};

type Props = {
  open: boolean;
  companyId: string;
  /** e.g. "$84.20 for Juan Perez" — what is being exempted. */
  summary: string;
  onClose: () => void;
  onConfirm: (input: ExemptOverageInput) => Promise<void>;
};

/**
 * ROUND 355 R-2 — a non-fuel purchase on a fuel card is personal and recovered in full, except a repair (named work
 * order) or spend a manager authorized. The reviewer records the exemption here instead of approving recovery.
 */
export function ExemptOverageModal({ open, companyId, summary, onClose, onConfirm }: Props) {
  const [reason, setReason] = useState<ExemptOverageInput["reason"]>("repair");
  const [workOrderId, setWorkOrderId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setReason("repair");
      setWorkOrderId(null);
      setNote("");
      setError(null);
    }
  }, [open]);

  const missing =
    note.trim().length < 3 ? "Add a note (at least 3 characters)." : reason === "repair" && !workOrderId ? "Pick the work order for this repair." : null;
  const close = () => closeUnlessPending(busy, onClose);

  return (
    <Modal open={open} onClose={close} title="Exempt from recovery">
      <div className="space-y-3" data-testid="fuel-card-overage-exempt-modal">
        <p className="text-xs text-gray-700">
          Do not recover {summary}. The event is kept with your name, the reason and the time.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-slate-600">
            Reason
            <select
              className="mt-1 h-8 w-full rounded-sm border border-gray-300 px-2 text-xs"
              value={reason}
              onChange={(e) => setReason(e.target.value as ExemptOverageInput["reason"])}
              data-testid="fuel-card-overage-exempt-reason"
            >
              <option value="repair">Repair</option>
              <option value="authorized_spend">Authorized by a manager</option>
            </select>
          </label>
          <label className="text-xs text-slate-600">
            Work order
            <EntityPicker
              kind="work_order"
              operatingCompanyId={companyId}
              value={workOrderId}
              onChange={(next) => setWorkOrderId(next ?? null)}
              allowCreate={false}
              placeholder={reason === "repair" ? "Required for a repair" : "Optional"}
              className="mt-1"
              dataTestId="fuel-card-overage-exempt-work-order"
            />
          </label>
        </div>
        <label className="block text-xs text-slate-600">
          Note
          <textarea
            className="mt-1 min-h-16 w-full rounded-sm border border-gray-300 px-2 py-1 text-xs"
            value={note}
            maxLength={1000}
            onChange={(e) => setNote(e.target.value)}
            data-testid="fuel-card-overage-exempt-note"
          />
        </label>
        {error ? (
          <p className="text-xs text-red-800" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="button"
            loading={busy}
            disabled={Boolean(missing)}
            title={missing ?? undefined}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await onConfirm({ reason, work_order_id: workOrderId, note: note.trim() });
                onClose();
              } catch (err) {
                setError((err as Error)?.message || "Exemption failed — please try again.");
              } finally {
                setBusy(false);
              }
            }}
          >
            Exempt
          </Button>
        </div>
      </div>
    </Modal>
  );
}
