import { Link } from "react-router-dom";
import { Modal } from "../Modal";
import { RecordExpenseForm } from "./RecordExpenseForm";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  onClose: () => void;
  onCreated?: () => void;
};

export function RecordExpenseModal({ open, operatingCompanyId, onClose, onCreated }: Props) {
  return (
    <Modal open={open} onClose={onClose} title="Record expense" modalKind="record-expense" sizePreset="md">
      <div className="space-y-4">
        {/* UploadZone now lives INSIDE RecordExpenseForm so its draft id is the one sent in the create
            payload and reconciled onto the real expense (Option B) — no separate, orphaning draft id here. */}
        <RecordExpenseForm
          operatingCompanyId={operatingCompanyId}
          idPrefix="record-expense-modal"
          submitLabel="Record expense"
          onSubmitted={() => {
            onCreated?.();
            onClose();
          }}
        />
        <p className="text-xs text-gray-600">
          <Link className="text-slate-700 underline" to="/accounting/expenses">
            View all expenses
          </Link>
        </p>
      </div>
    </Modal>
  );
}
