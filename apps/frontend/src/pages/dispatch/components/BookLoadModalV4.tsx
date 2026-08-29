/**
 * C7-WIDE-WIZARD-EXCEPTION — Book Load stays a WIDE WIZARD, not the shared 480px create drawer.
 *
 * Owner-ratified. C7 moved every "+ Create"/"+ Book" surface onto `<Modal variant="drawer">`;
 * this one and Create Work Order are the two ratified exceptions. Booking a load is a multi-step
 * wizard over customer + equipment + stops + rate + pre-dispatch validation — it needs the width,
 * and squeezing it into a 480px column would hide the validation panel behind a scroll.
 * scripts/verify-create-surface-is-drawer.mjs enforces this in BOTH directions: it will fail if
 * this file is quietly drawer-ised, and it will fail if this annotation is removed or the file is
 * renamed without moving the exception with it.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useForm, type FieldErrors, type UseFormSetValue } from "react-hook-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createDispatchLoad } from "../../../api/dispatch";
import { listAllDispatchCatalogRows, loadTypesCatalogClient, lumperProvidersCatalogClient, pickupTimeTypesCatalogClient } from "../../../api/catalogs-dispatch";
import { ApiError } from "../../../api/client";
import { userFacingApiError } from "../../../lib/api-error-message";
import { properPersonOrPlaceName } from "../../../lib/properDisplayText";
import { entityLabel } from "../../../lib/entity-label";
import { EntityLink } from "../../../components/shared/EntityLink";
import { getLoad, updateDispatchLoadFull, type LoadDetail } from "../../../api/loads";
import { buildEditPrefill, buildEditPatchBody } from "./book-load-v4/editLoadMapping";
import { bookLoadToastMessage, bookLoadToastTone, serverStatusOf } from "./book-load-toast";
import { listCustomers } from "../../../api/mdata";
import { useAuth } from "../../../auth/useAuth";
import { Button } from "../../../components/Button";
import { ConfirmDiscardDialog } from "../../../components/dialogs/ConfirmDiscardDialog";
import { ModalCloseButton } from "../../../components/ModalCloseButton";
import { useEscapeKey } from "../../../hooks/useEscapeKey";
import { useToast } from "../../../components/Toast";
import { EntityPicker } from "../../../components/parity/EntityPicker";
import type { EntityPickerOption } from "../../../components/parity/entityPickerRegistry";
import { ReferenceSelect } from "../../../components/parity/ReferenceSelect";
import type { BookLoadFormValues } from "./BookLoadCustomerSection";
import { BookLoadEquipmentSection } from "./BookLoadEquipmentSection";
import { PreDispatchValidationPanel } from "../../../components/dispatch/PreDispatchValidationPanel";
import { AuthGatePanel } from "../../../components/dispatch/AuthGatePanel";
import { LoadCreateModal } from "../LoadCreateModal";
import { BookLoadStopsSection } from "./BookLoadStopsSection";
import { MultiStopExtraRateEditor } from "../../../components/dispatch/MultiStopExtraRateEditor";
import { BookLoadValidationSection } from "./BookLoadValidationSection";
import type { LiveReservation } from "./book-load-v4/LiveLoadIdBar";
import { LiveLoadIdBar } from "./book-load-v4/LiveLoadIdBar";
import { MilesStrip } from "./book-load-v4/MilesStrip";
import { OcrDropZone } from "./book-load-v4/OcrDropZone";
import { RateConUploadPanel } from "./book-load-v4/RateConUploadPanel";
import { useFeatureFlag } from "../../../hooks/useFeatureFlag";

// Load Wizard V5 (Block H): compact, denser layout behind an OFF-by-default flag. The
// old layout stays the default until LOAD_WIZARD_V5 is enabled. V5 changes are visual
// density only — the submit payload is byte-identical.
export const LOAD_WIZARD_V5_FLAG = "LOAD_WIZARD_V5";
import { LoadTemplatePicker, applyLoadTemplateToBookForm, type MinimalBookForm } from "../LoadTemplateLibrary";
// RATECON-2: rate-con intake is now the single OcrDropZone block in §E (Documents). RateConUploadPanel
// (button variant) still shares the useRateConExtraction hook and is retained for reuse, but is no longer
// rendered here — one intake surface, no duplicate affordance.
import { AccessorialEditor } from "../../../components/dispatch/AccessorialEditor";
import { sumStopExtraRatesCents, stopExtraRateChargeLines } from "../../../components/dispatch/book-load-extra-rates";
import {
  buildBookLoadChargeLines,
  computeBookLoadSectionTotalCents,
  computeDetentionAccrualCents,
  rowFromLegacyAccessorialCents,
  sumAccessorialCents,
  type AccessorialRow,
} from "../../../components/dispatch/accessorial-editor-lib";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";
import { MoneyInput } from "../../../components/forms/MoneyInput";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";

/**
 * FAIL-D2 — human labels for the fields a blocked submit names back to the dispatcher. Only the
 * fields that can realistically fail validation need an entry; anything unmapped falls back to the
 * de-underscored key, which is still an honest answer and never a silent one.
 */
const FIELD_LABELS: Record<string, string> = {
  customer_id: "Customer",
  trip_type: "Trip Type",
  rate_total_cents: "Rate",
  stops: "Stops",
  team_id: "Team",
  assigned_unit_id: "Truck",
  assigned_trailer_unit_id: "Trailer",
  assigned_primary_driver_id: "Driver",
  commodity: "Commodity",
  weight_lbs: "Weight",
  trailer_type: "Trailer type",
  reefer_setpoint: "Reefer setpoint",
  detention_reason_id: "Detention reason",
};

type FormValues = BookLoadFormValues & {
  load_type: "broker" | "direct";
  catalog_load_type_id: string;
  pieces: string;
  trip_type: "" | "NB" | "TR" | "SB";
  tour_id: string;
  trailer_type: string;
  load_trailer_equipment_id: string;
  assigned_unit_id: string;
  assigned_trailer_unit_id: string;
  assignment_mode: "solo" | "team";
  team_id: string;
  assigned_primary_driver_id: string;
  assigned_secondary_driver_id: string;
  temp_fahrenheit: number;
  driver_pay_rate_per_mile: number;
  reefer_setpoint: string;
  requires_reefer_fuel: boolean;
  requires_pulp_probe: boolean;
  requires_locking_jacks: boolean;
  requires_load_locks: boolean;
  requires_straps: boolean;
  customer_po_number: string;
  hazmat: boolean;
  driver_instructions_text: string;
  addToOpenPresettlement: boolean;
  reservation_uuid: string;
  reserved_load_number: string;
  live_load_number: string;
  booking_mode: "single_popup" | "legacy_form";
  requires_tarps: boolean;
  tarp_type: string;
  // render-v6 §B reefer/tarp detail (migration 202606231400).
  reefer_temp_f: number | "";
  temperature_type: "" | "frozen" | "fresh";
  reefer_mode: string;
  pre_cool: "yes" | "no";
  tarp_qty: number | "";
  tarp_size: string;
  lumper_amount_cents: number;
  customer_chargeback_requested: boolean;
  customer_chargeback_reason: string;
  anticipated_chargeback_cents: number;
  anticipated_chargeback_reason: string;
  detention_expected_y_n: boolean;
  detention_reason_id: string;
  detention_expected_hours: number;
  detention_bill_customer_per_hour_cents: number;
  detention_driver_pay_per_hour_cents: number;
  late_delivery_risk_y_n: boolean;
  late_delivery_est_deduction_cents: number;
  late_delivery_reason: string;
  ocr_source_pdf_r2_key: string;
  miles_practical: number;
  miles_shortest: number;
  miles_deadhead: number;
  pickup_number: string;
  border_routing: string;
  is_sample_data: boolean;
  cash_advance_cents: number;
  fuel_advance_cents: number;
  factoring_company_vendor_id: string;
  accessorial_rows: AccessorialRow[];
  stops: Array<{
    stop_type: "pickup" | "delivery";
    sequence_number: number;
    city: string;
    state: string;
    country: string;
    address_line1: string;
    // LV-STOP-ZIP-DROPPED: the Zip Code input is registered as stops.N.postal_code
    // (BookLoadStopsSection.tsx) but this form type never declared it, so the field existed on screen and in
    // RHF state while being invisible to every typed consumer — which is how the submit mapping came to omit
    // it without TypeScript ever complaining. Declaring it is what makes the drop a compile error.
    postal_code?: string;
    latitude?: string;
    longitude?: string;
    scheduled_arrival_at: string;
    time_window_type?: "appointment" | "open_window" | "select_hours" | "refused";
    pickup_time_type_id?: string;
    appointment_start_at?: string;
    appointment_end_at?: string;
    lumper_required?: boolean;
    lumper_provider_id?: string;
    lumper_paid_by?: "carrier" | "shipper" | "broker" | "receiver" | "unknown";
    lumper_amount_cents?: number;
    is_tarp_stop?: boolean;
    tarp_count?: number;
    stop_notes?: string;
    site_contact_name?: string;
    site_contact_phone?: string;
    gate_dock_text?: string;
    extra_rates?: Array<{ rate_type?: string; amount_cents?: number; description?: string }>;
  }>;
};

type Props = {
  open: boolean;
  operatingCompanyId: string;
  onClose: () => void;
  /** Optional created load identity so nested EntityPicker callers can auto-select (picker law R=W). */
  onCreated: (created?: { id: string; label?: string }) => void;
  /** B21-D7 OCR queue convert — applies template JSON at modal open (integration seam only). */
  templatePrefillJson?: Record<string, unknown> | null;
  /** Block 7 — when set, the wizard opens in EDIT mode: prefilled from this load, Save → guarded PATCH. */
  editLoadId?: string | null;
  /** Dispatch "+ Book load" per-truck action — prefill the assigned unit when opening a fresh booking. */
  prefillUnitId?: string | null;
  /** If the entry point already knows the driver for that unit, prefill it too. */
  prefillDriverId?: string | null;
};

function driverBillMintSkippedMessage(
  action: "booked" | "updated",
  missingInputs: string[] | undefined
): string {
  const missing = Array.isArray(missingInputs) ? missingInputs.filter(Boolean) : [];
  const missingLabel = missing.length > 0 ? missing.join(", ") : "a configured driver pay rate";
  return `Load ${action}, but driver pay was NOT minted — missing ${missingLabel}. Review driver pay rate / mile and the load's pay-basis miles before delivery so the driver bill can be created.`;
}

function numOrUndef(v: unknown): number | undefined {
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return undefined;
  return n;
}

/** Build one editable accessorial ROW per extracted rate-con accessorial (never collapsed into one line).
 *  Falls back to the legacy single summed row only when the extraction carried no per-line accessorials. */
function rateConAccessorialRows(json: Record<string, unknown>): AccessorialRow[] {
  const lines = Array.isArray(json.accessorial_lines)
    ? (json.accessorial_lines as Array<{ code?: string; description?: string; amount_cents?: number }>)
    : [];
  const valid = lines.filter((l) => Number(l.amount_cents) > 0);
  if (valid.length > 0) {
    return valid.map((l) => ({
      id: `acc-${crypto.randomUUID()}`,
      additional_charge_id: "",
      code: String(l.code || "ACCESSORIAL"),
      description: String(l.description || "Accessorial"),
      amount_cents: Number(l.amount_cents),
      taxable: false,
    }));
  }
  const legacy = Number(json.accessorial_cents);
  return legacy > 0 ? rowFromLegacyAccessorialCents(legacy) : [];
}

