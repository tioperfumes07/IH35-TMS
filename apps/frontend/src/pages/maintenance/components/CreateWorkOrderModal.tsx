import { useEffect, type ReactNode } from "react";
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

// ---- render-v5 presentational helpers (match docs/approved-screens/maintenance-create-wo-render-v5.html) ----
const FLD = "h-[30px] w-full rounded-[5px] border border-[#d6dae1] bg-white px-2 text-[12.5px] text-[#1f2937] outline-none focus:border-[#1f2a44]";

function SectionCard({ badge, title, right, testid, children }: { badge: string; title: string; right?: string; testid?: string; children: ReactNode }) {
  return (
    <section data-testid={testid} className="rounded-[7px] border border-[#d6dae1] bg-white">
      <div className="flex items-center gap-2 rounded-t-[7px] border-b border-[#e6e9ee] bg-[#fafbfc] px-2.5 py-1.5">
        <span className="grid h-[18px] w-[18px] place-items-center rounded bg-[#1d2b45] text-[10px] font-bold text-white">{badge}</span>
        <span className="text-[10.5px] font-bold uppercase tracking-wide text-[#374151]">{title}</span>
        {right ? <span className="ml-auto text-[10.5px] text-[#6b7280]">{right}</span> : null}
      </div>
      <div className="p-2.5">{children}</div>
    </section>
  );
}

