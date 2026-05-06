import type { UseFormRegister, UseFormWatch } from "react-hook-form";
import type { CreateWOFormValues } from "./CreateWorkOrderModal";

type Props = {
  register: UseFormRegister<CreateWOFormValues>;
  watch: UseFormWatch<CreateWOFormValues>;
};

export function CreateWOSectionPaymentTiming({ register, watch }: Props) {
  const paymentTiming = watch("payment_timing");
  return (
    <section className="rounded border border-amber-200 bg-amber-50 p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-800">B. Payment Timing</h3>
      <div className="space-y-2 text-sm">
        <label className="flex items-center gap-2">
          <input type="radio" value="in_house" {...register("payment_timing")} />
          In-house — internal labor + parts inventory
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" value="paid_same_day" {...register("payment_timing")} />
          Paid same day — creates Expense
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" value="vendor_invoice" {...register("payment_timing")} />
          Vendor will invoice — creates Bill
        </label>
      </div>
      {paymentTiming === "vendor_invoice" ? (
        <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-gray-600">Vendor Terms</label>
            <select {...register("bill_terms")} className="h-8 w-full rounded border border-gray-300 px-2 text-sm">
              <option value="net_7">Net 7</option>
              <option value="net_15">Net 15</option>
              <option value="net_30">Net 30</option>
              <option value="due_on_receipt">Due on receipt</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-gray-600">Bill Date</label>
            <input type="date" {...register("bill_date")} className="h-8 w-full rounded border border-gray-300 px-2 text-sm" />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-gray-600">Due Date</label>
            <input type="date" {...register("due_date")} className="h-8 w-full rounded border border-gray-300 px-2 text-sm" />
          </div>
        </div>
      ) : null}
    </section>
  );
}