const BOOK_LOAD_CORRECT_DESIGN_CSS = `
.blw-sec{background:#fff;border:1px solid #e3e6eb;border-radius:7px;overflow:hidden}
.blw-sec-hd{display:flex;align-items:center;gap:9px;padding:7px 11px;background:#eef1f4;border-bottom:1px solid #e3e6eb}
.blw-sec-chip{width:18px;height:18px;border-radius:4px;background:#1f2a44;color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center}
.blw-sec-name{font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#5b6472}
.blw-sec-meta{margin-left:auto;font-size:10px;font-weight:600;color:#5b6472}
.blw-sec-meta b{color:#1f2733}
.blw-collapse{border:1px solid #e3e6eb;border-radius:5px;overflow:hidden}
.blw-collapse-bar{display:flex;align-items:center;gap:8px;padding:8px 11px;cursor:pointer;background:#f7f8fa}
.blw-collapse-bar:hover{background:#f0f2f5}
.blw-collapse-plus{width:16px;height:16px;border-radius:3px;background:#1f2a44;color:#fff;font-size:12px;font-weight:600;display:flex;align-items:center;justify-content:center;flex:none}
.blw-note{font-size:9.5px;color:#8a93a1}
/* Load Wizard V5 — compact density (visual only; gated by LOAD_WIZARD_V5). */
[data-wizard-v5="on"] .blw-sec-hd{padding:4px 9px}
[data-wizard-v5="on"] .blw-collapse-bar{padding:5px 9px}
[data-wizard-v5="on"] input:not([type="checkbox"]):not([type="radio"]),
[data-wizard-v5="on"] select{height:24px;font-size:11px}
[data-wizard-v5="on"] .p-3{padding:7px}
[data-wizard-v5="on"] .gap-3{gap:7px}
[data-wizard-v5="on"] .gap-2{gap:5px}
[data-wizard-v5="on"] .space-y-3>*+*{margin-top:7px}
[data-wizard-v5="on"] .space-y-2>*+*{margin-top:4px}
`;

