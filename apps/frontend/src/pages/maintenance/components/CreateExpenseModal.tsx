import { useState } from "react";
import { Modal } from "../../../components/Modal";
import { TwoSectionLineEditor, type TwoSectionLine } from "../../../components/forms/TwoSectionLineEditor";
import { TotalsStack } from "../../../components/forms/shared/TotalsStack";
import { EXPENSE_TYPE_TABS, TypeTabBar } from "../../../components/forms/shared/TypeTabBar";
import { UploadZone } from "../../../components/UploadZone";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  onClose: () => void;
};

export function CreateExpenseModal({ open, operatingCompanyId, onClose }: Props) {
  const [lines, setLines] = useState<TwoSectionLine[]>([]);
  const [taxRate, setTaxRate] = useState(8.25);
  const [expenseType, setExpenseType] = useState("fuel");
  const [draftAttachmentEntityId] = useState(() => crypto.randomUUID());
  const subtotal = lines.reduce((sum, line) => {
    if (line.section === "A") return sum + Number(line.amount || 0);
    const subRowsTotal = (line.sub_rows ?? []).reduce((rowSum, row) => rowSum + Number(row.amount || 0), 0);
    return sum + Math.max(Number(line.amount || 0), subRowsTotal);
  }, 0);

  return (
    <Modal open={open} onClose={onClose} title="Create Expense">
      <div className="space-y-3">
        <TypeTabBar tabs={EXPENSE_TYPE_TABS} activeId={expenseType} onChange={setExpenseType} />

        <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700">
          Expense Details
        </div>

        <div className="grid gap-2 rounded border border-gray-200 bg-white p-2 md:grid-cols-6">
          <input className="rounded border border-gray-300 px-2 py-1 text-xs md:col-span-2" placeholder="Payee" />
          <div className="md:col-span-3" />
          <input className="rounded border border-gray-300 px-2 py-1 text-xs md:col-span-1" placeholder="Load Number" />
          <select className="rounded border border-gray-300 px-2 py-1 text-xs md:col-span-2" defaultValue="">
            <option value="" disabled>
              Account Paid From
            </option>
            <option value="bank">Bank account</option>
            <option value="credit-card">Credit card</option>
          </select>
          <input className="rounded border border-gray-300 px-2 py-1 text-xs md:col-span-1" placeholder="Transaction date" type="date" />
        </div>

        <TwoSectionLineEditor mode="expense" onChange={setLines} partsLaborMode="parts-and-labor" />
        <TotalsStack subtotal={subtotal} taxRate={taxRate} onTaxRateChange={setTaxRate} grandLabel="Expense Total = A + B" />
        <UploadZone
          operatingCompanyId={operatingCompanyId}
          entityType="expense"
          entityId={draftAttachmentEntityId}
          defaultCategory="receipt"
          title="Expense Receipts"
        />
      </div>
    </Modal>
  );
}
