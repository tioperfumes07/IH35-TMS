/**
 * C7-WIDE-WIZARD-EXCEPTION — Create Work Order stays a WIDE WIZARD, not the shared 480px drawer.
 *
 * Owner-ratified. The WO creator is the render-v5 two-column form (`<Modal wide>`): WO header +
 * line items + parts/labor + vendor/bill terms side by side. C7 flipped every other create surface
 * to `<Modal variant="drawer">`; this file and BookLoadModalV4 are the two ratified exceptions.
 * scripts/verify-create-surface-is-drawer.mjs enforces this in BOTH directions: it fails if this
 * file is drawer-ised, and it fails if this annotation disappears or the file is renamed without
 * the exception moving with it.
 */
import { entityLabel } from "../../../lib/entity-label";
import { useEffect, type ReactNode } from "react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import {
  addWorkOrderLineItem,
  createWorkOrder,
  deleteWorkOrderLineItem,
  suggestExpenseLoad,
  updateWorkOrder,
  type PaymentTiming,
  type UpdateWorkOrderPayload,
  type WorkOrderType,
} from "../../../api/maintenance";
import { ApiError } from "../../../api/client";
import { userFacingApiError } from "../../../lib/api-error-message";
import { companyToday } from "../../../lib/businessDate";
import { BILL_TERMS_OPTIONS } from "../../../lib/billTermsLabel";
import { Button } from "../../../components/Button";
import { Combobox } from "../../../components/shared/Combobox";
import { EntityPicker } from "../../../components/parity/EntityPicker";
import { ParityTable } from "../../../components/parity/ParityTable";
import { MoneyInput } from "../../../components/forms/MoneyInput";
import { TwoSectionLineEditor, type TwoSectionLine } from "../../../components/forms/TwoSectionLineEditor";
import { TotalsStack } from "../../../components/forms/shared/TotalsStack";
import { TypeTabBar } from "../../../components/forms/shared/TypeTabBar";
import { Modal } from "../../../components/Modal";
import { ListErrorState } from "../../../components/ListErrorState";
import { useToast } from "../../../components/Toast";
import { UploadZone } from "../../../components/UploadZone";
import { TaskLinkPicker } from "../../../components/tasks/TaskLinkPicker";
import { CreateWOSectionIdentification } from "./CreateWOSectionIdentification";
import { CreateWOSectionRenderV5Header } from "./CreateWOSectionRenderV5Header";
import { CreateWOSectionPaymentTiming } from "./CreateWOSectionPaymentTiming";
import { CreateWOSectionValidation } from "./CreateWOSectionValidation";
import { CreateWOSectionReconcile } from "./CreateWOSectionReconcile";
import { EntityLink } from "../../../components/shared/EntityLink";

// ---- render-v5 presentational helpers (match docs/approved-screens/maintenance-create-wo-render-v5.html) ----
const FLD = "h-[30px] w-full rounded-[5px] border border-[#d6dae1] bg-white px-2 text-[12.5px] text-sidebar-bg outline-hidden focus:border-[#1f2a44]";

function SectionCard({ badge, title, right, testid, children }: { badge: string; title: string; right?: string; testid?: string; children: ReactNode }) {
  return (
    <section data-testid={testid} className="rounded-[7px] border border-[#d6dae1] bg-white">
      <div className="flex items-center gap-2 rounded-t-[7px] border-b border-[#e6e9ee] bg-[#fafbfc] px-2.5 py-1.5">
        <span className="grid h-[18px] w-[18px] place-items-center rounded-sm bg-[#1d2b45] text-[10px] font-bold text-white">{badge}</span>
        <span className="text-[10.5px] font-bold uppercase tracking-wide text-sidebar-active">{title}</span>
        {right ? <span className="ml-auto text-[10.5px] text-inactive">{right}</span> : null}
      </div>
      <div className="p-2.5">{children}</div>
    </section>
  );
}

function FieldV5({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[10.5px] font-semibold uppercase tracking-wide text-inactive">{label}</span>
      {children}
    </label>
  );
}

function SegYesNo({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div data-testid="wo-oos-seg" className="inline-flex h-[30px] overflow-hidden rounded-[5px] border border-[#d6dae1]">
      <button type="button" onClick={() => onChange(true)} className={`px-3 text-[11px] font-semibold ${value ? "bg-[#b91c1c] text-white" : "bg-white text-inactive"}`}>Yes</button>
      <button type="button" onClick={() => onChange(false)} className={`px-3 text-[11px] font-semibold ${!value ? "bg-[#1d2b45] text-white" : "bg-white text-inactive"}`}>No</button>
    </div>
  );
}

function CccRow({ tone, label, register, placeholder }: { tone: "cmp" | "cau" | "cor"; label: string; register: import("react-hook-form").UseFormRegisterReturn; placeholder?: string }) {
  const bg = tone === "cmp" ? "bg-[#0891b2]" : tone === "cau" ? "bg-[#b45309]" : "bg-[#15803d]";
  return (
    <div className="mb-2 overflow-hidden rounded-md border border-[#e6e9ee] last:mb-0">
      <div className={`px-2 py-1 text-[9.5px] font-extrabold uppercase tracking-wide text-white ${bg}`}>{label}</div>
      <textarea {...register} placeholder={placeholder} className="h-10 w-full resize-y border-0 px-2 py-1.5 text-[12.5px] outline-hidden" />
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
        <button type="button" data-testid="wo-add-serialized-part" onClick={onAdd} className="rounded-sm bg-[#1f2a44] px-2 py-0.5 text-[10px] font-semibold text-white">+ Create part</button>
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
                      className={`rounded-sm px-2 py-0.5 text-[11px] font-semibold ${c.key === sp.part_type ? "bg-[#1d2b45] text-white" : "bg-[#f8fafc] text-[#475569]"}`}>{c.label}</button>
                  ))}
                  <button type="button" onClick={() => onRemove(i)} className="ml-auto rounded-sm border border-[#d6dae1] px-2 text-[11px] text-[#b91c1c]">Remove</button>
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
                        className={`rounded-sm border px-2 py-0.5 text-[10px] font-bold ${sp.position_code === pos ? "border-[#1f2a44] bg-[#1f2a44] text-white" : "border-[#94a3b8] bg-white text-[#475569]"}`}>{pos}</button>
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
  /** Trailer/reefer — maps to maintenance.work_orders.equipment_id (EntityPicker kind=trailer → mdata.equipment). */
  equipment_id: string;
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
  source_intransit_issue_id: string;
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

