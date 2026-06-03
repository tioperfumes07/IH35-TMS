import { useState } from "react";
import { Link } from "react-router-dom";
import { Modal } from "../Modal";
import { UploadZone } from "../UploadZone";
import { RecordExpenseForm } from "./RecordExpenseForm";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  onClose: () => void;
  onCreated?: () => void;
};

export function RecordExpenseModal({ open, operatingCompanyId, onClose, onCreated }: Props) {
  const [draftAttachmentEntityId] = useState(() => crypto.randomUUID());

  return (
    <Modal open={open} onClose={onClose} title="Record expense" modalKind="record-expense" sizePreset="md">
      <div className="space-y-4">
        <RecordExpenseForm
          operatingCompanyId={operatingCompanyId}
          idPrefix="record-expense-modal"
          submitLabel="Record expense"
          onSubmitted={() => {
            onCreated?.();
            onClose();
          }}
        />
        <UploadZone
          operatingCompanyId={operatingCompanyId}
          entityType="expense"
          entityId={draftAttachmentEntityId}
          defaultCategory="receipt"
          title="Receipt"
        />
        <p className="text-xs text-gray-600">
          <Link className="text-blue-700 underline" to="/accounting/expenses">
            View all expenses
          </Link>
        </p>
      </div>
    </Modal>
  );
}
