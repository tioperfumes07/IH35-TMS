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
import { UploadZone } from "../../../components/UploadZone";
import { CreateWOSectionIdentification } from "./CreateWOSectionIdentification";
import { CreateWOSectionRenderV5Header } from "./CreateWOSectionRenderV5Header";
import { CreateWOSectionPaymentTiming } from "./CreateWOSectionPaymentTiming";
import { CreateWOSectionValidation } from "./CreateWOSectionValidation";
import { CreateWOSectionReconcile } from "./CreateWOSectionReconcile";

export type CreateWOFormValues = {
  wo_type: WorkOrderType;
  source_type: "IS" | "ES" | "AC" | "ET" | "RT" | "IT" | "RS";
  bucket: "in_house" | "external" | "roadside";
  service_date: string;
  unit_id: string;
  driver_id: string;
  class_hint: string;
  repair_location: string;
  vendor_id: string;
  vendor_qbo_id: string;
  vendor_display_name: string;
  customer_id: string;
  customer_qbo_id: string;
  customer_display_name: string;
  shop_name: string;
  shop_address: string;
  shop_phone: string;
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
  roadside_callout_at: string;
  roadside_arrived_at: string;
  roadside_provider_vendor_id: string;
  roadside_location: string;
  roadside_breakdown_load_id: string;
  // Block 8 — VMRS repair detail.
  vmrs_system_code: string;
  vmrs_assembly_code: string;
  vmrs_component_code: string;
  out_of_service: boolean;
  repair_complaint: string;
  repair_cause: string;
  repair_correction: string;
  // render-v5 header (#1353 live columns).
  status: "open" | "in_progress" | "waiting_parts" | "complete" | "cancelled";
  open_date: string;
  open_time: string;
  authorized_by_user_id: string;
  authorization_number: string;
  service_location_type: "" | "shop" | "mobile" | "roadside";
  repaired_by: "" | "in_house" | "outside_vendor";
  // render-v5 §A Priority — stored value must match the mig-0310 CHECK (routine|urgent|immediate).
  wo_priority: "" | "routine" | "urgent" | "immediate";
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
const DEFAULT_SOURCE_BY_TYPE: Record<WorkOrderType, CreateWOFormValues["source_type"]> = {
  pm: "IS",
  repair: "IS",
  tire: "IT",
  accident: "AC",
};

export function CreateWorkOrderModal({ open, operatingCompanyId, initialType = "pm", initialValues, onClose, onCreated }: Props) {
  const { pushToast } = useToast();
  const [lines, setLines] = useState<TwoSectionLine[]>([]);
  const [taxRate, setTaxRate] = useState(8.25);
  // Block 8 gap 1 — vendor-invoice reconcile (the invoice SIDE; the WO side is computed from the lines below).
  // Block 8 — asset-location map: serialized parts placed on the unit during this WO.
  const [serializedParts, setSerializedParts] = useState<
    Array<{ part_type: "tire" | "battery" | "lamp" | "mirror" | "other"; part_label: string; serial_number: string; position_code: string }>
  >([]);
  const [invoicePartsInput, setInvoicePartsInput] = useState("");
  const [invoiceLaborInput, setInvoiceLaborInput] = useState("");
  const form = useForm<CreateWOFormValues>({
    defaultValues: {
      wo_type: initialType,
      source_type: DEFAULT_SOURCE_BY_TYPE[initialType],
      bucket: "in_house",
      service_date: new Date().toISOString().slice(0, 10),
      unit_id: "",
      driver_id: "",
      class_hint: "",
      repair_location: "in_house",
      vendor_id: "",
      vendor_qbo_id: "",
      vendor_display_name: "",
      customer_id: "",
      customer_qbo_id: "",
      customer_display_name: "",
      shop_name: "",
      shop_address: "",
      shop_phone: "",
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
      roadside_callout_at: "",
      roadside_arrived_at: "",
      roadside_provider_vendor_id: "",
      roadside_location: "",
      roadside_breakdown_load_id: "",
      vmrs_system_code: "",
      vmrs_assembly_code: "",
      vmrs_component_code: "",
      out_of_service: false,
      repair_complaint: "",
      repair_cause: "",
      repair_correction: "",
      status: "open",
      open_date: new Date().toISOString().slice(0, 10),
      open_time: "",
      authorized_by_user_id: "",
      authorization_number: "",
      service_location_type: "",
      repaired_by: "",
      wo_priority: "",
      line_items: [],
      ...initialValues,
    },
  });

  useEffect(() => {
    if (!open) return;
    const nextSource = initialValues?.source_type ?? DEFAULT_SOURCE_BY_TYPE[initialType];
    form.reset({
      ...form.getValues(),
      wo_type: initialType,
      source_type: nextSource,
      ...initialValues,
    });
    setLines([]);
    setSerializedParts([]);
    setInvoicePartsInput("");
    setInvoiceLaborInput("");
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
  const [draftAttachmentEntityId, setDraftAttachmentEntityId] = useState(() => crypto.randomUUID());
  useEffect(() => {
    if (!open) return;
    setSuggestionPinned(false);
    setDraftAttachmentEntityId(crypto.randomUUID());
  }, [open]);
  const needsExternalVendor = ["ES", "AC", "ET", "RT", "RS"].includes(sourceType);

  // Block 8 gap 1 — two-sided reconcile. WO parts/labor come from the Section B item sub-rows by line_type;
  // the invoice side is the captured vendor-invoice totals. Create is HARD-GATED until both tie (vendor
  // invoices only — in-house / paid-same-day have no separate invoice to reconcile against).
  const sectionBSubRows = lines.filter((l) => l.section === "B").flatMap((l) => l.sub_rows ?? []);
  const woPartsDollars = sectionBSubRows.filter((r) => r.line_type === "parts").reduce((s, r) => s + Number(r.amount || 0), 0);
  const woLaborDollars = sectionBSubRows.filter((r) => r.line_type === "labor").reduce((s, r) => s + Number(r.amount || 0), 0);
  const reconcileRequired = paymentTiming === "vendor_invoice";
  const reconcileOk =
    !reconcileRequired ||
    (Math.round(woPartsDollars * 100) === Math.round((Number(invoicePartsInput) || 0) * 100) &&
      Math.round(woLaborDollars * 100) === Math.round((Number(invoiceLaborInput) || 0) * 100));

  const checks = [
    { label: "Unit active and class set", ok: Boolean(form.watch("unit_id")) },
    {
      label: "Driver and unit required for non-PM operational types",
      ok: selectedType === "pm" || (Boolean(form.watch("driver_id")) && Boolean(form.watch("unit_id"))),
    },
    {
      label: "Vendor invoice # or vendor WO # required",
      ok:
        Boolean(String(form.watch("vendor_invoice_number") ?? "").trim()) ||
        Boolean(String(form.watch("external_vendor_invoice_number") ?? "").trim()) ||
        Boolean(String(form.watch("external_vendor_wo_number") ?? "").trim()),
    },
    { label: "Vendor required for non in-house location", ok: form.watch("repair_location") === "in_house" || Boolean(form.watch("vendor_id")) },
    {
      label: "External WO fields required for ES/AC/ET/RT/RS",
      ok:
        !needsExternalVendor ||
        ((Boolean(form.watch("external_vendor_id")) || Boolean(form.watch("vendor_id"))) &&
          Boolean(form.watch("external_vendor_wo_number")) &&
          Boolean(form.watch("external_vendor_invoice_number"))),
    },
    { label: "At least one cost line item", ok: (form.watch("line_items") ?? []).length > 0 },
    ...(reconcileRequired
      ? [{ label: "Vendor invoice reconciles — WO parts & labor tie to invoice", ok: reconcileOk }]
      : []),
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
      const canonicalVendorId = values.external_vendor_id || values.vendor_id || undefined;
      const response = await createWorkOrder({
        header: {
          operating_company_id: operatingCompanyId,
          // Option B: send the UploadZone draft id so the WO route re-keys create-time photos/estimates
          // onto the new work order (otherwise they orphan).
          attachment_draft_id: draftAttachmentEntityId,
          wo_type: values.wo_type,
          source_type: values.source_type,
          unit_id: values.unit_id,
          driver_id: values.driver_id || undefined,
          load_id: values.load_id || undefined,
          service_date: values.service_date || undefined,
          repair_location: values.repair_location,
          bucket: values.bucket,
          vendor_id: values.vendor_id || undefined,
          vendor_qbo_id: values.vendor_qbo_id || undefined,
          shop_name: values.shop_name || undefined,
          shop_address: values.shop_address || undefined,
          shop_phone: values.shop_phone || undefined,
          vendor_invoice_number: values.vendor_invoice_number || undefined,
          external_vendor_id: needsExternalVendor ? canonicalVendorId : undefined,
          external_vendor_wo_number: values.external_vendor_wo_number || undefined,
          external_vendor_invoice_number: values.external_vendor_invoice_number || undefined,
          description: values.description,
          payment_timing: mode === "wo_only" ? "in_house" : values.payment_timing,
          bill_terms: values.bill_terms || undefined,
          bill_date: values.bill_date || undefined,
          due_date: values.due_date || undefined,
          load_exemption_reason: values.load_exemption_reason?.trim() || undefined,
          roadside_callout_at: values.roadside_callout_at ? new Date(values.roadside_callout_at).toISOString() : undefined,
          roadside_arrived_at: values.roadside_arrived_at ? new Date(values.roadside_arrived_at).toISOString() : undefined,
          roadside_provider_vendor_id: values.roadside_provider_vendor_id || undefined,
          roadside_location: values.roadside_location || undefined,
          roadside_breakdown_load_id: values.roadside_breakdown_load_id || undefined,
          // Block 8 — VMRS repair detail.
          vmrs_system_code: values.vmrs_system_code || undefined,
          vmrs_assembly_code: values.vmrs_assembly_code || undefined,
          vmrs_component_code: values.vmrs_component_code || undefined,
          out_of_service: values.out_of_service || undefined,
          repair_complaint: values.repair_complaint || undefined,
          repair_cause: values.repair_cause || undefined,
          repair_correction: values.repair_correction || undefined,
          // render-v5 header (#1353 live columns). opened_at = open_date + open_time → ISO (date-only if no time).
          status: values.status || undefined,
          opened_at: values.open_date
            ? new Date(`${values.open_date}T${values.open_time || "00:00"}`).toISOString()
            : undefined,
          authorized_by_user_id: values.authorized_by_user_id || undefined,
          authorization_number: values.authorization_number || undefined,
          wo_priority: values.wo_priority || undefined,
          service_location_type: values.service_location_type || undefined,
          repaired_by: values.repaired_by || undefined,
        },
        sectionA: sectionALines,
        sectionB: sectionBLines,
        serialized_parts: serializedParts
          .filter((sp) => sp.part_label.trim())
          .map((sp) => ({
            part_type: sp.part_type,
            part_label: sp.part_label.trim(),
            serial_number: sp.serial_number.trim() || undefined,
            position_code: sp.position_code.trim() || undefined,
          })),
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
              form.setValue("source_type", DEFAULT_SOURCE_BY_TYPE[typed]);
            }}
          />
        </div>

        <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700">
          Work Order Details
        </div>
        <CreateWOSectionIdentification
          register={form.register}
          watch={form.watch}
          operatingCompanyId={operatingCompanyId}
          setValue={form.setValue}
          getValues={form.getValues}
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
        <CreateWOSectionRenderV5Header register={form.register} />
        <CreateWOSectionPaymentTiming register={form.register} watch={form.watch} />
        <div className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-900">
          Class auto-derive: <span className="font-semibold">{form.watch("class_hint") || `${form.watch("unit_id") || "UNIT"}-${form.watch("driver_id") || "DRIVER"}`}</span>
        </div>
        {/* Block 8 — VMRS Repair Detail (render-v5 §B). System/Assembly/Component codes + the 3 Cs. §7 navy. */}
        <section data-testid="wo-vmrs-repair-detail" className="rounded border border-slate-300 bg-white p-2 text-xs">
          <div className="mb-1 font-semibold text-[#1F2A44]">VMRS Repair Detail — System / component</div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <label className="space-y-0.5"><span className="font-semibold text-slate-600">System code</span>
              <input {...form.register("vmrs_system_code")} className="h-7 w-full rounded border border-gray-300 px-2" /></label>
            <label className="space-y-0.5"><span className="font-semibold text-slate-600">Assembly code</span>
              <input {...form.register("vmrs_assembly_code")} className="h-7 w-full rounded border border-gray-300 px-2" /></label>
            <label className="space-y-0.5"><span className="font-semibold text-slate-600">Component code</span>
              <input {...form.register("vmrs_component_code")} className="h-7 w-full rounded border border-gray-300 px-2" /></label>
          </div>
          <label className="mt-2 flex items-center gap-1.5 font-semibold text-slate-600">
            <input type="checkbox" {...form.register("out_of_service")} className="h-3.5 w-3.5" /> Out of service?
          </label>
          <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
            <label className="space-y-0.5"><span className="font-semibold text-slate-600">Complaint</span>
              <textarea {...form.register("repair_complaint")} rows={2} className="w-full rounded border border-gray-300 px-2 py-1" /></label>
            <label className="space-y-0.5"><span className="font-semibold text-slate-600">Cause</span>
              <textarea {...form.register("repair_cause")} rows={2} className="w-full rounded border border-gray-300 px-2 py-1" /></label>
            <label className="space-y-0.5"><span className="font-semibold text-slate-600">Correction</span>
              <textarea {...form.register("repair_correction")} rows={2} className="w-full rounded border border-gray-300 px-2 py-1" /></label>
          </div>
        </section>
        {/* Block 8 — Asset-location map (serialized parts): part + serial + position on the unit. §7 navy. */}
        <section data-testid="wo-asset-location" className="rounded border border-slate-300 bg-white p-2 text-xs">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-semibold text-[#1F2A44]">Asset-location (serialized parts)</span>
            <button
              type="button"
              data-testid="wo-add-serialized-part"
              onClick={() => setSerializedParts((p) => [...p, { part_type: "tire", part_label: "", serial_number: "", position_code: "" }])}
              className="rounded bg-[#1F2A44] px-2 py-0.5 text-[10px] font-semibold text-white"
            >
              + Add part
            </button>
          </div>
          {serializedParts.length === 0 ? (
            <div className="text-[11px] text-slate-500">No serialized parts. Add tires/batteries/lamps/mirrors with serial + position.</div>
          ) : (
            <div className="space-y-1">
              {serializedParts.map((sp, i) => (
                <div key={i} className="grid grid-cols-1 gap-1 md:grid-cols-[120px_1fr_1fr_1fr_auto]">
                  <select
                    value={sp.part_type}
                    onChange={(e) => setSerializedParts((p) => p.map((x, j) => (j === i ? { ...x, part_type: e.target.value as typeof x.part_type } : x)))}
                    className="h-7 rounded border border-gray-300 px-1"
                  >
                    {["tire", "battery", "lamp", "mirror", "other"].map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <input placeholder="Part label" value={sp.part_label}
                    onChange={(e) => setSerializedParts((p) => p.map((x, j) => (j === i ? { ...x, part_label: e.target.value } : x)))}
                    className="h-7 rounded border border-gray-300 px-2" />
                  <input placeholder="Serial #" value={sp.serial_number}
                    onChange={(e) => setSerializedParts((p) => p.map((x, j) => (j === i ? { ...x, serial_number: e.target.value } : x)))}
                    className="h-7 rounded border border-gray-300 px-2" />
                  <input placeholder="Position (e.g. LF, RR-IN)" value={sp.position_code}
                    onChange={(e) => setSerializedParts((p) => p.map((x, j) => (j === i ? { ...x, position_code: e.target.value } : x)))}
                    className="h-7 rounded border border-gray-300 px-2" />
                  <button type="button" onClick={() => setSerializedParts((p) => p.filter((_, j) => j !== i))}
                    className="rounded border border-gray-300 px-2 text-[11px] text-[#A32D2D]">Remove</button>
                </div>
              ))}
            </div>
          )}
        </section>
        <TwoSectionLineEditor mode="wo" initialLines={[]} onChange={setLines} />
        {requiresLoadForG18 ? (
          <div className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-900">
            Required: this expense type must link to a load (G18).
          </div>
        ) : null}
        <TotalsStack subtotal={subtotal} taxRate={taxRate} onTaxRateChange={setTaxRate} grandLabel="WO Total = A + B" />
        {reconcileRequired ? (
          <CreateWOSectionReconcile
            woPartsDollars={woPartsDollars}
            woLaborDollars={woLaborDollars}
            invoicePartsInput={invoicePartsInput}
            invoiceLaborInput={invoiceLaborInput}
            onInvoicePartsChange={setInvoicePartsInput}
            onInvoiceLaborChange={setInvoiceLaborInput}
          />
        ) : null}
        <CreateWOSectionValidation checks={checks} />
        <UploadZone
          operatingCompanyId={operatingCompanyId}
          entityType="work_order"
          entityId={draftAttachmentEntityId}
          defaultCategory="vendor_ro"
          title="Work Order Attachments"
        />

        <div className="flex items-center justify-between">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" disabled={paymentTiming !== "in_house"} onClick={() => void submit("wo_only")}>
              Save draft
            </Button>
            <Button
              type="button"
              disabled={
                (requiresLoadForG18 && !Boolean(form.watch("load_id")) && form.watch("load_exemption_reason").trim().length < 20) ||
                // Block 8 gap 1 — hard gate: vendor-invoice WO can't be created until parts & labor tie.
                !reconcileOk
              }
              onClick={() => void submit("full")}
            >
              {paymentTiming === "vendor_invoice" ? "Save WO & Create Bill" : paymentTiming === "paid_same_day" ? "Save WO & Create Expense" : "Create work order"}
            </Button>
          </div>
        </div>
        <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-900">
          Posts to QBO with class {form.watch("class_hint") || `${form.watch("unit_id") || "UNIT"}-${form.watch("driver_id") || "DRIVER"}`} on every line
        </div>
      </div>
    </Modal>
  );
}
