import { useFieldArray, type Control, type UseFormRegister } from "react-hook-form";
import { SelectCombobox } from "../shared/SelectCombobox";

type Props = {
  control: Control<any>;
  register: UseFormRegister<any>;
  stopIndex: number;
};

export function MultiStopExtraRateEditor({ control, register, stopIndex }: Props) {
  const fieldName = `stops.${stopIndex}.extra_rates` as const;
  const { fields, append, remove } = useFieldArray({
    control,
    name: fieldName,
  });

  return (
    <div className="space-y-2 rounded border border-gray-200 bg-gray-50 p-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold text-gray-700">Per-stop extra rates</p>
        <button
          type="button"
          className="text-[10px] font-semibold text-[#16203a] hover:underline"
          onClick={() =>
            append({
              rate_type: "extra_stop_fee",
              amount_cents: 0,
              description: "",
            })
          }
        >
          + Add extra rate
        </button>
      </div>
      {fields.length === 0 ? <p className="text-[10px] text-gray-500">No extra rates for this stop.</p> : null}
      <div className="space-y-2">
        {fields.map((field, rowIndex) => (
          <div key={field.id} className="grid grid-cols-1 gap-2 rounded border border-gray-200 bg-white p-2 md:grid-cols-[1.2fr_1fr_2fr_auto]">
            <SelectCombobox {...register(`stops.${stopIndex}.extra_rates.${rowIndex}.rate_type`)} className="h-12 text-sm">
              <option value="extra_stop_fee">Extra stop fee</option>
              <option value="lumper">Lumper</option>
              <option value="detention">Detention</option>
              <option value="fuel_surcharge">Fuel surcharge</option>
              <option value="accessorial">Accessorial</option>
              <option value="other">Other</option>
            </SelectCombobox>
            <input
              type="number"
              min={0}
              step={1}
              {...register(`stops.${stopIndex}.extra_rates.${rowIndex}.amount_cents`, { valueAsNumber: true })}
              className="h-12 rounded border border-gray-300 px-3 text-sm"
              placeholder="Amount cents"
            />
            <input
              {...register(`stops.${stopIndex}.extra_rates.${rowIndex}.description`)}
              className="h-12 rounded border border-gray-300 px-3 text-sm"
              placeholder="Description"
            />
            <button
              type="button"
              className="h-12 rounded border border-red-200 px-3 text-xs font-semibold text-red-600 hover:bg-red-50"
              onClick={() => remove(rowIndex)}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
