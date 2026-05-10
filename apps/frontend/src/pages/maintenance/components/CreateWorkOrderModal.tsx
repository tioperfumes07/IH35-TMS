import { useEffect } from "react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { createWorkOrder, suggestExpenseLoad, type PaymentTiming, type WorkOrderType } from "../../../api/maintenance";
import { ApiError } from "../../../api/client";
import { Button } from "../../../components/Button";
import { TwoSectionLineEditor, type TwoSectionLine } from "../../../components/forms/TwoSectionLineEditor";
import { TotalsStack } from "../../../components/forms/shared/TotalsStack";
import { TypeTabBar } from "../../../components/forms/shared/TypeTabBar";
import { Modal } from "../../../components/Modal";
import { useToast } from "../../../components/Toast";
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
  load_exemption_reason: string;
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

const typeTabs: Array<{ id: WorkOrderType; label: string }> = [
  { id: "pm", label: "PM" },
  { id: "repair", label: "Repair" },
  { id: "tire", label: "Tire" },
  { id: "accident", label: "Accident" },
];

const G18_EXPENSE_REGEX = /\b(fuel|diesel|roadside|toll|parking)\b/i;

export function CreateWorkOrderModal({ open, operatingCompanyId, initialType = "pm", initialValues, onClose, onCreated }: Props) {
  const { pushToast } = useToast();
  const [lines, setLines] = useState<TwoSectionLine[]>([]);
  const [taxRate, setTaxRate] = useState(8.25);
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
      load_exemption_reason: "",
      description: "",
      payment_timing: "vendor_invoice",
      bill_terms: "net_30",
      bill_date: new Date().toISOString().slice(0, 10),
      due_date: "",
      line_items: [],
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
    setLines([]);
    setSuggestionPinned(false);
    setBackendLoadError(null);
  }, [form, initialType, initialValues, open]);

  const selectedType = form.watch("wo_type");
  const sourceType = form.watch("source_type");
  const paymentTiming = form.watch("payment_timing");
  const driverId = form.watch("driver_id");
  const unitId = form.watch("unit_id");
  const serviceDate = form.watch("service_date");
  const selectedLoad = form.watch("load_id");
  const [backendLoadError, setBackendLoadError] = useState<string | null>(null);
  const [suggestionPinned, setSuggestionPinned] = useState(false);
  useEffect(() => {
    if (!open) return;
    setSuggestionPinned(false);
  }, [driverId, unitId, serviceDate, open]);
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

  const sectionALines = lines
    .filter((line) => line.section === "A")
    .map((line) => ({
      description: line.description,
      quantity: Number(line.quantity || 0),
      amount: Number(line.unit_cost || 0),
      expense_category_uuid: line.expense_category_uuid || "",
    }))
    .filter((line) => line.expense_category_uuid);

  const sectionBLines = lines
    .filter((line) => line.section === "B")
    .map((line) => ({
      description: line.description,
      quantity: Number(line.quantity || 0),
      unit_cost: Number(line.unit_cost || 0),
      amount: Number(line.amount || 0),
      service_item_uuid: line.service_item_uuid || "",
      sub_rows: (line.sub_rows ?? []).map((row) => ({
        line_type: row.line_type,
        description: row.description,
        quantity: Number(row.quantity || 0),
        unit_cost: Number(row.unit_cost || 0),
        amount: Number(row.amount || 0),
        part_uuid: row.part_uuid,
        labor_rate_uuid: row.labor_rate_uuid,
        part_location_codes: row.part_location_codes ?? [],
      })),
    }))
    .filter((line) => line.service_item_uuid);

  const subtotal = lines.reduce((sum, line) => {
    if (line.section === "A") return sum + Number(line.amount || 0);
    const subRowsTotal = (line.sub_rows ?? []).reduce((rowSum, row) => rowSum + Number(row.amount || 0), 0);
    return sum + Math.max(Number(line.amount || 0), subRowsTotal);
  }, 0);
  const requiresLoadForG18 =
    paymentTiming === "paid_same_day" &&
    sectionALines.some((line) => G18_EXPENSE_REGEX.test(line.description));
  const suggestionQuery = useQuery({
    queryKey: ["maintenance", "suggest-load", operatingCompanyId, driverId, unitId, serviceDate],
    queryFn: () =>
      suggestExpenseLoad({
        operating_company_id: operatingCompanyId,
        driver_id: driverId || undefined,
        unit_id: unitId || undefined,
        transaction_date: serviceDate,
      }),
    enabled: Boolean(operatingCompanyId && serviceDate && (driverId || unitId)),
  });

  useEffect(() => {
    if (!open) return;
    if (selectedLoad || suggestionPinned) return;
    const suggested = suggestionQuery.data?.data;
    if (!suggested?.load_id) return;
    form.setValue("load_id", suggested.load_id, { shouldDirty: false });
    setSuggestionPinned(true);
  }, [form, open, selectedLoad, suggestionPinned, suggestionQuery.data]);

  const submit = async (mode: "full" | "wo_only") => {
    const values = form.getValues();
    if (mode === "wo_only" && values.payment_timing !== "in_house") {
      pushToast("Save WO Only is only available for in-house timing", "error");
      return;
    }
    if (mode === "full" && requiresLoadForG18 && !values.load_id) {
      if (values.load_exemption_reason.trim().length < 20) {
        pushToast("Diesel/over-the-road expenses need a load or exemption reason (>=20 chars)", "error");
        return;
      }
    }
    setBackendLoadError(null);
    try {
      const response = await createWorkOrder({
        header: {
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
          load_exemption_reason: values.load_exemption_reason?.trim() || undefined,
        },
        sectionA: sectionALines,
        sectionB: sectionBLines,
      });
      if ((response as { bill?: { uuid?: string } }).bill?.uuid) {
        pushToast("Work order created. Bill auto-created (Open Bill).", "success");
      } else if ((response as { expense?: { uuid?: string } }).expense?.uuid) {
        pushToast("Work order created. Expense auto-created (Open Expense).", "success");
      } else {
        pushToast("Work order created", "success");
      }
      onCreated();
      onClose();
    } catch (error) {
      if (error instanceof ApiError) {
        const payload = error.data as { error?: string; message?: string } | undefined;
        if (payload?.error === "E_LOAD_FK_REQUIRED" || payload?.error === "E_DIESEL_REQUIRES_LOAD") {
          const msg = payload.message || "Load is required for this expense category.";
          setBackendLoadError(msg);
          pushToast(msg, "error");
          return;
        }
      }
      pushToast(`Failed to create work order: ${String((error as Error).message || error)}`, "error");
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Create Work Order">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <TypeTabBar
            tabs={typeTabs.map((tab) => ({ id: tab.id, label: tab.label }))}
            activeId={selectedType}
            onChange={(tabId) => {
              const typed = tabId as WorkOrderType;
              form.setValue("wo_type", typed);
              if (typed === "accident") form.setValue("source_type", "AC");
              else if (typed === "tire") form.setValue("source_type", "IT");
              else form.setValue("source_type", "IS");
            }}
          />
        </div>

        <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700">
          Work Order Details
        </div>
        <CreateWOSectionIdentification
          register={form.register}
          watch={form.watch}
          requireLoadForExpense={requiresLoadForG18}
          suggestedLoad={
            suggestionQuery.data?.data
              ? {
                  load_number: suggestionQuery.data.data.load_number,
                  confidence: suggestionQuery.data.data.confidence,
                }
              : null
          }
          backendLoadError={backendLoadError}
        />
        <CreateWOSectionPaymentTiming register={form.register} watch={form.watch} />
        <div className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-900">
          Class auto-derive: <span className="font-semibold">{form.watch("class_hint") || `${form.watch("unit_id") || "UNIT"}-${form.watch("driver_id") || "DRIVER"}`}</span>
        </div>
        <TwoSectionLineEditor mode="wo" initialLines={[]} onChange={setLines} />
        {requiresLoadForG18 ? (
          <div className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-900">
            Required: this expense type must link to a load (G18).
          </div>
        ) : null}
        <TotalsStack subtotal={subtotal} taxRate={taxRate} onTaxRateChange={setTaxRate} grandLabel="WO Total = A + B" />
        <CreateWOSectionValidation checks={checks} />

        <div className="flex items-center justify-between">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" disabled={paymentTiming !== "in_house"} onClick={() => void submit("wo_only")}>
              Save WO Only
            </Button>
            <Button
              type="button"
              disabled={requiresLoadForG18 && !Boolean(form.watch("load_id")) && form.watch("load_exemption_reason").trim().length < 20}
              onClick={() => void submit("full")}
            >
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
