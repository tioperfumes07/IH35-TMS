import type { UseFormRegister, UseFormSetValue, UseFormWatch } from "react-hook-form";
import { SimpleCombobox as Combobox } from "../../../components/Combobox";
import { DatePicker } from "../../../components/forms/DatePicker";
import type { CreateWOFormValues } from "./CreateWorkOrderModal";

type Props = {
  register: UseFormRegister<CreateWOFormValues>;
  watch: UseFormWatch<CreateWOFormValues>;
  setValue: UseFormSetValue<CreateWOFormValues>;
};

export function CreateWOSectionPaymentTiming({ register, watch, setValue }: Props) {
  const paymentTiming = watch("payment_timing");
  return (
    <section className="rounded-sm border border-gray-200 bg-white p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-700">Where &amp; How - drives the accounting auto-post</h3>
      <div className="space-y-2 text-sm">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-gray-600">Bill Terms</label>
            {/* C9: this select had `onChange={() => {}}`. Bill Terms IS sent (CreateWorkOrderModal
                `bill_terms: values.bill_terms || undefined`) and the route accepts it — but the
                handler was a no-op, so whatever the operator picked was thrown away and every WO
                bill booked on the rendered default. Wiring setValue makes the pick real. */}
            <Combobox
              options={[
                { value: "net_30", label: "Net 30" },
                { value: "net_15", label: "Net 15" },
                { value: "net_7", label: "Net 7" },
              ]}
              value={watch("bill_terms") || "net_30"}
              onChange={(next) => setValue("bill_terms", next ?? "net_30", { shouldDirty: true })}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-gray-600">Bill Date</label>
            <DatePicker value={watch("bill_date") || ""} onChange={(v) => setValue("bill_date", v, { shouldDirty: true })} className="h-8 w-full" />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-gray-600">Due Date (auto)</label>
            <DatePicker value={watch("due_date") || ""} onChange={(v) => setValue("due_date", v, { shouldDirty: true })} className="h-8 w-full bg-gray-100" disabled />
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
