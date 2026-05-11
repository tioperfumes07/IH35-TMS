import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { createDispatchLoad, reserveDispatchLoadId } from "../../../api/dispatch";
import { ApiError } from "../../../api/client";
import { useAuth } from "../../../auth/useAuth";
import { Button } from "../../../components/Button";
import { Modal } from "../../../components/Modal";
import { useToast } from "../../../components/Toast";
import { UploadZone } from "../../../components/UploadZone";
import { BookLoadCustomerSection, type BookLoadFormValues } from "./BookLoadCustomerSection";
import { BookLoadEquipmentSection } from "./BookLoadEquipmentSection";
import { BookLoadStopsSection } from "./BookLoadStopsSection";
import { BookLoadValidationSection } from "./BookLoadValidationSection";
import { BookLoadV3OptionsSection } from "./book-load-v3/BookLoadV3OptionsSection";

type FormValues = BookLoadFormValues & {
  trailer_type: string;
  assigned_unit_id: string;
  assignment_mode: "solo" | "team";
  team_id: string;
  assigned_primary_driver_id: string;
  assigned_secondary_driver_id: string;
  temp_fahrenheit: number;
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
  stops: Array<{
    stop_type: "pickup" | "delivery";
    sequence_number: number;
    city: string;
    state: string;
    country: string;
    address_line1: string;
    scheduled_arrival_at: string;
    time_window_type?: "appointment" | "first_come_first_serve" | "drop_window";
    appointment_start_at?: string;
    appointment_end_at?: string;
    lumper_required?: boolean;
    lumper_paid_by?: "carrier" | "shipper" | "broker" | "receiver" | "unknown";
    lumper_amount_cents?: number;
    is_tarp_stop?: boolean;
    tarp_count?: number;
    stop_notes?: string;
  }>;
};

type Props = {
  open: boolean;
  operatingCompanyId: string;
  onClose: () => void;
  onCreated: () => void;
};

