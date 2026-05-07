import type { UseFormRegister, UseFormWatch } from "react-hook-form";
import type { CreateWOFormValues } from "./CreateWorkOrderModal";

type Props = {
  register: UseFormRegister<CreateWOFormValues>;
  watch: UseFormWatch<CreateWOFormValues>;
};

function Field({ label, children }: { label: string; children: JSX.Element }) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-semibold text-gray-600">{label}</label>
      {children}
    </div>
  );
}

export function CreateWOSectionIdentification({ register, watch }: Props) {
  const type = watch("wo_type");
  const sourceType = watch("source_type");
  const requireDriverAndLoad = type === "repair" || type === "tire" || type === "accident";
  const requireExternalFields = ["ES", "AC", "ET", "RT", "RS"].includes(sourceType);
  return (
    <section className="rounded border border-gray-200 bg-gray-50 p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-700">A. Identification & Where</h3>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3 lg:grid-cols-6">
        <Field label="WO #">
          <input value="Auto on save" readOnly className="h-8 w-full rounded border border-gray-300 bg-gray-100 px-2 text-sm" />
        </Field>
        <Field label="Service Type">
          <input {...register("wo_type")} readOnly className="h-8 w-full rounded border border-gray-300 bg-gray-100 px-2 text-sm capitalize" />
        </Field>
        <Field label="Source Type *">
          <select {...register("source_type", { required: true })} className="h-8 w-full rounded border border-gray-300 px-2 text-sm">
            <option value="IS">Internal Shop (IS)</option>
            <option value="ES">External Shop (ES)</option>
            <option value="AC">Accident (AC)</option>
            <option value="ET">External Tires (ET)</option>
            <option value="RT">Roadside Tires (RT)</option>
            <option value="IT">Internal Tires (IT)</option>
            <option value="RS">Roadside Service (RS)</option>
          </select>
        </Field>
        <Field label="Date">
          <input type="date" {...register("service_date")} className="h-8 w-full rounded border border-gray-300 px-2 text-sm" />
        </Field>
        <Field label="Unit">
          <input {...register("unit_id", { required: true })} className="h-8 w-full rounded border border-gray-300 px-2 text-sm" />
        </Field>
        <Field label={`Driver${requireDriverAndLoad ? " *" : ""}`}>
          <input {...register("driver_id", { required: requireDriverAndLoad })} className="h-8 w-full rounded border border-gray-300 px-2 text-sm" />
        </Field>
        <Field label="Class">
          <input {...register("class_hint")} readOnly className="h-8 w-full rounded border border-gray-300 bg-gray-100 px-2 text-sm" />
        </Field>
      </div>
      <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
        <Field label="Repair Location">
          <select {...register("repair_location")} className="h-8 w-full rounded border border-gray-300 px-2 text-sm">
            <option value="in_house">In-house</option>
            <option value="external_shop">External Shop</option>
            <option value="mobile_roadside">Mobile Roadside</option>
          </select>
        </Field>
        <Field label="Vendor">
          <input {...register("vendor_id")} className="h-8 w-full rounded border border-gray-300 px-2 text-sm" />
        </Field>
        <Field label="Vendor RO/Invoice #">
          <input {...register("vendor_invoice_number")} className="h-8 w-full rounded border border-gray-300 px-2 text-sm" />
        </Field>
      </div>
      {requireExternalFields ? (
        <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
          <Field label="External Vendor *">
            <input {...register("external_vendor_id", { required: true })} className="h-8 w-full rounded border border-gray-300 px-2 text-sm" />
          </Field>
          <Field label="External Vendor WO Number *">
            <input {...register("external_vendor_wo_number", { required: true })} className="h-8 w-full rounded border border-gray-300 px-2 text-sm" />
          </Field>
          <Field label="External Vendor Invoice Number *">
            <input {...register("external_vendor_invoice_number", { required: true })} className="h-8 w-full rounded border border-gray-300 px-2 text-sm" />
          </Field>
        </div>
      ) : null}
      <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-4">
        <Field label={`Load #${requireDriverAndLoad ? " *" : ""}`}>
          <input {...register("load_id", { required: requireDriverAndLoad })} className="h-8 w-full rounded border border-gray-300 px-2 text-sm" />
        </Field>
        <div className="md:col-span-3">
          <Field label="Description">
            <input {...register("description", { required: true })} className="h-8 w-full rounded border border-gray-300 px-2 text-sm" />
          </Field>
        </div>
      </div>
    </section>
  );
}