function FieldV5({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[10.5px] font-semibold uppercase tracking-wide text-[#6b7280]">{label}</span>
      {children}
    </label>
  );
}

function SegYesNo({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div data-testid="wo-oos-seg" className="inline-flex h-[30px] overflow-hidden rounded-[5px] border border-[#d6dae1]">
      <button type="button" onClick={() => onChange(true)} className={`px-3 text-[11px] font-semibold ${value ? "bg-[#b91c1c] text-white" : "bg-white text-[#6b7280]"}`}>Yes</button>
      <button type="button" onClick={() => onChange(false)} className={`px-3 text-[11px] font-semibold ${!value ? "bg-[#1d2b45] text-white" : "bg-white text-[#6b7280]"}`}>No</button>
    </div>
  );
}

function CccRow({ tone, label, register, placeholder }: { tone: "cmp" | "cau" | "cor"; label: string; register: import("react-hook-form").UseFormRegisterReturn; placeholder?: string }) {
  const bg = tone === "cmp" ? "bg-[#0891b2]" : tone === "cau" ? "bg-[#b45309]" : "bg-[#15803d]";
  return (
    <div className="mb-2 overflow-hidden rounded-md border border-[#e6e9ee] last:mb-0">
      <div className={`px-2 py-1 text-[9.5px] font-extrabold uppercase tracking-wide text-white ${bg}`}>{label}</div>
      <textarea {...register} placeholder={placeholder} className="h-10 w-full resize-y border-0 px-2 py-1.5 text-[12.5px] outline-none" />
    </div>
  );
}

type SerializedPart = { part_type: "tire" | "battery" | "lamp" | "mirror" | "other"; part_label: string; serial_number: string; position_code: string };
const LOC_CATS: Array<{ key: SerializedPart["part_type"]; label: string; positions: string[] }> = [
  { key: "tire", label: "Tires", positions: ["LF", "RF", "D1-LO", "D1-LI", "D1-RI", "D1-RO", "D2-LO", "D2-LI", "D2-RI", "D2-RO"] },
  { key: "battery", label: "Batteries", positions: ["Box-L", "Box-R"] },
  { key: "lamp", label: "Ext. lamps", positions: ["Head-L", "Head-R", "Mkr-L", "Mkr-R", "Tail-L", "Tail-R"] },
  { key: "mirror", label: "Mirrors", positions: ["Mirror-L", "Mirror-R"] },
  { key: "other", label: "Other", positions: ["Cab", "Frame", "Trailer"] },
];

function AssetLocationMap({ parts, onAdd, onChange, onRemove }: { parts: SerializedPart[]; onAdd: () => void; onChange: (i: number, patch: Partial<SerializedPart>) => void; onRemove: (i: number) => void }) {
  return (
    <div data-testid="wo-asset-location" className="mt-2 overflow-hidden rounded-lg border border-[#d6dae1] bg-white">
      <div className="flex items-center gap-2 bg-[#0f1a30] px-2.5 py-1.5 text-white">
        <span className="text-[10px] font-extrabold uppercase tracking-wide">Asset location &amp; serial</span>
        <span className="ml-auto text-[10px] text-[#aab6cd]">tires · batteries · lamps · mirrors — where it sits + serial</span>
        <button type="button" data-testid="wo-add-serialized-part" onClick={onAdd} className="rounded bg-[#1f2a44] px-2 py-0.5 text-[10px] font-semibold text-white">+ Add part</button>
      </div>
      {parts.length === 0 ? (
        <div className="px-3 py-3 text-[11px] text-[#94a3b8]">No serialized items placed. Add a tire/battery/lamp/mirror to capture its position + serial (chain-of-custody).</div>
      ) : (
        <div className="space-y-2 p-2.5">
          {parts.map((sp, i) => {
            const cat = LOC_CATS.find((c) => c.key === sp.part_type) ?? LOC_CATS[0];
            return (
              <div key={i} className="rounded-md border border-[#e6e9ee] p-2">
                <div className="mb-1.5 flex flex-wrap gap-1">
                  {LOC_CATS.map((c) => (
                    <button type="button" key={c.key} onClick={() => onChange(i, { part_type: c.key, position_code: "" })}
                      className={`rounded px-2 py-0.5 text-[11px] font-semibold ${c.key === sp.part_type ? "bg-[#1d2b45] text-white" : "bg-[#f8fafc] text-[#475569]"}`}>{c.label}</button>
                  ))}
                  <button type="button" onClick={() => onRemove(i)} className="ml-auto rounded border border-[#d6dae1] px-2 text-[11px] text-[#b91c1c]">Remove</button>
                </div>
                {/* truck silhouette — clickable wheel/position grid */}
                <div className="rounded-md border border-[#e6e9ee] bg-[#f8fafc] p-2">
                  <svg viewBox="0 0 430 110" className="mb-1 h-16 w-full">
                    <rect x="60" y="30" width="120" height="50" rx="8" fill="#eef2f7" stroke="#cbd5e1" />
                    <rect x="185" y="42" width="210" height="34" rx="6" fill="#f1f5f9" stroke="#cbd5e1" />
                    <text x="120" y="60" fontSize="9" fill="#94a3b8" textAnchor="middle">TRACTOR</text>
                    <text x="290" y="63" fontSize="9" fill="#94a3b8" textAnchor="middle">TRAILER</text>
                  </svg>
                  <div className="flex flex-wrap gap-1">
                    {cat.positions.map((pos) => (
                      <button type="button" key={pos} onClick={() => onChange(i, { position_code: pos })}
                        className={`rounded border px-2 py-0.5 text-[10px] font-bold ${sp.position_code === pos ? "border-[#1f2a44] bg-[#1f2a44] text-white" : "border-[#94a3b8] bg-white text-[#475569]"}`}>{pos}</button>
                    ))}
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
                  <FieldV5 label="Part label"><input value={sp.part_label} onChange={(e) => onChange(i, { part_label: e.target.value })} placeholder="serialized item" className={FLD} /></FieldV5>
                  <FieldV5 label="Serial / DOT #"><input value={sp.serial_number} onChange={(e) => onChange(i, { serial_number: e.target.value })} className={FLD} /></FieldV5>
                  <FieldV5 label="Position"><input value={sp.position_code} onChange={(e) => onChange(i, { position_code: e.target.value })} placeholder="LF / D1-RO…" className={FLD} /></FieldV5>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

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
  // W-FIX-8: render-v5 §A Close date/time → maintenance.work_orders.closed_at.
  close_date: string;
  close_time: string;
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
      close_date: "",
      close_time: "",
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
          closed_at: values.close_date
            ? new Date(`${values.close_date}T${values.close_time || "00:00"}`).toISOString()
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

  // render-v5 §A "Repaired by" → Outside vendor reveals the vendor block (matches the render's #bySel toggle).
  const repairedBy = form.watch("repaired_by");
  const outsideVendor = repairedBy === "outside_vendor";
  useEffect(() => {
    // keep the legacy repair_location/bucket in sync with the render's Repaired-by toggle so submit stays correct
    if (outsideVendor) {
      form.setValue("repair_location", "vendor");
      form.setValue("bucket", "external");
    } else if (repairedBy === "in_house") {
      form.setValue("repair_location", "in_house");
      form.setValue("bucket", "in_house");
    }
  }, [form, outsideVendor, repairedBy]);

  const classHint = form.watch("class_hint") || `${form.watch("unit_id") || "UNIT"}-${form.watch("driver_id") || "DRIVER"}`;

  return (
    <Modal open={open} onClose={onClose} title="Create / Edit Work Order" sizePreset="lg" wide>
      <div data-testid="create-wo-render-v5" className="space-y-2.5 text-[12.5px] text-[#1f2937]">
        {/* Subbar — WO # · status · opened timestamp (render: .subbar) */}
        <div className="flex flex-wrap items-center gap-2 rounded bg-[#243352] px-3 py-1.5 text-[10.5px] text-[#cdd6e6]">
          <span>WO #</span>
          <span className="rounded border border-[#34466a] bg-[#0f1a30] px-2 py-0.5 font-semibold text-white">new — auto on save</span>
          <span>·</span>
          <span className="capitalize">{form.watch("status") || "draft"}</span>
          <span className="ml-auto text-[#8aa0c4]">All changes timestamped</span>
        </div>

        {/* ===================== A — WORK ORDER ===================== */}
        <SectionCard badge="A" title="Work Order" right="every field is a searchable filter list">
          <div className="mb-2 flex flex-wrap gap-2">
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
          <CreateWOSectionIdentification
            register={form.register}
            watch={form.watch}
            operatingCompanyId={operatingCompanyId}
            setValue={form.setValue}
            getValues={form.getValues}
            requireLoadForExpense={requiresLoadForG18}
            suggestedLoad={
              suggestionQuery.data?.data
                ? { load_number: suggestionQuery.data.data.load_number, confidence: suggestionQuery.data.data.confidence }
                : null
            }
            backendLoadError={backendLoadError}
          />
          <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-4">
            <FieldV5 label="Priority"><input list="wo-prios" {...form.register("wo_priority")} placeholder="Routine / Urgent / OOS" className={FLD} /></FieldV5>
            <FieldV5 label="Status"><input list="wo-statuses" {...form.register("status")} placeholder="Open…" className={FLD} /></FieldV5>
            <FieldV5 label="Repaired by"><select {...form.register("repaired_by")} className={FLD}><option value="in_house">In-house</option><option value="outside_vendor">Outside vendor</option></select></FieldV5>
            <FieldV5 label="Authorization #"><input {...form.register("authorization_number")} className={FLD} /></FieldV5>
          </div>
          <CreateWOSectionRenderV5Header register={form.register} />
          {/* Conditional Outside-vendor block (render: #vendorBlock, revealed when Repaired by = Outside vendor) */}
          {outsideVendor ? (
            <div data-testid="wo-outside-vendor-block" className="mt-2 rounded-md border border-[#fed7aa] bg-[#fffdf8] p-2">
              <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-[#b45309]">Outside vendor</div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                <FieldV5 label="Vendor (QuickBooks list)"><input list="wo-vendors" {...form.register("vendor_display_name")} placeholder="Search vendor…" className={FLD} /></FieldV5>
                <FieldV5 label="Vendor invoice #"><input {...form.register("vendor_invoice_number")} className={FLD} /></FieldV5>
                <FieldV5 label="Authorization #"><input {...form.register("authorization_number")} className={FLD} /></FieldV5>
              </div>
              <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                <FieldV5 label="Shop / location (vendor address)"><input {...form.register("shop_address")} placeholder="Vendor address & contact" className={FLD} /></FieldV5>
                <FieldV5 label="Service location (mobile / roadside)"><input {...form.register("roadside_location")} placeholder="Address or I-35 mile marker…" className={FLD} /></FieldV5>
              </div>
            </div>
          ) : null}
          <div className="mt-2 rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] text-emerald-900">
            Class auto-derive: <span className="font-semibold">{classHint}</span>
          </div>
        </SectionCard>

        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
          {/* ===================== B — REPAIR DETAIL (VMRS) ===================== */}
          <SectionCard badge="B" title="Repair detail (VMRS)" right="complaint · cause · correction" testid="wo-vmrs-repair-detail">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <FieldV5 label="System / component">
                {/* Categorized picker (render: #systems datalist), replacing the raw VMRS code box. */}
                <input list="wo-systems" {...form.register("vmrs_system_code")} placeholder="Search component…" className={FLD} />
              </FieldV5>
              <FieldV5 label="Out of service?">
                <SegYesNo value={form.watch("out_of_service")} onChange={(v) => form.setValue("out_of_service", v)} />
              </FieldV5>
            </div>
            <CccRow tone="cmp" label="Complaint" register={form.register("repair_complaint")} placeholder="What was reported…" />
            <CccRow tone="cau" label="Cause" register={form.register("repair_cause")} placeholder="Diagnosed root cause…" />
            <CccRow tone="cor" label="Correction" register={form.register("repair_correction")} placeholder="Work performed…" />
          </SectionCard>

          {/* ===================== C — PARTS & LABOR ===================== */}
          <SectionCard badge="C" title="Parts & Labor" right="from parts catalog" testid="wo-parts-labor">
            <TwoSectionLineEditor mode="wo" initialLines={[]} onChange={setLines} />
            <AssetLocationMap
              parts={serializedParts}
              onAdd={() => setSerializedParts((p) => [...p, { part_type: "tire", part_label: "", serial_number: "", position_code: "" }])}
              onChange={(i, patch) => setSerializedParts((p) => p.map((x, j) => (j === i ? { ...x, ...patch } : x)))}
              onRemove={(i) => setSerializedParts((p) => p.filter((_, j) => j !== i))}
            />
            {requiresLoadForG18 ? (
              <div className="mt-2 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] text-amber-900">
                Required: this expense type must link to a load (G18).
              </div>
            ) : null}
            <div className="mt-2"><TotalsStack subtotal={subtotal} taxRate={taxRate} onTaxRateChange={setTaxRate} grandLabel="WO Total = A + B" /></div>
          </SectionCard>
        </div>

        {/* ===================== D — VENDOR INVOICE & PAYMENT ===================== */}
        <SectionCard badge="D" title="Vendor invoice & payment" right="parts & labor each tie to the invoice" testid="wo-invoice-payment">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              {reconcileRequired ? (
                <CreateWOSectionReconcile
                  woPartsDollars={woPartsDollars}
                  woLaborDollars={woLaborDollars}
                  invoicePartsInput={invoicePartsInput}
                  invoiceLaborInput={invoiceLaborInput}
                  onInvoicePartsChange={setInvoicePartsInput}
                  onInvoiceLaborChange={setInvoiceLaborInput}
                />
              ) : (
                <div className="rounded border border-slate-200 bg-slate-50 px-2 py-2 text-[11px] text-slate-600">
                  No separate vendor invoice to reconcile for this payment type.
                </div>
              )}
            </div>
            <div>
              <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-[#6b7280]">How was it paid?</div>
              {/* Segmented Expense / Bill / In-house (render: #paySeg) */}
              <div data-testid="wo-pay-seg" className="mb-2 flex gap-1.5">
                {([
                  { v: "paid_same_day", h: "Expense", s: "paid now" },
                  { v: "vendor_invoice", h: "Bill", s: "terms / Net 30" },
                  { v: "in_house", h: "In-house", s: "no vendor" },
                ] as const).map((p) => {
                  const on = paymentTiming === p.v;
                  return (
                    <button type="button" key={p.v} onClick={() => form.setValue("payment_timing", p.v)}
                      className={`flex-1 rounded-md border p-1.5 text-center ${on ? "border-[#1d2b45] bg-[#1d2b45] text-white" : "border-[#d6dae1] bg-white text-[#374151]"}`}>
                      <div className="text-[12px] font-extrabold">{p.h}</div>
                      <div className="text-[9.5px] opacity-75">{p.s}</div>
                    </button>
                  );
                })}
              </div>
              {paymentTiming === "paid_same_day" ? (
                <>
                  <CreateWOSectionPaymentTiming register={form.register} watch={form.watch} />
                  <div className="mt-1.5 rounded-md border border-[#cbd5e1] bg-[#f1f5f9] px-2 py-1.5 text-[10.5px] text-[#1f2a44]">Registers as an <b>Expense</b> in QuickBooks (money out now) against the payment account.</div>
                </>
              ) : null}
              {paymentTiming === "vendor_invoice" ? (
                <>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <FieldV5 label="Terms"><input list="wo-terms" {...form.register("bill_terms")} placeholder="Net 30 / Net 15 / Due on receipt" className={FLD} /></FieldV5>
                    <FieldV5 label="Due date (from terms)"><input {...form.register("due_date")} placeholder="auto from terms" className={FLD} /></FieldV5>
                  </div>
                  <div className="mt-1.5 rounded-md border border-[#fed7aa] bg-[#fff7ed] px-2 py-1.5 text-[10.5px] text-[#92400e]">Registers as a <b>Bill</b> (A/P) — payable later, 1099-tracked.</div>
                </>
              ) : null}
              {paymentTiming === "in_house" ? (
                <div className="rounded-md border border-[#d6dae1] bg-[#f1f5f9] px-2 py-1.5 text-[10.5px] text-[#475569]">In-house — no vendor invoice. Parts drawn from inventory; labor costed internally.</div>
              ) : null}
            </div>
          </div>
          <div className="mt-2"><CreateWOSectionValidation checks={checks} /></div>
        </SectionCard>

        {/* ===================== E — DOCUMENTS ===================== */}
        <SectionCard badge="E" title="Documents" right="invoice · photos · DOT form" testid="wo-documents">
          <UploadZone
            operatingCompanyId={operatingCompanyId}
            entityType="work_order"
            entityId={draftAttachmentEntityId}
            defaultCategory="vendor_ro"
            title="Upload documents — vendor invoice, repair photos, DOT inspection form"
          />
        </SectionCard>

        {/* Footer — Cancel / Save draft / Create work order (green) */}
        <div className="flex items-center gap-2 border-t border-[#d6dae1] pt-2.5">
          <div className="text-[11px] text-[#475569]">Completing a PM recalculates next-due → PM Countdown</div>
          <div className="flex-1" />
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="button" variant="secondary" disabled={paymentTiming !== "in_house"} onClick={() => void submit("wo_only")}>Save draft</Button>
          <button
            type="button"
            data-testid="wo-create-btn"
            disabled={
              (requiresLoadForG18 && !Boolean(form.watch("load_id")) && form.watch("load_exemption_reason").trim().length < 20) ||
              !reconcileOk
            }
            onClick={() => void submit("full")}
            className="h-8 rounded-md border border-[#15803d] bg-[#16a34a] px-3.5 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {paymentTiming === "vendor_invoice" ? "Create work order & Bill" : paymentTiming === "paid_same_day" ? "Create work order & Expense" : "Create work order"}
          </button>
        </div>
        <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-900">
          Posts to QBO with class {classHint} on every line
        </div>
      </div>

      {/* render-v5 datalists (searchable filter lists) */}
      <datalist id="wo-prios"><option value="routine">Routine</option><option value="urgent">Urgent</option><option value="immediate">OOS / Immediate</option></datalist>
      <datalist id="wo-statuses"><option value="open">Open</option><option value="in_progress">In progress</option><option value="waiting_parts">Awaiting parts</option><option value="complete">Completed</option></datalist>
      <datalist id="wo-systems">{["Brakes", "Tires & wheels", "Engine", "Aftertreatment / DEF", "Electrical / Battery", "Lighting / Lamps", "Mirrors / Glass", "HVAC / Reefer", "Suspension", "Body / Trailer"].map((s) => <option key={s} value={s} />)}</datalist>
      <datalist id="wo-terms">{["Due on receipt", "Net 15", "Net 30", "Net 45"].map((t) => <option key={t} value={t} />)}</datalist>
      <datalist id="wo-vendors">{["TA Petro Laredo", "Rush Truck Centers", "Love's Road Service"].map((v) => <option key={v} value={v} />)}</datalist>
    </Modal>
  );
}
