import type { UseFormGetValues, UseFormRegister, UseFormSetValue, UseFormWatch } from "react-hook-form";
import { QboCombobox } from "../../../components/forms/QboCombobox";

export type BookLoadFormValues = {
  customer_id: string;
  /** QuickBooks mirror list id (display); TMS FK is `customer_id`. */
  customer_qbo_id: string;
  /** Cached label from selected QBO row. */
  customer_name: string;
  customer_wo_number: string;
  customer_po_number: string;
  commodity: string;
  weight_lbs: number;
  hazmat: boolean;
  driver_instructions_text: string;
  notes: string;
  linehaul_cents: number;
  fuel_surcharge_cents: number;
  accessorial_cents: number;
};

type Props = {
  register: UseFormRegister<BookLoadFormValues>;
  watch: UseFormWatch<BookLoadFormValues>;
  operatingCompanyId?: string;
  setValue?: UseFormSetValue<BookLoadFormValues>;
  getValues?: UseFormGetValues<BookLoadFormValues>;
  customerIdError?: string;
  showOptionalFields?: boolean;
};

export function BookLoadCustomerSection({
  register,
  watch,
  operatingCompanyId,
  setValue,
  getValues,
  customerIdError,
  showOptionalFields = true,
}: Props) {
  const dollarsToCents = (value: unknown) => {
    if (value === null || value === undefined || value === "") return 0;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return Math.round(numeric * 100);
  };

  const customerQboId = watch("customer_qbo_id");
  const customerName = watch("customer_name");

  return (
    <section className="rounded border border-amber-200 bg-amber-50 p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-800">A. Customer · Invoice · Charges</h3>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <div className="space-y-1 md:col-span-2">
          <input type="hidden" {...register("customer_id", { required: "Select a customer from QuickBooks search results" })} />
          <label className="text-[11px] font-semibold text-gray-600">Customer *</label>
          {operatingCompanyId && setValue ? (
            <QboCombobox
              entityType="customer"
              operatingCompanyId={operatingCompanyId}
              value={customerQboId?.trim() ? customerQboId : null}
              displayValue={customerName ?? ""}
              allowFreeText={false}
              placeholder="Select QBO customer (type to search)…"
              onChange={(qboId, name) => {
                if (qboId) {
                  setValue("customer_qbo_id", qboId, { shouldDirty: true, shouldValidate: false });
                  setValue("customer_name", name, { shouldDirty: true, shouldValidate: false });
                  return;
                }
                setValue("customer_name", name, { shouldDirty: true, shouldValidate: false });
              }}
              onPick={(row) => {
                setValue("customer_id", row.id, { shouldDirty: true, shouldValidate: true });
                setValue("customer_qbo_id", row.qbo_id, { shouldDirty: true, shouldValidate: false });
                setValue("customer_name", row.display_name, { shouldDirty: true, shouldValidate: false });
              }}
            />
          ) : (
            <div className="rounded border border-amber-300 bg-white px-2 py-2 text-xs text-amber-900">Company context required for customer lookup.</div>
          )}
          {customerIdError ? <p className="text-[11px] text-red-600">{customerIdError}</p> : null}
        </div>
        <Field label="Customer WO# / PU#" input={<input {...register("customer_wo_number")} className="h-8 w-full rounded border border-gray-300 px-2 text-sm" />} />
        <Field label="Customer PO#" input={<input {...register("customer_po_number")} className="h-8 w-full rounded border border-gray-300 px-2 text-sm" />} />
        {operatingCompanyId && setValue && getValues ? (
          <div className="md:col-span-2">
            <label className="text-[11px] font-semibold text-gray-600">QBO customer lookup (appends to Special notes)</label>
            <div className="mt-1">
              <QboCombobox
                entityType="customer"
                operatingCompanyId={operatingCompanyId}
                value={null}
                displayValue=""
                allowFreeText={false}
                onChange={(qboId, displayName) => {
                  if (!qboId) return;
                  const prev = String(getValues("notes") ?? "");
                  const line = `QBO customer: ${displayName} (${qboId})`;
                  setValue("notes", prev ? `${prev}\n${line}` : line, { shouldDirty: true });
                }}
              />
            </div>
          </div>
        ) : null}
        <Field label="Commodity" input={<input {...register("commodity")} className="h-8 w-full rounded border border-gray-300 px-2 text-sm" />} />
        <Field label="Weight (lbs)" input={<input type="number" {...register("weight_lbs", { valueAsNumber: true })} className="h-8 w-full rounded border border-gray-300 px-2 text-sm" />} />
        <label className="flex items-center gap-2 text-[11px] font-semibold text-gray-700">
          <input type="checkbox" {...register("hazmat")} />
          Hazmat
        </label>
        <Field
          label="Rate ($)"
          input={
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              {...register("linehaul_cents", { setValueAs: dollarsToCents })}
              className="h-8 w-full rounded border border-gray-300 px-2 text-sm"
            />
          }
        />
        <Field
          label="Fuel surcharge ($)"
          input={
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              {...register("fuel_surcharge_cents", { setValueAs: dollarsToCents })}
              className="h-8 w-full rounded border border-gray-300 px-2 text-sm"
            />
          }
        />
        <Field
          label="Accessorial ($)"
          input={
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              {...register("accessorial_cents", { setValueAs: dollarsToCents })}
              className="h-8 w-full rounded border border-gray-300 px-2 text-sm"
            />
          }
        />
      </div>
      {showOptionalFields ? (
        <>
          <div className="mt-2">
            <label className="text-[11px] font-semibold text-gray-600">Special notes</label>
            <textarea {...register("notes")} rows={2} className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm" />
          </div>
          <div className="mt-2">
            <label className="text-[11px] font-semibold text-gray-600">
              Driver instructions
              <span className="ml-2 rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">VISIBLE TO DRIVER</span>
            </label>
            <textarea {...register("driver_instructions_text")} rows={3} className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm" />
          </div>
        </>
      ) : null}
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
