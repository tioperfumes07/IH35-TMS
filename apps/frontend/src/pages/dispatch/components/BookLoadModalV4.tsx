import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useForm, type UseFormSetValue } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { createDispatchLoad } from "../../../api/dispatch";
import { ApiError } from "../../../api/client";
import { getLoad, updateDispatchLoadFull, type LoadDetail } from "../../../api/loads";
import { buildEditPrefill, buildEditPatchBody } from "./book-load-v4/editLoadMapping";
import { listVendors } from "../../../api/mdata";
import { useAuth } from "../../../auth/useAuth";
import { Button } from "../../../components/Button";
import { ConfirmDiscardDialog } from "../../../components/dialogs/ConfirmDiscardDialog";
import { ModalCloseButton } from "../../../components/ModalCloseButton";
import { useEscapeKey } from "../../../hooks/useEscapeKey";
import { useToast } from "../../../components/Toast";
import type { BookLoadFormValues } from "./BookLoadCustomerSection";
import { BookLoadEquipmentSection } from "./BookLoadEquipmentSection";
import { PreDispatchValidationPanel } from "../../../components/dispatch/PreDispatchValidationPanel";
import { BookLoadStopsSection } from "./BookLoadStopsSection";
import { MultiStopExtraRateEditor } from "../../../components/dispatch/MultiStopExtraRateEditor";
import { BookLoadValidationSection } from "./BookLoadValidationSection";
import type { LiveReservation } from "./book-load-v4/LiveLoadIdBar";
import { LiveLoadIdBar } from "./book-load-v4/LiveLoadIdBar";
import { MilesStrip } from "./book-load-v4/MilesStrip";
import { OcrDropZone } from "./book-load-v4/OcrDropZone";
import { useFeatureFlag } from "../../../hooks/useFeatureFlag";

// Load Wizard V5 (Block H): compact, denser layout behind an OFF-by-default flag. The
// old layout stays the default until LOAD_WIZARD_V5 is enabled. V5 changes are visual
// density only — the submit payload is byte-identical.
export const LOAD_WIZARD_V5_FLAG = "LOAD_WIZARD_V5";
import { LoadTemplatePicker, applyLoadTemplateToBookForm, type MinimalBookForm } from "../LoadTemplateLibrary";
import { AccessorialEditor } from "../../../components/dispatch/AccessorialEditor";
import {
  buildBookLoadChargeLines,
  computeBookLoadSectionTotalCents,
  computeDetentionAccrualCents,
  rowFromLegacyAccessorialCents,
  sumAccessorialCents,
  type AccessorialRow,
} from "../../../components/dispatch/accessorial-editor-lib";
import { QboCombobox } from "../../../components/forms/QboCombobox";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";
import { MoneyInput } from "../../../components/forms/MoneyInput";

type FormValues = BookLoadFormValues & {
  load_type: "broker" | "direct";
  pieces: string;
  trip_type: "" | "NB" | "TR" | "SB";
  tour_id: string;
  trailer_type: string;
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
  cash_advance_cents: number;
  fuel_advance_cents: number;
  factoring_company_summary: string;
  accessorial_rows: AccessorialRow[];
  stops: Array<{
    stop_type: "pickup" | "delivery";
    sequence_number: number;
    city: string;
    state: string;
    country: string;
    address_line1: string;
    scheduled_arrival_at: string;
    time_window_type?: "appointment" | "open_window" | "select_hours" | "refused";
    appointment_start_at?: string;
    appointment_end_at?: string;
    lumper_required?: boolean;
    lumper_paid_by?: "carrier" | "shipper" | "broker" | "receiver" | "unknown";
    lumper_amount_cents?: number;
    is_tarp_stop?: boolean;
    tarp_count?: number;
    stop_notes?: string;
    site_contact_name?: string;
    site_contact_phone?: string;
    gate_dock_text?: string;
  }>;
};

