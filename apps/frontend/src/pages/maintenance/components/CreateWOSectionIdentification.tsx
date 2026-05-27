import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { UseFormGetValues, UseFormRegister, UseFormSetValue, UseFormWatch } from "react-hook-form";
import { listMaintenanceDrivers, listMaintenanceVehicles } from "../../../api/maintenance";
import { useToast } from "../../../components/Toast";
import type { CreateWOFormValues } from "./CreateWorkOrderModal";
import { QboCombobox } from "../../../components/forms/QboCombobox";
import { Combobox } from "../../../components/shared/Combobox";
import { QuickCreateEntityModal, type QuickCreateKind } from "../../../components/forms/shared/QuickCreateEntityModal";

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
  const { pushToast } = useToast();
  const [quickCreateKind, setQuickCreateKind] = useState<QuickCreateKind | null>(null);
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
  const driversQuery = useQuery({
    queryKey: ["maintenance", "master-data", "drivers", operatingCompanyId, "create-wo"],
    queryFn: () => listMaintenanceDrivers(String(operatingCompanyId), {}),
    enabled: Boolean(operatingCompanyId),
    staleTime: 60_000,
  });
  const vehicleOptions = (vehiclesQuery.data?.rows ?? [])
    .map((row) => ({ value: row.id, label: row.unit_display_id || row.id }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const driverOptions = (driversQuery.data?.rows ?? [])
    .map((row) => ({ value: row.id, label: `${row.first_name} ${row.last_name}`.trim() || row.id }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return (
    <section className="rounded border border-gray-200 bg-white p-3">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3 lg:grid-cols-6">
        <Field label="WO Number">
          <input value="Auto on save" readOnly className="h-8 w-full rounded border border-gray-300 bg-gray-100 px-2 text-sm" />
        </Field>
        <Field label="Date Opened *">
          <input type="date" {...register("service_date")} className="h-8 w-full rounded border border-gray-300 px-2 text-sm" />
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
            <input {...register("unit_id", { required: true })} className="h-8 w-full rounded border border-gray-300 px-2 text-sm" />
          )}
        </Field>
        <Field label="Driver">
          {operatingCompanyId && setValue ? (
            <>
              <input type="hidden" {...register("driver_id", { required: requireDriverAndLoad })} />
              <Combobox
                options={driverOptions}
                value={watch("driver_id") || null}
                placeholder={driversQuery.isLoading ? "Loading drivers..." : "Select driver"}
                onChange={(value) => setValue("driver_id", value ?? "", { shouldDirty: true })}
              />
            </>
          ) : (
            <input {...register("driver_id", { required: requireDriverAndLoad })} className="h-8 w-full rounded border border-gray-300 px-2 text-sm" />
          )}
        </Field>
        <Field label="Class (auto)">
          <input {...register("class_hint")} readOnly className="h-8 w-full rounded border border-emerald-200 bg-emerald-50 px-2 text-sm font-semibold text-emerald-900" />
        </Field>
        <Field label="Load #">
          <input {...register("load_id", { required: requireLoad })} className="h-8 w-full rounded border border-gray-300 px-2 text-sm" />
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
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <QboCombobox
                    entityType="vendor"
                    operatingCompanyId={operatingCompanyId}
                    value={watch("vendor_qbo_id") ? watch("vendor_qbo_id") : null}
                    displayValue={watch("vendor_display_name") ?? ""}
                    allowFreeText={false}
                    placeholder="Search QuickBooks vendors…"
                    onChange={(qboId, displayName) => {
                      setValue("vendor_qbo_id", qboId ?? "", { shouldDirty: true });
                      setValue("vendor_display_name", displayName, { shouldDirty: true });
                      if (!qboId) {
                        setValue("vendor_id", "", { shouldDirty: true });
                        setValue("external_vendor_id", "", { shouldDirty: true });
                      }
                    }}
                    onPick={(row) => {
                      setValue("vendor_id", row.id, { shouldDirty: true });
                      setValue("external_vendor_id", row.id, { shouldDirty: true });
                      setValue("vendor_qbo_id", row.qbo_id, { shouldDirty: true });
                      setValue("vendor_display_name", row.display_name || row.company_name || "", { shouldDirty: true });
                      const shopNameNow = String(getValues("shop_name") ?? "").trim();
                      if (!shopNameNow) {
                        setValue("shop_name", row.display_name || row.company_name || "", { shouldDirty: true });
                      }
                      const shopPhoneNow = String(getValues("shop_phone") ?? "").trim();
                      if (!shopPhoneNow && row.primary_phone) {
                        setValue("shop_phone", row.primary_phone, { shouldDirty: true });
                      }
                    }}
                  />
                </div>
                <button
                  type="button"
                  className="h-9 rounded border border-gray-300 px-2 text-xs"
                  onClick={() => setQuickCreateKind("vendor")}
                  aria-label="Quick create vendor"
                >
                  + Create
                </button>
              </div>
            </>
          ) : (
            <input {...register("vendor_id")} className="h-8 w-full rounded border border-gray-300 px-2 text-sm" />
          )}
        </Field>
        <Field label="Vendor RO / Invoice #">
          <input {...register("vendor_invoice_number")} className="h-8 w-full rounded border border-gray-300 px-2 text-sm" />
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
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <QboCombobox
                    entityType="customer"
                    operatingCompanyId={operatingCompanyId}
                    value={watch("customer_qbo_id") ? watch("customer_qbo_id") : null}
                    displayValue={watch("customer_display_name") ?? ""}
                    allowFreeText={false}
                    placeholder="Search QuickBooks customers…"
                    onChange={(qboId, displayName) => {
                      setValue("customer_qbo_id", qboId ?? "", { shouldDirty: true });
                      setValue("customer_display_name", displayName, { shouldDirty: true });
                      if (!qboId) setValue("customer_id", "", { shouldDirty: true });
                    }}
                    onPick={(row) => {
                      setValue("customer_id", row.id, { shouldDirty: true });
                      setValue("customer_qbo_id", row.qbo_id, { shouldDirty: true });
                      setValue("customer_display_name", row.display_name || row.company_name || "", { shouldDirty: true });
                    }}
                  />
                </div>
                <button
                  type="button"
                  className="h-9 rounded border border-gray-300 px-2 text-xs"
                  onClick={() => setQuickCreateKind("customer")}
                  aria-label="Quick create customer"
                >
                  + Create
                </button>
              </div>
            </>
          ) : (
            <input className="h-8 w-full rounded border border-gray-300 px-2 text-sm" disabled />
          )}
        </Field>
      </div>
      {operatingCompanyId && setValue && getValues && (bucket === "external" || repairLocation === "external_shop") ? (
        <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
          <Field label="Shop name">
            <input {...register("shop_name")} className="h-8 w-full rounded border border-gray-300 px-2 text-sm" />
          </Field>
          <Field label="Shop phone">
            <input {...register("shop_phone")} className="h-8 w-full rounded border border-gray-300 px-2 text-sm" />
          </Field>
          <Field label="Shop address">
            <input {...register("shop_address")} className="h-8 w-full rounded border border-gray-300 px-2 text-sm" />
          </Field>
        </div>
      ) : null}
      {bucket === "roadside" ? (
        <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-4">
          <Field label="Roadside Callout At *">
            <input type="datetime-local" {...register("roadside_callout_at")} className="h-8 w-full rounded border border-gray-300 px-2 text-sm" />
          </Field>
          <Field label="Roadside Arrived At">
            <input type="datetime-local" {...register("roadside_arrived_at")} className="h-8 w-full rounded border border-gray-300 px-2 text-sm" />
          </Field>
          <Field label="Roadside Provider Vendor ID *">
            <input {...register("roadside_provider_vendor_id")} className="h-8 w-full rounded border border-gray-300 px-2 text-sm" />
          </Field>
          <Field label="Breakdown Load ID *">
            <input {...register("roadside_breakdown_load_id")} className="h-8 w-full rounded border border-gray-300 px-2 text-sm" />
          </Field>
          <div className="md:col-span-4">
            <Field label="Roadside Location (min 10 chars) *">
              <input {...register("roadside_location")} className="h-8 w-full rounded border border-gray-300 px-2 text-sm" />
            </Field>
          </div>
        </div>
      ) : null}
      {requireExternalFields ? (
        <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
          <Field label="External Vendor WO Number *">
            <input {...register("external_vendor_wo_number", { required: true })} className="h-8 w-full rounded border border-gray-300 px-2 text-sm" />
          </Field>
          <Field label="External Vendor Invoice Number *">
            <input {...register("external_vendor_invoice_number", { required: true })} className="h-8 w-full rounded border border-gray-300 px-2 text-sm" />
          </Field>
        </div>
      ) : null}
      <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-4">
        <div className="md:col-span-3">
          <Field label="Description">
            <input {...register("description", { required: true })} className="h-8 w-full rounded border border-gray-300 px-2 text-sm" />
          </Field>
        </div>
      </div>
      {suggestedLoad ? (
        <div className="mt-2 rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-900">
          Suggested load: <span className="font-semibold">{suggestedLoad.load_number}</span>{" "}
          <span className="rounded bg-emerald-100 px-1 py-0.5 uppercase">{suggestedLoad.confidence}</span>
        </div>
      ) : null}
      {showExemptionReason ? (
        <div className="mt-2">
          <Field label="Load exemption reason (required when no load selected, min 20 chars)">
            <textarea
              {...register("load_exemption_reason")}
              rows={2}
              className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
              placeholder="historical_pre_launch_data ... (min 20 chars)"
            />
          </Field>
        </div>
      ) : null}
      {backendLoadError ? <div className="mt-2 text-xs font-semibold text-red-600">{backendLoadError}</div> : null}
      {quickCreateKind && operatingCompanyId && setValue ? (
        <QuickCreateEntityModal
          open
          kind={quickCreateKind}
          operatingCompanyId={operatingCompanyId}
          onClose={() => setQuickCreateKind(null)}
          onCreated={(created) => {
            if (quickCreateKind === "vendor") {
              setValue("vendor_id", created.id, { shouldDirty: true });
              setValue("external_vendor_id", created.id, { shouldDirty: true });
              setValue("vendor_qbo_id", "", { shouldDirty: true });
              setValue("vendor_display_name", created.label, { shouldDirty: true });
              const shopNameNow = getValues ? String(getValues("shop_name") ?? "").trim() : "";
              if (!shopNameNow) setValue("shop_name", created.label, { shouldDirty: true });
            } else if (quickCreateKind === "customer") {
              setValue("customer_id", created.id, { shouldDirty: true });
              setValue("customer_qbo_id", "", { shouldDirty: true });
              setValue("customer_display_name", created.label, { shouldDirty: true });
            } else {
              pushToast("Unsupported quick create target.", "error");
            }
            setQuickCreateKind(null);
            void queryClient.invalidateQueries({ queryKey: ["qbo-mdata-autocomplete"] });
          }}
        />
      ) : null}
    </section>
  );
}