export function BookLoadModal({ open, operatingCompanyId, onClose, onCreated }: Props) {
  const auth = useAuth();
  const { pushToast } = useToast();
  const [gateBanner, setGateBanner] = useState<{
    type: "advisory" | "hard_block" | "hos_block";
    message: string;
    warnings?: Array<Record<string, unknown>>;
  } | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideToken, setOverrideToken] = useState<string | null>(null);
  const [pendingCloseAfterAdvisory, setPendingCloseAfterAdvisory] = useState(false);
  const [submitErrorMessage, setSubmitErrorMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"customer" | "equipment" | "stops" | "v3">("customer");
  const [draftAttachmentEntityId, setDraftAttachmentEntityId] = useState(() => crypto.randomUUID());
  const form = useForm<FormValues>({
    defaultValues: {
      customer_id: "",
      customer_wo_number: "",
      commodity: "",
      weight_lbs: 0,
      notes: "",
      linehaul_cents: 0,
      fuel_surcharge_cents: 0,
      accessorial_cents: 0,
      trailer_type: "dry_van",
      assigned_unit_id: "",
      assignment_mode: "solo",
      team_id: "",
      assigned_primary_driver_id: "",
      assigned_secondary_driver_id: "",
      temp_fahrenheit: 0,
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
      stops: [
        { stop_type: "pickup", sequence_number: 1, city: "", state: "", country: "USA", address_line1: "", scheduled_arrival_at: "" },
        { stop_type: "delivery", sequence_number: 2, city: "", state: "", country: "USA", address_line1: "", scheduled_arrival_at: "" },
      ],
    },
  });

  const linehaul = form.watch("linehaul_cents");
  const fuel = form.watch("fuel_surcharge_cents");
  const accessorial = form.watch("accessorial_cents");
  const driverBillPreview = useMemo(() => (linehaul || 0) + (fuel || 0) + (accessorial || 0), [accessorial, fuel, linehaul]);
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

  const validationIssues = [
    "Unit PM up-to-date check (Phase 3 stub)",
    "Driver debt check (Phase 3 stub)",
    "Trailer inspection check (Phase 3 stub)",
    "Customer quality flag warning (Phase 3 stub)",
    "FMCSA broker authority cache check (Phase 3 stub)",
  ];

  const canOverrideHardBlock = auth.user?.role === "Owner";
  const canOverrideHos = ["Owner", "Administrator", "Manager"].includes(String(auth.user?.role ?? ""));

  useEffect(() => {
    if (!open) return;
    setDraftAttachmentEntityId(crypto.randomUUID());
    void reserveDispatchLoadId(operatingCompanyId)
      .then((reservation) => {
        form.setValue("reservation_uuid", reservation.reservation_uuid, { shouldDirty: false });
        form.setValue("reserved_load_number", reservation.load_number, { shouldDirty: false });
      })
      .catch(() => {
        form.setValue("reservation_uuid", "", { shouldDirty: false });
        form.setValue("reserved_load_number", "", { shouldDirty: false });
      });
  }, [form, open, operatingCompanyId]);

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

  return (
    <Modal open={open} onClose={onClose} title="Book Load">
      <form
        className="space-y-3"
        onSubmit={form.handleSubmit(async (values) => {
          await submitLoad(values, "book_dispatch");
        })}
      >
        {submitErrorMessage ? (
          <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-900">{submitErrorMessage}</div>
        ) : null}
        <div className="rounded border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
          Live load number: <span className="font-semibold">{form.watch("reserved_load_number") || "Reserving..."}</span>
        </div>
        {gateBanner ? (
          <div
            className={`rounded border px-3 py-2 text-xs ${
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
                    onClose();
                  }}
                >
                  Continue
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex gap-2 rounded border border-gray-200 bg-gray-50 p-1 text-xs">
          {[
            { id: "customer", label: "Customer" },
            { id: "equipment", label: "Equipment" },
            { id: "stops", label: "Stops" },
            { id: "v3", label: "V3 Options" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`rounded px-2 py-1 ${activeTab === tab.id ? "bg-white font-semibold text-gray-900" : "text-gray-600"}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "customer" ? <BookLoadCustomerSection register={form.register} /> : null}
        {activeTab === "equipment" ? <BookLoadEquipmentSection register={form.register} /> : null}
        {activeTab === "stops" ? <BookLoadStopsSection control={form.control as never} register={form.register as never} /> : null}
        {activeTab === "v3" ? <BookLoadV3OptionsSection register={form.register as never} /> : null}
        <div className="rounded border border-gray-200 bg-gray-50 p-2">
          <label
            className="flex cursor-not-allowed items-center gap-2 text-xs font-semibold text-gray-600"
            title="Pending: presettlement linkage will activate when the lookup service ships in a follow-up block. Load will book normally without auto-linking."
          >
            <input type="checkbox" disabled />
            Add to open presettlement (pending follow-up)
          </label>
        </div>
        <BookLoadValidationSection issues={validationIssues} />
        <UploadZone
          operatingCompanyId={operatingCompanyId}
          entityType="manual"
          entityId={draftAttachmentEntityId}
          defaultCategory="rate_confirmation"
          title="Rate Confirmations / Load Documents"
          onOcrParsed={(parsed) => {
            if (parsed.customer_id) form.setValue("customer_id", parsed.customer_id, { shouldDirty: true });
            if (parsed.rate_cents > 0) form.setValue("linehaul_cents", parsed.rate_cents, { shouldDirty: true });
            const currentStops = form.getValues("stops");
            if (currentStops[0]) {
              form.setValue("stops.0.city", parsed.origin_city, { shouldDirty: true });
              form.setValue("stops.0.state", parsed.origin_state, { shouldDirty: true });
            }
            if (currentStops[1]) {
              form.setValue("stops.1.city", parsed.destination_city, { shouldDirty: true });
              form.setValue("stops.1.state", parsed.destination_state, { shouldDirty: true });
            }
            pushToast(
              `Rate confirmation parsed (${Math.round(parsed.confidence_score * 100)}% confidence)`,
              parsed.confidence_score >= 0.7 ? "success" : "info"
            );
          }}
        />

        <div className="flex items-center justify-between rounded border border-gray-200 bg-white px-3 py-2">
          <div className="text-xs text-gray-600">
            Driver bill preview: <span className="font-semibold">{money.format((driverBillPreview || 0) / 100)}</span>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button
              type="button"
              variant="secondary"
              onClick={form.handleSubmit(async (values) => {
                await submitLoad(values, "draft");
              })}
            >
              Save Draft
            </Button>
            <Button type="submit">Book + Dispatch</Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
