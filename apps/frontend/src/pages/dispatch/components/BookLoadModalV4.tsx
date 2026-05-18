import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useForm, type UseFormSetValue } from "react-hook-form";
import { createDispatchLoad } from "../../../api/dispatch";
import { ApiError } from "../../../api/client";
import { useAuth } from "../../../auth/useAuth";
import { Button } from "../../../components/Button";
import { ConfirmDiscardDialog } from "../../../components/dialogs/ConfirmDiscardDialog";
import { useEscapeKey } from "../../../hooks/useEscapeKey";
import { useToast } from "../../../components/Toast";
import type { BookLoadFormValues } from "./BookLoadCustomerSection";
import { BookLoadEquipmentSection } from "./BookLoadEquipmentSection";
import { BookLoadStopsSection } from "./BookLoadStopsSection";
import { BookLoadValidationSection } from "./BookLoadValidationSection";
import { DriverInstructionsTextarea } from "./book-load-v4/DriverInstructionsTextarea";
import { ExpectedAdjustmentsCallout } from "./book-load-v4/ExpectedAdjustmentsCallout";
import type { LiveReservation } from "./book-load-v4/LiveLoadIdBar";
import { LiveLoadIdBar } from "./book-load-v4/LiveLoadIdBar";
import { MilesStrip } from "./book-load-v4/MilesStrip";
import { OcrDropZone } from "./book-load-v4/OcrDropZone";
import { LoadTemplatePicker, applyLoadTemplateToBookForm, type MinimalBookForm } from "../LoadTemplateLibrary";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";
import { QboCombobox } from "../../../components/forms/QboCombobox";

type FormValues = BookLoadFormValues & {
  load_type: "broker" | "direct";
  pieces: string;
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
};

function numOrUndef(v: unknown): number | undefined {
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return undefined;
  return n;
}

