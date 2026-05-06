import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { createDispatchLoad } from "../../../api/dispatch";
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
  const { pushToast } = useToast();
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

  const validationIssues = [
    "Unit PM up-to-date check (Phase 3 stub)",
    "Driver debt check (Phase 3 stub)",
    "Trailer inspection check (Phase 3 stub)",
    "Customer quality flag warning (Phase 3 stub)",
    "FMCSA broker authority cache check (Phase 3 stub)",
  ];

  return (
    <Modal open={open} onClose={onClose} title="Book Load">
      <form
        className="space-y-3"
        onSubmit={form.handleSubmit(async (values) => {
          try {
            await createDispatchLoad({
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
              charges: [
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
              save_mode: "book_dispatch",
            });
            pushToast("Load booked and dispatched", "success");
            onCreated();
            onClose();
          } catch {
            pushToast("Failed to book load", "error");
          }
        })}
      >
        <BookLoadCustomerSection register={form.register} />
        <BookLoadEquipmentSection register={form.register} />
        <BookLoadStopsSection control={form.control as never} register={form.register as never} />
        <BookLoadValidationSection issues={validationIssues} />

        <div className="flex items-center justify-between rounded border border-gray-200 bg-white px-3 py-2">
          <div className="text-xs text-gray-600">Driver bill preview: <span className="font-semibold">${(driverBillPreview / 100).toFixed(2)}</span></div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button
              type="button"
              variant="secondary"
              onClick={form.handleSubmit(async (values) => {
                try {
                  await createDispatchLoad({
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
                    charges: [],
                    stops: values.stops.map((stop, index) => ({
                      stop_type: stop.stop_type,
                      sequence_number: index + 1,
                      city: stop.city,
                      state: stop.state,
                      country: stop.country,
                      address_line1: stop.address_line1,
                      scheduled_arrival_at: stop.scheduled_arrival_at ? new Date(stop.scheduled_arrival_at).toISOString() : undefined,
                    })),
                    save_mode: "draft",
                  });
                  pushToast("Draft saved", "success");
                  onCreated();
                  onClose();
                } catch {
                  pushToast("Failed to save draft", "error");
                }
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
