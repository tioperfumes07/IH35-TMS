import { useFieldArray, type Control, type UseFormRegister } from "react-hook-form";
import { Button } from "../../../components/Button";

type Props = {
  control: Control<any>;
  register: UseFormRegister<any>;
};

export function BookLoadStopsSection({ control, register }: Props) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: "stops",
  });

  return (
    <section className="rounded border border-green-200 bg-green-50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-green-800">C. Stops · PC*MILER</h3>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() =>
              append({
                stop_type: "pickup",
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
              })
            }
          >
            + Add pickup
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() =>
              append({
                stop_type: "delivery",
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
              })
            }
          >
            + Add delivery
          </Button>
        </div>
      </div>
      <div className="space-y-2">
        {fields.map((field, index) => (
          <div key={field.id} className="rounded border border-green-100 bg-white p-2">
            <div className="mb-2 flex items-center justify-between text-[11px] font-semibold text-green-700">
              <span>Stop #{index + 1}</span>
              {index >= 2 ? (
                <button type="button" className="text-red-600" onClick={() => remove(index)}>
                  Remove
                </button>
              ) : null}
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <Field
                label="Type"
                input={
                  <select {...register(`stops.${index}.stop_type`)} className="h-8 w-full rounded border border-gray-300 px-2 text-sm">
                    <option value="pickup">PICKUP</option>
                    <option value="delivery">DELIVERY</option>
                  </select>
                }
              />
              <Field label="Address" input={<input {...register(`stops.${index}.address_line1`)} className="h-8 w-full rounded border border-gray-300 px-2 text-sm" />} />
              <Field label="City" input={<input {...register(`stops.${index}.city`)} className="h-8 w-full rounded border border-gray-300 px-2 text-sm" />} />
              <Field label="State" input={<input {...register(`stops.${index}.state`)} className="h-8 w-full rounded border border-gray-300 px-2 text-sm" />} />
              <Field label="Country" input={<input {...register(`stops.${index}.country`)} className="h-8 w-full rounded border border-gray-300 px-2 text-sm" />} />
              <Field label="Appt" input={<input type="datetime-local" {...register(`stops.${index}.scheduled_arrival_at`)} className="h-8 w-full rounded border border-gray-300 px-2 text-sm" />} />
              <Field
                label="Time window"
                input={
                  <select {...register(`stops.${index}.time_window_type`)} className="h-8 w-full rounded border border-gray-300 px-2 text-sm">
                    <option value="appointment">Appointment</option>
                    <option value="first_come_first_serve">First come first serve</option>
                    <option value="drop_window">Drop window</option>
                  </select>
                }
              />
              <Field label="Window start" input={<input type="datetime-local" {...register(`stops.${index}.appointment_start_at`)} className="h-8 w-full rounded border border-gray-300 px-2 text-sm" />} />
              <Field label="Window end" input={<input type="datetime-local" {...register(`stops.${index}.appointment_end_at`)} className="h-8 w-full rounded border border-gray-300 px-2 text-sm" />} />
              <label className="flex items-center gap-2 text-[11px] font-semibold text-gray-700">
                <input type="checkbox" {...register(`stops.${index}.lumper_required`)} />
                Lumper required
              </label>
              <Field
                label="Lumper paid by"
                input={
                  <select {...register(`stops.${index}.lumper_paid_by`)} className="h-8 w-full rounded border border-gray-300 px-2 text-sm">
                    <option value="carrier">Carrier</option>
                    <option value="shipper">Shipper</option>
                    <option value="broker">Broker</option>
                    <option value="receiver">Receiver</option>
                    <option value="unknown">Unknown</option>
                  </select>
                }
              />
              <Field label="Lumper amount (cents)" input={<input type="number" min={0} step={1} {...register(`stops.${index}.lumper_amount_cents`, { valueAsNumber: true })} className="h-8 w-full rounded border border-gray-300 px-2 text-sm" />} />
              <label className="flex items-center gap-2 text-[11px] font-semibold text-gray-700">
                <input type="checkbox" {...register(`stops.${index}.is_tarp_stop`)} />
                Tarp stop
              </label>
              <Field label="Tarp count" input={<input type="number" min={0} step={1} {...register(`stops.${index}.tarp_count`, { valueAsNumber: true })} className="h-8 w-full rounded border border-gray-300 px-2 text-sm" />} />
              <Field label="Stop notes" input={<input {...register(`stops.${index}.stop_notes`)} className="h-8 w-full rounded border border-gray-300 px-2 text-sm" />} />
            </div>
          </div>
        ))}
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
