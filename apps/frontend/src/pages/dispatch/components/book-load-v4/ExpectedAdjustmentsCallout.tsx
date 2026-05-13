import type { UseFormRegister } from "react-hook-form";

type Props = {
  register: UseFormRegister<Record<string, unknown>>;
};

export function ExpectedAdjustmentsCallout({ register }: Props) {
  return (
    <div className="rounded border border-amber-300 bg-[#FEF3C7] px-3 py-2 text-[11px] text-amber-950">
      <div className="mb-2 font-semibold uppercase tracking-wide">Expected adjustments</div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <div className="space-y-1 rounded border border-amber-200 bg-white/70 p-2">
          <div className="text-[10px] font-semibold text-amber-900">Anticipated chargeback</div>
          <input
            type="number"
            min={0}
            step={1}
            placeholder="cents"
            {...register("anticipated_chargeback_cents", { valueAsNumber: true })}
            className="h-8 w-full rounded border border-gray-300 px-2 text-sm"
          />
          <input
            {...register("anticipated_chargeback_reason")}
            placeholder="Reason"
            className="h-8 w-full rounded border border-gray-300 px-2 text-sm"
          />
        </div>
        <div className="space-y-1 rounded border border-amber-200 bg-white/70 p-2">
          <div className="text-[10px] font-semibold text-amber-900">Detention expected</div>
          <label className="flex items-center gap-2">
            <input type="checkbox" {...register("detention_expected_y_n")} />
            Yes
          </label>
          <input
            type="number"
            min={0}
            step={0.25}
            placeholder="Hours"
            {...register("detention_expected_hours", { valueAsNumber: true })}
            className="h-8 w-full rounded border border-gray-300 px-2 text-sm"
          />
          <input
            type="number"
            min={0}
            placeholder="Bill customer ¢/hr"
            {...register("detention_bill_customer_per_hour_cents", { valueAsNumber: true })}
            className="h-8 w-full rounded border border-gray-300 px-2 text-sm"
          />
          <input
            type="number"
            min={0}
            placeholder="Driver pay ¢/hr"
            {...register("detention_driver_pay_per_hour_cents", { valueAsNumber: true })}
            className="h-8 w-full rounded border border-gray-300 px-2 text-sm"
          />
        </div>
        <div className="space-y-1 rounded border border-amber-200 bg-white/70 p-2">
          <div className="text-[10px] font-semibold text-amber-900">Late delivery risk</div>
          <label className="flex items-center gap-2">
            <input type="checkbox" {...register("late_delivery_risk_y_n")} />
            Yes
          </label>
          <input
            type="number"
            min={0}
            placeholder="Est deduction (¢)"
            {...register("late_delivery_est_deduction_cents", { valueAsNumber: true })}
            className="h-8 w-full rounded border border-gray-300 px-2 text-sm"
          />
          <input {...register("late_delivery_reason")} placeholder="Reason" className="h-8 w-full rounded border border-gray-300 px-2 text-sm" />
        </div>
      </div>
    </div>
  );
}
