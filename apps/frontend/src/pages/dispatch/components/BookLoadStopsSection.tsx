import { useState } from "react";
import { useFieldArray, Controller, type Control, type UseFormRegister, type UseFormSetValue } from "react-hook-form";
import { TimeWindowDropdown } from "./book-load-v4/TimeWindowDropdown";
import { StateSelect } from "../../../components/forms/StateSelect";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";
import { MultiStopExtraRateEditor } from "../../../components/dispatch/MultiStopExtraRateEditor";
import { AddressGeocodeInput } from "../../../components/dispatch/AddressGeocodeInput";

type Props = {
  control: Control<any>;
  register: UseFormRegister<any>;
  setValue?: UseFormSetValue<any>;
};

export function BookLoadStopsSection({ control, register, setValue }: Props) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: "stops",
  });
  // render-v6 §C: stop cards show their address/appointment fields INLINE by default (the v6 vertical card).
  // State tracks rows the user has explicitly collapsed; undefined/true = expanded. Defaulting to collapsed
  // was the #1355 stop-card false-DONE — the fields existed in source (guard passed) but rendered hidden.
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const isExpanded = (id: string) => expandedRows[id] !== false;
  const currentStops =
    ((control as unknown as { _formValues?: { stops?: Array<Record<string, unknown>> } })._formValues?.stops ?? []) as Array<
      Record<string, unknown>
    >;

  function toggleExpanded(id: string) {
    setExpandedRows((prev) => ({ ...prev, [id]: prev[id] === false ? true : false }));
  }

  function formatStopDate(raw: unknown) {
    if (typeof raw !== "string" || !raw) return "No appointment";
    const dt = new Date(raw);
    if (Number.isNaN(dt.getTime())) return "No appointment";
    return dt.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  return (
    <section className="space-y-2">
      <div className="space-y-1">
        {fields.map((field, index) => (
          <div key={field.id} data-testid={`stop-card-${index}`} className="overflow-hidden rounded border border-gray-200 bg-white">
            {/* render-v6 .stop card — full-width colored header BAR + tag. v6 uses blue(pick)/green(del); §7
                overrides design color → pickup = navy #1F2A44, delivery = slate. (§7 forbids blue/green.) */}
            <div className={`flex items-center gap-2 px-2 py-1 text-[10.5px] font-bold tracking-[0.03em] ${index % 2 === 0 ? "bg-[#1F2A44] text-white" : "bg-slate-200 text-slate-800"}`}>
              <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase ${index % 2 === 0 ? "bg-white/20 text-white" : "bg-slate-600 text-white"}`}>
                {index % 2 === 0 ? "PICKUP" : "DELIVERY"}
              </span>
              <span>Stop {index + 1}</span>
              <span className={`ml-auto truncate font-medium ${index % 2 === 0 ? "text-white/80" : "text-slate-600"}`}>
                {`${currentStops[index]?.address_full || currentStops[index]?.address_line1 || "Address pending"}`}
                {currentStops[index]?.scheduled_arrival_at ? ` · ${formatStopDate(currentStops[index]?.scheduled_arrival_at)}` : ""}
              </span>
              <button type="button" className={`text-[10px] font-semibold ${index % 2 === 0 ? "text-white" : "text-[#16203a]"}`} onClick={() => toggleExpanded(field.id)}>
                {isExpanded(field.id) ? "Collapse" : "Expand / edit"}
              </button>
              {index >= 2 ? (
                <button type="button" className={`text-[10px] font-semibold ${index % 2 === 0 ? "text-white" : "text-[#A32D2D]"}`} onClick={() => remove(index)}>
                  Remove
                </button>
              ) : null}
            </div>
            <div className="p-2">
            <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
              <Field label="Time window" input={<TimeWindowDropdown register={register} name={`stops.${index}.time_window_type`} />} />
              <Field label="Free time / lumper" input={<input {...register(`stops.${index}.free_time_summary`)} className="h-7 w-full rounded border border-gray-300 px-2 text-xs" placeholder="120 min · customer-provided" />} />
            </div>
            {isExpanded(field.id) ? (
              <div className="mt-2 grid grid-cols-1 gap-2 border-t border-gray-200 pt-2 md:grid-cols-2">
                {/* DISPATCH-UI-REFINE-2 ITEM 4 + PCMILER-GEOCODE — single full-width address line. When
                    PCMILER_ENABLED is ON, this becomes a Trimble geocoding autocomplete; selecting a result
                    populates the parsed Address/City/State/Country fields below (kept additive in #1134).
                    Flag OFF → plain editable text (identical to #1134), no Trimble call. */}
                <div className="md:col-span-2">
                  <Field
                    label="Address (one line)"
                    input={
                      <Controller
                        control={control}
                        name={`stops.${index}.address_full`}
                        render={({ field }) => (
                          <AddressGeocodeInput
                            value={field.value ?? ""}
                            onChange={field.onChange}
                            onResolve={(r) => {
                              if (r.address_line1) setValue?.(`stops.${index}.address_line1`, r.address_line1, { shouldDirty: true });
                              if (r.city) setValue?.(`stops.${index}.city`, r.city, { shouldDirty: true });
                              if (r.state) setValue?.(`stops.${index}.state`, r.state, { shouldDirty: true });
                              if (r.country) setValue?.(`stops.${index}.country`, r.country, { shouldDirty: true });
                            }}
                            placeholder="123 Main St, Laredo, TX 78040, USA"
                            className="h-7 w-full rounded border border-gray-300 px-2 text-xs"
                            dataAttrs={{ "data-stop-address-oneline": "true" }}
                          />
                        )}
                      />
                    }
                  />
                </div>
                <div className="md:col-span-2 -mb-1 text-[9px] font-semibold uppercase tracking-[0.4px] text-gray-400">
                  Parsed location (kept for PC*MILER)
                </div>
                <Field
                  label="Type"
                  input={
                    <SelectCombobox {...register(`stops.${index}.stop_type`)} className="h-7 w-full text-xs">
                      <option value="pickup">PICKUP</option>
                      <option value="delivery">DELIVERY</option>
                    </SelectCombobox>
                  }
                />
                <Field label="Address" input={<input {...register(`stops.${index}.address_line1`)} className="h-7 w-full rounded border border-gray-300 px-2 text-xs" />} />
                <Field label="City" input={<input {...register(`stops.${index}.city`)} className="h-7 w-full rounded border border-gray-300 px-2 text-xs" />} />
                <Field label="State" input={
                  <Controller
                    control={control}
                    name={`stops.${index}.state`}
                    render={({ field }) => <StateSelect value={field.value ?? ""} onChange={field.onChange} placeholder="State" />}
                  />
                } />
                <Field label="Country" input={<input {...register(`stops.${index}.country`)} className="h-7 w-full rounded border border-gray-300 px-2 text-xs" />} />
                <Field label="Appt" input={<input type="datetime-local" {...register(`stops.${index}.scheduled_arrival_at`)} className="h-7 w-full rounded border border-gray-300 px-2 text-xs" />} />
                <Field label="Window start" input={<input type="datetime-local" {...register(`stops.${index}.appointment_start_at`)} className="h-7 w-full rounded border border-gray-300 px-2 text-xs" />} />
                <Field label="Window end" input={<input type="datetime-local" {...register(`stops.${index}.appointment_end_at`)} className="h-7 w-full rounded border border-gray-300 px-2 text-xs" />} />
                <Field label="Site contact" input={<input {...register(`stops.${index}.site_contact_name`)} className="h-7 w-full rounded border border-gray-300 px-2 text-xs" />} />
                <Field label="Site phone" input={<input {...register(`stops.${index}.site_contact_phone`)} className="h-7 w-full rounded border border-gray-300 px-2 text-xs" />} />
                <Field label="Gate / dock" input={<input {...register(`stops.${index}.gate_dock_text`)} className="h-7 w-full rounded border border-gray-300 px-2 text-xs" />} />
                <Field
                  label="Lumper paid by"
                  input={
                    <SelectCombobox {...register(`stops.${index}.lumper_paid_by`)} className="h-7 w-full text-xs">
                      <option value="carrier">Carrier</option>
                      <option value="shipper">Shipper</option>
                      <option value="broker">Broker</option>
                      <option value="receiver">Receiver</option>
                      <option value="unknown">Unknown</option>
                    </SelectCombobox>
                  }
                />
                <Field label="Lumper amount (cents)" input={<input type="number" min={0} step={1} {...register(`stops.${index}.lumper_amount_cents`, { valueAsNumber: true })} className="h-7 w-full rounded border border-gray-300 px-2 text-xs" />} />
                <label className="flex items-center gap-2 text-[11px] text-gray-700">
                  <input type="checkbox" {...register(`stops.${index}.lumper_required`)} />
                  Lumper required
                </label>
                <label className="flex items-center gap-2 text-[11px] text-gray-700">
                  <input type="checkbox" {...register(`stops.${index}.is_tarp_stop`)} />
                  Tarp stop
                </label>
                <Field label="Tarp count" input={<input type="number" min={0} step={1} {...register(`stops.${index}.tarp_count`, { valueAsNumber: true })} className="h-7 w-full rounded border border-gray-300 px-2 text-xs" />} />
                <Field label="Stop notes" input={<input {...register(`stops.${index}.stop_notes`)} className="h-7 w-full rounded border border-gray-300 px-2 text-xs" />} />
                <div className="md:col-span-2">
                  <MultiStopExtraRateEditor control={control} register={register} stopIndex={index} />
                </div>
              </div>
            ) : null}
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="text-xs font-semibold text-[#16203a] hover:underline"
        onClick={() =>
          append({
            stop_type: fields.length % 2 === 0 ? "pickup" : "delivery",
            sequence_number: fields.length + 1,
            city: "",
            state: "",
            country: "USA",
            address_full: "",
            address_line1: "",
            scheduled_arrival_at: "",
            time_window_type: "appointment",
            appointment_start_at: "",
            appointment_end_at: "",
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
          })
        }
      >
        + Add stop · multi-leg
      </button>
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
