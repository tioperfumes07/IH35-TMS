import type { UseFormRegister } from "react-hook-form";
import type { BookLoadFormValues } from "./BookLoadCustomerSection";

type EquipmentFormValues = BookLoadFormValues & {
  trailer_type: string;
  assigned_unit_id: string;
  assigned_primary_driver_id: string;
  assigned_secondary_driver_id: string;
  temp_fahrenheit: number;
};

type Props = {
  register: UseFormRegister<EquipmentFormValues>;
};

export function BookLoadEquipmentSection({ register }: Props) {
  return (
    <section className="rounded border border-blue-200 bg-blue-50 p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-blue-800">B. Equipment · Driver · Trailer</h3>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <Field label="Trailer Type" input={<input {...register("trailer_type")} className="h-8 w-full rounded border border-gray-300 px-2 text-sm" />} />
        <Field label="Truck Unit ID" input={<input {...register("assigned_unit_id")} className="h-8 w-full rounded border border-gray-300 px-2 text-sm" />} />
        <Field label="Primary Driver ID" input={<input {...register("assigned_primary_driver_id")} className="h-8 w-full rounded border border-gray-300 px-2 text-sm" />} />
        <Field label="Team Driver ID (optional)" input={<input {...register("assigned_secondary_driver_id")} className="h-8 w-full rounded border border-gray-300 px-2 text-sm" />} />
        <Field label="Temp °F" input={<input type="number" {...register("temp_fahrenheit", { valueAsNumber: true })} className="h-8 w-full rounded border border-gray-300 px-2 text-sm" />} />
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
