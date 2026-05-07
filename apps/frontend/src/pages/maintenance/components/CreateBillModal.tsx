import { useState } from "react";
import { Modal } from "../../../components/Modal";
import { TwoSectionLineEditor, type TwoSectionLine } from "../../../components/forms/TwoSectionLineEditor";

type Props = {
  open: boolean;
  linkedWoDisplayId?: string;
  onClose: () => void;
};

export function CreateBillModal({ open, linkedWoDisplayId, onClose }: Props) {
  const [lines, setLines] = useState<TwoSectionLine[]>([]);
  const subtotal = lines.reduce((sum, line) => sum + Number(line.amount || 0), 0);

  return (
    <Modal open={open} onClose={onClose} title="Create Bill">
      <div className="space-y-3">
        <div className="grid gap-2 rounded border border-gray-200 bg-white p-2 md:grid-cols-3">
          <input className="rounded border border-gray-300 px-2 py-1 text-xs" placeholder="Vendor UUID" />
          <input className="rounded border border-gray-300 px-2 py-1 text-xs" placeholder="Bill date" type="date" />
          <div className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-900">
            Linked → {linkedWoDisplayId || "WO-XXXX"}
          </div>
        </div>
        <TwoSectionLineEditor mode="bill" onChange={setLines} />
        <div className="text-right text-xs font-semibold">Bill total: ${subtotal.toFixed(2)}</div>
      </div>
    </Modal>
  );
}
