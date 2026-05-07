import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { createWorkOrder, type PaymentTiming, type WorkOrderType } from "../../../api/maintenance";
import { Button } from "../../../components/Button";
import { Modal } from "../../../components/Modal";
import { useToast } from "../../../components/Toast";
import { CreateWOSectionCostBreakdown } from "./CreateWOSectionCostBreakdown";
import { CreateWOSectionIdentification } from "./CreateWOSectionIdentification";
import { CreateWOSectionPaymentTiming } from "./CreateWOSectionPaymentTiming";
import { CreateWOSectionValidation } from "./CreateWOSectionValidation";

export type CreateWOFormValues = {
  wo_type: WorkOrderType;
  source_type: "IS" | "ES" | "AC" | "ET" | "RT" | "IT" | "RS";
  service_date: string;
  unit_id: string;
  driver_id: string;
  class_hint: string;
  repair_location: string;
  vendor_id: string;
  vendor_invoice_number: string;
  external_vendor_id: string;
  external_vendor_wo_number: string;
  external_vendor_invoice_number: string;
  load_id: string;
  description: string;
  payment_timing: PaymentTiming;
  bill_terms: string;
  bill_date: string;
  due_date: string;
  line_items: Array<{
    line_type: "parts" | "labor" | "other";
    description: string;
    quantity: number;
    unit_cost: number;
    amount: number;
  }>;
};

type Props = {
  open: boolean;
  operatingCompanyId: string;
  initialType?: WorkOrderType;
  initialValues?: Partial<CreateWOFormValues>;
  onClose: () => void;
  onCreated: () => void;
};

const typeTabs: Array<{ id: WorkOrderType; label: string; danger?: boolean }> = [
  { id: "pm", label: "PM" },
  { id: "repair", label: "Repair" },
  { id: "tire", label: "Tire" },
  { id: "accident", label: "Accident", danger: true },
];

export function CreateWorkOrderModal({ open, operatingCompanyId, initialType = "pm", initialValues, onClose, onCreated }: Props) {
  const { pushToast } = useToast();
  const form = useForm<CreateWOFormValues>({
    defaultValues: {
      wo_type: initialType,
      source_type: initialType === "accident" ? "AC" : initialType === "tire" ? "IT" : "IS",
      service_date: new Date().toISOString().slice(0, 10),
      unit_id: "",
      driver_id: "",
      class_hint: "",
      repair_location: "in_house",
      vendor_id: "",
      vendor_invoice_number: "",
      external_vendor_id: "",
      external_vendor_wo_number: "",
      external_vendor_invoice_number: "",
      load_id: "",
      description: "",
      payment_timing: "vendor_invoice",
      bill_terms: "net_30",
      bill_date: new Date().toISOString().slice(0, 10),
      due_date: "",
      line_items: [{ line_type: "parts", description: "", quantity: 1, unit_cost: 0, amount: 0 }],
      ...initialValues,
    },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      ...form.getValues(),
      wo_type: initialType,
      ...initialValues,
    });
  }, [form, initialType, initialValues, open]);

  const selectedType = form.watch("wo_type");
  const sourceType = form.watch("source_type");
  const paymentTiming = form.watch("payment_timing");
  const needsExternalVendor = ["ES", "AC", "ET", "RT", "RS"].includes(sourceType);
  const checks = [
    { label: "Unit active and class set", ok: Boolean(form.watch("unit_id")) },
    { label: "Driver and load required for non-PM types", ok: selectedType === "pm" || (Boolean(form.watch("driver_id")) && Boolean(form.watch("load_id"))) },
    { label: "Vendor required for non in-house location", ok: form.watch("repair_location") === "in_house" || Boolean(form.watch("vendor_id")) },
    {
      label: "External WO fields required for ES/AC/ET/RT/RS",
      ok: !needsExternalVendor || (Boolean(form.watch("external_vendor_id")) && Boolean(form.watch("external_vendor_wo_number")) && Boolean(form.watch("external_vendor_invoice_number"))),
    },
    { label: "At least one cost line item", ok: (form.watch("line_items") ?? []).length > 0 },
  ];

  const submit = async (mode: "full" | "wo_only") => {
    const values = form.getValues();
    if (mode === "wo_only" && values.payment_timing !== "in_house") {
      pushToast("Save WO Only is only available for in-house timing", "error");
      return;
    }
    try {
      await createWorkOrder({
        operating_company_id: operatingCompanyId,
        wo_type: values.wo_type,
        source_type: values.source_type,
        unit_id: values.unit_id,
        driver_id: values.driver_id || undefined,
        load_id: values.load_id || undefined,
        service_date: values.service_date || undefined,
        repair_location: values.repair_location,
        vendor_id: values.vendor_id || undefined,
        vendor_invoice_number: values.vendor_invoice_number || undefined,
        external_vendor_id: values.external_vendor_id || undefined,
        external_vendor_wo_number: values.external_vendor_wo_number || undefined,
        external_vendor_invoice_number: values.external_vendor_invoice_number || undefined,
        description: values.description,
        payment_timing: mode === "wo_only" ? "in_house" : values.payment_timing,
        bill_terms: values.bill_terms || undefined,
        bill_date: values.bill_date || undefined,
        due_date: values.due_date || undefined,
        line_items: values.line_items,
      });
      pushToast("Work order created", "success");
      onCreated();
      onClose();
    } catch (error) {
      pushToast(`Failed to create work order: ${String((error as Error).message || error)}`, "error");
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Create Work Order">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {typeTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                form.setValue("wo_type", tab.id);
                if (tab.id === "accident") form.setValue("source_type", "AC");
                else if (tab.id === "tire") form.setValue("source_type", "IT");
                else form.setValue("source_type", "IS");
              }}
              className={`rounded border px-2 py-1 text-xs font-semibold ${selectedType === tab.id ? (tab.danger ? "border-red-500 bg-red-100 text-red-700" : "border-blue-500 bg-blue-100 text-blue-700") : "border-gray-300 bg-white text-gray-700"}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <CreateWOSectionIdentification register={form.register} watch={form.watch} />
        <CreateWOSectionPaymentTiming register={form.register} watch={form.watch} />
        <CreateWOSectionCostBreakdown control={form.control} register={form.register} watch={form.watch} />
        <CreateWOSectionValidation checks={checks} />

        <div className="flex items-center justify-between">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" disabled={paymentTiming !== "in_house"} onClick={() => void submit("wo_only")}>
              Save WO Only
            </Button>
            <Button type="button" onClick={() => void submit("full")}>
              {paymentTiming === "vendor_invoice" ? "Save WO & Create Bill" : paymentTiming === "paid_same_day" ? "Save WO & Create Expense" : "Save WO"}
            </Button>
          </div>
        </div>
        <div className="rounded border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] text-blue-900">
          Will be: WO-{form.watch("unit_id") || "UNIT"}-{sourceType}-{new Date().toLocaleDateString("en-US").replace(/\//g, "-")}-XXXX (XXXX auto-generated)
        </div>
      </div>
    </Modal>
  );
}