// ── Edit mode ─────────────────────────────────────────────────────────────────
// D2-3: real Work Order edit. The modal accepts an existing WO; on save it calls the EXISTING
// updateWorkOrder PATCH (header) + the EXISTING line-item endpoints (cost). No new routes.
export type EditWorkOrderLine = {
  id?: string; // present = persisted line (maintenance.work_order_lines); absent = newly added
  line_type: "parts" | "labor" | "other";
  description: string;
  quantity: number;
  unit_cost: number;
  amount: number;
};

export type EditWorkOrderTarget = {
  id: string;
  display_id?: string | null;
  status?: string | null;
  description?: string | null;
  bucket?: "in_house" | "external" | "roadside" | null;
  external_vendor_wo_number?: string | null;
  external_vendor_invoice_number?: string | null;
  wo_priority?: "routine" | "urgent" | "immediate" | "" | null;
  vmrs_system_code?: string | null;
  vmrs_component_code?: string | null;
  out_of_service?: boolean | null;
  repair_complaint?: string | null;
  repair_cause?: string | null;
  repair_correction?: string | null;
  authorization_number?: string | null;
  service_location_type?: "shop" | "mobile" | "roadside" | "" | null;
  repaired_by?: "in_house" | "outside_vendor" | "" | null;
  line_items?: EditWorkOrderLine[];
};

