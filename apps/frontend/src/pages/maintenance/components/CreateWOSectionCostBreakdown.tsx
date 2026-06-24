import { useFieldArray, Controller, type Control, type UseFormRegister, type UseFormWatch } from "react-hook-form";
import { Button } from "../../../components/Button";
import { MoneyInput } from "../../../components/forms/MoneyInput";
import type { CreateWOFormValues } from "./CreateWorkOrderModal";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";

type Props = {
  control: Control<CreateWOFormValues>;
  register: UseFormRegister<CreateWOFormValues>;
  watch: UseFormWatch<CreateWOFormValues>;
};

export function CreateWOSectionCostBreakdown({ control, register, watch }: Props) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: "line_items",
  });
  const lines = watch("line_items");
  const totals = (lines ?? []).reduce(
    (acc, line) => {
      const amount = Number(line.amount || 0);
      if (line.line_type === "parts") acc.parts += amount;
      else if (line.line_type === "labor") acc.labor += amount;
      acc.total += amount;
      return acc;
    },
    { parts: 0, labor: 0, total: 0 }
  );

  return (
    <section className="rounded border border-yellow-200 bg-yellow-50 p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-yellow-800">C. Cost Breakdown</h3>
      <div className="space-y-2">
        {fields.map((field, idx) => (
          <div key={field.id} className="grid grid-cols-1 gap-2 rounded border border-yellow-100 bg-white p-2 md:grid-cols-7">
            <SelectCombobox {...register(`line_items.${idx}.line_type`)} className="h-8 rounded border border-gray-300 px-2 text-sm">
              <option value="parts">Parts</option>
              <option value="labor">Labor</option>
              <option value="other">Other</option>
            </SelectCombobox>
            <input {...register(`line_items.${idx}.description`)} placeholder="Description" className="h-8 rounded border border-gray-300 px-2 text-sm md:col-span-2" />
            <input type="number" step="0.01" {...register(`line_items.${idx}.quantity`, { valueAsNumber: true })} placeholder="Qty" className="h-8 rounded border border-gray-300 px-2 text-sm" />
            {/* M-1: dollars-mode via Controller; WO line unit_cost/amount = z.number() DOLLARS (work-orders.routes), byte-for-byte. */}
            <Controller control={control} name={`line_items.${idx}.unit_cost`} render={({ field }) => (
              <MoneyInput valueDollars={field.value ?? null} onChangeDollars={(d) => field.onChange(d ?? 0)} ariaLabel="Unit cost (USD)" className="w-full" />
            )} />
            <Controller control={control} name={`line_items.${idx}.amount`} render={({ field }) => (
              <MoneyInput valueDollars={field.value ?? null} onChangeDollars={(d) => field.onChange(d ?? 0)} ariaLabel="Amount (USD)" className="w-full" />
            )} />
            <Button type="button" size="icon" variant="secondary" onClick={() => remove(idx)}>✕</Button>
          </div>
        ))}
      </div>
      <div className="mt-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() =>
            append({
              line_type: "parts",
              description: "",
              quantity: 1,
              unit_cost: 0,
              amount: 0,
            })
          }
        >
          + Create line
        </Button>
      </div>
      <div className="mt-2 rounded border border-green-200 bg-green-50 px-2 py-1 text-xs">
        Parts Subtotal: <span className="font-semibold">${totals.parts.toFixed(2)}</span> · Labor Subtotal:{" "}
        <span className="font-semibold">${totals.labor.toFixed(2)}</span> · Estimated Total:{" "}
        <span className="font-semibold">${totals.total.toFixed(2)}</span>
      </div>
      <div className="mt-2 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700">
        On save: work order and accounting artifacts are created according to payment timing.
      </div>
    </section>
  );
}
