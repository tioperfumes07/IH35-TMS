import { Button } from "../../../components/Button";
import { Modal } from "../../../components/Modal";
import { closeUnlessPending } from "../../../components/shared/ConfirmModal";

type Props = {
  open: boolean;
  amountCents: number;
  driverLabel: string;
  loading?: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function FineConvertConfirmModal({ open, amountCents, driverLabel, loading, onClose, onConfirm }: Props) {
  const dismiss = () => closeUnlessPending(Boolean(loading), onClose);
  return (
    <Modal open={open} onClose={dismiss} title="Convert Fine to Driver Liability">
      <div className="space-y-3 text-sm text-gray-700">
        <p>
          This will create a driver liability for <strong>${(amountCents / 100).toFixed(2)}</strong>. The fine will be locked and deducted
          from {driverLabel || "the driver"}'s next settlement.
        </p>
        <p>This cannot be undone (only handled through dispute workflow).</p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={dismiss} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={onConfirm} loading={loading}>
            Confirm conversion
          </Button>
        </div>
      </div>
    </Modal>
  );
}
