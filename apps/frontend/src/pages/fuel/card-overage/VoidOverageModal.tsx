import { VoidReasonModal } from "../../../components/accounting/VoidReasonModal";

type Props = {
  open: boolean;
  /** e.g. "$450.00 for Juan Perez" — what is being voided. */
  summary: string;
  /** True when the receivable has posted: the void also posts a linked reversing entry. */
  posted: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
};

/** ROUND 352 point 7 — void an overage event; a posted receivable is reversed, never deleted. */
export function VoidOverageModal({ open, summary, posted, onClose, onConfirm }: Props) {
  return (
    <VoidReasonModal
      open={open}
      title="Void overage"
      entityRef={summary}
      postsReversingEntry={posted}
      onClose={onClose}
      onSubmit={onConfirm}
      submitLabel="Void"
    />
  );
}
