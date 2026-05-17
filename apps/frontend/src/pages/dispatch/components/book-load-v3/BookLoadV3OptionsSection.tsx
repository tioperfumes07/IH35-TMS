import type { UseFormRegister } from "react-hook-form";
import { SelectCombobox } from "../../../../components/shared/SelectCombobox";

type V3Fields = {
  booking_mode: "single_popup" | "legacy_form";
  requires_tarps: boolean;
  tarp_type: string;
  lumper_amount_cents: number;
  customer_chargeback_requested: boolean;
  customer_chargeback_reason: string;
  live_load_number: string;
};

type Props = {
  register: UseFormRegister<V3Fields>;
};

export function BookLoadV3OptionsSection({ register }: Props) {
  return (
    <section className="rounded border border-indigo-200 bg-indigo-50 p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-indigo-800">D2 · Book Load v3</h3>
      <div className="grid gap-2 md:grid-cols-2">
        <label className="text-[11px] font-semibold text-gray-700">
          Booking mode
          <SelectCombobox {...register("booking_mode")} className="mt-1 h-8 w-full rounded border border-gray-300 px-2 text-sm">
            <option value="single_popup">Single popup</option>
            <option value="legacy_form">Legacy form</option>
          </SelectCombobox>
        </label>
        <label className="text-[11px] font-semibold text-gray-700">
          Lumper amount (cents)
          <input type="number" min={0} step={1} {...register("lumper_amount_cents", { valueAsNumber: true })} className="mt-1 h-8 w-full rounded border border-gray-300 px-2 text-sm" />
        </label>
        <label className="flex items-center gap-2 text-[11px] font-semibold text-gray-700">
          <input type="checkbox" {...register("requires_tarps")} />
          Requires tarps
        </label>
        <label className="text-[11px] font-semibold text-gray-700">
          Tarp type
          <input {...register("tarp_type")} className="mt-1 h-8 w-full rounded border border-gray-300 px-2 text-sm" placeholder="e.g. lumber tarp" />
        </label>
        <label className="text-[11px] font-semibold text-gray-700">
          Live load #
          <input {...register("live_load_number")} className="mt-1 h-8 w-full rounded border border-gray-300 px-2 text-sm" placeholder="Optional external load #" />
        </label>
        <label className="flex items-center gap-2 text-[11px] font-semibold text-gray-700 md:col-span-2">
          <input type="checkbox" {...register("customer_chargeback_requested")} />
          Customer chargeback requested
        </label>
        <label className="text-[11px] font-semibold text-gray-700 md:col-span-2">
          Chargeback reason
          <textarea {...register("customer_chargeback_reason")} rows={2} className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm" />
        </label>
      </div>
    </section>
  );
}
