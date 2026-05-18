import { useMemo, useState } from "react";
import { useFieldArray, type Control, type UseFormRegister, type UseFormWatch } from "react-hook-form";
import { TimeWindowDropdown } from "./book-load-v4/TimeWindowDropdown";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";

type Props = {
  control: Control<any>;
  register: UseFormRegister<any>;
  watch: UseFormWatch<any>;
};

function formatStopDate(raw: unknown) {
  if (typeof raw !== "string" || !raw) return "No appointment";
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return "No appointment";
  return dt.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function BookLoadStopsSection({ control, register, watch }: Props) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: "stops",
  });
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  const stopValues = watch("stops");
  const stops = useMemo(() => (Array.isArray(stopValues) ? stopValues : []), [stopValues]);

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <section className="space-y-2">
      <div className="space-y-1">
        {fields.map((field, index) => (
          <div key={field.id} className="rounded border border-gray-200 bg-[#F8F8F4] p-2">
            <div className="flex items-center gap-2 text-[11px]">
              <span
                className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.4px] ${
                  String(stops[index]?.stop_type ?? "pickup") === "delivery"
                    ? "bg-[#D1FAE5] text-[#064E3B]"
                    : "bg-[#DBEAFE] text-[#1E3A8A]"
                }`}
              >
                {String(stops[index]?.stop_type ?? "pickup") === "delivery" ? "Delivery" : "Pickup"} · {index + 1}
              </span>
              <span className="font-semibold text-gray-700">
                {stops[index]?.reference_number?.trim?.() || `Stop #${index + 1}`}
              </span>
              <span className="flex-1 truncate text-gray-800">
                {[stops[index]?.address_line1, stops[index]?.city, stops[index]?.state].filter(Boolean).join(", ") || "Address pending"}
              </span>
              <span className="text-[10px] text-gray-500">{formatStopDate(stops[index]?.scheduled_arrival_at)}</span>
              <button type="button" className="text-[10px] font-semibold text-[#2563EB]" onClick={() => toggleExpanded(field.id)}>
                {expandedIds[field.id] ? "Collapse" : "Expand / edit"}
              </button>
              {index >= 2 ? (
                <button type="button" className="text-[10px] font-semibold text-red-600" onClick={() => remove(index)}>
                  Remove
                </button>
              ) : null}
            </div>
            <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
              <Field
                label="Time window type"
                input={<TimeWindowDropdown register={register} name={`stops.${index}.time_window_type`} />}
              />
              <Field
                label="Free time · lumper"
                input={
                  <input
                    {...register(`stops.${index}.free_time_summary`)}
                    placeholder="120 min · customer-provided"
                    className="h-7 w-full rounded border border-gray-300 px-2 text-xs"
                  />
                }
              />
            </div>
            {expandedIds[field.id] ? (
              <div className="mt-2 grid grid-cols-1 gap-2 border-t border-gray-200 pt-2 md:grid-cols-2">
                <Field
                  label="Type"
                  input={
                    <SelectCombobox {...register(`stops.${index}.stop_type`)} className="h-7 w-full rounded border border-gray-300 bg-white px-2 text-xs">
                      <option value="pickup">PICKUP</option>
                      <option value="delivery">DELIVERY</option>
                    </SelectCombobox>
                  }
                />
                <Field label="Reference #" input={<input {...register(`stops.${index}.reference_number`)} className="h-7 w-full rounded border border-gray-300 px-2 text-xs" />} />
                <Field label="Address" input={<input {...register(`stops.${index}.address_line1`)} className="h-7 w-full rounded border border-gray-300 px-2 text-xs" />} />
                <Field label="City" input={<input {...register(`stops.${index}.city`)} className="h-7 w-full rounded border border-gray-300 px-2 text-xs" />} />
                <Field label="State" input={<input {...register(`stops.${index}.state`)} className="h-7 w-full rounded border border-gray-300 px-2 text-xs" />} />
                <Field label="Country" input={<input {...register(`stops.${index}.country`)} className="h-7 w-full rounded border border-gray-300 px-2 text-xs" />} />
                <Field label="Appointment" input={<input type="datetime-local" {...register(`stops.${index}.scheduled_arrival_at`)} className="h-7 w-full rounded border border-gray-300 px-2 text-xs" />} />
                <Field label="Window start" input={<input type="datetime-local" {...register(`stops.${index}.appointment_start_at`)} className="h-7 w-full rounded border border-gray-300 px-2 text-xs" />} />
                <Field label="Window end" input={<input type="datetime-local" {...register(`stops.${index}.appointment_end_at`)} className="h-7 w-full rounded border border-gray-300 px-2 text-xs" />} />
                <Field label="Site contact" input={<input {...register(`stops.${index}.site_contact_name`)} className="h-7 w-full rounded border border-gray-300 px-2 text-xs" />} />
                <Field label="Site phone" input={<input {...register(`stops.${index}.site_contact_phone`)} className="h-7 w-full rounded border border-gray-300 px-2 text-xs" />} />
                <Field label="Gate / dock" input={<input {...register(`stops.${index}.gate_dock_text`)} className="h-7 w-full rounded border border-gray-300 px-2 text-xs" />} />
                <Field
                  label="Lumper paid by"
                  input={
                    <SelectCombobox {...register(`stops.${index}.lumper_paid_by`)} className="h-7 w-full rounded border border-gray-300 bg-white px-2 text-xs">
                      <option value="carrier">Carrier</option>
                      <option value="shipper">Shipper</option>
                      <option value="broker">Broker</option>
                      <option value="receiver">Receiver</option>
                      <option value="unknown">Unknown</option>
                    </SelectCombobox>
                  }
                />
                <Field label="Lumper amount (cents)" input={<input type="number" min={0} step={1} {...register(`stops.${index}.lumper_amount_cents`, { valueAsNumber: true })} className="h-7 w-full rounded border border-gray-300 px-2 text-xs" />} />
                <Field label="Stop notes" input={<input {...register(`stops.${index}.stop_notes`)} className="h-7 w-full rounded border border-gray-300 px-2 text-xs" />} />
                <label className="flex items-center gap-2 text-[11px] text-gray-700">
                  <input type="checkbox" {...register(`stops.${index}.lumper_required`)} />
                  Lumper required
                </label>
                <label className="flex items-center gap-2 text-[11px] text-gray-700">
                  <input type="checkbox" {...register(`stops.${index}.is_tarp_stop`)} />
                  Tarp stop
                </label>
                <Field label="Tarp count" input={<input type="number" min={0} step={1} {...register(`stops.${index}.tarp_count`, { valueAsNumber: true })} className="h-7 w-full rounded border border-gray-300 px-2 text-xs" />} />
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <button
        type="button"
        className="text-xs font-semibold text-[#2563EB]"
        onClick={() =>
          append({
            stop_type: fields.length % 2 === 0 ? "pickup" : "delivery",
            sequence_number: fields.length + 1,
            city: "",
            state: "",
            country: "USA",
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
