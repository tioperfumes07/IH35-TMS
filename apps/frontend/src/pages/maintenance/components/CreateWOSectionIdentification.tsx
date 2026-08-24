import type { JSX } from "react";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { UseFormGetValues, UseFormRegister, UseFormSetValue, UseFormWatch } from "react-hook-form";
import { getDriver, getUnit } from "../../../api/mdata";
import type { CreateWOFormValues } from "./CreateWorkOrderModal";
import { DriverPickerWithCreate } from "../../../components/drivers/DriverPickerWithCreate";
import { EntityPicker } from "../../../components/parity/EntityPicker";
import { DatePicker } from "../../../components/forms/DatePicker";
import { DateTimePicker } from "../../../components/forms/DateTimePicker";
import { Combobox } from "../../../components/shared/Combobox";
import { entityLabel } from "../../../lib/entity-label";
import { EntityLink } from "../../../components/shared/EntityLink";


/** AUDIT-611 / backend deriveClassHint — {UNIT_DISPLAY}-{DRIVER_LAST} never raw UUIDs. */
export function deriveWoClassHintLabel(opts: {
  unitDisplayId?: string | null;
  driverLastName?: string | null;
  hasUnit: boolean;
  hasDriver: boolean;
}): string {
  const unitPart = String(opts.unitDisplayId ?? "").trim() || (opts.hasUnit ? "UNIT" : "UNIT");
  const driverPart = String(opts.driverLastName ?? "")
    .trim()
    .toUpperCase() || (opts.hasDriver ? "DRIVER" : "UNASSIGNED");
  // Never emit UUID-shaped segments (8-4-4-4-12) — that was the live defect.
  const looksUuid = (s: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
  const safeUnit = looksUuid(unitPart) ? "UNIT" : unitPart;
  const safeDriver = looksUuid(driverPart) ? "UNASSIGNED" : driverPart;
  return `${safeUnit}-${safeDriver}`;
}

type Props = {
  register: UseFormRegister<CreateWOFormValues>;
  watch: UseFormWatch<CreateWOFormValues>;
  requireLoadForExpense?: boolean;
  suggestedLoad?: { load_id: string; load_number: string; confidence: "exact" | "fuzzy" | "none" } | null;
  backendLoadError?: string | null;
  operatingCompanyId?: string;
  setValue?: UseFormSetValue<CreateWOFormValues>;
  getValues?: UseFormGetValues<CreateWOFormValues>;
  onIdentityReadStateChange?: (blocked: boolean) => void;
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
  onIdentityReadStateChange,
}: Props) {
  const type = watch("wo_type");
  const sourceType = watch("source_type");
  const bucket = watch("bucket");
  const repairLocation = watch("repair_location");
  const selectedLoadId = watch("load_id");
  const requireDriverAndLoad = type === "repair" || type === "tire" || type === "accident";
  const requireLoad = requireDriverAndLoad || requireLoadForExpense;
  const requireExternalFields = ["ES", "AC", "ET", "RT", "RS"].includes(sourceType);
  const showExemptionReason = requireLoadForExpense && !selectedLoadId;
  const unitId = watch("unit_id");
  const driverId = watch("driver_id");
  // SAF-B29 / picker law: never silent 500/1000-cap pages.
  // Unit/vendor/customer → EntityPicker (server-search).
  const selectedUnitQuery = useQuery({
    queryKey: ["maintenance", "master-data", "unit", operatingCompanyId, unitId],
    queryFn: () => getUnit(String(unitId), String(operatingCompanyId)),
    enabled: Boolean(operatingCompanyId) && Boolean(unitId),
    staleTime: 60_000,
  });
  const selectedDriverQuery = useQuery({
    queryKey: ["maintenance", "master-data", "driver", operatingCompanyId, driverId],
    queryFn: () => getDriver(String(driverId), String(operatingCompanyId)),
    enabled: Boolean(operatingCompanyId) && Boolean(driverId),
    staleTime: 60_000,
  });

  const identityReadBlocked =
    Boolean(unitId) && (selectedUnitQuery.isPending || selectedUnitQuery.isError) ||
    Boolean(driverId) && (selectedDriverQuery.isPending || selectedDriverQuery.isError);

  useEffect(() => {
    onIdentityReadStateChange?.(identityReadBlocked);
  }, [identityReadBlocked, onIdentityReadStateChange]);

  useEffect(() => {
    if (!setValue) return;
    if (identityReadBlocked) return;
    const unitDisplay = selectedUnitQuery.data?.unit_number;
    const next = deriveWoClassHintLabel({
      unitDisplayId: unitDisplay,
      driverLastName: selectedDriverQuery.data?.last_name,
      hasUnit: Boolean(unitId),
      hasDriver: Boolean(driverId),
    });
    const current = getValues?.("class_hint") ?? "";
    if (current !== next) {
      setValue("class_hint", next, { shouldDirty: false });
    }
  }, [setValue, getValues, unitId, driverId, identityReadBlocked, selectedUnitQuery.data, selectedDriverQuery.data]);
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
              className="h-8 w-full"
            />
          ) : (
            <input {...register("service_date")} className="h-8 w-full rounded-sm border border-gray-300 px-2 text-sm" />
          )}
        </Field>
        <Field label="Unit *">
          {operatingCompanyId && setValue ? (
            <>
              <input type="hidden" {...register("unit_id", { required: true })} />
              <EntityPicker
                kind="unit"
                operatingCompanyId={operatingCompanyId}
                value={watch("unit_id") || null}
                onChange={(value) => setValue("unit_id", value ?? "", { shouldDirty: true })}
                placeholder="Select unit"
                dataField="unit_id"
                className="h-8 w-full text-sm"
              />
            </>
          ) : (
            <input {...register("unit_id", { required: true })} className="h-8 w-full rounded-sm border border-gray-300 px-2 text-sm" />
          )}
        </Field>
        <Field label="Trailer / equipment">
          {/* CREATE-PATH TRIP: trailers/reefers use mdata.equipment → work_orders.equipment_id (no trailer_id col). */}
          {operatingCompanyId && setValue ? (
            <div data-testid="wo-equipment-entity-picker">
              <input type="hidden" {...register("equipment_id")} />
              <EntityPicker
                kind="trailer"
                operatingCompanyId={operatingCompanyId}
                value={watch("equipment_id") || null}
                onChange={(value) => setValue("equipment_id", value ?? "", { shouldDirty: true })}
                placeholder="Select trailer…"
                dataField="equipment_id"
                dataTestId="wo-create-equipment-picker"
                className="h-8 w-full text-sm"
                allowClear
              />
            </div>
          ) : (
            <input {...register("equipment_id")} className="h-8 w-full rounded-sm border border-gray-300 px-2 text-sm" />
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
          <input
            {...register("class_hint")}
            readOnly
            data-testid="wo-class-auto-derive"
            aria-label="Class auto-derive"
            className="h-8 w-full rounded-sm border border-emerald-200 bg-emerald-50 px-2 text-sm font-semibold text-emerald-900"
          />
        </Field>
        <Field label="Load # auto — unit on active trip">
          {/* M-18: G18 load FK must be EntityPicker kind=load — never raw UUID text. */}
          {operatingCompanyId && setValue ? (
            <div data-testid="wo-load-entity-picker">
              <input type="hidden" {...register("load_id", { required: requireLoad })} />
              <EntityPicker
                kind="load"
                operatingCompanyId={operatingCompanyId}
                value={watch("load_id") || null}
                onChange={(value) => setValue("load_id", value ?? "", { shouldDirty: true })}
                placeholder="Search load…"
                dataField="load_id"
                className="h-8 w-full text-sm"
              />
            </div>
          ) : (
            <input {...register("load_id", { required: requireLoad })} className="h-8 w-full rounded-sm border border-gray-300 px-2 text-sm" />
          )}
        </Field>
      </div>
      {selectedUnitQuery.isError ? (
        <button type="button" className="mt-2 text-xs font-semibold text-red-700 underline" onClick={() => void selectedUnitQuery.refetch()}>
          Selected unit couldn't be loaded — retry
        </button>
      ) : null}
      {selectedDriverQuery.isError ? (
        <button type="button" className="mt-2 ml-3 text-xs font-semibold text-red-700 underline" onClick={() => void selectedDriverQuery.refetch()}>
          Selected driver couldn't be loaded — retry
        </button>
      ) : null}
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
              {/* Label only — shop_name/vendor_id are the persisted fields. */}
              {/* CLS-SILENT-CAP: EntityPicker server-search — no capped vendor roster page. */}
              <EntityPicker
                kind="vendor"
                allowCreate
                operatingCompanyId={operatingCompanyId}
                value={watch("vendor_id") || null}
                onChange={(next, option) => {
                  setValue("vendor_id", next ?? "", { shouldDirty: true });
                  setValue("external_vendor_id", next ?? "", { shouldDirty: true });
                  setValue("vendor_qbo_id", "", { shouldDirty: true });
                  setValue("vendor_display_name", option?.label ?? "", { shouldDirty: true });
                  if (next && option?.label) {
                    const shopNameNow = String(getValues("shop_name") ?? "").trim();
                    if (!shopNameNow) {
                      setValue("shop_name", option.label, { shouldDirty: true });
                    }
                  }
                }}
                placeholder="Search vendors…"
                dataField="vendor_id"
                className="h-8 w-full text-sm"
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

      <div className="mt-2">
        <Field label="Customer">
          {operatingCompanyId && setValue ? (
            <>
              <input type="hidden" {...register("customer_id")} />
              {/* CLS-SILENT-CAP: EntityPicker server-search — no capped customer roster page. */}
              <EntityPicker
                kind="customer"
                allowCreate
                operatingCompanyId={operatingCompanyId}
                value={watch("customer_id") || null}
                onChange={(next, option) => {
                  setValue("customer_id", next ?? "", { shouldDirty: true });
                  setValue("customer_display_name", option?.label ?? "", { shouldDirty: true });
                }}
                placeholder="Search customers…"
                dataField="customer_id"
                className="h-8 w-full text-sm"
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
          <Field label="Roadside Provider Vendor *">
            {/*
              LST-PICKER-01 (guard 1868): free-text UUID for roadside_provider_vendor_id.
              Backend joins mdata.vendors (work-orders.service.ts) and requires the id for
              roadside WOs. EntityPicker kind=vendor allowCreate — same canonical table as shop vendor.
            */}
            {setValue && operatingCompanyId ? (
              <div data-testid="wo-roadside-provider-vendor-select">
                <EntityPicker
                  kind="vendor"
                  allowCreate
                  operatingCompanyId={operatingCompanyId}
                  value={watch("roadside_provider_vendor_id") || null}
                  onChange={(next) => setValue("roadside_provider_vendor_id", next ?? "", { shouldDirty: true })}
                  placeholder="Select roadside vendor…"
                  dataField="roadside_provider_vendor_id"
                  className="h-8 w-full text-sm"
                />
              </div>
            ) : (
              <input {...register("roadside_provider_vendor_id")} className="h-8 w-full rounded-sm border border-gray-300 px-2 text-sm" />
            )}
          </Field>
          <Field label="Breakdown Load *">
            {operatingCompanyId && setValue ? (
              <div data-testid="wo-breakdown-load-entity-picker">
                <input type="hidden" {...register("roadside_breakdown_load_id")} />
                <EntityPicker
                  kind="load"
                  operatingCompanyId={operatingCompanyId}
                  value={watch("roadside_breakdown_load_id") || null}
                  onChange={(value) => setValue("roadside_breakdown_load_id", value ?? "", { shouldDirty: true })}
                  placeholder="Search breakdown load…"
                  dataField="roadside_breakdown_load_id"
                  className="h-8 w-full text-sm"
                />
              </div>
            ) : (
              <input {...register("roadside_breakdown_load_id")} className="h-8 w-full rounded-sm border border-gray-300 px-2 text-sm" />
            )}
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
          Suggested load:{" "}
          <EntityLink kind="load" id={suggestedLoad.load_id} label={entityLabel(suggestedLoad.load_number, suggestedLoad.load_id, "Load")} className="font-semibold" />{" "}
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
