import { useState } from "react";
import { Modal } from "../../../components/Modal";
import { TwoSectionLineEditor, type TwoSectionLine } from "../../../components/forms/TwoSectionLineEditor";
import { TotalsStack } from "../../../components/forms/shared/TotalsStack";
import { EXPENSE_TYPE_TABS, TypeTabBar } from "../../../components/forms/shared/TypeTabBar";
import { Combobox } from "../../../components/shared/Combobox";
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
          <Field label="Expense Type *">
            <input className="h-8 w-full rounded border border-gray-300 bg-gray-100 px-2 text-xs" value={EXPENSE_TYPE_TABS.find((tab) => tab.id === expenseType)?.label ?? "Fuel Expense"} readOnly />
          </Field>
          <div className="md:col-span-3" />
          <Field label="Expense Date">
            <input className="h-8 w-full rounded border border-gray-300 px-2 text-xs" type="date" />
          </Field>
          <Field label="Expense Number">
            <input className="h-8 w-full rounded border border-gray-300 px-2 text-xs" placeholder="Expense Number" />
          </Field>

          <Field label="Pay From Account">
            <Combobox
              options={[
                { value: "bank", label: "Operating - Frost Bank" },
                { value: "card", label: "Jorge Fuel Card (Comdata)" },
              ]}
              value={"bank"}
              onChange={() => {}}
            />
          </Field>
          <Field label="Payment Method">
            <Combobox
              options={[
                { value: "fuel_card", label: "Fuel card" },
                { value: "debit", label: "Debit" },
                { value: "credit", label: "Credit" },
                { value: "cash", label: "Cash" },
              ]}
              value={"fuel_card"}
              onChange={() => {}}
            />
          </Field>
          <div className="md:col-span-4" />

          <div className="md:col-span-6 h-2" />
          <Field label="Payee">
            <input className="h-8 w-full rounded border border-gray-300 px-2 text-xs" placeholder="Payee" />
          </Field>
          <div className="md:col-span-4" />
          <Field label="Load Number">
            <input className="h-8 w-full rounded border border-gray-300 px-2 text-xs" placeholder="Load Number" />
          </Field>

          <div className="md:col-span-6 h-2" />
          <Field label="Driver">
            <input className="h-8 w-full rounded border border-gray-300 px-2 text-xs" placeholder="Driver" />
          </Field>
          <Field label="Unit Number">
            <input className="h-8 w-full rounded border border-gray-300 px-2 text-xs" placeholder="Unit Number" />
          </Field>
          <div className="md:col-span-3" />
          <Field label="Class">
            <input className="h-8 w-full rounded border border-gray-300 bg-gray-100 px-2 text-xs" value="Auto class" readOnly />
          </Field>

          <div className="md:col-span-6 h-2" />
          <Field label="Invoice Number">
            <input className="h-8 w-full rounded border border-gray-300 px-2 text-xs" placeholder="Invoice Number" />
          </Field>
          <div className="md:col-span-5" />
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

function Field({ label, children }: { label: string; children: JSX.Element }) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-semibold text-gray-600">{label}</label>
      {children}
    </div>
  );
}
