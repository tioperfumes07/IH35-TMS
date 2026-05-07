import { useState } from "react";
import { Modal } from "../../../components/Modal";
import { TwoSectionLineEditor, type TwoSectionLine } from "../../../components/forms/TwoSectionLineEditor";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function CreateExpenseModal({ open, onClose }: Props) {
  const [lines, setLines] = useState<TwoSectionLine[]>([]);
  const subtotal = lines.reduce((sum, line) => sum + Number(line.amount || 0), 0);

  return (
    <Modal open={open} onClose={onClose} title="Create Expense">
      <div className="space-y-3">
        <div className="grid gap-2 rounded border border-gray-200 bg-white p-2 md:grid-cols-3">
          <input className="rounded border border-gray-300 px-2 py-1 text-xs" placeholder="Vendor UUID" />
          <select className="rounded border border-gray-300 px-2 py-1 text-xs" defaultValue="">
            <option value="" disabled>
              Account Paid From
            </option>
            <option value="bank">Bank account</option>
            <option value="credit-card">Credit card</option>
          </select>
          <input className="rounded border border-gray-300 px-2 py-1 text-xs" placeholder="Transaction date" type="date" />
        </div>
        <TwoSectionLineEditor mode="expense" onChange={setLines} />
        <div className="text-right text-xs font-semibold">Expense total: ${subtotal.toFixed(2)}</div>
      </div>
    </Modal>
  );
}
