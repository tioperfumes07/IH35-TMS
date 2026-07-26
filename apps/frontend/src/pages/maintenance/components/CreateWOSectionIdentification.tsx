import type { JSX } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseFormGetValues, UseFormRegister, UseFormSetValue, UseFormWatch } from "react-hook-form";
import { listMaintenanceVehicles } from "../../../api/maintenance";
import { listCustomers, listVendors } from "../../../api/mdata";
import type { CreateWOFormValues } from "./CreateWorkOrderModal";
import { DriverPickerWithCreate } from "../../../components/drivers/DriverPickerWithCreate";
import { DatePicker } from "../../../components/forms/DatePicker";
import { DateTimePicker } from "../../../components/forms/DateTimePicker";
import { Combobox } from "../../../components/shared/Combobox";
import { ReferenceSelect } from "../../../components/parity/ReferenceSelect";

type Props = {
  register: UseFormRegister<CreateWOFormValues>;
  watch: UseFormWatch<CreateWOFormValues>;
  requireLoadForExpense?: boolean;
  suggestedLoad?: { load_number: string; confidence: "exact" | "fuzzy" | "none" } | null;
  backendLoadError?: string | null;
  operatingCompanyId?: string;
  setValue?: UseFormSetValue<CreateWOFormValues>;
  getValues?: UseFormGetValues<CreateWOFormValues>;
};

function Field({ label, children }: { label: string; children: JSX.Element }) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-semibold text-gray-600">{label}</label>
      {children}
    </div>
  );
}

const SOURCE_TYPE_OPTIONS: Array<{
  value: CreateWOFormValues["source_type"];
  label: string;
  repairLocation: CreateWOFormValues["repair_location"];
  bucket: CreateWOFormValues["bucket"];
}> = [
  { value: "IS", label: "IS - Internal shop", repairLocation: "in_house", bucket: "in_house" },
  { value: "ES", label: "ES - External shop", repairLocation: "external_shop", bucket: "external" },
  { value: "AC", label: "AC - Accident", repairLocation: "external_shop", bucket: "external" },
  { value: "ET", label: "ET - External tires", repairLocation: "external_tires", bucket: "external" },
  { value: "RT", label: "RT - Road call", repairLocation: "mobile_roadside", bucket: "roadside" },
  { value: "IT", label: "IT - Internal tires", repairLocation: "internal_tires", bucket: "in_house" },
  { value: "RS", label: "RS - Roadside service", repairLocation: "mobile_roadside", bucket: "roadside" },
];