export function BookLoadModalV4({
  open,
  operatingCompanyId,
  onClose,
  onCreated,
  templatePrefillJson,
  editLoadId,
  prefillUnitId,
  prefillDriverId,
}: Props) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const isEditMode = Boolean(editLoadId);
  const { pushToast } = useToast();
  const panelRef = useRef<HTMLDivElement>(null);
  const { enabled: wizardV5 } = useFeatureFlag(LOAD_WIZARD_V5_FLAG, operatingCompanyId);

  const [gateBanner, setGateBanner] = useState<{
    type: "advisory" | "hard_block" | "hos_block";
    message: string;
    warnings?: Array<Record<string, unknown>>;
  } | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideToken, setOverrideToken] = useState<string | null>(null);
  const [pendingCloseAfterAdvisory, setPendingCloseAfterAdvisory] = useState(false);
  // LV-DISPATCH-TOAST-LIES (class instance 2). The maintenance-advisory branch returns EARLY from the
  // submit handler, so the created load's server status would be lost by the time the operator presses
  // Continue — and that Continue handler then fired its own green "success" toast that had never seen the
  // response. Same shape as the defect this file already fixed one branch above: an outcome asserted from
  // local state. Carrying the status forward is what lets the advisory path tell the truth too.
  const [advisoryServerStatus, setAdvisoryServerStatus] = useState<string | null>(null);
  const [advisoryCreatedLoad, setAdvisoryCreatedLoad] = useState<{ id: string; label?: string } | null>(null);
  const [submitErrorMessage, setSubmitErrorMessage] = useState<string | null>(null);
  const [creditLimitBlock, setCreditLimitBlock] = useState<{ exposure_cents: number; limit_cents: number; credit_limit_source: string | null; can_override: boolean } | null>(null);
  const [overrideCreditLimit, setOverrideCreditLimit] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [headerTime] = useState(() => new Date().toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }));
  const [showSpecialNotes, setShowSpecialNotes] = useState(false);

  const form = useForm<FormValues>({
    defaultValues: {
      customer_id: "",
      customer_qbo_id: "",
      customer_name: "",
      customer_wo_number: "",
      commodity: "",
      weight_lbs: 0,
      load_type: "broker",
      catalog_load_type_id: "",
      pieces: "",
      trip_type: "",
      tour_id: "",
      notes: "",
      linehaul_cents: 0,
      fuel_surcharge_cents: 0,
      accessorial_cents: 0,
      trailer_type: "dry_van",
      load_trailer_equipment_id: "",
      assigned_unit_id: prefillUnitId ?? "",
      assigned_trailer_unit_id: "",
      assignment_mode: "solo",
      team_id: "",
      assigned_primary_driver_id: prefillDriverId ?? "",
      assigned_secondary_driver_id: "",
      temp_fahrenheit: 0,
      driver_pay_rate_per_mile: 0,
      reefer_setpoint: "",
      requires_reefer_fuel: false,
      requires_pulp_probe: false,
      requires_locking_jacks: false,
      requires_load_locks: false,
      requires_straps: false,
      customer_po_number: "",
      hazmat: false,
      driver_instructions_text: "",
      addToOpenPresettlement: false,
      reservation_uuid: "",
      reserved_load_number: "",
      live_load_number: "",
      booking_mode: "single_popup",
      requires_tarps: false,
      tarp_type: "",
      reefer_temp_f: "",
      temperature_type: "",
      reefer_mode: "",
      pre_cool: "no",
      tarp_qty: "",
      tarp_size: "",
      lumper_amount_cents: 0,
      customer_chargeback_requested: false,
      customer_chargeback_reason: "",
      anticipated_chargeback_cents: 0,
      anticipated_chargeback_reason: "",
      detention_expected_y_n: false,
      detention_reason_id: "",
      detention_expected_hours: 0,
      detention_bill_customer_per_hour_cents: 0,
      detention_driver_pay_per_hour_cents: 0,
      late_delivery_risk_y_n: false,
      late_delivery_est_deduction_cents: 0,
      late_delivery_reason: "",
      ocr_source_pdf_r2_key: "",
      miles_practical: 0,
      miles_shortest: 0,
      miles_deadhead: 0,
      pickup_number: "",
      border_routing: "",
      is_sample_data: false,
      cash_advance_cents: 0,
      fuel_advance_cents: 0,
      factoring_company_vendor_id: "",
      accessorial_rows: [],
      stops: [
        { stop_type: "pickup", sequence_number: 1, city: "", state: "", country: "USA", address_line1: "", postal_code: "", latitude: "", longitude: "", scheduled_arrival_at: "", time_window_type: "appointment" },
        { stop_type: "delivery", sequence_number: 2, city: "", state: "", country: "USA", address_line1: "", postal_code: "", latitude: "", longitude: "", scheduled_arrival_at: "", time_window_type: "appointment" },
      ],
    },
  });
  const assignedUnitId = form.watch("assigned_unit_id");
  // GAP-14 live pre-dispatch validation inputs (driver/unit/trailer/customer) + live result summary.
  const assignedPrimaryDriverId = form.watch("assigned_primary_driver_id");
  const assignedTrailerUnitId = form.watch("assigned_trailer_unit_id");
  const watchedCustomerId = form.watch("customer_id");
  const watchedCustomerName = form.watch("customer_name");
  const watchedTripType = form.watch("trip_type");
  const [preDispatch, setPreDispatch] = useState<{ canDispatch: boolean; hasBlockers: boolean; hasWarnings: boolean }>({
    canDispatch: true,
    hasBlockers: false,
    hasWarnings: false,
  });
  // GAP-47 — dispatch authorization gates (distinct from GAP-14's physical-readiness checks above):
  // server-side already enforces these on POST .../book (auth-gates preHandler, 422 dispatch_auth_gate_blocked
  // if it fails), so this is a pre-submit PREVIEW, same "read-only preview, submit-time gate is the real
  // enforcement" pattern as PreDispatchValidationPanel.
  const [authGateBlocked, setAuthGateBlocked] = useState(false);
  // AUTHGATE-PANEL-MISSING-ENTITY-LABELS (2026-08-21): lifted up from BookLoadEquipmentSection —
  // the only place a picked unit/trailer/driver's real display name is known — so <AuthGatePanel>
  // below can render real names instead of falling back to "Unit — not visible" (id-only).
  const [equipmentOptions, setEquipmentOptions] = useState<{
    unit: EntityPickerOption | null;
    trailer: EntityPickerOption | null;
    primaryDriver: EntityPickerOption | null;
  }>({ unit: null, trailer: null, primaryDriver: null });
  // GAP-47 — active-repair-work-order block on the selected driver, with a dispatcher override checkbox.
  const [overrideRepairBlock, setOverrideRepairBlock] = useState(false);
  const [repairBlockSubmitBlocked, setRepairBlockSubmitBlocked] = useState(false);
  const watchedStops = form.watch("stops");
  const deadheadAfterAt = useMemo(() => {
    const stops = (watchedStops ?? []) as Array<{
      stop_type?: string;
      scheduled_arrival_at?: string;
      scheduled_departure_at?: string;
      city?: string;
      state?: string;
    }>;
    const deliveries = stops.filter((s) => String(s?.stop_type ?? "").toLowerCase().includes("deliver"));
    const last = deliveries[deliveries.length - 1] ?? stops[stops.length - 1];
    const raw = last?.scheduled_departure_at || last?.scheduled_arrival_at;
    if (raw) {
      const d = new Date(raw);
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    }
    return new Date().toISOString();
  }, [watchedStops]);
  const deadheadDropPreview = useMemo(() => {
    const stops = (watchedStops ?? []) as Array<{ stop_type?: string; city?: string; state?: string }>;
    const deliveries = stops.filter((s) => String(s?.stop_type ?? "").toLowerCase().includes("deliver"));
    const last = deliveries[deliveries.length - 1] ?? stops[stops.length - 1];
    return { city: last?.city, state: last?.state };
  }, [watchedStops]);


  const { isDirty } = form.formState;

  // DSP-F7251: opening the modal must establish a clean form before any caller-provided
  // template/OCR prefill is applied. This reset effect used to live below the prefill effect;
  // React runs effects in declaration order, so every OCR conversion visibly opened Book Load
  // and then silently erased the extracted customer, rate, stops, and dates.
  useEffect(() => {
    if (!open) {
      setShowDiscardConfirm(false);
      return;
    }
    form.reset();
    setGateBanner(null);
    setSubmitErrorMessage(null);
    setOverrideReason("");
    setOverrideToken(null);
    setPendingCloseAfterAdvisory(false);
    setShowSpecialNotes(false);
  }, [open, form]);

  useEffect(() => {
    if (!open || !templatePrefillJson) return;
    applyLoadTemplateToBookForm(form.setValue as unknown as UseFormSetValue<MinimalBookForm>, templatePrefillJson);
    const ocrKey = templatePrefillJson.ocr_source_pdf_r2_key;
    if (typeof ocrKey === "string" && ocrKey) {
      form.setValue("ocr_source_pdf_r2_key", ocrKey, { shouldDirty: true });
    }
  }, [open, templatePrefillJson, form]);

  // Dispatch per-truck "+ Book load" — prefill the assigned unit when opening a fresh (non-edit) booking.
  useEffect(() => {
    if (!open || editLoadId || !prefillUnitId) return;
    form.setValue("assigned_unit_id", prefillUnitId, { shouldDirty: true });
  }, [open, editLoadId, prefillUnitId, form]);

  useEffect(() => {
    if (!open || editLoadId || !prefillDriverId) return;
    form.setValue("assigned_primary_driver_id", prefillDriverId, { shouldDirty: true });
  }, [open, editLoadId, prefillDriverId, form]);

  // Block 7 — EDIT mode: load the existing load and prefill the wizard. form.reset(...keepDefaults)
  // marks nothing dirty, so the Save body (dirtyFields-gated) only contains what the user then changes.
  const editLoadQuery = useQuery({
    queryKey: ["book-load-edit", operatingCompanyId, editLoadId],
    queryFn: () => getLoad(editLoadId as string, operatingCompanyId),
    enabled: Boolean(open && editLoadId && operatingCompanyId),
    staleTime: 0,
  });
  const editLoad: LoadDetail | undefined = editLoadQuery.data;
  useEffect(() => {
    if (!open || !isEditMode || !editLoad) return;
    // reset WITHOUT keepDefaultValues so the prefilled values become the clean baseline — nothing is
    // dirty until the user edits, which is what the dirtyFields-gated Save body relies on.
    form.reset({ ...form.getValues(), ...(buildEditPrefill(editLoad) as Partial<FormValues>) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isEditMode, editLoad]);

  const finalizeBookLoadClose = useCallback(() => {
    setShowDiscardConfirm(false);
    onClose();
  }, [onClose]);

  const attemptBookLoadClose = useCallback(() => {
    const needsConfirm = isDirty || overrideReason.trim().length > 0;
    if (needsConfirm) {
      setShowDiscardConfirm(true);
      return;
    }
    finalizeBookLoadClose();
  }, [finalizeBookLoadClose, isDirty, overrideReason]);

  useEscapeKey(attemptBookLoadClose, open);

  const onReservationUpdate = useCallback(
    (r: LiveReservation | null) => {
      if (!r) {
        form.setValue("reservation_uuid", "", { shouldDirty: false });
        form.setValue("reserved_load_number", "", { shouldDirty: false });
        return;
      }
      form.setValue("reservation_uuid", r.reservation_uuid, { shouldDirty: false });
      form.setValue("reserved_load_number", r.load_number, { shouldDirty: false });
    },
    [form]
  );

  const linehaul = form.watch("linehaul_cents");
  const fuel = form.watch("fuel_surcharge_cents");
  const accessorialRows = form.watch("accessorial_rows");
  const stops = form.watch("stops");
  const loadType = form.watch("load_type");
  const driverPayRatePerMile = form.watch("driver_pay_rate_per_mile");
  const milesShortest = form.watch("miles_shortest");
  const milesPractical = form.watch("miles_practical");
  const milesDeadhead = form.watch("miles_deadhead");
  const reservedLoadNumber = form.watch("reserved_load_number");
  const factoringCompanyVendorId = form.watch("factoring_company_vendor_id");

  const customersQuery = useQuery({
    queryKey: ["book-load-v4-customers", operatingCompanyId, customerSearch],
    queryFn: () =>
      listCustomers({
        operating_company_id: operatingCompanyId,
        limit: customerSearch ? 200 : 500,
        search: customerSearch || undefined,
      }),
    enabled: Boolean(operatingCompanyId),
    staleTime: 15_000,
  });
  const customerOptions = useMemo(
    () =>
      (customersQuery.data?.customers ?? [])
        .map((c) => ({
          value: c.id,
          label: String(c.name || c.customer_code || "").trim() || c.id,
        }))
        .filter((o) => o.label)
        .sort((a, b) => a.label.localeCompare(b.label)),
    [customersQuery.data?.customers]
  );
  const pickupTimeTypesQuery = useQuery({
    queryKey: ["book-load-pickup-time-types", operatingCompanyId],
    queryFn: () => listAllDispatchCatalogRows(pickupTimeTypesCatalogClient, { operating_company_id: operatingCompanyId, is_active: "true" }),
    enabled: Boolean(operatingCompanyId),
  });
  const pickupTimeTypeOptions = useMemo(
    () => (pickupTimeTypesQuery.data?.rows ?? []).map((row) => ({ value: row.id, label: row.display_name, type: row.code })),
    [pickupTimeTypesQuery.data?.rows]
  );
  const lumperProvidersQuery = useQuery({
    queryKey: ["book-load-lumper-providers", operatingCompanyId],
    queryFn: () => listAllDispatchCatalogRows(lumperProvidersCatalogClient, { operating_company_id: operatingCompanyId, is_active: "true" }),
    enabled: Boolean(operatingCompanyId),
  });
  const lumperProviderOptions = useMemo(
    () => (lumperProvidersQuery.data?.rows ?? []).map((row) => ({ value: row.id, label: row.display_name, type: row.code })),
    [lumperProvidersQuery.data?.rows]
  );
  const loadTypesQuery = useQuery({
    queryKey: ["book-load-catalog-load-types", operatingCompanyId],
    queryFn: () => listAllDispatchCatalogRows(loadTypesCatalogClient, { operating_company_id: operatingCompanyId, is_active: "true" }),
    enabled: Boolean(operatingCompanyId),
  });
  const loadTypeOptions = useMemo(
    () => (loadTypesQuery.data?.rows ?? []).map((row) => ({ value: row.id, label: row.display_name, type: row.code })),
    [loadTypesQuery.data?.rows]
  );

  const sectionTotal = useMemo(
    () => computeBookLoadSectionTotalCents(linehaul || 0, fuel || 0, accessorialRows ?? []),
    [accessorialRows, fuel, linehaul]
  );
  // W7 — per-stop extra rates (stops[].extra_rates) must bill the customer: roll into the accessorial
  // subtotal, customer-invoice total, driver-bill preview, and the payload (pure math, unit-tested).
  const extraRatesCents = useMemo(() => sumStopExtraRatesCents(stops ?? []), [stops]);
  const customerInvoiceTotal = sectionTotal + extraRatesCents;

  useEffect(() => {
    const sum = sumAccessorialCents(accessorialRows ?? []);
    if (form.getValues("accessorial_cents") !== sum) {
      form.setValue("accessorial_cents", sum, { shouldDirty: false });
    }
  }, [accessorialRows, form]);
  // WIRE-02 / ACCT-F63 — the driver bill preview must NEVER fall back to the customer charges.
  // This memo used to `return sectionTotal + extraRatesCents`, which is the IDENTICAL expression
  // assigned to `customerInvoiceTotal` eight lines above: whenever miles or the per-mile rate were
  // missing, the operator was shown the CUSTOMER invoice total labelled as the driver bill. That is
  // the same defect ACCT-F63/WIRE-02 removed from book-load.service.ts, surviving in the FE.
  //
  // It also promised a figure the backend will never mint. With no miles,
  // `resolveDriverBasePayCents` returns null and the booking writes
  // `driver_finance.driver_bill.skipped_no_pay_rate` instead of a bill.
  //
  // Measured on prod (br-fancy-credit-akjnd07a, 2026-08-09): USMCA has 25 live loads, 24 with no
  // shortest miles and 22 with no miles at all, against 22 that DO carry a customer rate — 18 skip
  // events, 2 driver bills. So the fallback was not an edge case; it was what the operator saw on
  // essentially every load, and the number it showed was always the wrong side of the ledger.
  //
  // Not priceable is now shown AS not priceable. Dispatch is never blocked from booking.
  const driverBillPreview = useMemo<number | null>(() => {
    const miles = Number(milesShortest || 0);
    const rate = Number(driverPayRatePerMile || 0);
    if (miles > 0 && rate > 0) return Math.round(miles * rate * 100);
    return null;
  }, [driverPayRatePerMile, milesShortest]);
  const driverBillMissing = useMemo(() => {
    const missing: string[] = [];
    if (!(Number(milesShortest || 0) > 0)) missing.push("shortest miles");
    if (!(Number(driverPayRatePerMile || 0) > 0)) missing.push("driver pay rate / mile");
    return missing;
  }, [milesShortest, driverPayRatePerMile]);
  const ratePerMile = useMemo(() => {
    const miles = Number(milesShortest || 0);
    if (miles <= 0) return 0;
    return (linehaul || 0) / miles / 100;
  }, [linehaul, milesShortest]);

  const money = useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    []
  );

  const validationChecks = useMemo(
    () => [
      { text: "Unit repair / availability gate", code: "readiness", state: "live" as const },
      { text: "DVIR major-defect authorization gate", code: "authorization required", state: "live" as const },
      { text: "Trailer inspection check", code: "not automated", state: "pending" as const },
      { text: "Customer quality flag warning", code: "not automated", state: "pending" as const },
      { text: "FMCSA broker authority cache check", code: "not automated", state: "pending" as const },
      { text: "Driver instructions → mobile + dispatch PDF", code: "on save", state: "on_save" as const },
      { text: "Expected adjustments → invoice review", code: "on save", state: "on_save" as const },
    ],
    []
  );
  const billNumberPreview = useMemo(() => {
    if (!reservedLoadNumber) return "B-—";
    return reservedLoadNumber.startsWith("L-") ? reservedLoadNumber.replace(/^L-/, "B-") : `B-${reservedLoadNumber}`;
  }, [reservedLoadNumber]);

  const canOverrideHardBlock = auth.user?.role === "Owner";
  const canOverrideHos = ["Owner", "Administrator", "Manager"].includes(String(auth.user?.role ?? ""));
  const canOverrideCreditLimit = ["Owner", "Administrator", "Manager"].includes(String(auth.user?.role ?? ""));

  // FAIL-B5 — double Book+dispatch. There was NO in-flight state anywhere in this modal: no `isSubmitting`
  // tracking, no re-entry guard, and the submit button's `disabled` covered only the repair-block and
  // credit-limit gates. A second click (or Enter pressed twice) re-entered this function and issued a
  // SECOND create, booking and dispatching the load twice. FIVE different controls call
  // `form.handleSubmit(...)`, so guarding one button is not enough — the guard lives at the single choke
  // point every one of them funnels through, and the button disable below is the visible affordance.
  const submitInFlightRef = useRef(false);

  // FAIL-D2 — silent Save. `form.handleSubmit(onValid)` aborts WITHOUT a sound when validation fails:
  // no toast, no banner, no console line, and `submitLoad` never runs. In EDIT mode that is invisible
  // by construction — most sections render `isEditMode ? null : …`, so an invalid field's inline error
  // has nowhere on screen to appear and "Save changes" reads as a dead button. The same five controls
  // that funnel into `submitLoad` must funnel into ONE invalid handler too, or the next one added
  // re-opens the hole. Never fail silently: name the fields that blocked the write.
  const onInvalidSubmit = useCallback(
    (errors: FieldErrors<FormValues>) => {
      const names = Object.keys(errors ?? {});
      const shown = names.slice(0, 6).map((name) => FIELD_LABELS[name] ?? name.replace(/_/g, " "));
      const more = names.length > shown.length ? ` (+${names.length - shown.length} more)` : "";
      setGateBanner(null);
      setSubmitErrorMessage(
        shown.length > 0
          ? `Not saved — these fields blocked it: ${shown.join(", ")}${more}. Nothing was written.`
          : "Not saved — the form did not pass validation. Nothing was written."
      );
      pushToast(isEditMode ? "Not saved — fix the flagged fields" : "Not booked — fix the flagged fields", "error");
    },
    [isEditMode, pushToast]
  );

  async function submitLoad(values: FormValues, saveMode: "book_dispatch" | "draft", opts?: { override?: boolean }) {
    if (submitInFlightRef.current) return;
    submitInFlightRef.current = true;
    try {
      return await submitLoadInner(values, saveMode, opts);
    } finally {
      // Released in `finally` so a thrown/rejected submit does not wedge the form shut.
      submitInFlightRef.current = false;
    }
  }

  async function submitLoadInner(values: FormValues, saveMode: "book_dispatch" | "draft", opts?: { override?: boolean }) {
    setGateBanner(null);
    setSubmitErrorMessage(null);

    // Block 7 — EDIT mode: PATCH only the fields the user changed (dirtyFields-gated, anti-data-loss).
    // Trip-type is not editable here, so the create-only trip_type gate below does not apply.
    if (isEditMode && editLoadId) {
      try {
        const body = buildEditPatchBody(
          values as unknown as Record<string, unknown>,
          form.formState.dirtyFields as unknown as Record<string, unknown>,
          operatingCompanyId
        );
        // DRV-BILL-SKIP-PATHS — Edit Load calls ensureDriverBillArtifactsForLoad (#5408); surface mint skips
        // the same way Book does (LV-DISPATCH-TOAST-LIES companion: report server outcome, never invent pay).
        const patchResult = await updateDispatchLoadFull(editLoadId, body);
        pushToast("Load updated", "success");
        const mint = (
          patchResult as { driver_bill_mint?: { outcome?: string; missing?: string[] } | null }
        ).driver_bill_mint;
        if (mint?.outcome === "skipped_no_pay_rate") {
          pushToast(driverBillMintSkippedMessage("updated", mint.missing), "info");
        }
        onCreated({ id: editLoadId, label: editLoad?.load_number ? String(editLoad.load_number) : undefined });
        onClose();
      } catch (error) {
        const data = error instanceof ApiError ? ((error.data as Record<string, unknown>) ?? {}) : {};
        if (error instanceof ApiError && error.status === 409 && String(data.error ?? "") === "load_edit_locked") {
          setSubmitErrorMessage(
            "This load is locked — it's behind an open settlement, an issued invoice, or a driver bill, so it can't be edited."
          );
          pushToast("Load locked — can't edit", "error");
        } else {
          setSubmitErrorMessage(String(data.message ?? "Failed to update the load."));
          pushToast("Failed to update load", "error");
        }
      }
      return;
    }

    if (values.assignment_mode === "team" && !values.team_id.trim()) {
      pushToast("Team mode requires a team ID", "error");
      return;
    }
    // Trip Pairing (Block 04): Trip Type is REQUIRED — block save + surface an inline error.
    if (!values.trip_type) {
      form.setError("trip_type", { type: "required", message: "Select a Trip Type (NB / TR / SB)" });
      pushToast("Select a Trip Type before booking", "error");
      return;
    }
    // Manual miles (no PC*MILER): refuse silent 0 for both shortest (driver pay) and practical (fuel/ETA).
    const seatedDriver = Boolean(values.assigned_primary_driver_id?.trim?.() || values.assigned_primary_driver_id);
    if (saveMode === "book_dispatch") {
      if (!(Number(values.miles_practical) > 0)) {
        form.setError("miles_practical", {
          type: "required",
          message: "Enter practical miles (fuel + ETA). PC*MILER is not connected — type them manually.",
        });
        pushToast("Enter practical miles before booking", "error");
        return;
      }
      if (seatedDriver && !(Number(values.miles_shortest) > 0)) {
        form.setError("miles_shortest", {
          type: "required",
          message: "Enter shortest miles (driver pay). PC*MILER is not connected — type them manually.",
        });
        pushToast("Enter shortest miles before booking with a driver", "error");
        return;
      }
    }
    const token = opts?.override ? overrideToken ?? crypto.randomUUID() : undefined;
    if (opts?.override && !overrideToken) setOverrideToken(token ?? null);
    try {
      const payload = await createDispatchLoad({
        operating_company_id: operatingCompanyId,
        customer_id: values.customer_id,
        customer_wo_number: values.customer_wo_number || undefined,
        customer_po_number: values.customer_po_number || undefined,
        piece_count: numOrUndef(values.pieces),
        commodity: values.commodity || undefined,
        weight_lbs: values.weight_lbs || undefined,
        // [HOLD-FOR-JORGE — TIER 1] send booked advances so the backend can create the pending cash-advance
        // request (cash) / defer (fuel). Previously collected in the form but never sent.
        cash_advance_cents: values.cash_advance_cents || undefined,
        fuel_advance_cents: values.fuel_advance_cents || undefined,
        hazmat: values.hazmat,
        driver_instructions_text: values.driver_instructions_text || undefined,
        notes: values.notes || undefined,
        booking_mode: values.booking_mode,
        requires_tarps: values.requires_tarps,
        requires_reefer_fuel: values.requires_reefer_fuel,
        requires_pulp_probe: values.requires_pulp_probe,
        requires_locking_jacks: values.requires_locking_jacks,
        requires_load_locks: values.requires_load_locks,
        requires_straps: values.requires_straps,
        load_type: values.load_type,
        catalog_load_type_id: values.catalog_load_type_id || undefined,
        driver_pay_rate_per_mile:
          Number.isFinite(values.driver_pay_rate_per_mile) && values.driver_pay_rate_per_mile > 0
            ? values.driver_pay_rate_per_mile
            : undefined,
        factoring_company_vendor_id: values.factoring_company_vendor_id || undefined,
        tarp_type: values.tarp_type || undefined,
        // render-v6 §B reefer/tarp detail (migration 202606231400).
        reefer_temp_f: values.reefer_temp_f === "" ? undefined : Number(values.reefer_temp_f),
        temperature_type: values.temperature_type || undefined,
        reefer_mode: values.reefer_mode || undefined,
        pre_cool: values.pre_cool === "yes" ? true : undefined,
        tarp_qty: values.tarp_qty === "" ? undefined : Number(values.tarp_qty),
        tarp_size: values.tarp_size || undefined,
        lumper_amount_cents: values.lumper_amount_cents || 0,
        customer_chargeback_requested: values.customer_chargeback_requested,
        customer_chargeback_reason: values.customer_chargeback_reason || undefined,
        live_load_number: values.live_load_number || undefined,
        addToOpenPresettlement: values.addToOpenPresettlement,
        reservation_uuid: values.reservation_uuid || undefined,
        anticipated_chargeback_cents: numOrUndef(values.anticipated_chargeback_cents),
        anticipated_chargeback_reason: values.anticipated_chargeback_reason || undefined,
        detention_expected_y_n: values.detention_expected_y_n,
        detention_reason_id: values.detention_reason_id || undefined,
        detention_expected_hours: numOrUndef(values.detention_expected_hours),
        detention_bill_customer_per_hour_cents: numOrUndef(values.detention_bill_customer_per_hour_cents),
        detention_driver_pay_per_hour_cents: numOrUndef(values.detention_driver_pay_per_hour_cents),
        late_delivery_risk_y_n: values.late_delivery_risk_y_n,
        late_delivery_est_deduction_cents: numOrUndef(values.late_delivery_est_deduction_cents),
        late_delivery_reason: values.late_delivery_reason || undefined,
        ocr_source_pdf_r2_key: values.ocr_source_pdf_r2_key || undefined,
        miles_practical: numOrUndef(values.miles_practical),
        miles_shortest: numOrUndef(values.miles_shortest),
        miles_deadhead: numOrUndef(values.miles_deadhead),
        pickup_number: values.pickup_number || undefined,
        border_routing: values.border_routing || undefined,
        // FAIL-D6 — send the flag explicitly. Sending `undefined` when false is fine (the column is NOT
        // NULL DEFAULT false), but sending it always keeps the request self-describing.
        is_sample_data: values.is_sample_data,
        trip_type: values.trip_type || undefined,
        tour_id: values.tour_id || undefined,
        // Guard empty → undefined: the backend trailer_type is z.enum(...).optional(), which rejects "" (a
        // bare empty string is NOT "optional") with a 400. When equipment type isn't detected/selected the
        // form holds "", so coerce it to undefined like every other optional enum field here.
        trailer_type:
          (values.trailer_type || undefined) as
            | "refrigerated_van"
            | "dry_van"
            | "flatbed"
            | "lowboy"
            | "power_only_no_trailer"
            | "power_only_customer_trailer"
            | undefined,
        // Empty string is NOT a valid UUID — zod rejects "" with Invalid UUID before the
        // service can default DRY_VAN (P44 resolveLoadTrailerEquipmentIdForInsert). Omit when blank.
        load_trailer_equipment_id: values.load_trailer_equipment_id || undefined,
        assigned_unit_id: values.assigned_unit_id || undefined,
        // The service persists this through dispatch.load_assignment_history.new_trailer_id after
        // creating the load; mdata.loads intentionally has no trailer FK column.
        assigned_trailer_unit_id: values.assigned_trailer_unit_id || undefined,
        team_id: values.assignment_mode === "team" ? values.team_id || undefined : undefined,
        assigned_primary_driver_id: values.assignment_mode === "solo" ? values.assigned_primary_driver_id || undefined : undefined,
        assigned_secondary_driver_id: values.assignment_mode === "solo" ? values.assigned_secondary_driver_id || undefined : undefined,
        temp_fahrenheit: values.temp_fahrenheit || undefined,
        charges:
          saveMode === "draft"
            ? []
            : [
                ...buildBookLoadChargeLines({
                  linehaul_cents: Number(values.linehaul_cents || 0),
                  fuel_surcharge_cents: Number(values.fuel_surcharge_cents || 0),
                  accessorial_rows: values.accessorial_rows ?? [],
                }),
                // W7 — per-stop extra rates as customer charge lines (were dropped from the payload).
                ...stopExtraRateChargeLines(values.stops ?? []),
              ],
        stops: values.stops.map((stop, index) => ({
          stop_type: stop.stop_type,
          sequence_number: index + 1,
          city: stop.city?.trim() ? properPersonOrPlaceName(stop.city) : "",
          state: stop.state,
          // LV-STOP-ZIP-DROPPED: this mapping is an explicit field-by-field allow-list and postal_code was
          // never added to it. Every other layer was already correct - the Zip Code input is registered as
          // stops.N.postal_code (BookLoadStopsSection.tsx:132), the geocode autofill writes it, the backend
          // stop type accepts it (book-load.service.ts:44), the INSERT lists it (:1568) and binds it (:1594),
          // and mdata.load_stops.postal_code exists on prod. So the operator typed a ZIP, watched it render,
          // and this handler dropped it on the floor with no error. PROD 2026-08-08 (lucia bypass in a txn;
          // visible 20 == n_live_tup 20, a REAL zero): 0 of 20 stops have EVER carried a postal_code, while
          // city persists on 12 and address_line1 on 10 - they persist when supplied, this never has.
          // Postal code is the PC*MILER routing key, so driver pay-per-mile, fuel/ETA and IFTA jurisdiction
          // miles were all structurally unreachable.
          postal_code: stop.postal_code || undefined,
          latitude: numOrUndef(stop.latitude),
          longitude: numOrUndef(stop.longitude),
          country: stop.country,
          address_line1: stop.address_line1?.trim() ? properPersonOrPlaceName(stop.address_line1) : "",
          scheduled_arrival_at: stop.scheduled_arrival_at ? new Date(stop.scheduled_arrival_at).toISOString() : undefined,
          time_window_type: stop.time_window_type,
          pickup_time_type_id: stop.pickup_time_type_id || undefined,
          appointment_start_at: stop.appointment_start_at ? new Date(stop.appointment_start_at).toISOString() : undefined,
          appointment_end_at: stop.appointment_end_at ? new Date(stop.appointment_end_at).toISOString() : undefined,
          // Stop booleans: RHF hidden inputs read as "" when empty → never send "" for a boolean field
          // (backend Zod boolean rejects the string). Coerce to a strict boolean on the wire. (GUARD live
          // repro: stops posted is_tarp_stop:"" → 400 "expected boolean, received string".)
          lumper_required: stop.lumper_required === true || (stop.lumper_required as unknown) === "true",
          lumper_provider_id: stop.lumper_provider_id || undefined,
          lumper_paid_by: stop.lumper_paid_by,
          lumper_amount_cents: Number(stop.lumper_amount_cents || 0),
          is_tarp_stop: stop.is_tarp_stop === true || (stop.is_tarp_stop as unknown) === "true",
          tarp_count: Number(stop.tarp_count || 0),
          stop_notes: stop.stop_notes || undefined,
          site_contact_name: stop.site_contact_name?.trim() ? properPersonOrPlaceName(stop.site_contact_name) : undefined,
          site_contact_phone: stop.site_contact_phone || undefined,
          gate_dock_text: stop.gate_dock_text || undefined,
        })),
        save_mode: saveMode,
        override_token: token,
        override_reason: opts?.override ? overrideReason : undefined,
        override_credit_limit: overrideCreditLimit || undefined,
      });
      const warnings = Array.isArray((payload as Record<string, unknown>)?.wf_044_maintenance_warnings)
        ? ((payload as Record<string, unknown>).wf_044_maintenance_warnings as Array<Record<string, unknown>>)
        : [];
      if (warnings.length > 0 && saveMode === "book_dispatch") {
        setAdvisoryServerStatus(serverStatusOf(payload));
        const createdId = String((payload as { id?: string }).id ?? "");
        const createdLabel = String((payload as { load_number?: string }).load_number ?? "") || undefined;
        setAdvisoryCreatedLoad(createdId ? { id: createdId, label: createdLabel } : null);
        setPendingCloseAfterAdvisory(true);
        setGateBanner({
          type: "advisory",
          message: "Unit has open PM-due work order. Continue?",
          warnings,
        });
        return;
      }
      // LV-DISPATCH-TOAST-LIES — report the status the SERVER returned, never the one the click intended.
      // `save_mode: "book_dispatch"` does NOT force `dispatched` (book-load.service.ts writes
      // `toMdataStatus(input.status)`), so asserting dispatch from `saveMode` told a dispatcher a truck was
      // rolling under an audited DOT override while the record sat at `assigned_not_dispatched`.
      const serverStatus = serverStatusOf(payload);
      pushToast(bookLoadToastMessage(saveMode, serverStatus), bookLoadToastTone(saveMode, serverStatus));
      const mint = (payload as { driver_bill_mint?: { outcome?: string; missing?: string[] } }).driver_bill_mint;
      if (mint?.outcome === "skipped_no_pay_rate") {
        pushToast(driverBillMintSkippedMessage("booked", mint.missing), "info");
      }
      const createdId = String((payload as { id?: string }).id ?? "");
      const createdLabel = String((payload as { load_number?: string }).load_number ?? "") || undefined;
      onCreated(createdId ? { id: createdId, label: createdLabel } : undefined);
      onClose();
    } catch (error) {
      if (error instanceof ApiError) {
        const data = (error.data as Record<string, unknown>) ?? {};
        const code = String(data.error ?? "");
        const message = String(data.message ?? `API request failed with status ${error.status}`);
        if (error.status === 400 && code === "invalid_customer_for_company") {
          setSubmitErrorMessage(
            "This customer is not associated with the selected operating company. Please choose a customer that matches the company."
          );
          return;
        }
        if (error.status === 400) {
          // Surface the exact field that failed validation instead of a bare "status 400". A zod
          // validation_error carries details.fieldErrors keyed by field name — name the first one so a
          // dispatcher (and we) can see WHICH field is wrong rather than guessing.
          const details = (data.details as { fieldErrors?: Record<string, string[]> } | undefined) ?? undefined;
          const fieldErrors = details?.fieldErrors ?? {};
          const firstField = Object.keys(fieldErrors)[0];
          if (code === "validation_error" && firstField) {
            const reason = fieldErrors[firstField]?.[0] ?? "invalid";
            setSubmitErrorMessage(`Couldn't save — “${firstField}” is invalid (${reason}). Fix that field and try again.`);
            return;
          }
          setSubmitErrorMessage(message);
          return;
        }
        if (code === "E_UNIT_DISPATCH_BLOCKED") {
          // BOOKLOAD-OVERRIDE-DISPATCH-DEAD-CLICK — this gate response used to only set `gateBanner`,
          // which renders at the TOP of the form (section A). The control that triggers it (section D's
          // "Override & dispatch", or the bottom "Book + dispatch") lives well below that in the
          // scrollable form, so a dispatcher who does not scroll up sees a click that appears to do
          // nothing — the LV-DISPATCH-TOAST-LIES / FAIL-D2 silent-failure class, one call site over.
          // pushToast is the same fix this file already applies to every other silent-return branch.
          pushToast(message, "error");
          setGateBanner({
            type: "hard_block",
            message,
            warnings: (data.wf_044_maintenance_warnings as Array<Record<string, unknown>> | undefined) ?? [],
          });
          return;
        }
        if (code === "E_UNIT_OOS") {
          pushToast(message, "error");
          setGateBanner({
            type: "hard_block",
            message,
            warnings: (data.wf_044_maintenance_warnings as Array<Record<string, unknown>> | undefined) ?? [],
          });
          return;
        }
        if (code === "E_DRIVER_HOS_VIOLATION") {
          pushToast(message, "error");
          setGateBanner({
            type: "hos_block",
            message,
            warnings: (data.wf_044_maintenance_warnings as Array<Record<string, unknown>> | undefined) ?? [],
          });
          return;
        }
        if (error.status === 422 && code === "credit_limit_exceeded") {
          setCreditLimitBlock({
            exposure_cents: Number(data.exposure_cents ?? 0),
            limit_cents: Number(data.limit_cents ?? 0),
            credit_limit_source: (data.credit_limit_source as string | null) ?? null,
            can_override: Boolean(data.can_override),
          });
          return;
        }
      }
      pushToast(userFacingApiError(error, "Failed to book load"), "error");
    }
  }

  if (!open) return null;

  return createPortal(
    <>
    <style>{BOOK_LOAD_CORRECT_DESIGN_CSS}</style>
    <div
      // BOOK-LOAD-MODAL-INVISIBLE-BEHIND-DRAWER: this modal is opened both standalone ("+ Book Load")
      // and from inside LoadDetailDrawer's per-section "Edit ▸" (LoadDetailDrawer.tsx sets editLoadId
      // and leaves the drawer mounted underneath). The drawer's own panel renders at z-[210] (see
      // LoadDetailDrawer.tsx), so the old z-50 here painted a full 4 tiers BELOW it — a fully rendered,
      // interactive, but completely invisible/unclickable form (confirmed live: elementFromPoint on the
      // input's own on-screen coordinates returned the drawer's read-only text, not this modal).
      // Same root cause and same fix tier Modal.tsx already applied for the identical
      // CANCEL-LOAD-MODAL-INVISIBLE-BEHIND-DRAWER bug (z-[215], "above every other z-[N] tier including
      // the highest drawer") — this hand-rolled portal never got the same treatment. z-[216] keeps it
      // unambiguously topmost even alongside a Modal.tsx-based dialog.
      className="fixed inset-0 z-[216] flex items-start justify-center overflow-y-auto px-4 py-6"
      style={{ background: "rgba(15, 19, 32, 0.6)" }}
      onMouseDown={attemptBookLoadClose}
    >
      <div
        ref={panelRef}
        data-wizard-v5={wizardV5 ? "on" : undefined}
        className="flex max-h-[min(95vh,calc(100dvh-2rem))] w-full max-w-[min(1260px,calc(100vw-2rem))] flex-col overflow-hidden rounded-md border border-gray-200 bg-white shadow-2xl"
        // Owner 2026-07-04: let the dispatcher shrink/resize the wizard from the bottom-right corner so they
        // can keep the units / dispatch board visible behind it. Native `resize: both` grip; floors keep it
        // usable; the max-w/max-h classes cap the top end. The flex-col body already scrolls, so content
        // stays reachable at any size.
        style={{ width: "100%", resize: "both", minWidth: "440px", minHeight: "340px" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between border-b px-4 py-2.5 text-white" style={{ background: "#1f2a44" }}>
          <div>
            <div className="text-[10px]" style={{ color: "#9aa6ba" }}>
              {isEditMode ? "Dispatch › Edit load" : "Dispatch › Book load"}
            </div>
            {/* Two literal headings (not a ternary string) so the locked-ui-surface guard still sees the
                ">Book load<" text node for the create wizard while Edit shows the load number. */}
            {isEditMode ? (
              <div className="flex items-center gap-1.5 text-base font-bold">
                <span>Edit load</span>
                {editLoad?.id ? (
                  <EntityLink
                    kind="load"
                    id={editLoad.id}
                    label={entityLabel(editLoad.load_number, editLoad.id, "Load")}
                    className="text-white underline decoration-white/40 hover:decoration-white"
                    data-testid="book-load-edit-header-load-link"
                  />
                ) : null}
              </div>
            ) : (
              <div className="text-base font-bold">Book load</div>
            )}
          </div>
          <div className="flex items-center gap-3 text-[11px]" style={{ color: "#9aa6ba" }}>
            <span>{headerTime}</span>
            <ModalCloseButton
              title={isEditMode ? "Edit load" : "Book load"}
              onClose={attemptBookLoadClose}
              className="h-6 w-6 rounded-sm text-sm text-gray-200 hover:bg-[#2e3c5a]"
            />
          </div>
        </header>

        {/* Edit mode reuses the real LOAD# (in the header) — no new reservation bar. */}
        {isEditMode ? null : (
          <LiveLoadIdBar operatingCompanyId={operatingCompanyId} onReservationUpdate={onReservationUpdate} />
        )}

        <form
          className="flex flex-1 flex-col overflow-y-auto"
          onSubmit={(event) => {
            if (isEditMode && !editLoad) {
              event.preventDefault();
              setSubmitErrorMessage("Load details must finish loading before changes can be saved.");
              return;
            }
            void form.handleSubmit(async (values) => {
              await submitLoad(values, "book_dispatch");
            }, onInvalidSubmit)(event);
          }}
        >
          {isEditMode && editLoadQuery.isError ? (
            <div className="mx-3 mt-2">
              <ListErrorBanner message="Could not load persisted load details." onRetry={() => void editLoadQuery.refetch()} />
            </div>
          ) : null}
          {submitErrorMessage ? (
            <div className="mx-3 mt-2 rounded-sm border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-900">{submitErrorMessage}</div>
          ) : null}

          {creditLimitBlock ? (
            <div className="mx-3 mt-2 rounded-sm border-2 border-slate-300 bg-slate-50 px-3 py-2 text-xs">
              <p className="font-semibold text-slate-700">Credit limit reached</p>
              <p className="mt-0.5 text-slate-600">
                Open exposure: ${(creditLimitBlock.exposure_cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })} &mdash;{" "}
                Limit: ${(creditLimitBlock.limit_cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                {creditLimitBlock.credit_limit_source === "factor" ? " (Factor-set — FARO)" : ""}
              </p>
              {canOverrideCreditLimit ? (
                <label className="mt-1.5 inline-flex cursor-pointer items-center gap-2">
                  <input type="checkbox" checked={overrideCreditLimit} onChange={(e) => setOverrideCreditLimit(e.target.checked)} />
                  <span className="text-slate-700">Override — I acknowledge this customer is over their credit limit</span>
                </label>
              ) : (
                <p className="mt-1 text-slate-500">Contact an Owner or Manager to override.</p>
              )}
            </div>
          ) : null}

          {isEditMode ? (
            <div
              className="mx-3 mt-2 rounded-sm border border-slate-300 bg-slate-100 px-3 py-2 text-[11px] text-slate-700"
              data-testid="book-load-edit-honesty"
            >
              Editing persisted load details. Only fields you change are saved (partial PATCH — untouched
              columns stay). <span className="font-semibold">Commodity, weight, trip type, and reefer/tarp
              settings</span> round-trip on edit. <span className="font-semibold">Hazmat</span> is owner-locked
              out of edit (create-path only). <span className="font-semibold">Load type / trailer type</span>{" "}
              are not edit-PATCH columns yet.
            </div>
          ) : null}

          {/* A3 (render-A): Trip Type full-width banner between the subbar and the body. §7 navy ruling —
              NB/TR/SB in the navy family (navy / slate / slate-dk), no blue/green/purple. 46px two-line
              buttons (code over description) with directional icons; amber lifecycle note; TR/SB auto-join
              the unit's tour (tour_id derived server-side). */}
          <div className="border-b border-gray-200 bg-[#f8fafc] px-3 py-2" data-testid="trip-type-banner">
            <span className="text-[11px] font-bold uppercase tracking-[0.4px] text-gray-600">
              Trip Type <span className="text-red-500">*</span>
            </span>
            <div className="mt-1 flex gap-2">
              {([
                ["NB", "▲", "Northbound", "Border → US interior", "#1F2A44"],
                ["TR", "▶", "Triangulation", "US interior → US interior", "#64748b"],
                ["SB", "▼", "Southbound", "US interior → Laredo border", "#334155"],
              ] as const).map(([code, icon, label, desc, color]) => {
                const active = watchedTripType === code;
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => {
                      form.setValue("trip_type", code, { shouldDirty: true });
                      form.clearErrors("trip_type");
                    }}
                    className="flex h-[46px] flex-1 flex-col justify-center rounded-sm border px-2.5 text-left transition-colors"
                    style={active ? { backgroundColor: color, borderColor: color, color: "white" } : { borderColor: "#cbd5e1", color: "#1f2733" }}
                  >
                    <span className="text-[13.5px] font-bold leading-tight">{icon} {code} · {label}</span>
                    <span className={`text-[10px] leading-tight ${active ? "text-white/80" : "text-gray-500"}`}>{desc}</span>
                  </button>
                );
              })}
            </div>
            {form.formState.errors.trip_type ? (
              <p className="mt-1 text-[11px] text-red-600">{String(form.formState.errors.trip_type.message)}</p>
            ) : watchedTripType === "TR" || watchedTripType === "SB" ? (
              <p className="mt-1 text-[11px] text-gray-600">Part of this unit's tour — follows its most recent Northbound leg (joined automatically).</p>
            ) : null}
            <p className="mt-1 rounded-sm border border-slate-200 bg-slate-100 px-2 py-1 text-[10.5px] text-slate-700">
              Every load must be classified NB, TR, or SB. NB starts a tour; TR/SB join it; the settlement closes when the SB leg returns to Laredo.
            </p>
          </div>

          {gateBanner ? (
            <div
              className={`mx-3 mt-2 rounded border px-3 py-2 text-xs ${
                gateBanner.type === "advisory"
                  ? "border-slate-200 bg-slate-100 text-slate-700"
                  : "border-red-300 bg-red-50 text-red-900"
              }`}
            >
              <div className="font-semibold">{gateBanner.message}</div>
              {gateBanner.warnings?.length ? (
                <ul className="mt-1 list-disc pl-4">
                  {gateBanner.warnings.map((warning, index) => (
                    <li key={`${index}-${String(warning.unit_id ?? "")}`}>{String(warning.message ?? "Maintenance warning")}</li>
                  ))}
                </ul>
              ) : null}
              {(gateBanner.type === "hard_block" || gateBanner.type === "hos_block") ? (
                <div className="mt-2 space-y-2">
                  <textarea
                    value={overrideReason}
                    onChange={(event) => setOverrideReason(event.target.value)}
                    className="w-full rounded-sm border border-gray-300 px-2 py-1"
                    rows={3}
                    placeholder="Override reason (min 10 chars)"
                  />
                  <div className="flex gap-2">
                    {gateBanner.type === "hard_block" && canOverrideHardBlock ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={form.handleSubmit(async (values) => {
                          if (overrideReason.trim().length < 10) {
                            pushToast("Override reason must be at least 10 characters", "error");
                            return;
                          }
                          await submitLoad(values, "book_dispatch", { override: true });
                        }, onInvalidSubmit)}
                      >
                        Override (Owner only)
                      </Button>
                    ) : null}
                    {gateBanner.type === "hos_block" && canOverrideHos ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={form.handleSubmit(async (values) => {
                          if (overrideReason.trim().length < 10) {
                            pushToast("Override reason must be at least 10 characters", "error");
                            return;
                          }
                          await submitLoad(values, "book_dispatch", { override: true });
                        }, onInvalidSubmit)}
                      >
                        Override
                      </Button>
                    ) : null}
                    {gateBanner.type === "hard_block" && !canOverrideHardBlock ? <span>Contact Owner to override.</span> : null}
                    {gateBanner.type === "hos_block" && !canOverrideHos ? <span>Manager+ role required for HOS override.</span> : null}
                  </div>
                </div>
              ) : null}
              {gateBanner.type === "advisory" && pendingCloseAfterAdvisory ? (
                <div className="mt-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      // Report what the SERVER returned, exactly like the main path. "Booked with a
                      // maintenance advisory" was true but silent about dispatch: a book_dispatch that
                      // landed on assigned_not_dispatched still rendered green here.
                      pushToast(
                        `${bookLoadToastMessage("book_dispatch", advisoryServerStatus)} · maintenance advisory`,
                        bookLoadToastTone("book_dispatch", advisoryServerStatus),
                      );
                      onCreated(advisoryCreatedLoad ?? undefined);
                      setAdvisoryCreatedLoad(null);
                      setPendingCloseAfterAdvisory(false);
                      finalizeBookLoadClose();
                    }}
                  >
                    Continue
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-3 bg-[#e9ebef] px-4 py-3">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.05fr_1fr]">
              <section className="blw-sec">
                <div className="blw-sec-hd">
                  <span className="blw-sec-chip">A</span>
                  <span className="blw-sec-name">Customer · Invoice · Charges</span>
                  <span className="blw-sec-meta">Section total <b>{money.format(sectionTotal / 100)}</b></span>
                </div>
                <div className="space-y-2 p-3">
                  {/* §A rate-con upload — RESTORED per owner 2026-07-04 as the BUTTON variant (click → file
                      picker), matching how it worked before. The drag-drop zone lives in §E (Documents).
                      Both share the ONE extraction path and fill the same editable draft. */}
                  {!editLoadId ? (
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-gray-600">Upload rate confirmation (auto-fills this load)</label>
                      <RateConUploadPanel
                        operatingCompanyId={operatingCompanyId}
                        onPrefill={(prefill) => {
                          applyLoadTemplateToBookForm(form.setValue as unknown as UseFormSetValue<MinimalBookForm>, prefill.json);
                          const accRows = rateConAccessorialRows(prefill.json);
                          if (accRows.length > 0) {
                            form.setValue("accessorial_rows", accRows, { shouldDirty: true });
                          }
                          if (typeof prefill.json.trailer_type === "string") {
                            form.setValue("trailer_type", prefill.json.trailer_type, { shouldDirty: true });
                          }
                          // RATECON-4 — apply the newly-mapped fields to their existing wizard inputs
                          // (previously these values only reached the notes blob). Each is optional/guarded.
                          const pj = prefill.json as Record<string, unknown>;
                          if (typeof pj.commodity === "string" && pj.commodity) {
                            form.setValue("commodity", pj.commodity, { shouldDirty: true });
                          }
                          if (typeof pj.weight_lbs === "number" && Number.isFinite(pj.weight_lbs)) {
                            form.setValue("weight_lbs", pj.weight_lbs, { shouldDirty: true });
                          }
                          if (typeof pj.pieces === "string" && pj.pieces) {
                            form.setValue("pieces", pj.pieces, { shouldDirty: true });
                          }
                          if (typeof pj.pickup_number === "string" && pj.pickup_number) {
                            form.setValue("pickup_number", pj.pickup_number, { shouldDirty: true });
                          }
                          if (typeof pj.customer_wo_number === "string" && pj.customer_wo_number) {
                            form.setValue("customer_wo_number", pj.customer_wo_number, { shouldDirty: true });
                          }
                          pushToast(
                            prefill.lowConfidenceFields.length
                              ? "Rate con read — review the prefill (low-confidence fields flagged)"
                              : "Rate con read — review the prefill",
                            "success",
                          );
                        }}
                      />
                    </div>
                  ) : null}
                  <LoadTemplatePicker
                    operatingCompanyId={operatingCompanyId}
                    onSelectTemplate={(row) => {
                      const json = row.template_json as Record<string, unknown>;
                      applyLoadTemplateToBookForm(form.setValue as unknown as UseFormSetValue<MinimalBookForm>, json);
                      if (typeof json.accessorial_cents === "number" && json.accessorial_cents > 0) {
                        form.setValue("accessorial_rows", rowFromLegacyAccessorialCents(json.accessorial_cents), { shouldDirty: true });
                      }
                      pushToast("Template applied", "success");
                    }}
                  />

                  {/* RATECON-2: the rate-con intake (drop OR click → real extraction) is the single OcrDropZone
                      block in §E (Documents). The duplicate button-panel affordance was removed here. */}

                  <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                    <label className="text-[9px] font-semibold uppercase tracking-[0.4px] text-gray-500">
                      Customer
                      <input type="hidden" {...form.register("customer_id", { required: "Select a customer from the list" })} />
                      <div className="mt-0.5">
                        <ReferenceSelect
                          value={form.watch("customer_id") || null}
                          onChange={(next) => {
                            const match = customerOptions.find((o) => o.value === next);
                            form.setValue("customer_id", next ?? "", { shouldDirty: true, shouldValidate: true });
                            form.setValue("customer_name", match?.label ?? "", { shouldDirty: true, shouldValidate: false });
                          }}
                          options={customerOptions}
                          createKind="customer"
                          operatingCompanyId={operatingCompanyId}
                          placeholder="Search customers…"
                          onSearch={setCustomerSearch}
                          loading={customersQuery.isLoading}
                          disabled={customersQuery.isLoading || customersQuery.isError}
                          onOptionCreated={(opt) => {
                            void queryClient.invalidateQueries({ queryKey: ["book-load-v4-customers"] });
                            form.setValue("customer_id", opt.value, { shouldDirty: true, shouldValidate: true });
                            form.setValue("customer_name", opt.label, { shouldDirty: true, shouldValidate: false });
                          }}
                        />
                        {customersQuery.isError ? <ListErrorBanner message="Could not load customers." onRetry={() => void customersQuery.refetch()} /> : null}
                      </div>
                      {form.formState.errors.customer_id?.message ? <span className="mt-0.5 block normal-case tracking-normal text-red-600">{form.formState.errors.customer_id.message}</span> : null}
                    </label>
                    <label className="text-[9px] font-semibold uppercase tracking-[0.4px] text-gray-500">
                      Customer WO #
                      <input {...form.register("customer_wo_number")} className="mt-0.5 h-7 w-full rounded-sm border border-gray-300 px-2 text-xs" />
                    </label>
                    <label className="text-[9px] font-semibold uppercase tracking-[0.4px] text-gray-500">
                      Pickup #
                      <input {...form.register("pickup_number")} className="mt-0.5 h-7 w-full rounded-sm border border-gray-300 px-2 text-xs" />
                    </label>
                    {/* FAIL-D6 — the ONLY UI path that sets mdata.loads.is_sample_data. The column has
                        existed since migration 0403 (NOT NULL DEFAULT false) but no create surface ever
                        populated it, so every TMS-native load was written `false` whether it was real or a
                        demo fixture — and nothing downstream could tell them apart. Owner ruling §9.8 keeps
                        this column BANNED as a delete-selector; this marks data at birth, it selects
                        nothing for destruction. */}
                    <label className="flex items-end gap-1.5 text-[9px] font-semibold uppercase tracking-[0.4px] text-gray-500">
                      <input
                        type="checkbox"
                        data-testid="book-load-is-sample-data"
                        {...form.register("is_sample_data")}
                        className="mb-1 h-3.5 w-3.5 rounded-sm border-gray-300"
                      />
                      <span className="mb-0.5">Sample / demo load</span>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
                    <label className="text-[9px] font-semibold uppercase tracking-[0.4px] text-gray-500">
                      Equipment / load type
                      <div className="mt-0.5">
                        <ReferenceSelect
                          value={form.watch("catalog_load_type_id") || null}
                          onChange={(value) => form.setValue("catalog_load_type_id", value ?? "", { shouldDirty: true })}
                          options={loadTypeOptions}
                          createKind="load_type"
                          operatingCompanyId={operatingCompanyId}
                          placeholder="Select load type"
                          loading={loadTypesQuery.isLoading}
                          disabled={loadTypesQuery.isLoading || loadTypesQuery.isError}
                          onOptionCreated={() => void loadTypesQuery.refetch()}
                        />
                        {loadTypesQuery.isError ? <ListErrorBanner message="Could not load load types." onRetry={() => void loadTypesQuery.refetch()} /> : null}
                      </div>
                    </label>
                    <label className="text-[9px] font-semibold uppercase tracking-[0.4px] text-gray-500">
                      Type
                      <div className="mt-0.5 inline-flex h-7 overflow-hidden rounded-sm border border-gray-300 bg-white text-[11px]">
                        <label className={`flex cursor-pointer items-center px-3 ${loadType === "broker" ? "bg-[#1f2a44] text-white" : "text-gray-700"}`}>
                          <input type="radio" value="broker" className="hidden" {...form.register("load_type")} />
                          Broker
                        </label>
                        <label className={`flex cursor-pointer items-center border-l border-gray-300 px-3 ${loadType === "direct" ? "bg-[#1f2a44] text-white" : "text-gray-700"}`}>
                          <input type="radio" value="direct" className="hidden" {...form.register("load_type")} />
                          Direct
                        </label>
                      </div>
                    </label>
                    <label className="text-[9px] font-semibold uppercase tracking-[0.4px] text-gray-500">
                      Commodity
                      <input {...form.register("commodity")} className="mt-0.5 h-7 w-full rounded-sm border border-gray-300 px-2 text-xs" />
                    </label>
                    <label className="text-[9px] font-semibold uppercase tracking-[0.4px] text-gray-500">
                      Weight (lbs)
                      <input type="number" {...form.register("weight_lbs", { valueAsNumber: true })} className="mt-0.5 h-7 w-full rounded-sm border border-gray-300 px-2 text-xs" />
                    </label>
                    <label className="text-[9px] font-semibold uppercase tracking-[0.4px] text-gray-500">
                      Pieces
                      <input {...form.register("pieces")} className="mt-0.5 h-7 w-full rounded-sm border border-gray-300 px-2 text-xs" />
                    </label>
                  </div>

                  <div className="overflow-x-auto rounded-sm border border-gray-200">
                    <table className="w-full border-collapse text-xs">
                      <tbody>
                        <tr className="border-b border-gray-100">
                          <td className="px-2 py-1.5">Linehaul</td>
                          <td className="px-2 py-1.5 text-right">
                            <MoneyInput valueCents={form.watch("linehaul_cents")} onChangeCents={(c) => form.setValue("linehaul_cents", c ?? 0, { shouldDirty: true })} className="ml-auto w-28" ariaLabel="Linehaul" />
                          </td>
                        </tr>
                        <tr className="border-b border-gray-100">
                          <td className="px-2 py-1.5">Fuel surcharge</td>
                          <td className="px-2 py-1.5 text-right">
                            <MoneyInput valueCents={form.watch("fuel_surcharge_cents")} onChangeCents={(c) => form.setValue("fuel_surcharge_cents", c ?? 0, { shouldDirty: true })} className="ml-auto w-28" ariaLabel="Fuel surcharge" />
                          </td>
                        </tr>
                        <tr className="border-b border-gray-100">
                          <td className="px-2 py-1.5">Accessorial</td>
                          <td className="px-2 py-1.5 text-right font-mono text-gray-800">
                            {money.format(sumAccessorialCents(accessorialRows ?? []) / 100)}
                          </td>
                        </tr>
                        {extraRatesCents > 0 ? (
                          <tr className="border-b border-gray-100">
                            <td className="px-2 py-1.5">Per-stop extra rates</td>
                            <td className="px-2 py-1.5 text-right font-mono text-gray-800">{money.format(extraRatesCents / 100)}</td>
                          </tr>
                        ) : null}
                        <tr className="bg-[#f7f8fa] font-semibold">
                          <td className="px-2 py-1.5">Total customer invoice</td>
                          <td className="px-2 py-1.5 text-right">{money.format(customerInvoiceTotal / 100)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  {/* ARCHIVE-not-DELETE: B21 RBC dead + Add charge / orphan charge-type select — replaced by AccessorialEditor (B21-D3). Sunset: 2026-09. */}
                  <AccessorialEditor
                    operatingCompanyId={operatingCompanyId}
                    rows={accessorialRows ?? []}
                    extraSubtotalCents={extraRatesCents}
                    onRowsChange={(rows) => form.setValue("accessorial_rows", rows, { shouldDirty: true })}
                    onDetentionSeed={() => {
                      form.setValue("detention_expected_y_n", true, { shouldDirty: true });
                      // §B "Expected adjustments" expander is open by default (RENDER-A-v2 reorder) — no toggle needed.
                      const accrual = computeDetentionAccrualCents(
                        form.getValues("detention_expected_hours"),
                        form.getValues("detention_bill_customer_per_hour_cents")
                      );
                      if (accrual <= 0) return;
                      const rows = form.getValues("accessorial_rows") ?? [];
                      const last = rows[rows.length - 1];
                      if (last?.code === "DETENTION") {
                        form.setValue(
                          "accessorial_rows",
                          rows.map((row, index) => (index === rows.length - 1 ? { ...row, amount_cents: accrual } : row)),
                          { shouldDirty: true }
                        );
                      }
                    }}
                  />
                  <input type="hidden" {...form.register("accessorial_cents", { valueAsNumber: true })} />

                  {/* GAP-31 per-stop extra rates — relocated to §A (with the charges) per GUARD 2026-06-23.
                      Lives here, NOT in the §C stop card (which is exactly the 11 render-v6 fields). Each
                      editor instance is stop-scoped (stopIndex → stops.N.extra_rates) so the per-stop model
                      + verify-multi-stop-extra-rates guard hold. */}
                  <div data-testid="section-a-extra-rates" className="space-y-1">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.4px] text-gray-500">Per-stop extra rates</p>
                    {((form.watch("stops") as Array<{ stop_type?: string }> | undefined) ?? []).map((stopRow, i) => (
                      <div key={i} className="rounded-sm border border-gray-200 p-1">
                        <div className="text-[10px] font-semibold text-gray-600">
                          Stop {i + 1} · {stopRow?.stop_type === "delivery" ? "Delivery" : "Pickup"}
                        </div>
                        <MultiStopExtraRateEditor control={form.control as never} register={form.register as never} stopIndex={i} />
                      </div>
                    ))}
                  </div>

                  {/* Lumper responsibility — relocated to §A per GUARD 2026-06-23 (was hidden in §C). Per-stop,
                      referencing the stop (McLeod/QBO keep lumper-responsibility per-line in the charges).
                      Click-to-add: appears for a stop once it has a Lumper amount (§C "Lumper amount ($)" > 0). */}
                  {(() => {
                    const stopsForLumper = (form.watch("stops") as Array<{ stop_type?: string; lumper_amount_cents?: number }> | undefined) ?? [];
                    const withLumper = stopsForLumper.map((s, i) => ({ s, i })).filter(({ s }) => Number(s?.lumper_amount_cents ?? 0) > 0);
                    if (withLumper.length === 0) return null;
                    return (
                      <div data-testid="section-a-lumper-responsibility" className="space-y-1">
                        <p className="text-[9px] font-semibold uppercase tracking-[0.4px] text-gray-500">Lumper responsibility</p>
                        {lumperProvidersQuery.isError ? <ListErrorBanner message="Could not load lumper providers." onRetry={() => void lumperProvidersQuery.refetch()} /> : null}
                        {withLumper.map(({ s, i }) => (
                          <div key={i} className="grid grid-cols-1 items-end gap-2 rounded-sm border border-gray-200 p-1 md:grid-cols-4">
                            <div className="text-[10px] font-semibold text-gray-600">
                              Stop {i + 1} · {s?.stop_type === "delivery" ? "Delivery" : "Pickup"}
                            </div>
                            <label className="text-[9px] font-semibold uppercase tracking-[0.4px] text-gray-500">
                              Lumper paid by
                              <SelectCombobox {...form.register(`stops.${i}.lumper_paid_by`)} className="mt-0.5 h-7 w-full text-xs">
                                <option value="carrier">Carrier</option>
                                <option value="shipper">Shipper</option>
                                <option value="broker">Broker</option>
                                <option value="receiver">Receiver</option>
                                <option value="unknown">Unknown</option>
                              </SelectCombobox>
                            </label>
                            <label className="text-[9px] font-semibold uppercase tracking-[0.4px] text-gray-500">
                              Lumper provider
                              <ReferenceSelect
                                value={form.watch(`stops.${i}.lumper_provider_id`) || null}
                                onChange={(value) => form.setValue(`stops.${i}.lumper_provider_id`, value ?? "", { shouldDirty: true })}
                                options={lumperProviderOptions}
                                createKind="lumper_provider"
                                operatingCompanyId={operatingCompanyId}
                                loading={lumperProvidersQuery.isLoading}
                                disabled={lumperProvidersQuery.isLoading || lumperProvidersQuery.isError}
                                placeholder="Select provider"
                                onOptionCreated={() => void lumperProvidersQuery.refetch()}
                              />
                            </label>
                            <label className="flex items-center gap-2 text-[11px] text-gray-700">
                              <input type="checkbox" {...form.register(`stops.${i}.lumper_required`)} /> Lumper required
                            </label>
                          </div>
                        ))}
                      </div>
                    );
                  })()}

                  <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                    <label className="text-[9px] font-semibold uppercase tracking-[0.4px] text-gray-500">
                      Cash advance
                      <MoneyInput valueCents={form.watch("cash_advance_cents")} onChangeCents={(c) => form.setValue("cash_advance_cents", c ?? 0, { shouldDirty: true })} className="mt-0.5 w-full" ariaLabel="Cash advance" />
                    </label>
                    <label className="text-[9px] font-semibold uppercase tracking-[0.4px] text-gray-500">
                      Fuel advance
                      <MoneyInput valueCents={form.watch("fuel_advance_cents")} onChangeCents={(c) => form.setValue("fuel_advance_cents", c ?? 0, { shouldDirty: true })} className="mt-0.5 w-full" ariaLabel="Fuel advance" />
                    </label>
                    <label className="text-[9px] font-semibold uppercase tracking-[0.4px] text-gray-500">
                      Factoring company
                      {/*
                        LST-PICKER-01 / CLS-SILENT-CAP: EntityPicker server-search + allowCreate →
                        mdata.vendors (same table factoring_company_vendor_id writes).
                      */}
                      <div className="mt-0.5">
                        <EntityPicker
                          kind="vendor"
                          allowCreate
                          operatingCompanyId={operatingCompanyId}
                          value={factoringCompanyVendorId || null}
                          onChange={(next) =>
                            form.setValue("factoring_company_vendor_id", next ?? "", { shouldDirty: true })
                          }
                          enabled={Boolean(operatingCompanyId)}
                          placeholder="Search factoring company…"
                          dataField="book-load-factoring-company-vendor"
                          className="w-full"
                        />
                      </div>
                    </label>
                  </div>

                  <label className="flex items-center gap-2 text-[11px] text-gray-700">
                    <input type="checkbox" {...form.register("hazmat")} />
                    Hazmat
                  </label>

                  <div className={`blw-collapse ${showSpecialNotes ? "open" : ""}`}>
                    <button type="button" className="blw-collapse-bar w-full text-left" onClick={() => setShowSpecialNotes((openState) => !openState)}>
                      <span className="blw-collapse-plus">{showSpecialNotes ? "−" : "+"}</span>
                      <span className="text-[11px] font-bold text-[#1f2733]">Special notes</span>
                      <span className="ml-auto text-[9.5px] text-[#8a93a1]">optional — click to add</span>
                    </button>
                    {showSpecialNotes ? (
                      <div className="border-t border-gray-200 p-3">
                        <textarea {...form.register("notes")} rows={2} className="w-full rounded-sm border border-gray-300 px-2 py-1 text-xs" />
                      </div>
                    ) : null}
                  </div>
                </div>
              </section>

              <div className="space-y-3">
                <section className="blw-sec">
                  <div className="blw-sec-hd">
                    <span className="blw-sec-chip">B</span>
                    <span className="blw-sec-name">Equipment · Driver · Trailer</span>
                    <span className="blw-sec-meta">Class <b>T120-SMITH</b></span>
                  </div>
                  <div className="space-y-2 p-3">
                    {/* Trip Type lifted to the full-width banner above the body (A3). §B starts at Equipment.
                        SKIP inventing a driver picker here — create-worthy Driver / Team driver fields live in
                        BookLoadEquipmentSection (DriverPickerWithCreate + CreateDriverModal). */}
                    <BookLoadEquipmentSection
                      register={form.register}
                      watch={form.watch}
                      setValue={form.setValue}
                      operatingCompanyId={operatingCompanyId}
                      deadheadAfterAt={deadheadAfterAt}
                      deadheadDropCity={deadheadDropPreview.city}
                      deadheadDropState={deadheadDropPreview.state}
                      onOptionsResolved={setEquipmentOptions}
                    />
                  </div>
                </section>
              </div>
            </div>

            <section className="blw-sec">
              <div className="blw-sec-hd">
                <span className="blw-sec-chip">C</span>
                <span className="blw-sec-name">Stops · Miles (manual)</span>
                <span className="blw-sec-meta">1 pickup · 1 delivery · type short + long</span>
              </div>
              <div className="space-y-2 p-3">
                <BookLoadStopsSection
                  operatingCompanyId={operatingCompanyId}
                  pickupTimeTypeOptions={pickupTimeTypeOptions}
                  pickupTimeTypesLoading={pickupTimeTypesQuery.isLoading}
                  pickupTimeTypesUnavailable={pickupTimeTypesQuery.isError}
                  onPickupTimeTypesRetry={() => void pickupTimeTypesQuery.refetch()}
                  onPickupTimeTypeCreated={() => void pickupTimeTypesQuery.refetch()}
                  control={form.control as never}
                  register={form.register as never}
                  setValue={form.setValue as never}
                />
                <MilesStrip
                  practical={milesPractical}
                  shortest={milesShortest}
                  deadhead={milesDeadhead}
                  ratePerMile={ratePerMile}
                  shortestRequired={Boolean(assignedPrimaryDriverId)}
                  practicalRequired
                  onPracticalChange={(n) => form.setValue("miles_practical", n, { shouldDirty: true, shouldValidate: true })}
                  onShortestChange={(n) => form.setValue("miles_shortest", n, { shouldDirty: true, shouldValidate: true })}
                  onDeadheadChange={(n) => form.setValue("miles_deadhead", n, { shouldDirty: true, shouldValidate: true })}
                />
                <p className="blw-note">
                  Enter Shortest (driver pay) and Practical/long (fuel + ETA) by hand — PC*MILER is not connected yet.
                  Practical must be greater than 0; with a driver seated, Shortest must also be greater than 0 or Book is refused.
                </p>
                {/* border_routing stays form-backed but not operator-facing here */}
                <div className="hidden">
                  <input {...form.register("border_routing")} />
                </div>
              </div>
            </section>

            <section className="blw-sec">
              <div className="blw-sec-hd">
                <span className="blw-sec-chip">D</span>
                <span className="blw-sec-name">Pre-dispatch validation</span>
                <span className="blw-sec-meta">
                  {preDispatch.hasBlockers || authGateBlocked || repairBlockSubmitBlocked ? (
                    <b className="text-red-700">Active blocker(s) — override required</b>
                  ) : assignedPrimaryDriverId || assignedUnitId || watchedCustomerId ? (
                    <b>
                      {preDispatch.hasWarnings
                        ? "Warnings to review · booking allowed"
                        : preDispatch.canDispatch
                          ? "All checks pass · ready to book"
                          : "Validation unavailable · retry checks"}
                    </b>
                  ) : (
                    <span>Select driver / unit / customer to run checks</span>
                  )}
                </span>
              </div>
              <div className="space-y-2 p-3">
                {/* GAP-14: live CDL / med-card / HOS / DVIR / driver-status checks against the actual
                    selected driver+unit+customer. Read-only preview — the submit-time gate (gateBanner)
                    remains the enforcement path; this surfaces blockers before the dispatcher hits Book. */}
                <PreDispatchValidationPanel
                  operatingCompanyId={operatingCompanyId}
                  driverUuid={assignedPrimaryDriverId || null}
                  unitUuid={assignedUnitId || null}
                  trailerUuid={assignedTrailerUnitId || null}
                  customerId={watchedCustomerId || null}
                  customerLabel={watchedCustomerName || null}
                  onValidationChange={(canDispatch, hasBlockers, hasWarnings) =>
                    setPreDispatch({ canDispatch, hasBlockers, hasWarnings })
                  }
                  // OWNER-ALWAYS-OVERRIDE: these two props were NEVER passed. Both are optional, so
                  // inside the panel `value={overrideReason ?? ""}` was permanently "" and onChange
                  // optional-chained to a no-op — the override textarea could not receive a single
                  // character. That, not role-gating and not the reservation re-render, is why the
                  // override was a dead end. Wired to the SAME state the AuthGate override already
                  // uses, so there is one reason string, one min-10 rule, one submitted value.
                  overrideReason={overrideReason}
                  onOverrideReasonChange={setOverrideReason}
                  canOwnerOverride={canOverrideHardBlock}
                  onOwnerOverride={() => {
                    void form.handleSubmit(async (values) => {
                      if (overrideReason.trim().length < 10) {
                        pushToast("Override reason must be at least 10 characters", "error");
                        return;
                      }
                      await submitLoad(values, "book_dispatch", { override: true });
                    }, onInvalidSubmit)();
                  }}
                />
                {/* GAP-47 — dispatch authorization gates (workflow-level, e.g. active-driver / DVIR-major /
                    advisory registry checks), distinct from the physical-readiness checks above. */}
                <AuthGatePanel
                  operatingCompanyId={operatingCompanyId}
                  action={isEditMode ? "assign_driver" : "book_load"}
                  loadUuid={editLoadId || undefined}
                  loadLabel={editLoad?.load_number ?? null}
                  unitUuid={assignedUnitId || undefined}
                  driverUuid={assignedPrimaryDriverId || undefined}
                  trailerUuid={assignedTrailerUnitId || undefined}
                  unitLabel={equipmentOptions.unit?.label ?? null}
                  driverLabel={equipmentOptions.primaryDriver?.label ?? null}
                  trailerLabel={equipmentOptions.trailer?.label ?? null}
                  onBlockersChange={setAuthGateBlocked}
                />
                <LoadCreateModal
                  operatingCompanyId={operatingCompanyId}
                  selectedDriverId={assignedPrimaryDriverId || ""}
                  overrideRepairBlock={overrideRepairBlock}
                  onOverrideRepairBlockChange={setOverrideRepairBlock}
                  onSubmitBlockedChange={setRepairBlockSubmitBlocked}
                />
                <BookLoadValidationSection checks={validationChecks} />
              </div>
            </section>

            {/* render-v6 §E — DOCUMENTS at the BOTTOM near Save.
                HONESTY: only rate-con OCR is wired here. BOL / POD / lumper live on Load Detail
                Documents + POD Review after the load is booked — do not claim upload chrome that
                is not implemented on this surface. */}
            <section className="blw-sec" data-testid="book-load-documents">
              <div className="blw-sec-hd">
                <span className="blw-sec-chip">E</span>
                <span className="blw-sec-name">Documents</span>
                <span className="blw-sec-meta">rate confirmation (OCR prefill)</span>
              </div>
              <div className="space-y-2 p-3">
                <label className="text-[11px] font-semibold text-gray-600">Upload rate confirmation</label>
                {!editLoadId ? (
                  <OcrDropZone
                    operatingCompanyId={operatingCompanyId}
                    onPrefill={(prefill) => {
                      applyLoadTemplateToBookForm(form.setValue as unknown as UseFormSetValue<MinimalBookForm>, prefill.json);
                      const accRows = rateConAccessorialRows(prefill.json);
                      if (accRows.length > 0) {
                        form.setValue("accessorial_rows", accRows, { shouldDirty: true });
                      }
                      if (typeof prefill.json.trailer_type === "string") {
                        form.setValue("trailer_type", prefill.json.trailer_type, { shouldDirty: true });
                      }
                      pushToast(
                        prefill.lowConfidenceFields.length
                          ? "Rate con read — review the prefill (low-confidence fields flagged)"
                          : "Rate con read — review the prefill",
                        "success",
                      );
                    }}
                  />
                ) : (
                  <p className="text-[11px] text-gray-500">Rate-con extraction fills a new load — open Book Load to read a rate con into a fresh draft.</p>
                )}
                <p className="text-[10px] text-gray-500" data-testid="book-load-documents-honesty">
                  BOL, POD, and lumper receipts are captured on Load Detail → Documents / POD Review after booking — not on this Book Load form.
                </p>
              </div>
            </section>
          </div>

          <div className="flex shrink-0 items-center justify-between border-t border-gray-200 bg-white px-3 py-2">
            <div className="text-xs text-gray-600">
              Driver bill preview <span className="font-mono font-semibold text-gray-800">{billNumberPreview}</span>{" "}
              {driverBillPreview === null ? (
                <span className="font-semibold text-[#dc2626]" data-testid="book-load-driver-bill-not-priceable">
                  Not priceable — no driver bill will be created
                </span>
              ) : (
                <span className="font-mono text-sm font-bold text-gray-900">{money.format(driverBillPreview / 100)}</span>
              )}
              <div className="text-[9.5px] text-gray-500">
                {driverBillPreview === null
                  ? `Missing ${driverBillMissing.join(" and ")}. The load still books; driver pay is recorded as skipped until this is entered.`
                  : `${Number(milesShortest || 0).toLocaleString()} short mi × $${Number(driverPayRatePerMile || 0).toFixed(2)}/mi · recalculates on field changes`}
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={attemptBookLoadClose}>
                Cancel
              </Button>
              {/* Edit mode: a single Save; no draft path (the load already exists). */}
              {isEditMode ? null : (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={form.handleSubmit(async (values) => {
                    await submitLoad(values, "draft");
                  }, onInvalidSubmit)}
                >
                  Save draft
                </Button>
              )}
              <Button type="submit" disabled={form.formState.isSubmitting || (isEditMode && !editLoad) || repairBlockSubmitBlocked || (creditLimitBlock != null && (!canOverrideCreditLimit || !overrideCreditLimit))}>
                {isEditMode ? "Save changes" : "Book + dispatch"}
              </Button>
            </div>
          </div>
          <div className="border-t border-gray-100 px-3 py-1 text-right text-[9px] text-gray-500">
            <kbd className="rounded-sm border border-gray-200 bg-gray-50 px-1 font-mono text-[9px]">Esc</kbd> close &nbsp;
            <kbd className="rounded-sm border border-gray-200 bg-gray-50 px-1 font-mono text-[9px]">⌘S</kbd> save draft &nbsp;
            <kbd className="rounded-sm border border-gray-200 bg-gray-50 px-1 font-mono text-[9px]">⌘↵</kbd> book + dispatch
          </div>
        </form>
      </div>
    </div>
    <ConfirmDiscardDialog
      open={showDiscardConfirm}
      onCancel={() => setShowDiscardConfirm(false)}
      onDiscard={finalizeBookLoadClose}
    />
    </>,
    document.body
  );
}
