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
            })
          }
        >
          + Create Stop
        </Button>
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