export function CreateWOSectionIdentification({
  register,
  watch,
  requireLoadForExpense = false,
  suggestedLoad = null,
  backendLoadError = null,
  operatingCompanyId,
  setValue,
  getValues,
}: Props) {
  const queryClient = useQueryClient();
  const type = watch("wo_type");
  const sourceType = watch("source_type");
  const bucket = watch("bucket");
  const repairLocation = watch("repair_location");
  const selectedLoadId = watch("load_id");
  const requireDriverAndLoad = type === "repair" || type === "tire" || type === "accident";
  const requireLoad = requireDriverAndLoad || requireLoadForExpense;
  const requireExternalFields = ["ES", "AC", "ET", "RT", "RS"].includes(sourceType);
  const showExemptionReason = requireLoadForExpense && !selectedLoadId;
  const vehiclesQuery = useQuery({
    queryKey: ["maintenance", "master-data", "vehicles", operatingCompanyId, "create-wo"],
    queryFn: () => listMaintenanceVehicles(String(operatingCompanyId), {}),
    enabled: Boolean(operatingCompanyId),
    staleTime: 60_000,
  });
  const vendorsQuery = useQuery({
    queryKey: ["maintenance", "vendors", operatingCompanyId, "create-wo-id"],
    queryFn: () => listVendors({ operating_company_id: String(operatingCompanyId), status: "active", limit: 200 }),
    enabled: Boolean(operatingCompanyId),
    staleTime: 60_000,
  });
  const customersQuery = useQuery({
    queryKey: ["maintenance", "customers", operatingCompanyId, "create-wo-id"],
    queryFn: () => listCustomers({ operating_company_id: String(operatingCompanyId), limit: 200 }),
    enabled: Boolean(operatingCompanyId),
    staleTime: 60_000,
  });
  const vehicleOptions = (vehiclesQuery.data?.rows ?? [])
    .map((row) => ({ value: row.id, label: row.unit_display_id || row.id }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const vendorOptions = (vendorsQuery.data?.vendors ?? [])
    .filter((v) => !v.deactivated_at)
    .map((v) => ({ value: v.id, label: v.name }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const customerOptions = (customersQuery.data?.customers ?? [])
    .map((c) => ({ value: c.id, label: c.name }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return (
    <section className="rounded-sm border border-gray-200 bg-white p-3">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3 lg:grid-cols-6">
        <Field label="WO Number">
          <input value="Auto on save" readOnly className="h-8 w-full rounded-sm border border-gray-300 bg-gray-100 px-2 text-sm" />
        </Field>
        <Field label="Date Opened *">
          {setValue ? (
            <DatePicker
              value={watch("service_date") || ""}
              onChange={(v) => setValue("service_date", v, { shouldDirty: true })}
              className="h-8 w-full rounded-sm border border-gray-300 px-2 text-sm"
            />
          ) : (
            <input {...register("service_date")} className="h-8 w-full rounded-sm border border-gray-300 px-2 text-sm" />
          )}
        </Field>
        <Field label="Unit *">
          {operatingCompanyId && setValue ? (
            <>
              <input type="hidden" {...register("unit_id", { required: true })} />
              <Combobox
                options={vehicleOptions}
                value={watch("unit_id") || null}
                placeholder={vehiclesQuery.isLoading ? "Loading units..." : "Select unit"}
                onChange={(value) => setValue("unit_id", value ?? "", { shouldDirty: true })}
              />
            </>
          ) : (
            <input {...register("unit_id", { required: true })} className="h-8 w-full rounded-sm border border-gray-300 px-2 text-sm" />
          )}
        </Field>
        <Field label="Driver locked — assigned to this trip">
          {operatingCompanyId && setValue ? (
            <>
              <input type="hidden" {...register("driver_id", { required: requireDriverAndLoad })} />
              <DriverPickerWithCreate
                operatingCompanyId={operatingCompanyId}
                value={watch("driver_id") || null}
                onChange={(value) => setValue("driver_id", value ?? "", { shouldDirty: true })}
                placeholder="Select driver"
              />
            </>
          ) : (
            <input {...register("driver_id", { required: requireDriverAndLoad })} className="h-8 w-full rounded-sm border border-gray-300 px-2 text-sm" />
          )}
        </Field>
        <Field label="Class (auto)">
          <input {...register("class_hint")} readOnly className="h-8 w-full rounded-sm border border-emerald-200 bg-emerald-50 px-2 text-sm font-semibold text-emerald-900" />
        </Field>
        <Field label="Load # auto — unit on active trip">
          <input {...register("load_id", { required: requireLoad })} className="h-8 w-full rounded-sm border border-gray-300 px-2 text-sm" />
        </Field>
      </div>
      <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-4">
        <Field label="Source Type *">
          <Combobox
            options={SOURCE_TYPE_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
            value={sourceType}
            onChange={(value) => {
              if (!value || !setValue) return;
              const selected = SOURCE_TYPE_OPTIONS.find((option) => option.value === value);
              setValue("source_type", value as CreateWOFormValues["source_type"], { shouldDirty: true });
              if (!selected) return;
              setValue("repair_location", selected.repairLocation, { shouldDirty: true });
              setValue("bucket", selected.bucket, { shouldDirty: true });
            }}
          />
        </Field>
        <Field label="Location *">
          <Combobox
            options={[
              { value: "external_shop", label: "External shop" },
              { value: "in_house", label: "Internal shop" },
              { value: "mobile_roadside", label: "Roadside" },
              { value: "internal_tires", label: "Internal tires" },
              { value: "external_tires", label: "External tires" },
            ]}
            value={repairLocation}
            onChange={(value) => {
              if (!value || !setValue) return;
              setValue("repair_location", value as CreateWOFormValues["repair_location"], { shouldDirty: true });
              if (value === "in_house") setValue("bucket", "in_house", { shouldDirty: true });
              if (value === "external_shop" || value === "external_tires") setValue("bucket", "external", { shouldDirty: true });
              if (value === "mobile_roadside") setValue("bucket", "roadside", { shouldDirty: true });
            }}
          />
        </Field>
        <Field label={repairLocation !== "in_house" ? "Vendor *" : "Vendor"}>
          {operatingCompanyId && setValue && getValues ? (
            <>
              <input type="hidden" {...register("vendor_id")} />
              <input type="hidden" {...register("vendor_qbo_id")} />
              <input type="hidden" {...register("vendor_display_name")} />
              <ReferenceSelect
                value={watch("vendor_id") || null}
                onChange={(next) => {
                  const match = vendorOptions.find((o) => o.value === next);
                  setValue("vendor_id", next ?? "", { shouldDirty: true });
                  setValue("external_vendor_id", next ?? "", { shouldDirty: true });
                  setValue("vendor_qbo_id", "", { shouldDirty: true });
                  setValue("vendor_display_name", match?.label ?? "", { shouldDirty: true });
                  if (next && match) {
                    const shopNameNow = String(getValues("shop_name") ?? "").trim();
                    if (!shopNameNow) {
                      setValue("shop_name", match.label, { shouldDirty: true });
                    }
                  }
                }}
                options={vendorOptions}
                createKind="vendor"
                operatingCompanyId={operatingCompanyId}
                placeholder="Search vendors…"
                onOptionCreated={(opt) => {
                  void queryClient.invalidateQueries({ queryKey: ["maintenance", "vendors"] });
                  setValue("vendor_display_name", opt.label, { shouldDirty: true });
                  setValue("external_vendor_id", opt.value, { shouldDirty: true });
                  const shopNameNow = String(getValues("shop_name") ?? "").trim();
                  if (!shopNameNow) setValue("shop_name", opt.label, { shouldDirty: true });
                }}
              />
            </>
          ) : (
            <input {...register("vendor_id")} className="h-8 w-full rounded-sm border border-gray-300 px-2 text-sm" />
          )}
        </Field>
        <Field label="Vendor RO / Invoice #">
          <input {...register("vendor_invoice_number")} className="h-8 w-full rounded-sm border border-gray-300 px-2 text-sm" />
        </Field>
      </div>

      <input type="hidden" {...register("source_type")} />
      <input type="hidden" {...register("bucket")} />
      <input type="hidden" {...register("external_vendor_id")} />

      <div className="mt-2 hidden">
        <Field label="Customer">
          {operatingCompanyId && setValue ? (
            <>
              <input type="hidden" {...register("customer_id")} />
              <input type="hidden" {...register("customer_qbo_id")} />
              <input type="hidden" {...register("customer_display_name")} />
              <ReferenceSelect
                value={watch("customer_id") || null}
                onChange={(next) => {
                  const match = customerOptions.find((o) => o.value === next);
                  setValue("customer_id", next ?? "", { shouldDirty: true });
                  setValue("customer_qbo_id", "", { shouldDirty: true });
                  setValue("customer_display_name", match?.label ?? "", { shouldDirty: true });
                }}
                options={customerOptions}
                createKind="customer"
                operatingCompanyId={operatingCompanyId}
                placeholder="Search customers…"
                onOptionCreated={(opt) => {
                  void queryClient.invalidateQueries({ queryKey: ["maintenance", "customers"] });
                  setValue("customer_display_name", opt.label, { shouldDirty: true });
                }}
              />
            </>
          ) : (
            <input className="h-8 w-full rounded-sm border border-gray-300 px-2 text-sm" disabled />
          )}
        </Field>
      </div>
      {operatingCompanyId && setValue && getValues && (bucket === "external" || repairLocation === "external_shop") ? (
        <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
          <Field label="Shop name">
            <input {...register("shop_name")} className="h-8 w-full rounded-sm border border-gray-300 px-2 text-sm" />
          </Field>
          <Field label="Shop phone">
            <input {...register("shop_phone")} className="h-8 w-full rounded-sm border border-gray-300 px-2 text-sm" />
          </Field>
          <Field label="Shop address">
            <input {...register("shop_address")} className="h-8 w-full rounded-sm border border-gray-300 px-2 text-sm" />
          </Field>
        </div>
      ) : null}
      {bucket === "roadside" ? (
        <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-4">
          <Field label="Roadside Callout At *">
            {/* Same watch/setValue bridge this file already uses for the DatePicker above —
                DateTimePicker is not an <input>, so it cannot take a register() spread. */}
            {setValue ? (
              <DateTimePicker
                aria-label="Roadside Callout At"
                value={watch("roadside_callout_at") || ""}
                onChange={(v) => setValue("roadside_callout_at", v, { shouldDirty: true })}
              />
            ) : (
              <input {...register("roadside_callout_at")} className="h-8 w-full rounded-sm border border-gray-300 px-2 text-sm" />
            )}
          </Field>
          <Field label="Roadside Arrived At">
            {setValue ? (
              <DateTimePicker
                aria-label="Roadside Arrived At"
                value={watch("roadside_arrived_at") || ""}
                onChange={(v) => setValue("roadside_arrived_at", v, { shouldDirty: true })}
              />
            ) : (
              <input {...register("roadside_arrived_at")} className="h-8 w-full rounded-sm border border-gray-300 px-2 text-sm" />
            )}
          </Field>
          <Field label="Roadside Provider Vendor ID *">
            <input {...register("roadside_provider_vendor_id")} className="h-8 w-full rounded-sm border border-gray-300 px-2 text-sm" />
          </Field>
          <Field label="Breakdown Load ID *">
            <input {...register("roadside_breakdown_load_id")} className="h-8 w-full rounded-sm border border-gray-300 px-2 text-sm" />
          </Field>
          <div className="md:col-span-4">
            <Field label="Roadside Location (min 10 chars) *">
              <input {...register("roadside_location")} className="h-8 w-full rounded-sm border border-gray-300 px-2 text-sm" />
            </Field>
          </div>
        </div>
      ) : null}
      {requireExternalFields ? (
        <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
          <Field label="External Vendor WO Number *">
            <input {...register("external_vendor_wo_number", { required: true })} className="h-8 w-full rounded-sm border border-gray-300 px-2 text-sm" />
          </Field>
          <Field label="External Vendor Invoice Number *">
            <input {...register("external_vendor_invoice_number", { required: true })} className="h-8 w-full rounded-sm border border-gray-300 px-2 text-sm" />
          </Field>
        </div>
      ) : null}
      <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-4">
        <div className="md:col-span-3">
          <Field label="Description">
            <input {...register("description", { required: true })} className="h-8 w-full rounded-sm border border-gray-300 px-2 text-sm" />
          </Field>
        </div>
      </div>
      {suggestedLoad ? (
        <div className="mt-2 rounded-sm border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-900">
          Suggested load: <span className="font-semibold">{suggestedLoad.load_number}</span>{" "}
          <span className="rounded-sm bg-emerald-100 px-1 py-0.5 uppercase">{suggestedLoad.confidence}</span>
        </div>
      ) : null}
      {showExemptionReason ? (
        <div className="mt-2">
          <Field label="Load exemption reason (required when no load selected, min 20 chars)">
            <textarea
              {...register("load_exemption_reason")}
              rows={2}
              className="w-full rounded-sm border border-gray-300 px-2 py-1 text-sm"
              placeholder="historical_pre_launch_data ... (min 20 chars)"
            />
          </Field>
        </div>
      ) : null}
      {backendLoadError ? <div className="mt-2 text-xs font-semibold text-red-600">{backendLoadError}</div> : null}
    </section>
  );
}
