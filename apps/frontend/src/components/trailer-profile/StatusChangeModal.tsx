import { Modal } from "../Modal";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function StatusChangeModal({ open, onClose }: Props) {
  return (
    <Modal open={open} title="Change trailer status" onClose={onClose}>
      <p className="text-sm text-gray-600" data-testid="tp-status-change-modal">
        Status change requires a reason (wired in follow-up).
      </p>
    </Modal>
  );
}