export function BookLoadModalV4({ open, operatingCompanyId, onClose, onCreated }: Props) {
  const auth = useAuth();
  const { pushToast } = useToast();
  const panelRef = useRef<HTMLDivElement>(null);

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
  const [showDriverInstructions, setShowDriverInstructions] = useState(false);
  const [showExpectedAdjustments, setShowExpectedAdjustments] = useState(false);

  const form = useForm<FormValues>({
    defaultValues: {
      customer_id: "",
      customer_qbo_id: "",
      customer_name: "",
      customer_wo_number: "",
      commodity: "",
      weight_lbs: 0,
      notes: "",
      linehaul_cents: 0,
      fuel_surcharge_cents: 0,
      accessorial_cents: 0,
      load_type: "broker",
      pieces: "",
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
      stops: [
        { stop_type: "pickup", sequence_number: 1, city: "", state: "", country: "USA", address_line1: "", scheduled_arrival_at: "", time_window_type: "appointment" },
        { stop_type: "delivery", sequence_number: 2, city: "", state: "", country: "USA", address_line1: "", scheduled_arrival_at: "", time_window_type: "appointment" },
      ],
    },
  });

  const { isDirty } = form.formState;

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
  const accessorial = form.watch("accessorial_cents");
  const customerQboId = form.watch("customer_qbo_id");
  const customerName = form.watch("customer_name");
  const loadType = form.watch("load_type");
  const driverPayRatePerMile = form.watch("driver_pay_rate_per_mile");
  const milesShortest = form.watch("miles_shortest");
  const milesPractical = form.watch("miles_practical");
  const milesDeadhead = form.watch("miles_deadhead");
  const reservedLoadNumber = form.watch("reserved_load_number");

  const sectionTotal = useMemo(() => (linehaul || 0) + (fuel || 0) + (accessorial || 0), [accessorial, fuel, linehaul]);
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
      { text: "Unit PM up-to-date · dispatch_eligible=true", source: "WF-044" },
      { text: "Driver CDL valid · no active debt", source: "WF-050 + WF-011" },
      { text: "Trailer inspection status passed", source: "WF-044" },
      { text: "Customer quality profile verified", source: "customers.quality" },
      { text: "PM due soon advisory", source: "WF-044 advisory", advisory: true },
    ],
    []
  );
  const passCount = useMemo(() => validationIssues.filter((issue) => !issue.advisory).length, [validationIssues]);
  const saveActions = useMemo(
    () => [
      "Insert load in dispatch.loads with assigned_not_dispatched status",
      "Auto-create driver bill from current shortest miles and pay rate",
      "Queue QBO outbox for customer invoice + driver bill vendor entry",
      "Create dispatch.load.created audit event",
      "Send driver assignment message",
      "Push driver instructions to mobile + dispatch sheet",
      "Flag expected adjustments in accounting invoice review",
    ],
    []
  );
  const billNumberPreview = useMemo(() => {
    const reserved = reservedLoadNumber || "";
    if (!reserved) return "B-—";
    return reserved.startsWith("L-") ? reserved.replace(/^L-/, "B-") : `B-${reserved}`;
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
    setShowDriverInstructions(false);
    setShowExpectedAdjustments(false);
  }, [open, form]);

  async function submitLoad(values: FormValues, saveMode: "book_dispatch" | "draft", opts?: { override?: boolean }) {
    setGateBanner(null);
    setSubmitErrorMessage(null);
    if (values.assignment_mode === "team" && !values.team_id.trim()) {
      pushToast("Team mode requires a team ID", "error");
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
        commodity: values.commodity || undefined,
        weight_lbs: values.weight_lbs || undefined,
        hazmat: values.hazmat,
        driver_instructions_text: values.driver_instructions_text || undefined,
        notes: values.notes || undefined,
        booking_mode: values.booking_mode,
        requires_tarps: values.requires_tarps,
        tarp_type: values.tarp_type || undefined,
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
        trailer_type: values.trailer_type as
          | "refrigerated_van"
          | "dry_van"
          | "flatbed"
          | "power_only_no_trailer"
          | "power_only_customer_trailer",
        assigned_unit_id: values.assigned_unit_id || undefined,
        team_id: values.assignment_mode === "team" ? values.team_id || undefined : undefined,
        assigned_primary_driver_id: values.assignment_mode === "solo" ? values.assigned_primary_driver_id || undefined : undefined,
        assigned_secondary_driver_id: values.assignment_mode === "solo" ? values.assigned_secondary_driver_id || undefined : undefined,
        temp_fahrenheit: values.temp_fahrenheit || undefined,
        charges:
          saveMode === "draft"
            ? []
            : [
                { code: "linehaul", amount_cents: Number(values.linehaul_cents || 0) },
                { code: "fuel_surcharge", amount_cents: Number(values.fuel_surcharge_cents || 0) },
                { code: "accessorial", amount_cents: Number(values.accessorial_cents || 0) },
              ],
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
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-4 py-6"
      style={{ background: "rgba(15, 19, 32, 0.6)" }}
      onMouseDown={attemptBookLoadClose}
    >
      <div
        ref={panelRef}
        className="flex max-h-[min(95vh,calc(100dvh-2rem))] w-full max-w-[min(1260px,calc(100vw-2rem))] flex-col overflow-hidden rounded-md border border-gray-200 bg-white shadow-2xl"
        style={{ width: "100%" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="flex flex-shrink-0 items-center gap-4 border-b px-4 py-2.5 text-white" style={{ background: "#1A1F36" }}>
          <div>
            <div className="text-[10px]" style={{ color: "#A8B0C7" }}>
              Dispatch › Book load
            </div>
            <div className="text-sm font-semibold">Book load</div>
          </div>
          <div className="ml-auto text-[10px]" style={{ color: "#A8B0C7" }}>
            {headerTime}
          </div>
          <button type="button" className="text-[11px] text-gray-300 hover:text-white" onClick={attemptBookLoadClose}>
            ✕
          </button>
        </header>

        <LiveLoadIdBar operatingCompanyId={operatingCompanyId} onReservationUpdate={onReservationUpdate} />

        <form
          className="flex flex-1 flex-col overflow-y-auto"
          onSubmit={form.handleSubmit(async (values) => {
            await submitLoad(values, "book_dispatch");
          })}
        >
          {submitErrorMessage ? (
            <div className="mx-3 mt-2 rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-900">{submitErrorMessage}</div>
          ) : null}

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

          <div className="grid grid-cols-1 border-t border-gray-200 lg:grid-cols-2">
            <section className="border-b border-r-0 border-gray-200 bg-white lg:border-r">
              <div className="flex h-[26px] items-center border-b border-gray-200 bg-[#F1EFE8] px-3 text-[10px] font-semibold tracking-[0.3px] text-[#1A1F36]">
                <span className="rounded bg-[#1A1F36] px-1.5 py-0.5 text-[9px] font-semibold text-white">A</span>
                <span className="ml-2">Customer · Invoice · Charges</span>
                <span className="ml-auto text-[10px] font-medium text-gray-600">
                  Section total: <strong>{money.format(sectionTotal / 100)}</strong>
                </span>
              </div>
              <div className="space-y-2 p-3">
                <OcrDropZone operatingCompanyId={operatingCompanyId} onUploaded={(key) => form.setValue("ocr_source_pdf_r2_key", key, { shouldDirty: true })} />
                <LoadTemplatePicker
                  operatingCompanyId={operatingCompanyId}
                  onSelectTemplate={(row) => {
                    applyLoadTemplateToBookForm(form.setValue as unknown as UseFormSetValue<MinimalBookForm>, row.template_json as Record<string, unknown>);
                    pushToast("Template applied", "success");
                  }}
                />

                <div className="grid grid-cols-1 gap-2 md:grid-cols-[2fr_1fr_1fr]">
                  <label className="text-[9px] font-semibold uppercase tracking-[0.4px] text-gray-600">
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
                    {form.formState.errors.customer_id?.message ? (
                      <span className="mt-0.5 block normal-case tracking-normal text-red-600">{form.formState.errors.customer_id.message}</span>
                    ) : null}
                  </label>
                  <label className="text-[9px] font-semibold uppercase tracking-[0.4px] text-gray-600">
                    Customer WO #
                    <input {...form.register("customer_wo_number")} className="mt-0.5 h-7 w-full rounded border border-gray-300 px-2 text-xs" />
                  </label>
                  <label className="text-[9px] font-semibold uppercase tracking-[0.4px] text-gray-600">
                    Pickup #
                    <input {...form.register("pickup_number")} className="mt-0.5 h-7 w-full rounded border border-gray-300 px-2 text-xs" />
                  </label>
                </div>

                <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
                  <label className="text-[9px] font-semibold uppercase tracking-[0.4px] text-gray-600">
                    Type
                    <div className="mt-0.5 inline-flex h-7 overflow-hidden rounded border border-gray-300 bg-white text-[11px]">
                      <label className={`flex cursor-pointer items-center px-3 ${loadType === "broker" ? "bg-[#1A1F36] text-white" : "text-gray-700"}`}>
                        <input type="radio" value="broker" className="hidden" {...form.register("load_type")} />
                        Broker
                      </label>
                      <label className={`flex cursor-pointer items-center border-l border-gray-300 px-3 ${loadType === "direct" ? "bg-[#1A1F36] text-white" : "text-gray-700"}`}>
                        <input type="radio" value="direct" className="hidden" {...form.register("load_type")} />
                        Direct
                      </label>
                    </div>
                  </label>
                  <label className="text-[9px] font-semibold uppercase tracking-[0.4px] text-gray-600">
                    Commodity
                    <input {...form.register("commodity")} className="mt-0.5 h-7 w-full rounded border border-gray-300 px-2 text-xs" />
                  </label>
                  <label className="text-[9px] font-semibold uppercase tracking-[0.4px] text-gray-600">
                    Weight (lbs)
                    <input type="number" {...form.register("weight_lbs", { valueAsNumber: true })} className="mt-0.5 h-7 w-full rounded border border-gray-300 px-2 text-xs" />
                  </label>
                  <label className="text-[9px] font-semibold uppercase tracking-[0.4px] text-gray-600">
                    Pieces
                    <input {...form.register("pieces")} className="mt-0.5 h-7 w-full rounded border border-gray-300 px-2 text-xs" />
                  </label>
                </div>

                <div className="overflow-hidden rounded border border-gray-200">
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="bg-[#F8F8F4] text-[9px] uppercase tracking-[0.4px] text-gray-600">
                        <th className="px-2 py-1 text-left">Charge</th>
                        <th className="px-2 py-1 text-right">Amount</th>
                        <th className="px-2 py-1 text-right"></th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t border-gray-100">
                        <td className="px-2 py-1">Linehaul</td>
                        <td className="px-2 py-1 text-right">
                          <input type="number" min="0" step="1" {...form.register("linehaul_cents", { valueAsNumber: true })} className="h-7 w-28 rounded border border-gray-300 px-2 text-right text-xs" />
                        </td>
                        <td className="px-2 py-1 text-right"></td>
                      </tr>
                      <tr className="border-t border-gray-100">
                        <td className="px-2 py-1">Fuel surcharge</td>
                        <td className="px-2 py-1 text-right">
                          <input type="number" min="0" step="1" {...form.register("fuel_surcharge_cents", { valueAsNumber: true })} className="h-7 w-28 rounded border border-gray-300 px-2 text-right text-xs" />
                        </td>
                        <td className="px-2 py-1 text-right"></td>
                      </tr>
                      <tr className="border-t border-gray-100">
                        <td className="px-2 py-1">Accessorial</td>
                        <td className="px-2 py-1 text-right">
                          <input type="number" min="0" step="1" {...form.register("accessorial_cents", { valueAsNumber: true })} className="h-7 w-28 rounded border border-gray-300 px-2 text-right text-xs" />
                        </td>
                        <td className="px-2 py-1 text-right"></td>
                      </tr>
                      <tr>
                        <td colSpan={3} className="px-2 py-1.5 text-center">
                          <button type="button" className="text-xs font-semibold text-[#2563EB]">
                            + Add charge · detention · layover · accessorial
                          </button>
                        </td>
                      </tr>
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-gray-200 bg-[#F8F8F4]">
                        <td className="px-2 py-1.5 font-semibold">Total customer invoice</td>
                        <td className="px-2 py-1.5 text-right font-semibold">{money.format(sectionTotal / 100)}</td>
                        <td className="px-2 py-1.5"></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_1fr_2fr]">
                  <label className="text-[9px] font-semibold uppercase tracking-[0.4px] text-gray-600">
                    Cash advance
                    <input type="number" min="0" step="1" {...form.register("cash_advance_cents", { valueAsNumber: true })} className="mt-0.5 h-7 w-full rounded border border-gray-300 px-2 text-xs" />
                  </label>
                  <label className="text-[9px] font-semibold uppercase tracking-[0.4px] text-gray-600">
                    Fuel advance
                    <input type="number" min="0" step="1" {...form.register("fuel_advance_cents", { valueAsNumber: true })} className="mt-0.5 h-7 w-full rounded border border-gray-300 px-2 text-xs" />
                  </label>
                  <label className="text-[9px] font-semibold uppercase tracking-[0.4px] text-gray-600">
                    Factoring company
                    <input {...form.register("factoring_company_summary")} className="mt-0.5 h-7 w-full rounded border border-gray-300 px-2 text-xs" placeholder="Triumph · advances 87% · reserves 13%" />
                  </label>
                </div>

                <label className="flex items-center gap-2 text-[11px] text-gray-700">
                  <input type="checkbox" {...form.register("hazmat")} />
                  Hazmat
                </label>

                <div className="rounded border border-gray-200 bg-[#F8F8F4] p-2">
                  <button type="button" className="text-xs font-semibold text-gray-700" onClick={() => setShowSpecialNotes((openState) => !openState)}>
                    {showSpecialNotes ? "−" : "+"} Special notes
                  </button>
                  {showSpecialNotes ? (
                    <textarea {...form.register("notes")} rows={3} className="mt-2 w-full rounded border border-gray-300 px-2 py-1 text-xs" />
                  ) : null}
                </div>
              </div>
            </section>

            <section className="border-b border-gray-200 bg-white">
              <div className="flex h-[26px] items-center border-b border-gray-200 bg-[#F1EFE8] px-3 text-[10px] font-semibold tracking-[0.3px] text-[#1A1F36]">
                <span className="rounded bg-[#1A1F36] px-1.5 py-0.5 text-[9px] font-semibold text-white">B</span>
                <span className="ml-2">Equipment · Driver · Trailer</span>
                <span className="ml-auto text-[10px] font-medium text-gray-600">Class: <strong>auto</strong></span>
              </div>
              <div className="space-y-2 p-3">
                <BookLoadEquipmentSection register={form.register} watch={form.watch} operatingCompanyId={operatingCompanyId} />
                <div className="rounded border border-gray-200 bg-[#F8F8F4] p-2">
                  <button type="button" className="text-xs font-semibold text-gray-700" onClick={() => setShowDriverInstructions((openState) => !openState)}>
                    {showDriverInstructions ? "−" : "+"} Driver instructions
                  </button>
                  {showDriverInstructions ? <DriverInstructionsTextarea register={form.register as never} /> : null}
                </div>
                <div className="rounded border border-[#FCD34D] bg-[#FFF7E6] p-2">
                  <button type="button" className="text-xs font-semibold text-[#78350F]" onClick={() => setShowExpectedAdjustments((openState) => !openState)}>
                    {showExpectedAdjustments ? "−" : "+"} Expected adjustments
                  </button>
                  {showExpectedAdjustments ? <div className="mt-2"><ExpectedAdjustmentsCallout register={form.register as never} /></div> : null}
                </div>
              </div>
            </section>

            <section className="border-b border-gray-200 bg-white lg:col-span-2">
              <div className="flex h-[26px] items-center border-b border-gray-200 bg-[#F1EFE8] px-3 text-[10px] font-semibold tracking-[0.3px] text-[#1A1F36]">
                <span className="rounded bg-[#1A1F36] px-1.5 py-0.5 text-[9px] font-semibold text-white">C</span>
                <span className="ml-2">Stops · PC*MILER routing</span>
                <span className="ml-auto text-[10px] font-medium text-gray-600">{form.watch("stops").length} stops</span>
              </div>
              <div className="grid gap-3 p-3 md:grid-cols-2">
                <BookLoadStopsSection control={form.control as never} register={form.register as never} watch={form.watch as never} />
                <div className="space-y-2">
                  <MilesStrip practical={milesPractical} shortest={milesShortest} deadhead={milesDeadhead} ratePerMile={ratePerMile} />
                  <label className="text-[9px] font-semibold uppercase tracking-[0.4px] text-gray-600">
                    Border routing
                    <SelectCombobox {...form.register("border_routing")} className="mt-0.5 h-7 w-full rounded border border-gray-300 px-2 text-xs">
                      <option value="">No border crossing</option>
                      <option value="laredo">Routed via Laredo</option>
                      <option value="pharr">Routed via Pharr</option>
                    </SelectCombobox>
                  </label>
                </div>
              </div>
            </section>

            <section className="bg-white lg:col-span-2">
              <div className="flex h-[26px] items-center border-b border-gray-200 bg-[#F1EFE8] px-3 text-[10px] font-semibold tracking-[0.3px] text-[#1A1F36]">
                <span className="rounded bg-[#1A1F36] px-1.5 py-0.5 text-[9px] font-semibold text-white">D</span>
                <span className="ml-2">Pre-dispatch validation</span>
                <span className="ml-auto text-[10px] font-medium text-gray-600">{passCount} of {validationIssues.length} checks pass</span>
              </div>
              <div className="p-3">
                <BookLoadValidationSection issues={validationIssues} saveActions={saveActions} passCount={passCount} />
              </div>
            </section>
          </div>

          <div className="flex flex-shrink-0 items-center justify-between border-t border-gray-200 bg-[#F1EFE8] px-3 py-2">
            <div className="flex items-baseline gap-2 text-xs text-gray-600">
              <span className="text-[9px] font-semibold uppercase tracking-[0.4px]">Driver bill preview</span>
              <span className="rounded border border-gray-200 bg-white px-2 py-0.5 font-mono text-[11px] text-[#1557A0]">{billNumberPreview}</span>
              <span className="text-sm font-semibold text-[#1A1F36]">{money.format((driverBillPreview || 0) / 100)}</span>
              <span className="text-[10px] text-gray-500">
                {Number(milesShortest || 0).toLocaleString()} short mi × {(Number(driverPayRatePerMile || 0)).toFixed(2)}/mi
              </span>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={attemptBookLoadClose}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={form.handleSubmit(async (values) => {
                  await submitLoad(values, "draft");
                })}
              >
                Save draft
              </Button>
              <Button type="submit">Book + dispatch</Button>
            </div>
          </div>
          <div className="border-t border-gray-100 px-3 py-1 text-right text-[9px] text-gray-500">Esc closes · ⌘ S saves draft · ⌘ Enter books + dispatches</div>
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
