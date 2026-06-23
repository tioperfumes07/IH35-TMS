import { useFieldArray, Controller, type Control, type UseFormRegister, type UseFormSetValue } from "react-hook-form";
import { StateSelect } from "../../../components/forms/StateSelect";
import { AddressGeocodeInput } from "../../../components/dispatch/AddressGeocodeInput";

type Props = {
  control: Control<any>;
  register: UseFormRegister<any>;
  setValue?: UseFormSetValue<any>;
};

const CELL = "h-7 w-full rounded border border-gray-300 px-2 text-xs";

// render-v6 §C — each stop is a card with TWO rows (NOT a vertical stack):
//   Row 1 (.locrow): Address | City | St | Zip Code | Date | Time
//   Row 2 (.siterow): Site contact | Site phone | Dock | Free time / lumper | Lumper amount ($)
// then a collapsible "Customer instructions". Stop 1 = PICKUP (auto), Stop 2 = DELIVERY (auto).
// Built field-for-field + row-for-row to load-wizard-render-v6.html (GUARD render-truth spec).
export function BookLoadStopsSection({ control, register, setValue }: Props) {
  const { fields, append, remove } = useFieldArray({ control, name: "stops" });
  const currentStops =
    ((control as unknown as { _formValues?: { stops?: Array<Record<string, unknown>> } })._formValues?.stops ?? []) as Array<
      Record<string, unknown>
    >;

  function newStop(stopType: "pickup" | "delivery", seq: number) {
    return {
      stop_type: stopType,
      sequence_number: seq,
      city: "",
      state: "",
      country: "USA",
      address_full: "",
      address_line1: "",
      postal_code: "",
      scheduled_arrival_at: "",
      time_window_type: "appointment",
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
      <div className="space-y-2">
        {fields.map((field, index) => {
          const isPickup = String(currentStops[index]?.stop_type ?? (index % 2 === 0 ? "pickup" : "delivery")) === "pickup";
          return (
            <div key={field.id} data-testid={`stop-card-${index}`} className="overflow-hidden rounded border border-gray-200 bg-white">
              {/* render-v6 .stop header bar + tag. §7 recolors v6 blue/green → navy/slate. */}
              <div className={`flex items-center gap-2 px-2 py-1 text-[10.5px] font-bold tracking-[0.03em] ${isPickup ? "bg-[#1F2A44] text-white" : "bg-slate-200 text-slate-800"}`}>
                <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase ${isPickup ? "bg-white/20 text-white" : "bg-slate-600 text-white"}`}>
                  {isPickup ? "PICKUP" : "DELIVERY"}
                </span>
                <span>Stop {index + 1}</span>
                <span className={`ml-auto truncate font-medium ${isPickup ? "text-white/80" : "text-slate-600"}`}>
                  {`${currentStops[index]?.address_full || currentStops[index]?.address_line1 || (isPickup ? "first stop is always a pickup" : "auto-added because a pickup exists")}`}
                </span>
                {index >= 2 ? (
                  <button type="button" className={`text-[10px] font-semibold ${isPickup ? "text-white" : "text-[#A32D2D]"}`} onClick={() => remove(index)}>
                    Remove
                  </button>
                ) : null}
              </div>

              <div className="space-y-2 p-2">
                {/* keep Type + Country round-tripping without showing them as stray fields (design omits them). */}
                <input type="hidden" {...register(`stops.${index}.stop_type`)} />
                <input type="hidden" {...register(`stops.${index}.country`)} />

                {/* Row 1 — .locrow */}
                <div data-testid={`stop-locrow-${index}`} className="grid grid-cols-1 gap-2 md:grid-cols-6">
                  <Field
                    label="Address"
                    input={
                      <Controller
                        control={control}
                        name={`stops.${index}.address_full`}
                        render={({ field: f }) => (
                          <AddressGeocodeInput
                            value={f.value ?? ""}
                            onChange={f.onChange}
                            onResolve={(r) => {
                              if (r.address_line1) setValue?.(`stops.${index}.address_line1`, r.address_line1, { shouldDirty: true });
                              if (r.city) setValue?.(`stops.${index}.city`, r.city, { shouldDirty: true });
                              if (r.state) setValue?.(`stops.${index}.state`, r.state, { shouldDirty: true });
                              if (r.country) setValue?.(`stops.${index}.country`, r.country, { shouldDirty: true });
                            }}
                            placeholder="123 Main St"
                            className={CELL}
                            dataAttrs={{ "data-stop-address-oneline": "true" }}
                          />
                        )}
                      />
                    }
                  />
                  <Field label="City" input={<input {...register(`stops.${index}.city`)} className={CELL} />} />
                  <Field
                    label="St"
                    input={
                      <Controller
                        control={control}
                        name={`stops.${index}.state`}
                        render={({ field: f }) => <StateSelect value={f.value ?? ""} onChange={f.onChange} placeholder="State" />}
                      />
                    }
                  />
                  <Field label="Zip Code" input={<input {...register(`stops.${index}.postal_code`)} className={CELL} placeholder="ZIP" />} />
                  {/* Date + Time both write the single scheduled_arrival_at (datetime). */}
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
                          <Field label="Date" input={<input type="date" data-testid={`stop-date-${index}`} value={d} onChange={(e) => combine(e.target.value, t)} className={CELL} />} />
                          <Field label="Time" input={<input type="time" data-testid={`stop-time-${index}`} value={t} onChange={(e) => combine(d, e.target.value)} className={CELL} />} />
                        </>
                      );
                    }}
                  />
                </div>

                {/* Row 2 — .siterow */}
                <div data-testid={`stop-siterow-${index}`} className="grid grid-cols-1 gap-2 md:grid-cols-5">
                  <Field label="Site contact" input={<input {...register(`stops.${index}.site_contact_name`)} className={CELL} />} />
                  <Field label="Site phone" input={<input {...register(`stops.${index}.site_contact_phone`)} className={CELL} />} />
                  <Field label="Dock" input={<input {...register(`stops.${index}.gate_dock_text`)} className={CELL} />} />
                  <Field label="Free time / lumper" input={<input {...register(`stops.${index}.free_time_summary`)} className={CELL} placeholder="120 min" />} />
                  <Field
                    label="Lumper amount ($)"
                    input={
                      <Controller
                        control={control}
                        name={`stops.${index}.lumper_amount_cents`}
                        render={({ field: f }) => (
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={f.value ? Number(f.value) / 100 : ""}
                            onChange={(e) => f.onChange(e.target.value === "" ? 0 : Math.round(Number(e.target.value) * 100))}
                            className={CELL}
                          />
                        )}
                      />
                    }
                  />
                </div>

                {/* render-v6 §C empty-diff (GUARD): the stop card renders EXACTLY the 11 locrow/siterow fields
                    above — nothing else. These columns are RELOCATED per Jorge, not deleted, so they round-trip
                    as hidden registered inputs (the full-stops-array UPDATE would null them otherwise):
                    appointment start/end → represented by Date+Time; Lumper paid by / required → §A by the
                    Lumper charge; tarp stop/count → §B Flatbed panel; instructions → optional, not a flat field. */}
                {/* Lumper paid by / required now render in §A (per-stop, by the Lumper charge) — their values
                    round-trip via the stop field-array item (default/prefill); no hidden §C input needed. */}
                <input type="hidden" {...register(`stops.${index}.appointment_start_at`)} />
                <input type="hidden" {...register(`stops.${index}.appointment_end_at`)} />
                <input type="hidden" {...register(`stops.${index}.is_tarp_stop`)} />
                <input type="hidden" {...register(`stops.${index}.tarp_count`)} />
                <input type="hidden" {...register(`stops.${index}.stop_notes`)} />
                {/* GAP-31 per-stop extra-rate editor RELOCATED to §A (with the charges) per GUARD 2026-06-23 —
                    render-v6 §C has no extra-rate editor; the §C card is exactly the 11 design fields. */}
              </div>
            </div>
          );
        })}
      </div>

      {/* render-v6 §C stop-add buttons. */}
      <div className="flex flex-wrap gap-3">
        <button type="button" className="text-xs font-semibold text-[#16203a] hover:underline" onClick={() => append(newStop("pickup", fields.length + 1))}>
          + Add pickup
        </button>
        <button type="button" className="text-xs font-semibold text-[#16203a] hover:underline" onClick={() => append(newStop("delivery", fields.length + 1))}>
          + Add delivery
        </button>
        <button
          type="button"
          className="text-xs font-semibold text-[#16203a] hover:underline"
          onClick={() => append(newStop(fields.length % 2 === 0 ? "pickup" : "delivery", fields.length + 1))}
        >
          + Add stop · multi-leg
        </button>
      </div>
    </section>
  );
}

function Field({ label, input }: { label: string; input: JSX.Element }) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-semibold text-gray-600">{label}</label>
      {input}
    </div>
  );
}
