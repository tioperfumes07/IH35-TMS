import type { JSX } from "react";
import { useFieldArray, Controller, type Control, type UseFormRegister, type UseFormSetValue } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { ReferenceSelect } from "../../../components/parity/ReferenceSelect";
import { StateSelect } from "../../../components/forms/StateSelect";
import { DatePicker } from "../../../components/forms/DatePicker";
import { MoneyInput } from "../../../components/forms/MoneyInput";
import { TimePicker } from "../../../components/forms/TimePicker";
import { AddressGeocodeInput } from "../../../components/dispatch/AddressGeocodeInput";
import { geocodeSearch } from "../../../api/geocoding";
import { stopGeocodePatches } from "./book-load-stop-geocode";
import { stopLocationPatches, stopLocationClearPatch } from "./book-load-stop-location-patches";
import { LocationPicker } from "./book-load-v4/LocationPicker";
import { TimeWindowDropdown } from "./book-load-v4/TimeWindowDropdown";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";

type Props = {
  operatingCompanyId?: string;
  pickupTimeTypeOptions?: Array<{ value: string; label: string; type?: string }>;
  pickupTimeTypesLoading?: boolean;
  pickupTimeTypesUnavailable?: boolean;
  onPickupTimeTypesRetry?: () => void;
  onPickupTimeTypeCreated?: () => void;
  control: Control<any>;
  register: UseFormRegister<any>;
  setValue?: UseFormSetValue<any>;
};

const CELL = "h-7 w-full rounded-sm border border-gray-300 px-2 text-xs";
const CELL_NARROW = "h-7 w-full max-w-[7.5rem] rounded-sm border border-gray-300 px-2 text-xs";
const CELL_PHONE = "h-7 w-full max-w-[8.5rem] rounded-sm border border-gray-300 px-2 text-xs";
const CELL_DOCK = "h-7 w-full max-w-[6.5rem] rounded-sm border border-gray-300 px-2 text-xs";

