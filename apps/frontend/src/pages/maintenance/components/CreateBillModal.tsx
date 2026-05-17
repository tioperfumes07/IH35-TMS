import { useState } from "react";
import { Modal } from "../../../components/Modal";
import { TwoSectionLineEditor, type TwoSectionLine } from "../../../components/forms/TwoSectionLineEditor";
import { TotalsStack } from "../../../components/forms/shared/TotalsStack";
import { BILL_TYPE_TABS, TypeTabBar } from "../../../components/forms/shared/TypeTabBar";
import { Combobox } from "../../../components/shared/Combobox";
import { UploadZone } from "../../../components/UploadZone";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  linkedWoDisplayId?: string;
  onClose: () => void;
};

export function CreateBillModal({ open, operatingCompanyId, linkedWoDisplayId, onClose }: Props) {
  const [lines, setLines] = useState<TwoSectionLine[]>([]);
  const [taxRate, setTaxRate] = useState(8.25);
  const [billType, setBillType] = useState("repair");
  const [draftAttachmentEntityId] = useState(() => crypto.randomUUID());
  const subtotal = lines.reduce((sum, line) => {
    if (line.section === "A") return sum + Number(line.amount || 0);
    const subRowsTotal = (line.sub_rows ?? []).reduce((rowSum, row) => rowSum + Number(row.amount || 0), 0);
    return sum + Math.max(Number(line.amount || 0), subRowsTotal);
  }, 0);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create Bill"
    >
      <div className="space-y-3">
        <TypeTabBar tabs={BILL_TYPE_TABS} activeId={billType} onChange={setBillType} />

        <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700">Bill Details</div>

        <div className="grid gap-2 rounded border border-gray-200 bg-white p-2 md:grid-cols-6">
          <Field label="Bill Type *">
            <input className="h-8 w-full rounded border border-gray-300 bg-gray-100 px-2 text-xs" value={BILL_TYPE_TABS.find((t) => t.id === billType)?.label ?? "Repair Bill"} readOnly />
          </Field>
          <div />
          <Field label="Bill Date *">
            <input className="h-8 w-full rounded border border-gray-300 px-2 text-xs" type="date" />
          </Field>
          <Field label="Terms">
            <Combobox
              options={[
                { value: "net_30", label: "Net 30" },
                { value: "net_15", label: "Net 15" },
                { value: "net_7", label: "Net 7" },
              ]}
              value={"net_30"}
              onChange={() => {}}
            />
          </Field>
          <Field label="Due Date (auto, readonly)">
            <input className="h-8 w-full rounded border border-gray-300 bg-gray-100 px-2 text-xs" value="Auto from terms" readOnly />
          </Field>
          <Field label="Bill Number *">
            <input className="h-8 w-full rounded border border-gray-300 px-2 text-xs" placeholder="Bill Number" />
          </Field>

          <div className="md:col-span-6 h-2" />
          <Field label="Vendor *">
            <input className="h-8 w-full rounded border border-gray-300 px-2 text-xs" placeholder="Vendor" />
          </Field>
          <div className="md:col-span-4" />
          <Field label="Load Number">
            <input className="h-8 w-full rounded border border-gray-300 px-2 text-xs" placeholder="Load Number" />
          </Field>

          <div className="md:col-span-6 h-2" />
          <Field label="Driver">
            <input className="h-8 w-full rounded border border-gray-300 px-2 text-xs" placeholder="Driver" />
          </Field>
          <Field label="Unit">
            <input className="h-8 w-full rounded border border-gray-300 px-2 text-xs" placeholder="Unit" />
          </Field>
          <div className="md:col-span-3" />
          <Field label="Class">
            <input className="h-8 w-full rounded border border-gray-300 bg-gray-100 px-2 text-xs" value="Auto class" readOnly />
          </Field>

          <div className="md:col-span-6 rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-900">
            Linked - {linkedWoDisplayId || "WO-XXXX"}
          </div>
        </div>

        <TwoSectionLineEditor mode="bill" onChange={setLines} partsLaborMode="parts-and-labor" />
        <TotalsStack subtotal={subtotal} taxRate={taxRate} onTaxRateChange={setTaxRate} grandLabel="Bill Total = A + B" />
        <UploadZone
          operatingCompanyId={operatingCompanyId}
          entityType="bill"
          entityId={draftAttachmentEntityId}
          defaultCategory="vendor_invoice"
          title="Bill Attachments"
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