type Props = {
  open: boolean;
  operatingCompanyId: string;
  initialType?: WorkOrderType;
  initialValues?: Partial<CreateWOFormValues>;
  // When set, the modal renders in EDIT mode (title "Edit Work Order") for this existing WO.
  editWorkOrder?: EditWorkOrderTarget | null;
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

export function CreateWorkOrderModal({ open, operatingCompanyId, initialType = "pm", initialValues, editWorkOrder, onClose, onCreated }: Props) {
  const { pushToast } = useToast();
  const isEdit = Boolean(editWorkOrder);
  const [lines, setLines] = useState<TwoSectionLine[]>([]);
  // Edit-mode state (declared unconditionally so hook order is stable).
  const [editHeader, setEditHeader] = useState<UpdateWorkOrderPayload>({});
  const [editLines, setEditLines] = useState<EditWorkOrderLine[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editBlockMessage, setEditBlockMessage] = useState<string | null>(null);
  const [taxRate, setTaxRate] = useState(8.25);
  // Transaction-side task completion (TASKS-PLANNER-V2). Set after a WO is created so we can offer a
  // "Tasks" completion button that links the new WO (role='result') to an open task.
  const [createdWO, setCreatedWO] = useState<{ uuid: string; display_id?: string } | null>(null);
  // LINK-F5189: when payment_timing === "paid_same_day", the backend auto-creates a real
  // accounting.expenses row (autoCreateExpenseFromWO) and returns its id in response.expense.uuid
  // -- previously used only to pick a toast string, then discarded.
  const [createdExpense, setCreatedExpense] = useState<{ uuid: string } | null>(null);
  // Block 8 gap 1 — vendor-invoice reconcile (the invoice SIDE; the WO side is computed from the lines below).
  // Block 8 — asset-location map: serialized parts placed on the unit during this WO.
  const [serializedParts, setSerializedParts] = useState<
    Array<{ part_type: "tire" | "battery" | "lamp" | "mirror" | "other"; part_label: string; serial_number: string; position_code: string }>
  >([]);
  const [invoicePartsInput, setInvoicePartsInput] = useState("");
  const [invoiceLaborInput, setInvoiceLaborInput] = useState("");
  // LV-WO-RECONCILE-EXCLUDES-SECTION-A / LV-WO-RECONCILE-LINE-TYPE-DOMAIN-LEAK — third bucket for
  // whatever the Parts/Labor enumeration cannot see (Section A category lines, and any sub-row
  // whose line_type isn't 'parts'/'part'/'labor' — 'disposal', 'other', or any future value).
  const [invoiceOtherInput, setInvoiceOtherInput] = useState("");
  const form = useForm<CreateWOFormValues>({
    defaultValues: {
      wo_type: initialType,
      source_type: DEFAULT_SOURCE_BY_TYPE[initialType],
      bucket: "in_house",
      service_date: companyToday(),
      unit_id: "",
      equipment_id: "",
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
      source_intransit_issue_id: "",
      load_exemption_reason: "",
      description: "",
      payment_timing: "vendor_invoice",
      bill_terms: "net_30",
      bill_date: companyToday(),
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
      open_date: companyToday(),
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
    setCreatedWO(null);
    setCreatedExpense(null);
  }, [form, initialType, initialValues, open]);

  // Edit prefill — hydrate the edit header + cost lines from the existing WO each time it opens.
  useEffect(() => {
    if (!open || !editWorkOrder) return;
    setEditBlockMessage(null);
    setSavingEdit(false);
    setEditHeader({
      description: editWorkOrder.description ?? "",
      bucket: editWorkOrder.bucket ?? undefined,
      external_vendor_wo_number: editWorkOrder.external_vendor_wo_number ?? "",
      external_vendor_invoice_number: editWorkOrder.external_vendor_invoice_number ?? "",
      wo_priority: (editWorkOrder.wo_priority || undefined) as UpdateWorkOrderPayload["wo_priority"],
      vmrs_system_code: editWorkOrder.vmrs_system_code ?? "",
      vmrs_component_code: editWorkOrder.vmrs_component_code ?? "",
      out_of_service: Boolean(editWorkOrder.out_of_service),
      repair_complaint: editWorkOrder.repair_complaint ?? "",
      repair_cause: editWorkOrder.repair_cause ?? "",
      repair_correction: editWorkOrder.repair_correction ?? "",
      authorization_number: editWorkOrder.authorization_number ?? "",
      service_location_type: (editWorkOrder.service_location_type || undefined) as UpdateWorkOrderPayload["service_location_type"],
      repaired_by: (editWorkOrder.repaired_by || undefined) as UpdateWorkOrderPayload["repaired_by"],
    });
    setEditLines(
      (editWorkOrder.line_items ?? []).map((li) => ({
        id: li.id,
        line_type: li.line_type,
        description: li.description,
        quantity: Number(li.quantity ?? 0),
        unit_cost: Number(li.unit_cost ?? 0),
        amount: Number(li.amount ?? 0),
      }))
    );
  }, [open, editWorkOrder]);

  // When the modal is closed after a create, propagate onCreated so the parent list refetches.
  const handleModalClose = () => {
    if (createdWO) {
      setCreatedWO(null);
      setCreatedExpense(null);
      onCreated();
    }
    onClose();
  };

  const selectedType = form.watch("wo_type");
  const sourceType = form.watch("source_type");
  const paymentTiming = form.watch("payment_timing");
  const driverId = form.watch("driver_id");
  const unitId = form.watch("unit_id");
  const equipmentId = form.watch("equipment_id");
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
  //
  // LV-WO-RECONCILE-EXCLUDES-SECTION-A / LV-WO-RECONCILE-LINE-TYPE-DOMAIN-LEAK — the original version
  // of this computation filtered sub-rows by an EXACT string match on `line_type === "parts"|"labor"`,
  // which silently dropped: (1) every Section A category line (a live prod case showed a $436.66
  // shortfall this way), (2) the `'part'` singular alias (DB-valid, near-miss of `'parts'`), and (3)
  // `'disposal'`/`'other'` sub-rows — all fully included in the WO total and the A/P bill, none visible
  // to the tie-out, while the panel still printed "Reconciled." The fix: stop enumerating what the WO
  // side of the reconcile COVERS. Compute the WO's own authoritative grand total using the EXACT SAME
  // formula the backend uses to compute the number that actually posts to the A/P bill
  // (`two-section-service.ts` createWorkOrderWithLines: sectionATotal + sectionBTotal, where
  // sectionBTotal per line is max(line.amount, Σ its own sub_rows) — same established alias precedent
  // as severe-repair-estimate.service.ts's `line_type IN ('part','parts')` treatment), then bucket
  // Parts and Labor OUT of that total by their own literal type (collapsing 'part'→'parts', matching
  // the same codebase-established alias), and let EVERYTHING ELSE — Section A, 'disposal', 'other', any
  // future 6th type — fall into a third "Other / Category" residual bucket by subtraction, not
  // enumeration. Nothing can silently vanish from the WO side again: WO grand total − parts − labor −
  // other = 0 by construction, and reconcileOk now requires every bucket to independently tie.
  const sectionBSubRows = lines.filter((l) => l.section === "B").flatMap((l) => l.sub_rows ?? []);
  const woPartsDollars = sectionBSubRows
    .filter((r) => r.line_type === "parts" || (r.line_type as string) === "part")
    .reduce((s, r) => s + Number(r.amount || 0), 0);
  const woLaborDollars = sectionBSubRows.filter((r) => r.line_type === "labor").reduce((s, r) => s + Number(r.amount || 0), 0);
  const woGrandTotalDollars =
    lines
      .filter((l) => l.section === "A")
      .reduce((s, l) => s + Number(l.unit_cost || 0) * Math.max(1, Number(l.quantity || 0)), 0) +
    lines
      .filter((l) => l.section === "B")
      .reduce((s, l) => {
        const subTotal = (l.sub_rows ?? []).reduce((acc, r) => acc + Number(r.amount || 0), 0);
        return s + Math.max(Number(l.amount || 0), subTotal);
      }, 0);
  const woOtherDollars = Math.max(0, woGrandTotalDollars - woPartsDollars - woLaborDollars);
  const reconcileRequired = paymentTiming === "vendor_invoice";
  const reconcileOk =
    !reconcileRequired ||
    (Math.round(woPartsDollars * 100) === Math.round((Number(invoicePartsInput) || 0) * 100) &&
      Math.round(woLaborDollars * 100) === Math.round((Number(invoiceLaborInput) || 0) * 100) &&
      Math.round(woOtherDollars * 100) === Math.round((Number(invoiceOtherInput) || 0) * 100));

  // C1 (live 2026-08-02): hoisted ABOVE the pre-save checks so the cost-line rule can count the lines
  // that are actually submitted. These are the exact arrays sent in the create payload, so the
  // validator and the request can no longer disagree.
  const sectionALines = lines
    .filter((line) => line.section === "A")
    .map((line) => ({
      description: String(line.description ?? "").trim(),
      quantity: Number(line.quantity || 0),
      amount: Number(line.unit_cost || 0),
      expense_category_uuid: line.expense_category_uuid || "",
    }))
    .filter((line) => line.expense_category_uuid);

  const sectionBLines = lines
    .filter((line) => line.section === "B")
    .map((line) => ({
      description: String(line.description ?? "").trim(),
      quantity: Number(line.quantity || 0),
      unit_cost: Number(line.unit_cost || 0),
      amount: Number(line.amount || 0),
      ...(line.service_item_uuid ? { service_item_uuid: line.service_item_uuid } : {}),
      sub_rows: (line.sub_rows ?? []).map((row) => ({
        line_type: row.line_type,
        description: String(row.description ?? "").trim(),
        quantity: Number(row.quantity || 0),
        unit_cost: Number(row.unit_cost || 0),
        amount: Number(row.amount || 0),
        part_uuid: row.part_uuid,
        labor_rate_uuid: row.labor_rate_uuid,
        part_location_codes: row.part_location_codes ?? [],
      })),
    }))
    // A catalog outage must not erase a real, described Section-B cost line from validation or the
    // request. The backend stores service_item_uuid as nullable; retain the line and disclose the
    // missing catalog link instead of falsely claiming there are no costs.
    .filter((line) => line.description || line.sub_rows.length > 0);

  // Backend sectionALineSchema requires description.min(1). A blank "Part # / Task" used to reach
  // POST and 400 with a misleading header-level Zod dump. Gate it here with a named check.
  const sectionAPartTaskOk = sectionALines.every((line) => line.description.length > 0);
  const sectionBDescriptionsOk = sectionBLines.every(
    (line) =>
      line.description.length > 0 &&
      (line.sub_rows ?? []).every((row) => row.description.length > 0),
  );


  const checks = [
    { label: "Unit active and class set", ok: Boolean(form.watch("unit_id")) },
    {
      label: "Driver and unit required for non-PM operational types",
      ok: selectedType === "pm" || (Boolean(form.watch("driver_id")) && Boolean(form.watch("unit_id"))),
    },
    {
      label: "Vendor invoice # or vendor WO # required",
      ok:
        paymentTiming !== "vendor_invoice" ||
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
    {
      // C1 ROOT CAUSE (live 2026-08-02): this watched `line_items`, a form field initialised to [] and
      // populated ONLY in EDIT mode. The Section A/B editor writes to the separate `lines` state
      // (<TwoSectionLineEditor onChange={setLines} />), so in CREATE mode line_items was always empty
      // and this rule was ALWAYS red — even with a priced Section-A line driving a correct WO Total.
      // It blocked the POST from ever firing, which is why the USMCA Repair WO still could not be
      // created after the vendor fix (#4048): that fix was necessary but not sufficient.
      //
      // Same class as ACCT-F93 (the vendor-bill validator read `account_id`, a field the builder never
      // wrote). Count what is SUBMITTED: sectionALines + sectionBLines.
      label: "At least one cost line item",
      ok: sectionALines.length + sectionBLines.length > 0,
    },
    {
      // AUDIT-COVERAGE rows 597/606 + GUARD P1/P2 (2026-08-03): Section A "Part # / Task" is required
      // by backend sectionALineSchema (description.min(1)). Blank description must never reach POST.
      label: "Part # / Task required on every Section A cost line",
      ok: sectionALines.length === 0 || sectionAPartTaskOk,
    },
    {
      label: "Description required on every Section B cost line",
      ok: sectionBLines.length === 0 || sectionBDescriptionsOk,
    },
    ...(reconcileRequired
      ? [{ label: "Vendor invoice reconciles — WO parts & labor tie to invoice", ok: reconcileOk }]
      : []),
  ];
  const preSaveChecksOk = checks.every((check) => check.ok);

  const subtotal = lines.reduce((sum, line) => {
    if (line.section === "A") return sum + Number(line.amount || 0);
    const subRowsTotal = (line.sub_rows ?? []).reduce((rowSum, row) => rowSum + Number(row.amount || 0), 0);
    return sum + Math.max(Number(line.amount || 0), subRowsTotal);
  }, 0);
  const requiresLoadForG18 =
    paymentTiming === "paid_same_day" &&
    sectionALines.some((line) => G18_EXPENSE_REGEX.test(line.description));
  const suggestionQuery = useQuery({
    queryKey: ["maintenance", "suggest-load", operatingCompanyId, driverId, unitId, equipmentId, serviceDate],
    queryFn: () =>
      suggestExpenseLoad({
        operating_company_id: operatingCompanyId,
        driver_id: driverId || undefined,
        unit_id: unitId || undefined,
        // API accepts trailer_id; WO stores trailers as equipment_id (mdata.equipment).
        trailer_id: equipmentId || undefined,
        transaction_date: serviceDate,
      }),
    enabled: Boolean(operatingCompanyId && serviceDate && (driverId || unitId || equipmentId)),
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
    if (!preSaveChecksOk) {
      const firstFail = checks.find((check) => !check.ok);
      pushToast(firstFail?.label ?? "Complete required work-order fields before submit", "error");
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
          equipment_id: values.equipment_id || undefined,
          driver_id: values.driver_id || undefined,
          load_id: values.load_id || undefined,
          source_intransit_issue_id: values.source_intransit_issue_id || undefined,
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
          customer_id: values.customer_id || undefined,
          tax_rate_pct: Number.isFinite(taxRate) ? taxRate : undefined,
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
      // Offer transaction-side task completion before closing. If we can't resolve the new WO id
      // (legacy response shape), fall back to the original close-immediately behaviour.
      const woResult = (response as { wo?: { uuid?: string; display_id?: string } }).wo;
      const expenseResult = (response as { expense?: { uuid?: string } }).expense;
      if (expenseResult?.uuid) setCreatedExpense({ uuid: expenseResult.uuid });
      if (woResult?.uuid) {
        setCreatedWO({ uuid: woResult.uuid, display_id: woResult.display_id ?? undefined });
      } else {
        onCreated();
        onClose();
      }
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
      pushToast(userFacingApiError(error, "Failed to create work order"), "error");
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

  // AUDIT-611: never fall back to unit_id/driver_id UUIDs — Identification writes {UNIT}-{LASTNAME}.
  const classHint = form.watch("class_hint") || "UNIT-UNASSIGNED";

  // ── Edit-mode save: EXISTING updateWorkOrder PATCH (header) + EXISTING line-item endpoints (cost) ──
  const patchEditHeader = (patch: Partial<UpdateWorkOrderPayload>) => setEditHeader((h) => ({ ...h, ...patch }));
  const patchEditLine = (index: number, patch: Partial<EditWorkOrderLine>) =>
    setEditLines((rows) =>
      rows.map((row, i) => {
        if (i !== index) return row;
        const next = { ...row, ...patch };
        // Auto-derive amount from qty × unit cost unless the user is editing amount directly.
        if (("quantity" in patch || "unit_cost" in patch) && !("amount" in patch)) {
          next.amount = Math.round(Number(next.quantity || 0) * Number(next.unit_cost || 0) * 100) / 100;
        }
        return next;
      })
    );
  const addEditLine = () =>
    setEditLines((rows) => [...rows, { line_type: "parts", description: "", quantity: 1, unit_cost: 0, amount: 0 }]);
  const removeEditLine = (index: number) => setEditLines((rows) => rows.filter((_, i) => i !== index));
  const editLinesTotal = editLines.reduce((s, l) => s + Number(l.amount || 0), 0);

  const submitEdit = async () => {
    if (!editWorkOrder) return;
    const woId = editWorkOrder.id;
    setSavingEdit(true);
    setEditBlockMessage(null);
    try {
      // 1) Header PATCH (non-cost, non-financial fields only). editHeader is prefilled from the WO,
      //    so re-sending it is idempotent for untouched fields.
      await updateWorkOrder(woId, operatingCompanyId, editHeader);

      // 2) Cost lines — diff against the persisted lines and route through the line-item endpoints.
      //    add = POST · remove = DELETE · adjust = DELETE old + POST new (no line-PATCH route exists).
      const originalById = new Map((editWorkOrder.line_items ?? []).filter((l) => l.id).map((l) => [l.id as string, l]));
      const currentIds = new Set(editLines.filter((l) => l.id).map((l) => l.id as string));
      const toDelete: string[] = [];
      const toAdd: EditWorkOrderLine[] = [];
      for (const id of originalById.keys()) if (!currentIds.has(id)) toDelete.push(id);
      const changed = (a: EditWorkOrderLine, b: EditWorkOrderLine) =>
        a.line_type !== b.line_type ||
        a.description !== b.description ||
        Number(a.quantity) !== Number(b.quantity) ||
        Number(a.unit_cost) !== Number(b.unit_cost) ||
        Number(a.amount) !== Number(b.amount);
      for (const line of editLines) {
        if (!line.id) {
          toAdd.push(line);
          continue;
        }
        const orig = originalById.get(line.id);
        if (orig && changed(line, orig)) {
          toDelete.push(line.id);
          toAdd.push({ ...line, id: undefined });
        }
      }
      for (const id of toDelete) await deleteWorkOrderLineItem(woId, id, operatingCompanyId);
      for (const line of toAdd)
        await addWorkOrderLineItem(woId, operatingCompanyId, {
          line_type: line.line_type,
          description: line.description.trim() || "—",
          quantity: Number(line.quantity) || 0,
          unit_cost: Number(line.unit_cost) || 0,
          amount: Number(line.amount) || 0,
        });

      pushToast("Work order updated", "success");
      onCreated();
      onClose();
    } catch (error) {
      if (error instanceof ApiError) {
        const payload = error.data as { error?: string; message?: string } | undefined;
        if (payload?.error === "E_WO_POSTED_BILL_LOCK") {
          const msg =
            payload.message ||
            "This work order has a posted bill in Accounts Payable. Void the linked bill first, then edit its cost lines.";
          setEditBlockMessage(msg);
          pushToast(msg, "error");
          setSavingEdit(false);
          return;
        }
      }
      pushToast(userFacingApiError(error, "Failed to update work order"), "error");
    }
    setSavingEdit(false);
  };

  if (isEdit && editWorkOrder) {
    return (
      <Modal open={open} onClose={onClose} title="Edit Work Order" sizePreset="lg" wide>
        <div data-testid="edit-wo-modal" className="space-y-2.5 text-[12.5px] text-sidebar-bg">
          <div className="flex flex-wrap items-center gap-2 rounded-sm bg-[#243352] px-3 py-1.5 text-[10.5px] text-[#cdd6e6]">
            <span>WO #</span>
            <EntityLink
              kind="work_order"
              id={editWorkOrder.id}
              label={entityLabel(editWorkOrder.display_id, editWorkOrder.id, "Work order")}
              className="rounded-sm border border-[#34466a] bg-[#0f1a30] px-2 py-0.5 font-semibold text-white hover:underline"
            />
            <span>·</span>
            <span className="capitalize">{String(editWorkOrder.status ?? "—")}</span>
            <span className="ml-auto text-[#8aa0c4]">All changes timestamped &amp; audited</span>
          </div>

          {editBlockMessage ? (
            <div data-testid="edit-wo-posted-lock" className="rounded-sm border border-red-300 bg-red-50 px-3 py-2 text-[12px] text-red-900">
              {editBlockMessage}
            </div>
          ) : null}

          {/* ── Header (non-cost, safe to edit anytime) ── */}
          <SectionCard badge="A" title="Work order details" right="header — safe to edit anytime" testid="edit-wo-header">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <FieldV5 label="Description">
                <input
                  data-testid="edit-wo-description"
                  value={editHeader.description ?? ""}
                  onChange={(e) => patchEditHeader({ description: e.target.value })}
                  className={FLD}
                />
              </FieldV5>
              <FieldV5 label="Priority">
                <select value={editHeader.wo_priority ?? ""} onChange={(e) => patchEditHeader({ wo_priority: (e.target.value || undefined) as UpdateWorkOrderPayload["wo_priority"] })} className={FLD}>
                  <option value="">—</option>
                  <option value="routine">Routine</option>
                  <option value="urgent">Urgent</option>
                  <option value="immediate">OOS / Immediate</option>
                </select>
              </FieldV5>
              <FieldV5 label="Bucket">
                <select value={editHeader.bucket ?? ""} onChange={(e) => patchEditHeader({ bucket: (e.target.value || undefined) as UpdateWorkOrderPayload["bucket"] })} className={FLD}>
                  <option value="">—</option>
                  <option value="in_house">In-house</option>
                  <option value="external">External</option>
                  <option value="roadside">Roadside</option>
                </select>
              </FieldV5>
              <FieldV5 label="Repaired by">
                <select value={editHeader.repaired_by ?? ""} onChange={(e) => patchEditHeader({ repaired_by: (e.target.value || undefined) as UpdateWorkOrderPayload["repaired_by"] })} className={FLD}>
                  <option value="">—</option>
                  <option value="in_house">In-house</option>
                  <option value="outside_vendor">Outside vendor</option>
                </select>
              </FieldV5>
              <FieldV5 label="Service location">
                <select value={editHeader.service_location_type ?? ""} onChange={(e) => patchEditHeader({ service_location_type: (e.target.value || undefined) as UpdateWorkOrderPayload["service_location_type"] })} className={FLD}>
                  <option value="">—</option>
                  <option value="shop">Shop</option>
                  <option value="mobile">Mobile</option>
                  <option value="roadside">Roadside</option>
                </select>
              </FieldV5>
              <FieldV5 label="Out of service?">
                <SegYesNo value={Boolean(editHeader.out_of_service)} onChange={(v) => patchEditHeader({ out_of_service: v })} />
              </FieldV5>
              <FieldV5 label="Vendor WO #">
                <input value={editHeader.external_vendor_wo_number ?? ""} onChange={(e) => patchEditHeader({ external_vendor_wo_number: e.target.value })} className={FLD} />
              </FieldV5>
              <FieldV5 label="Vendor invoice #">
                <input value={editHeader.external_vendor_invoice_number ?? ""} onChange={(e) => patchEditHeader({ external_vendor_invoice_number: e.target.value })} className={FLD} />
              </FieldV5>
              <FieldV5 label="Authorization #">
                <input value={editHeader.authorization_number ?? ""} onChange={(e) => patchEditHeader({ authorization_number: e.target.value })} className={FLD} />
              </FieldV5>
              <FieldV5 label="System / component (VMRS)">
                <input value={editHeader.vmrs_system_code ?? ""} onChange={(e) => patchEditHeader({ vmrs_system_code: e.target.value })} className={FLD} />
              </FieldV5>
            </div>
          </SectionCard>

          {/* ── Repair detail ── */}
          <SectionCard badge="B" title="Repair detail (VMRS)" right="complaint · cause · correction" testid="edit-wo-ccc">
            <div className="space-y-2">
              <FieldV5 label="Complaint">
                <textarea value={editHeader.repair_complaint ?? ""} onChange={(e) => patchEditHeader({ repair_complaint: e.target.value })} className="h-10 w-full resize-y rounded-[5px] border border-[#d6dae1] px-2 py-1.5 text-[12.5px] outline-hidden" />
              </FieldV5>
              <FieldV5 label="Cause">
                <textarea value={editHeader.repair_cause ?? ""} onChange={(e) => patchEditHeader({ repair_cause: e.target.value })} className="h-10 w-full resize-y rounded-[5px] border border-[#d6dae1] px-2 py-1.5 text-[12.5px] outline-hidden" />
              </FieldV5>
              <FieldV5 label="Correction">
                <textarea value={editHeader.repair_correction ?? ""} onChange={(e) => patchEditHeader({ repair_correction: e.target.value })} className="h-10 w-full resize-y rounded-[5px] border border-[#d6dae1] px-2 py-1.5 text-[12.5px] outline-hidden" />
              </FieldV5>
            </div>
          </SectionCard>

          {/* ── Cost lines (routed through the line-item endpoints; posted-bill guarded server-side) ── */}
          <SectionCard badge="C" title="Cost lines" right="add · adjust · remove — blocked once the bill posts" testid="edit-wo-cost-lines">
            {/* MAINT-F3598: embedded ParityTable owns Search+Range+gear on edit-WO cost lines. */}
            <div data-testid="edit-wo-lines-body">
              <ParityTable<EditWorkOrderLine & { _idx: number }>
                embedded
                rows={editLines.map((line, i) => ({ ...line, _idx: i }))}
                rowKey={(row) => row.id ?? `new-${row._idx}`}
                storageKey="create-wo-modal-edit-cost-lines"
                exportFilename="wo-edit-cost-lines"
                tableTestId="create-wo-edit-cost-lines-table"
                emptyText="No cost lines. Add one to record parts / labor / other cost."
                columns={[
                  {
                    key: "line_type",
                    label: "Type",
                    alwaysVisible: true,
                    render: (row) => (
                      <select
                        value={row.line_type}
                        onChange={(e) =>
                          patchEditLine(row._idx, { line_type: e.target.value as EditWorkOrderLine["line_type"] })
                        }
                        className={FLD}
                      >
                        <option value="parts">Parts</option>
                        <option value="labor">Labor</option>
                        <option value="other">Other</option>
                      </select>
                    ),
                  },
                  {
                    key: "description",
                    label: "Description",
                    alwaysVisible: true,
                    render: (row) => (
                      <input
                        value={row.description}
                        onChange={(e) => patchEditLine(row._idx, { description: e.target.value })}
                        className={FLD}
                      />
                    ),
                  },
                  {
                    key: "quantity",
                    label: "Qty",
                    className: "text-right",
                    alwaysVisible: true,
                    render: (row) => (
                      <input
                        type="number"
                        step="1"
                        min="0"
                        value={row.quantity}
                        onChange={(e) => patchEditLine(row._idx, { quantity: Number(e.target.value) })}
                        className={`${FLD} text-right`}
                      />
                    ),
                  },
                  {
                    key: "unit_cost",
                    label: "Unit cost",
                    className: "text-right",
                    alwaysVisible: true,
                    render: (row) => (
                      <MoneyInput
                        valueDollars={row.unit_cost ?? null}
                        onChangeDollars={(d) => patchEditLine(row._idx, { unit_cost: d ?? 0 })}
                        ariaLabel="Unit cost (USD)"
                        className="w-full"
                      />
                    ),
                  },
                  {
                    key: "amount",
                    label: "Amount",
                    className: "text-right",
                    alwaysVisible: true,
                    render: (row) => (
                      <MoneyInput
                        valueDollars={row.amount ?? null}
                        onChangeDollars={(d) => patchEditLine(row._idx, { amount: d ?? 0 })}
                        ariaLabel="Amount (USD)"
                        className="w-full"
                      />
                    ),
                  },
                  {
                    key: "remove",
                    label: "",
                    alwaysVisible: true,
                    render: (row) => (
                      <button
                        type="button"
                        data-testid={`edit-wo-remove-line-${row._idx}`}
                        onClick={() => removeEditLine(row._idx)}
                        className="rounded-sm border border-[#d6dae1] px-2 py-0.5 text-[11px] text-[#b91c1c]"
                      >
                        Remove
                      </button>
                    ),
                  },
                ]}
              />
            </div>
            <div className="mt-2 flex items-center gap-2">
              <button type="button" data-testid="edit-wo-add-line" onClick={addEditLine} className="rounded-sm bg-[#1f2a44] px-2.5 py-1 text-[11px] font-semibold text-white">+ Create line</button>
              <span className="ml-auto text-[12px] font-semibold text-sidebar-active">Total ${editLinesTotal.toFixed(2)}</span>
            </div>
          </SectionCard>

          {/* Footer */}
          <div className="flex items-center gap-2 border-t border-[#d6dae1] pt-2.5">
            <div className="flex-1" />
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <button
              type="button"
              data-testid="edit-wo-save-btn"
              disabled={savingEdit}
              onClick={() => void submitEdit()}
              className="h-8 rounded-md border border-[#15803d] bg-[#16a34a] px-3.5 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {savingEdit ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  if (createdWO) {
    return (
      <Modal open={open} onClose={handleModalClose} title="Work order created" sizePreset="md">
        <div className="space-y-3 text-[12.5px] text-sidebar-bg">
          <p className="text-sm text-gray-700">
            Work order <EntityLink kind="work_order" id={createdWO.uuid} label={entityLabel(createdWO.display_id, createdWO.uuid, "Work order")} className="font-semibold text-slate-700 hover:underline" /> created.
            {createdExpense ? (
              <>
                {" "}Expense auto-created:{" "}
                <EntityLink kind="expense" id={createdExpense.uuid} label="View expense →" className="font-semibold text-slate-700 hover:underline" />
              </>
            ) : null}
          </p>
          <div className="flex items-center justify-between gap-3 border-t border-gray-200 pt-3">
            <span className="text-xs text-gray-600">Close an open task this work order fulfils:</span>
            <TaskLinkPicker
              operatingCompanyId={operatingCompanyId}
              targetType="work_order"
              targetId={createdWO.uuid}
            />
          </div>
          <div className="flex items-center justify-end pt-1">
            <Button type="button" onClick={handleModalClose}>Done</Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={handleModalClose} title="Create Work Order" sizePreset="lg" wide>
      <div data-testid="create-wo-render-v5" className="min-w-0 space-y-2.5 overflow-x-hidden text-[12.5px] text-sidebar-bg">
        {/* Subbar — WO # · status · opened timestamp (render: .subbar) */}
        <div className="flex flex-wrap items-center gap-2 rounded-sm bg-[#243352] px-3 py-1.5 text-[10.5px] text-[#cdd6e6]">
          <span>WO #</span>
          <span className="rounded-sm border border-[#34466a] bg-[#0f1a30] px-2 py-0.5 font-semibold text-white">new — auto on save</span>
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
          {suggestionQuery.isError ? (
            <ListErrorState
              title="Couldn't suggest a load for this work order"
              status={0}
              message={userFacingApiError(suggestionQuery.error, "Load suggestion failed")}
              onRetry={() => void suggestionQuery.refetch()}
            />
          ) : null}
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
                    load_id: suggestionQuery.data.data.load_id,
                    load_number: suggestionQuery.data.data.load_number,
                    confidence: suggestionQuery.data.data.confidence,
                  }
                : null
            }
            backendLoadError={backendLoadError}
          />
          {/* M-01: the compact Priority/Status/Repaired-by/Authorization # row that used to render here was
              a DUPLICATE of the same 4 fields already rendered by CreateWOSectionRenderV5Header's "Work
              order header" section immediately below — removed the duplicate render, kept the one full
              section (visual-sweep 2026-07-02). */}
          <CreateWOSectionRenderV5Header register={form.register} watch={form.watch} setValue={form.setValue} />
          {/* Conditional Outside-vendor block (render: #vendorBlock, revealed when Repaired by = Outside vendor) */}
          {outsideVendor ? (
            <div data-testid="wo-outside-vendor-block" className="mt-2 rounded-md border border-[#fed7aa] bg-[#fffdf8] p-2">
              <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-[#b45309]">Outside vendor</div>
              <input type="hidden" {...form.register("vendor_id")} />
              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                <FieldV5 label="Vendor (QuickBooks list)">
                  {/* CLS-SILENT-CAP: EntityPicker server-search — no capped vendor roster page. */}
                  <EntityPicker
                    kind="vendor"
                    allowCreate
                    operatingCompanyId={operatingCompanyId}
                    value={form.watch("vendor_id") || null}
                    onChange={(next, option) => {
                      form.setValue("vendor_id", next ?? "", { shouldDirty: true });
                      form.setValue("external_vendor_id", next ?? "", { shouldDirty: true });
                      form.setValue("vendor_display_name", option?.label ?? "", { shouldDirty: true });
                    }}
                    enabled={open}
                    placeholder="Search vendor…"
                    dataField="wo-outside-vendor"
                    className="w-full"
                  />
                </FieldV5>
                <FieldV5 label="Vendor invoice #"><input {...form.register("vendor_invoice_number")} className={FLD} /></FieldV5>
                <FieldV5 label="Authorization #"><input {...form.register("authorization_number")} className={FLD} /></FieldV5>
              </div>
              <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                <FieldV5 label="Shop / location (vendor address)"><input {...form.register("shop_address")} placeholder="Vendor address & contact" className={FLD} /></FieldV5>
                <FieldV5 label="Service location (mobile / roadside)"><input {...form.register("roadside_location")} placeholder="Address or I-35 mile marker…" className={FLD} /></FieldV5>
              </div>
            </div>
          ) : null}
          <div className="mt-2 rounded-sm border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] text-emerald-900">
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
              <div className="mt-2 rounded-sm border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] text-amber-900">
                Required: this expense type must link to a load (G18).
              </div>
            ) : null}
            <div className="mt-2"><TotalsStack subtotal={subtotal} taxRate={taxRate} taxRateMode="editable" onTaxRateChange={setTaxRate} grandLabel="WO Total = A + B" /></div>
          </SectionCard>
        </div>

        {/* ===================== D — VENDOR INVOICE & PAYMENT ===================== */}
        <SectionCard badge="D" title="Vendor invoice & payment" right="every WO dollar ties to the invoice" testid="wo-invoice-payment">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              {reconcileRequired ? (
                <CreateWOSectionReconcile
                  woPartsDollars={woPartsDollars}
                  woLaborDollars={woLaborDollars}
                  woOtherDollars={woOtherDollars}
                  invoicePartsInput={invoicePartsInput}
                  invoiceLaborInput={invoiceLaborInput}
                  invoiceOtherInput={invoiceOtherInput}
                  onInvoicePartsChange={setInvoicePartsInput}
                  onInvoiceLaborChange={setInvoiceLaborInput}
                  onInvoiceOtherChange={setInvoiceOtherInput}
                />
              ) : (
                <div className="rounded-sm border border-slate-200 bg-slate-50 px-2 py-2 text-[11px] text-slate-600">
                  No separate vendor invoice to reconcile for this payment type.
                </div>
              )}
            </div>
            <div>
              <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-inactive">How was it paid?</div>
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
                      className={`flex-1 rounded-md border p-1.5 text-center ${on ? "border-[#1d2b45] bg-[#1d2b45] text-white" : "border-[#d6dae1] bg-white text-sidebar-active"}`}>
                      <div className="text-[12px] font-extrabold">{p.h}</div>
                      <div className="text-[9.5px] opacity-75">{p.s}</div>
                    </button>
                  );
                })}
              </div>
              {paymentTiming === "paid_same_day" ? (
                <>
                  <CreateWOSectionPaymentTiming register={form.register} watch={form.watch} setValue={form.setValue} />
                  <div className="mt-1.5 rounded-md border border-[#cbd5e1] bg-[#f1f5f9] px-2 py-1.5 text-[10.5px] text-[#1f2a44]">Registers as an <b>Expense</b> in QuickBooks (money out now) against the payment account.</div>
                </>
              ) : null}
              {paymentTiming === "vendor_invoice" ? (
                <>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <FieldV5 label="Terms">
                      {/* M-05: show the human label ("Net 30"), never the raw stored code ("net_30"). */}
                      <Combobox
                        options={BILL_TERMS_OPTIONS}
                        value={form.watch("bill_terms") || null}
                        onChange={(value) => form.setValue("bill_terms", value ?? "", { shouldDirty: true })}
                        placeholder="Select terms…"
                      />
                    </FieldV5>
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
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 border-t border-[#d6dae1] pt-2.5" data-testid="wo-responsive-footer">
          <div className="mr-auto min-w-0 text-[11px] text-[#475569]">Completing a PM recalculates next-due → PM Countdown</div>
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="button" variant="secondary" disabled={paymentTiming !== "in_house" || !preSaveChecksOk} onClick={() => void submit("wo_only")}>Save draft</Button>
          <button
            type="button"
            data-testid="wo-create-btn"
            disabled={
              !preSaveChecksOk ||
              (requiresLoadForG18 && !Boolean(form.watch("load_id")) && form.watch("load_exemption_reason").trim().length < 20) ||
              !reconcileOk
            }
            onClick={() => void submit("full")}
            className="h-8 rounded-md border border-[#15803d] bg-[#16a34a] px-3.5 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {paymentTiming === "vendor_invoice" ? "Create work order & Bill" : paymentTiming === "paid_same_day" ? "Create work order & Expense" : "Create work order"}
          </button>
        </div>
      </div>

      {/* render-v5 datalists (searchable filter lists) */}
      <datalist id="wo-systems">{["Brakes", "Tires & wheels", "Engine", "Aftertreatment / DEF", "Electrical / Battery", "Lighting / Lamps", "Mirrors / Glass", "HVAC / Reefer", "Suspension", "Body / Trailer"].map((s) => <option key={s} value={s} />)}</datalist>
    </Modal>
  );
}