// Owner row order 2026-09-03 (pickup AND delivery):
//   Row 1: Location · Address (wider) · City · State · Zip
//   Row 2: Appointment date/time · Site contact · Site phone (smaller) · Dock (smaller)
//   Row 3: Time window (smaller) · Pickup type (pickup only) · Free time / lumper · Lumper amount
export function BookLoadStopsSection({
  operatingCompanyId = "",
  pickupTimeTypeOptions = [],
  pickupTimeTypesLoading = false,
  pickupTimeTypesUnavailable = false,
  onPickupTimeTypesRetry,
  onPickupTimeTypeCreated,
  control,
  register,
  setValue,
}: Props) {
  const { fields, append, remove } = useFieldArray({ control, name: "stops" });
  const currentStops =
    ((control as unknown as { _formValues?: { stops?: Array<Record<string, unknown>> } })._formValues?.stops ?? []) as Array<
      Record<string, unknown>
    >;

  // GO-24 dead-geocode gate: AddressGeocodeInput gates ITSELF on the local PCMILER_ENABLED feature
  // flag, but the flag being ON does not mean the provider actually IS — the backend also requires
  // TRIMBLE_MAPS_API_KEY configured (isTrimbleConfigured()) and returns {enabled:false} either way.
  const geocodeProbeQuery = useQuery({
    queryKey: ["book-load-geocode-probe"],
    queryFn: () => geocodeSearch("x"),
    staleTime: 10 * 60 * 1000,
    retry: false,
  });
  const geocodeReallyEnabled = Boolean((geocodeProbeQuery.data as { enabled?: boolean } | undefined)?.enabled);

  function newStop(stopType: "pickup" | "delivery", seq: number) {
    return {
      stop_type: stopType,
      sequence_number: seq,
      location_id: "",
      city: "",
      state: "",
      country: "USA",
      address_full: "",
      address_line1: "",
      postal_code: "",
      latitude: "",
      longitude: "",
      scheduled_arrival_at: "",
      time_window_type: "appointment",
      pickup_time_type_id: "",
      appointment_start_at: "",
      appointment_end_at: "",
      free_time_summary: "",
      lumper_required: false,
      lumper_paid_by: "unknown",
      lumper_amount_cents: 0,
      stop_notes: "",
      is_tarp_stop: false,
      tarp_count: 0,
      site_contact_name: "",
      site_contact_phone: "",
      gate_dock_text: "",
      extra_rates: [],
    };
  }

  return (
    <section className="space-y-2">
      {pickupTimeTypesUnavailable ? (
        <ListErrorBanner message="Could not load pickup and appointment types." onRetry={onPickupTimeTypesRetry} />
      ) : null}
      <div className="space-y-2">
        {fields.map((field, index) => {
          const isPickup = String(currentStops[index]?.stop_type ?? (index % 2 === 0 ? "pickup" : "delivery")) === "pickup";
          return (
            <div key={field.id} data-testid={`stop-card-${index}`} className="min-w-0 overflow-hidden rounded-sm border border-gray-200 bg-white">
              <div className={`flex items-center gap-2 px-2 py-1 text-[11px] font-bold tracking-[0.03em] ${isPickup ? "bg-[#1F2A44] text-white" : "bg-slate-200 text-slate-800"}`}>
                <span className={`rounded-sm px-1.5 py-0.5 text-[11px] font-semibold uppercase ${isPickup ? "bg-white/20 text-white" : "bg-slate-600 text-white"}`}>
                  {isPickup ? "PICKUP" : "DELIVERY"}
                </span>
                <span>Stop {index + 1}</span>
                <span className={`ml-auto truncate font-medium ${isPickup ? "text-white/80" : "text-slate-600"}`}>
                  {`${currentStops[index]?.address_full || currentStops[index]?.address_line1 || (isPickup ? "first stop is always a pickup" : "auto-added because a pickup exists")}`}
                </span>
                {index >= 2 ? (
                  <button type="button" className={`text-xs font-semibold ${isPickup ? "text-white" : "text-[#dc2626]"}`} onClick={() => remove(index)}>
                    Remove
                  </button>
                ) : null}
              </div>

              <div className="min-w-0 space-y-2 p-2">
                <input type="hidden" {...register(`stops.${index}.stop_type`)} />
                <input type="hidden" {...register(`stops.${index}.country`)} />

                {/* Row 1 — address details */}
                <div
                  data-testid={`stop-locrow-${index}`}
                  className="grid min-w-0 grid-cols-1 items-end gap-2 sm:grid-cols-2"
                >
                  <Field
                    label="Location"
                    input={
                      <Controller
                        control={control}
                        name={`stops.${index}.location_id`}
                        render={({ field: f }) => (
                          <LocationPicker
                            operatingCompanyId={operatingCompanyId}
                            value={f.value || null}
                            onChange={(locationId, location) => {
                              f.onChange(locationId ?? "");
                              if (locationId && location) {
                                for (const patch of stopLocationPatches(index, location)) {
                                  setValue?.(patch.field, patch.value, { shouldDirty: true });
                                }
                              } else {
                                const clear = stopLocationClearPatch(index);
                                setValue?.(clear.field, clear.value, { shouldDirty: true });
                              }
                            }}
                            dataTestId={`stop-location-picker-${index}`}
                          />
                        )}
                      />
                    }
                  />
                  <Field
                    label="Address"
                    input={
                      <Controller
                        control={control}
                        name={`stops.${index}.address_full`}
                        render={({ field: f }) =>
                          geocodeReallyEnabled ? (
                            <AddressGeocodeInput
                              value={f.value ?? ""}
                              onChange={(v) => {
                                f.onChange(v);
                                setValue?.(`stops.${index}.address_line1`, v, { shouldDirty: true });
                              }}
                              onResolve={(r) => {
                                for (const patch of stopGeocodePatches(index, r)) {
                                  setValue?.(patch.field, patch.value, { shouldDirty: true });
                                }
                              }}
                              placeholder="123 Main St"
                              className={CELL}
                              dataAttrs={{ "data-stop-address-oneline": "true" }}
                            />
                          ) : (
                            <input
                              value={f.value ?? ""}
                              onChange={(e) => {
                                f.onChange(e.target.value);
                                setValue?.(`stops.${index}.address_line1`, e.target.value, { shouldDirty: true });
                              }}
                              placeholder="123 Main St"
                              className={CELL}
                              autoComplete="off"
                              data-stop-address-oneline="true"
                            />
                          )
                        }
                      />
                    }
                  />
                </div>
                <div className="grid min-w-0 grid-cols-1 items-end gap-2 sm:grid-cols-3" data-testid={`stop-cityrow-${index}`}>
                  <Field
                    label="City"
                    input={
                      <input
                        {...register(`stops.${index}.city`, { required: "City is required" })}
                        className={CELL}
                        aria-required="true"
                      />
                    }
                  />
                  <Field
                    label="State"
                    input={
                      <Controller
                        control={control}
                        name={`stops.${index}.state`}
                        render={({ field: f }) => <StateSelect value={f.value ?? ""} onChange={f.onChange} placeholder="State" />}
                      />
                    }
                  />
                  <Field label="Zip" input={<input {...register(`stops.${index}.postal_code`)} className={CELL} placeholder="ZIP" />} />
                </div>
                <input type="hidden" {...register(`stops.${index}.latitude`)} />
                <input type="hidden" {...register(`stops.${index}.longitude`)} />

                {/* Row 2 — appointment + site */}
                <div
                  data-testid={`stop-siterow-${index}`}
                  className="grid min-w-0 grid-cols-1 items-end gap-2 sm:grid-cols-2 lg:grid-cols-3"
                >
                  <Controller
                    control={control}
                    name={`stops.${index}.scheduled_arrival_at`}
                    render={({ field: f }) => {
                      const v = typeof f.value === "string" ? f.value : "";
                      const d = v.slice(0, 10);
                      const t = v.slice(11, 16);
                      const combine = (nd: string, nt: string) => f.onChange(nd ? `${nd}T${nt || "00:00"}` : "");
                      return (
                        <>
                          <Field label="Appointment date" input={<DatePicker data-testid={`stop-date-${index}`} value={d} onChange={(next) => combine(next, t)} className={CELL} />} />
                          <Field label="Time" input={<TimePicker id={`stop-time-${index}`} value={t} onChange={(tv) => combine(d, tv)} className={CELL} ariaLabel="Stop time" />} />
                        </>
                      );
                    }}
                  />
                  <Field label="Site contact" input={<input {...register(`stops.${index}.site_contact_name`)} className={CELL} />} />
                  <Field label="Site phone" input={<input {...register(`stops.${index}.site_contact_phone`)} className={CELL_PHONE} />} />
                  <Field label="Dock" input={<input {...register(`stops.${index}.gate_dock_text`)} className={CELL_DOCK} />} />
                </div>

                {/* Row 3 — time window (smaller) + remaining stop economics */}
                <div data-testid={`stop-timewindow-${index}`} className="grid min-w-0 grid-cols-1 items-end gap-2 sm:grid-cols-2">
                  <Field
                    label="Time window"
                    input={<TimeWindowDropdown register={register} name={`stops.${index}.time_window_type`} />}
                  />
                  {isPickup ? (
                    <Controller
                      control={control}
                      name={`stops.${index}.pickup_time_type_id`}
                      render={({ field: pickupField }) => (
                        <Field
                          label="Pickup type"
                          input={(
                            <ReferenceSelect
                              size="sm"
                              value={pickupField.value || null}
                              onChange={(value) => pickupField.onChange(value ?? "")}
                              options={pickupTimeTypeOptions}
                              createKind="pickup_time_type"
                              operatingCompanyId={operatingCompanyId}
                              placeholder="Select pickup type"
                              loading={pickupTimeTypesLoading}
                              disabled={pickupTimeTypesLoading || pickupTimeTypesUnavailable}
                              onOptionCreated={onPickupTimeTypeCreated}
                            />
                          )}
                        />
                      )}
                    />
                  ) : (
                    <div />
                  )}
                  <Field label="Free time / lumper" input={<input {...register(`stops.${index}.free_time_summary`)} className={CELL_NARROW} placeholder="120 min" />} />
                  <Field
                    label="Lumper amount ($)"
                    input={
                      <Controller
                        control={control}
                        name={`stops.${index}.lumper_amount_cents`}
                        render={({ field: f }) => (
                          <MoneyInput
                            valueCents={f.value || null}
                            onChangeCents={(c) => f.onChange(c ?? 0)}
                            ariaLabel="Lumper amount"
                            className="w-full max-w-[7.5rem]"
                          />
                        )}
                      />
                    }
                  />
                </div>

                <input type="hidden" {...register(`stops.${index}.appointment_start_at`, { setValueAs: (v) => (v === "" || v == null ? undefined : v) })} />
                <input type="hidden" {...register(`stops.${index}.appointment_end_at`, { setValueAs: (v) => (v === "" || v == null ? undefined : v) })} />
                <input type="hidden" {...register(`stops.${index}.is_tarp_stop`, { setValueAs: (v) => v === true || v === "true" })} />
                <input type="hidden" {...register(`stops.${index}.tarp_count`, { setValueAs: (v) => (v === "" || v == null ? undefined : Number(v)) })} />
                <input type="hidden" {...register(`stops.${index}.stop_notes`)} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3">
        <button type="button" className="text-xs font-semibold text-[#1f2a44] hover:underline" onClick={() => append(newStop("pickup", fields.length + 1))}>
          + Create pickup
        </button>
        <button type="button" className="text-xs font-semibold text-[#1f2a44] hover:underline" onClick={() => append(newStop("delivery", fields.length + 1))}>
          + Create delivery
        </button>
        <button
          type="button"
          className="text-xs font-semibold text-[#1f2a44] hover:underline"
          onClick={() => append(newStop(fields.length % 2 === 0 ? "pickup" : "delivery", fields.length + 1))}
        >
          + Create stop · multi-leg
        </button>
      </div>
    </section>
  );
}

function Field({ label, input }: { label: string; input: JSX.Element }) {
  return (
    <div className="min-w-0 w-full space-y-0.5">
      <label className="block whitespace-nowrap text-[11px] font-bold uppercase tracking-[0.4px] text-[#4B5563]">{label}</label>
      {input}
    </div>
  );
}
