import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { createDispatchLoad } from "../../../api/dispatch";
import { ApiError } from "../../../api/client";
import { useAuth } from "../../../auth/useAuth";
import { Button } from "../../../components/Button";
import { Modal } from "../../../components/Modal";
import { useToast } from "../../../components/Toast";
import { BookLoadCustomerSection, type BookLoadFormValues } from "./BookLoadCustomerSection";
import { BookLoadEquipmentSection } from "./BookLoadEquipmentSection";
import { BookLoadStopsSection } from "./BookLoadStopsSection";
import { BookLoadValidationSection } from "./BookLoadValidationSection";

type FormValues = BookLoadFormValues & {
  trailer_type: string;
  assigned_unit_id: string;
  assigned_primary_driver_id: string;
  assigned_secondary_driver_id: string;
  temp_fahrenheit: number;
  stops: Array<{
    stop_type: "pickup" | "delivery";
    sequence_number: number;
    city: string;
    state: string;
    country: string;
    address_line1: string;
    scheduled_arrival_at: string;
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
      assigned_primary_driver_id: "",
      assigned_secondary_driver_id: "",
      temp_fahrenheit: 0,
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

  async function submitLoad(values: FormValues, saveMode: "book_dispatch" | "draft", opts?: { override?: boolean }) {
    setGateBanner(null);
    setSubmitErrorMessage(null);
    const token = opts?.override ? overrideToken ?? crypto.randomUUID() : undefined;
    if (opts?.override && !overrideToken) setOverrideToken(token ?? null);
    try {
      const payload = await createDispatchLoad({
        operating_company_id: operatingCompanyId,
        customer_id: values.customer_id,
        customer_wo_number: values.customer_wo_number || undefined,
        commodity: values.commodity || undefined,
        weight_lbs: values.weight_lbs || undefined,
        notes: values.notes || undefined,
        trailer_type: values.trailer_type as
          | "refrigerated_van"
          | "dry_van"
          | "flatbed"
          | "power_only_no_trailer"
          | "power_only_customer_trailer",
        assigned_unit_id: values.assigned_unit_id || undefined,
        assigned_primary_driver_id: values.assigned_primary_driver_id || undefined,
        assigned_secondary_driver_id: values.assigned_secondary_driver_id || undefined,
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

        <BookLoadCustomerSection register={form.register} />
        <BookLoadEquipmentSection register={form.register} />
        <BookLoadStopsSection control={form.control as never} register={form.register as never} />
        <BookLoadValidationSection issues={validationIssues} />

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
