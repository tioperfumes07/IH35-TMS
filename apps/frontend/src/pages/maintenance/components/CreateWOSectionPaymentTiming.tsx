import type { UseFormRegister, UseFormWatch } from "react-hook-form";
import { Combobox } from "../../../components/shared/Combobox";
import type { CreateWOFormValues } from "./CreateWorkOrderModal";

type Props = {
  register: UseFormRegister<CreateWOFormValues>;
  watch: UseFormWatch<CreateWOFormValues>;
};

export function CreateWOSectionPaymentTiming({ register, watch }: Props) {
  const paymentTiming = watch("payment_timing");
  return (
    <section className="rounded border border-gray-200 bg-white p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-700">Where &amp; How - drives the accounting auto-post</h3>
      <div className="space-y-2 text-sm">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-gray-600">Bill Terms</label>
            <Combobox
              options={[
                { value: "net_30", label: "Net 30" },
                { value: "net_15", label: "Net 15" },
                { value: "net_7", label: "Net 7" },
              ]}
              value={watch("bill_terms") || "net_30"}
              onChange={() => {}}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-gray-600">Bill Date</label>
            <input type="date" {...register("bill_date")} className="h-8 w-full rounded border border-gray-300 px-2 text-sm" />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-gray-600">Due Date (auto)</label>
            <input type="date" {...register("due_date")} className="h-8 w-full rounded border border-gray-300 bg-gray-100 px-2 text-sm" readOnly />
          </div>
        </div>
        <div className="text-[11px] font-semibold text-gray-600">Payment Timing</div>
        <label className="flex items-center gap-2">
          <input type="radio" value="paid_same_day" {...register("payment_timing")} />
          Paid today
          <span className="text-xs text-gray-500">→ creates Expense</span>
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" value="vendor_invoice" {...register("payment_timing")} />
          Vendor will invoice us (Net N)
          <span className="text-xs text-gray-500">→ creates Bill</span>
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" value="in_house" {...register("payment_timing")} />
          In-house - internal labor &amp; parts
          <span className="text-xs text-gray-500">→ no bill / no expense</span>
        </label>
      </div>
      {paymentTiming === "vendor_invoice" ? null : null}
    </section>
  );
}