type Props = {
  open: boolean;
  operatingCompanyId: string;
  onClose: () => void;
  onCreated: () => void;
  /** B21-D7 OCR queue convert — applies template JSON at modal open (integration seam only). */
  templatePrefillJson?: Record<string, unknown> | null;
  /** Block 7 — when set, the wizard opens in EDIT mode: prefilled from this load, Save → guarded PATCH. */
  editLoadId?: string | null;
  /** Dispatch "+ Book load" per-truck action — prefill the assigned unit when opening a fresh booking. */
  prefillUnitId?: string | null;
};

function numOrUndef(v: unknown): number | undefined {
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return undefined;
  return n;
}

const BOOK_LOAD_CORRECT_DESIGN_CSS = `
.blw-sec{background:#fff;border:1px solid #e3e6eb;border-radius:7px;overflow:hidden}
.blw-sec-hd{display:flex;align-items:center;gap:9px;padding:7px 11px;background:#eef1f4;border-bottom:1px solid #e3e6eb}
.blw-sec-chip{width:18px;height:18px;border-radius:4px;background:#16203a;color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center}
.blw-sec-name{font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#5b6472}
.blw-sec-meta{margin-left:auto;font-size:10px;font-weight:600;color:#5b6472}
.blw-sec-meta b{color:#1f2733}
.blw-collapse{border:1px solid #e3e6eb;border-radius:5px;overflow:hidden}
.blw-collapse-bar{display:flex;align-items:center;gap:8px;padding:8px 11px;cursor:pointer;background:#f7f8fa}
.blw-collapse-bar:hover{background:#f0f2f5}
.blw-collapse-plus{width:16px;height:16px;border-radius:3px;background:#16203a;color:#fff;font-size:12px;font-weight:600;display:flex;align-items:center;justify-content:center;flex:none}
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

export function BookLoadModalV4({ open, operatingCompanyId, onClose, onCreated, templatePrefillJson, editLoadId, prefillUnitId }: Props) {
  const auth = useAuth();
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
  const [submitErrorMessage, setSubmitErrorMessage] = useState<string | null>(null);
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
      pieces: "",
      trip_type: "",
      tour_id: "",
      notes: "",
      linehaul_cents: 0,
      fuel_surcharge_cents: 0,
      accessorial_cents: 0,
      trailer_type: "dry_van",
      assigned_unit_id: "",
      assigned_trailer_unit_id: "",
      assignment_mode: "solo",
      team_id: "",
      assigned_primary_driver_id: "",
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
      cash_advance_cents: 0,
      fuel_advance_cents: 0,
      factoring_company_summary: "",
      accessorial_rows: [],
      stops: [
        { stop_type: "pickup", sequence_number: 1, city: "", state: "", country: "USA", address_line1: "", scheduled_arrival_at: "", time_window_type: "appointment" },
        { stop_type: "delivery", sequence_number: 2, city: "", state: "", country: "USA", address_line1: "", scheduled_arrival_at: "", time_window_type: "appointment" },
      ],
    },
  });
  const assignedUnitId = form.watch("assigned_unit_id");
  // GAP-14 live pre-dispatch validation inputs (driver/unit/trailer/customer) + live result summary.
  const assignedPrimaryDriverId = form.watch("assigned_primary_driver_id");
  const assignedTrailerUnitId = form.watch("assigned_trailer_unit_id");
  const watchedCustomerId = form.watch("customer_id");
  const watchedTripType = form.watch("trip_type");
  const [preDispatch, setPreDispatch] = useState<{ canDispatch: boolean; hasBlockers: boolean }>({
    canDispatch: true,
    hasBlockers: false,
  });
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

  // Block 7 — EDIT mode: load the existing load and prefill the wizard. form.reset(...keepDefaults)
  // marks nothing dirty, so the Save body (dirtyFields-gated) only contains what the user then changes.
  const editLoadQuery = useQuery({
    queryKey: ["book-load-edit", editLoadId],
    queryFn: () => getLoad(editLoadId as string),
    enabled: Boolean(open && editLoadId),
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
  const customerQboId = form.watch("customer_qbo_id");
  const customerName = form.watch("customer_name");
  const loadType = form.watch("load_type");
  const driverPayRatePerMile = form.watch("driver_pay_rate_per_mile");
  const milesShortest = form.watch("miles_shortest");
  const milesPractical = form.watch("miles_practical");
  const milesDeadhead = form.watch("miles_deadhead");
  const reservedLoadNumber = form.watch("reserved_load_number");
  const factoringCompanySummary = form.watch("factoring_company_summary");

  const factoringVendorsQuery = useQuery({
    queryKey: ["book-load-factoring-vendors", operatingCompanyId],
    queryFn: () => listVendors({ operating_company_id: operatingCompanyId }),
    enabled: Boolean(operatingCompanyId),
  });
  const factoringVendorOptions = useMemo(
    () =>
      (factoringVendorsQuery.data?.vendors ?? [])
        .filter((vendor) => (vendor.vendor_type ?? "").toLowerCase().includes("factor") || (vendor.name ?? "").toLowerCase().includes("factor"))
        .map((vendor) => ({ value: vendor.name, label: vendor.name })),
    [factoringVendorsQuery.data?.vendors]
  );

  const sectionTotal = useMemo(
    () => computeBookLoadSectionTotalCents(linehaul || 0, fuel || 0, accessorialRows ?? []),
    [accessorialRows, fuel, linehaul]
  );

  useEffect(() => {
    const sum = sumAccessorialCents(accessorialRows ?? []);
    if (form.getValues("accessorial_cents") !== sum) {
      form.setValue("accessorial_cents", sum, { shouldDirty: false });
    }
  }, [accessorialRows, form]);
  const driverBillPreview = useMemo(() => {
    const miles = Number(milesShortest || 0);
    const rate = Number(driverPayRatePerMile || 0);
    if (miles > 0 && rate > 0) return Math.round(miles * rate * 100);
    return sectionTotal;
  }, [driverPayRatePerMile, milesShortest, sectionTotal]);
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

  const validationIssues = useMemo(
    () => [
      "Unit PM up-to-date check",
      "DVIR / dispatch block",
      "Trailer inspection check (pending automation)",
      "Customer quality flag warning (pending automation)",
      "FMCSA broker authority cache check (pending automation)",
      "Driver instructions pushed to driver mobile app + dispatch sheet PDF",
      "Expected adjustments flagged on customer invoice review banner",
    ],
    []
  );
  const billNumberPreview = useMemo(() => {
    if (!reservedLoadNumber) return "B-—";
    return reservedLoadNumber.startsWith("L-") ? reservedLoadNumber.replace(/^L-/, "B-") : `B-${reservedLoadNumber}`;
  }, [reservedLoadNumber]);

  const canOverrideHardBlock = auth.user?.role === "Owner";
  const canOverrideHos = ["Owner", "Administrator", "Manager"].includes(String(auth.user?.role ?? ""));

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

  async function submitLoad(values: FormValues, saveMode: "book_dispatch" | "draft", opts?: { override?: boolean }) {
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
        await updateDispatchLoadFull(editLoadId, body);
        pushToast("Load updated", "success");
        onCreated();
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
        hazmat: values.hazmat,
        driver_instructions_text: values.driver_instructions_text || undefined,
        notes: values.notes || undefined,
        booking_mode: values.booking_mode,
        requires_tarps: values.requires_tarps,
        tarp_type: values.tarp_type || undefined,
        // render-v6 §B reefer/tarp detail (migration 202606231400).
        reefer_temp_f: values.reefer_temp_f === "" ? undefined : Number(values.reefer_temp_f),
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
        trip_type: values.trip_type || undefined,
        tour_id: values.tour_id || undefined,
        trailer_type: values.trailer_type as
          | "refrigerated_van"
          | "dry_van"
          | "flatbed"
          | "power_only_no_trailer"
          | "power_only_customer_trailer",
        assigned_unit_id: values.assigned_unit_id || undefined,
        assigned_trailer_unit_id: values.assigned_trailer_unit_id || undefined, // W-FIX-3b → mdata.loads.trailer_id
        team_id: values.assignment_mode === "team" ? values.team_id || undefined : undefined,
        assigned_primary_driver_id: values.assignment_mode === "solo" ? values.assigned_primary_driver_id || undefined : undefined,
        assigned_secondary_driver_id: values.assignment_mode === "solo" ? values.assigned_secondary_driver_id || undefined : undefined,
        temp_fahrenheit: values.temp_fahrenheit || undefined,
        charges:
          saveMode === "draft"
            ? []
            : buildBookLoadChargeLines({
                linehaul_cents: Number(values.linehaul_cents || 0),
                fuel_surcharge_cents: Number(values.fuel_surcharge_cents || 0),
                accessorial_rows: values.accessorial_rows ?? [],
              }),
        stops: values.stops.map((stop, index) => ({
          stop_type: stop.stop_type,
          sequence_number: index + 1,
          city: stop.city,
          state: stop.state,
          country: stop.country,
          address_line1: stop.address_line1,
          scheduled_arrival_at: stop.scheduled_arrival_at ? new Date(stop.scheduled_arrival_at).toISOString() : undefined,
          time_window_type: stop.time_window_type,
          appointment_start_at: stop.appointment_start_at ? new Date(stop.appointment_start_at).toISOString() : undefined,
          appointment_end_at: stop.appointment_end_at ? new Date(stop.appointment_end_at).toISOString() : undefined,
          lumper_required: stop.lumper_required,
          lumper_paid_by: stop.lumper_paid_by,
          lumper_amount_cents: Number(stop.lumper_amount_cents || 0),
          is_tarp_stop: stop.is_tarp_stop,
          tarp_count: Number(stop.tarp_count || 0),
          stop_notes: stop.stop_notes || undefined,
          site_contact_name: stop.site_contact_name || undefined,
          site_contact_phone: stop.site_contact_phone || undefined,
          gate_dock_text: stop.gate_dock_text || undefined,
        })),
        save_mode: saveMode,
        override_token: token,
        override_reason: opts?.override ? overrideReason : undefined,
      });
      const warnings = Array.isArray((payload as Record<string, unknown>)?.wf_044_maintenance_warnings)
        ? ((payload as Record<string, unknown>).wf_044_maintenance_warnings as Array<Record<string, unknown>>)
        : [];
      if (warnings.length > 0 && saveMode === "book_dispatch") {
        setPendingCloseAfterAdvisory(true);
        setGateBanner({
          type: "advisory",
          message: "Unit has open PM-due work order. Continue?",
          warnings,
        });
        return;
      }
      pushToast(saveMode === "draft" ? "Draft saved" : "Load booked and dispatched", "success");
      onCreated();
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
          setSubmitErrorMessage(message);
          return;
        }
        if (code === "E_UNIT_DISPATCH_BLOCKED") {
          setGateBanner({
            type: "hard_block",
            message,
            warnings: (data.wf_044_maintenance_warnings as Array<Record<string, unknown>> | undefined) ?? [],
          });
          return;
        }
        if (code === "E_DRIVER_HOS_VIOLATION") {
          setGateBanner({
            type: "hos_block",
            message,
            warnings: (data.wf_044_maintenance_warnings as Array<Record<string, unknown>> | undefined) ?? [],
          });
          return;
        }
      }
      pushToast("Failed to book load", "error");
    }
  }

  if (!open) return null;

  return createPortal(
    <>
    <style>{BOOK_LOAD_CORRECT_DESIGN_CSS}</style>
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-4 py-6"
      style={{ background: "rgba(15, 19, 32, 0.6)" }}
      onMouseDown={attemptBookLoadClose}
    >
      <div
        ref={panelRef}
        data-wizard-v5={wizardV5 ? "on" : undefined}
        className="flex max-h-[min(95vh,calc(100dvh-2rem))] w-full max-w-[min(1260px,calc(100vw-2rem))] flex-col overflow-hidden rounded-md border border-gray-200 bg-white shadow-2xl"
        style={{ width: "100%" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="flex flex-shrink-0 items-center justify-between border-b px-4 py-2.5 text-white" style={{ background: "#16203a" }}>
          <div>
            <div className="text-[10px]" style={{ color: "#9aa6ba" }}>
              {isEditMode ? "Dispatch › Edit load" : "Dispatch › Book load"}
            </div>
            {/* Two literal headings (not a ternary string) so the locked-ui-surface guard still sees the
                ">Book load<" text node for the create wizard while Edit shows the load number. */}
            {isEditMode ? (
              <div className="text-base font-bold">Edit load{editLoad?.load_number ? ` ${editLoad.load_number}` : ""}</div>
            ) : (
              <div className="text-base font-bold">Book load</div>
            )}
          </div>
          <div className="flex items-center gap-3 text-[11px]" style={{ color: "#9aa6ba" }}>
            <span>{headerTime}</span>
            <ModalCloseButton
              title={isEditMode ? "Edit load" : "Book load"}
              onClose={attemptBookLoadClose}
              className="h-6 w-6 rounded text-sm text-gray-200 hover:bg-[#2e3c5a]"
            />
          </div>
        </header>

        {/* Edit mode reuses the real LOAD# (in the header) — no new reservation bar. */}
        {isEditMode ? null : (
          <LiveLoadIdBar operatingCompanyId={operatingCompanyId} onReservationUpdate={onReservationUpdate} />
        )}

        <form
          className="flex flex-1 flex-col overflow-y-auto"
          onSubmit={form.handleSubmit(async (values) => {
            await submitLoad(values, "book_dispatch");
          })}
        >
          {submitErrorMessage ? (
            <div className="mx-3 mt-2 rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-900">{submitErrorMessage}</div>
          ) : null}

          {isEditMode ? (
            <div className="mx-3 mt-2 rounded border border-slate-300 bg-slate-100 px-3 py-2 text-[11px] text-slate-700">
              Editing the persisted load details. <span className="font-semibold">Commodity, weight, trailer/trip
              type, hazmat and reefer settings</span> aren&apos;t stored for edit yet — they show blank here and
              will <span className="font-semibold">not</span> be changed by saving. Only fields you edit are saved.
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
                    className="flex h-[46px] flex-1 flex-col justify-center rounded border px-2.5 text-left transition-colors"
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
            <p className="mt-1 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[10.5px] text-amber-800">
              Every load must be classified NB, TR, or SB. NB starts a tour; TR/SB join it; the settlement closes when the SB leg returns to Laredo.
            </p>
          </div>

          {gateBanner ? (
            <div
              className={`mx-3 mt-2 rounded border px-3 py-2 text-xs ${
                gateBanner.type === "advisory"
                  ? "border-amber-300 bg-amber-50 text-amber-900"
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
                    className="w-full rounded border border-gray-300 px-2 py-1"
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
                        })}
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
                        })}
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
                      pushToast("Load booked with maintenance advisory", "success");
                      onCreated();
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
                  {/* render-v6 §A: the rate-confirmation/document dropzone is NOT here — moved to §E (bottom). */}
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

                  <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                    <label className="text-[9px] font-semibold uppercase tracking-[0.4px] text-gray-500">
                      Customer
                      <input type="hidden" {...form.register("customer_id", { required: "Select a customer from QuickBooks search results" })} />
                      <div className="mt-0.5">
                        <QboCombobox
                          entityType="customer"
                          operatingCompanyId={operatingCompanyId}
                          value={customerQboId?.trim() ? customerQboId : null}
                          displayValue={customerName ?? ""}
                          allowFreeText={false}
                          placeholder="Select customer..."
                          onChange={(qboId, name) => {
                            if (qboId) {
                              form.setValue("customer_qbo_id", qboId, { shouldDirty: true, shouldValidate: false });
                              form.setValue("customer_name", name, { shouldDirty: true, shouldValidate: false });
                              return;
                            }
                            form.setValue("customer_name", name, { shouldDirty: true, shouldValidate: false });
                          }}
                          onPick={(row) => {
                            form.setValue("customer_id", row.id, { shouldDirty: true, shouldValidate: true });
                            form.setValue("customer_qbo_id", row.qbo_id, { shouldDirty: true, shouldValidate: false });
                            form.setValue("customer_name", row.display_name, { shouldDirty: true, shouldValidate: false });
                          }}
                        />
                      </div>
                      {form.formState.errors.customer_id?.message ? <span className="mt-0.5 block normal-case tracking-normal text-red-600">{form.formState.errors.customer_id.message}</span> : null}
                    </label>
                    <label className="text-[9px] font-semibold uppercase tracking-[0.4px] text-gray-500">
                      Customer WO #
                      <input {...form.register("customer_wo_number")} className="mt-0.5 h-7 w-full rounded border border-gray-300 px-2 text-xs" />
                    </label>
                    <label className="text-[9px] font-semibold uppercase tracking-[0.4px] text-gray-500">
                      Pickup #
                      <input {...form.register("pickup_number")} className="mt-0.5 h-7 w-full rounded border border-gray-300 px-2 text-xs" />
                    </label>
                  </div>

                  <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
                    <label className="text-[9px] font-semibold uppercase tracking-[0.4px] text-gray-500">
                      Type
                      <div className="mt-0.5 inline-flex h-7 overflow-hidden rounded border border-gray-300 bg-white text-[11px]">
                        <label className={`flex cursor-pointer items-center px-3 ${loadType === "broker" ? "bg-[#16203a] text-white" : "text-gray-700"}`}>
                          <input type="radio" value="broker" className="hidden" {...form.register("load_type")} />
                          Broker
                        </label>
                        <label className={`flex cursor-pointer items-center border-l border-gray-300 px-3 ${loadType === "direct" ? "bg-[#16203a] text-white" : "text-gray-700"}`}>
                          <input type="radio" value="direct" className="hidden" {...form.register("load_type")} />
                          Direct
                        </label>
                      </div>
                    </label>
                    <label className="text-[9px] font-semibold uppercase tracking-[0.4px] text-gray-500">
                      Commodity
                      <input {...form.register("commodity")} className="mt-0.5 h-7 w-full rounded border border-gray-300 px-2 text-xs" />
                    </label>
                    <label className="text-[9px] font-semibold uppercase tracking-[0.4px] text-gray-500">
                      Weight (lbs)
                      <input type="number" {...form.register("weight_lbs", { valueAsNumber: true })} className="mt-0.5 h-7 w-full rounded border border-gray-300 px-2 text-xs" />
                    </label>
                    <label className="text-[9px] font-semibold uppercase tracking-[0.4px] text-gray-500">
                      Pieces
                      <input {...form.register("pieces")} className="mt-0.5 h-7 w-full rounded border border-gray-300 px-2 text-xs" />
                    </label>
                  </div>

                  <div className="overflow-hidden rounded border border-gray-200">
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
                        <tr className="bg-[#f7f8fa] font-semibold">
                          <td className="px-2 py-1.5">Total customer invoice</td>
                          <td className="px-2 py-1.5 text-right">{money.format(sectionTotal / 100)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  {/* ARCHIVE-not-DELETE: B21 RBC dead + Add charge / orphan charge-type select — replaced by AccessorialEditor (B21-D3). Sunset: 2026-09. */}
                  <AccessorialEditor
                    operatingCompanyId={operatingCompanyId}
                    rows={accessorialRows ?? []}
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
                      <div key={i} className="rounded border border-gray-200 p-1">
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
                        {withLumper.map(({ s, i }) => (
                          <div key={i} className="grid grid-cols-1 items-end gap-2 rounded border border-gray-200 p-1 md:grid-cols-3">
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
                      <SelectCombobox
                        value={factoringCompanySummary}
                        onChange={(event) => form.setValue("factoring_company_summary", event.target.value, { shouldDirty: true })}
                        className="mt-0.5 h-7 w-full text-xs"
                      >
                        <option value="">{factoringVendorsQuery.isLoading ? "Loading factoring companies..." : "Select factoring company"}</option>
                        {factoringVendorOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </SelectCombobox>
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
                        <textarea {...form.register("notes")} rows={2} className="w-full rounded border border-gray-300 px-2 py-1 text-xs" />
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
                    {/* Trip Type lifted to the full-width banner above the body (A3). §B starts at Equipment. */}
                    <BookLoadEquipmentSection
                      register={form.register}
                      watch={form.watch}
                      setValue={form.setValue}
                      operatingCompanyId={operatingCompanyId}
                      deadheadAfterAt={deadheadAfterAt}
                      deadheadDropCity={deadheadDropPreview.city}
                      deadheadDropState={deadheadDropPreview.state}
                    />
                  </div>
                </section>
              </div>
            </div>

            <section className="blw-sec">
              <div className="blw-sec-hd">
                <span className="blw-sec-chip">C</span>
                <span className="blw-sec-name">Stops · PC*MILER routing</span>
                <span className="blw-sec-meta">1 pickup · 1 delivery</span>
              </div>
              <div className="space-y-2 p-3">
                <BookLoadStopsSection control={form.control as never} register={form.register as never} setValue={form.setValue as never} />
                <MilesStrip practical={milesPractical} shortest={milesShortest} deadhead={milesDeadhead} ratePerMile={ratePerMile} />
                <p className="blw-note">Shortest miles (highlighted) used for driver pay. Practical used for fuel planning and ETA.</p>
                <div className="hidden">
                  <input type="number" {...form.register("miles_practical", { valueAsNumber: true })} />
                  <input type="number" {...form.register("miles_shortest", { valueAsNumber: true })} />
                  <input type="number" {...form.register("miles_deadhead", { valueAsNumber: true })} />
                  <input {...form.register("border_routing")} />
                </div>
              </div>
            </section>

            <section className="blw-sec">
              <div className="blw-sec-hd">
                <span className="blw-sec-chip">D</span>
                <span className="blw-sec-name">Pre-dispatch validation</span>
                <span className="blw-sec-meta">
                  {preDispatch.hasBlockers ? (
                    <b className="text-red-700">Active blocker(s) — override required</b>
                  ) : assignedPrimaryDriverId || assignedUnitId || watchedCustomerId ? (
                    <b>{preDispatch.canDispatch ? "All checks pass · ready to book" : "Review warnings"}</b>
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
                  onValidationChange={(canDispatch, hasBlockers) => setPreDispatch({ canDispatch, hasBlockers })}
                />
                <BookLoadValidationSection issues={validationIssues} />
              </div>
            </section>

            {/* render-v6 §E — DOCUMENTS at the BOTTOM near Save (design note: "moved to the BOTTOM").
                Rate confirmation + BOL / POD / lumper receipt upload. */}
            <section className="blw-sec" data-testid="book-load-documents">
              <div className="blw-sec-hd">
                <span className="blw-sec-chip">E</span>
                <span className="blw-sec-name">Documents</span>
                <span className="blw-sec-meta">rate con · BOL · POD · lumper receipt</span>
              </div>
              <div className="space-y-2 p-3">
                <label className="text-[11px] font-semibold text-gray-600">Upload rate confirmation &amp; documents</label>
                <OcrDropZone operatingCompanyId={operatingCompanyId} onUploaded={(key) => form.setValue("ocr_source_pdf_r2_key", key, { shouldDirty: true })} />
              </div>
            </section>
          </div>

          <div className="flex flex-shrink-0 items-center justify-between border-t border-gray-200 bg-white px-3 py-2">
            <div className="text-xs text-gray-600">
              Driver bill preview <span className="font-mono font-semibold text-gray-800">{billNumberPreview}</span>{" "}
              <span className="font-mono text-sm font-bold text-gray-900">{money.format((driverBillPreview || 0) / 100)}</span>
              <div className="text-[9.5px] text-gray-500">{Number(milesShortest || 0).toLocaleString()} short mi × ${(Number(driverPayRatePerMile || 0)).toFixed(2)}/mi · recalculates on field changes</div>
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
                  })}
                >
                  Save draft
                </Button>
              )}
              <Button type="submit">{isEditMode ? "Save changes" : "Book + dispatch"}</Button>
            </div>
          </div>
          <div className="border-t border-gray-100 px-3 py-1 text-right text-[9px] text-gray-500">
            <kbd className="rounded border border-gray-200 bg-gray-50 px-1 font-mono text-[9px]">Esc</kbd> close &nbsp;
            <kbd className="rounded border border-gray-200 bg-gray-50 px-1 font-mono text-[9px]">⌘S</kbd> save draft &nbsp;
            <kbd className="rounded border border-gray-200 bg-gray-50 px-1 font-mono text-[9px]">⌘↵</kbd> book + dispatch
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
