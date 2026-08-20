import { useEffect, useState, type JSX } from "react";
import { useQuery } from "@tanstack/react-query";
import type { UseFormRegister, UseFormSetValue, UseFormWatch } from "react-hook-form";
import { listDriverTeams } from "../../../api/mdata";
import { DriverPickerWithCreate } from "../../../components/drivers/DriverPickerWithCreate";
import { EntityPicker } from "../../../components/parity/EntityPicker";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";
import { OptimalDriversPanel } from "../../../components/dispatch/OptimalDriversPanel";
import { DriverHosClocksBlock } from "../../../components/dispatch/hos/DriverHosClocks";
import { DeadheadOptimizerPanel } from "../../../components/dispatch/DeadheadOptimizerPanel";
import { DriverInstructionsTextarea } from "./book-load-v4/DriverInstructionsTextarea";
import { ExpectedAdjustmentsCallout } from "./book-load-v4/ExpectedAdjustmentsCallout";
import { loadTrailerEquipmentCatalogClient, type DispatchCatalogRow } from "../../../api/catalogs-dispatch";
import { ReferenceSelect } from "../../../components/parity/ReferenceSelect";
import { EntityLinkOrTombstone } from "../../../components/shared/EntityLinkOrTombstone";
import type { EntityPickerOption } from "../../../components/parity/entityPickerRegistry";

type Props = {
  register: UseFormRegister<any>;
  watch?: UseFormWatch<any>;
  setValue?: UseFormSetValue<any>;
  operatingCompanyId?: string;
  /** Existing load id when editing; preview seam uses reservation uuid for new books. */
  optimizerLoadId?: string;
  /** Deadhead-optimizer inputs lifted from the parent so §B order is owned here (RENDER-A-v2). */
  deadheadAfterAt?: string;
  deadheadDropCity?: string;
  deadheadDropState?: string;
};

export function BookLoadEquipmentSection({ register, watch, setValue, operatingCompanyId, optimizerLoadId, deadheadAfterAt, deadheadDropCity, deadheadDropState }: Props) {
  const assignmentMode = watch ? watch("assignment_mode") : "solo";
  const primaryDriverId = watch ? String(watch("assigned_primary_driver_id") ?? "") : "";
  const secondaryDriverId = watch ? String(watch("assigned_secondary_driver_id") ?? "") : "";
  const assignedUnitId = watch ? String(watch("assigned_unit_id") ?? "") : "";
  const assignedTrailerUnitId = watch ? String(watch("assigned_trailer_unit_id") ?? "") : "";
  const [primaryDriverOption, setPrimaryDriverOption] = useState<EntityPickerOption | null>(null);
  const [secondaryDriverOption, setSecondaryDriverOption] = useState<EntityPickerOption | null>(null);
  const [unitOption, setUnitOption] = useState<EntityPickerOption | null>(null);
  const [trailerOption, setTrailerOption] = useState<EntityPickerOption | null>(null);
  const reservationUuid = watch ? String(watch("reservation_uuid") ?? "") : "";
  const trailerType = watch ? String(watch("trailer_type") ?? "") : "";
  const temperatureType = watch ? String(watch("temperature_type") ?? "") : ""; // W-FIX-1 Frozen/Fresh segmented
  // Conditional equipment detail reveals (render-v6 §B): reefer detail only on a reefer trailer, tarp detail
  // only on a flatbed. Previously the reefer setpoint always showed and flatbed tarp detail never revealed.
  const isReefer = trailerType === "refrigerated_van";
  const isFlatbed = trailerType === "flatbed";
  // render-v6 §B: Tarp qty + size are disabled until "Tarp required?" = Yes (reuses requires_tarps).
  const tarpRequired = watch ? Boolean(watch("requires_tarps")) : false;
  const hazmat = watch ? Boolean(watch("hazmat")) : false;
  const stops = watch ? (watch("stops") as Array<{ city?: string; state?: string }> | undefined) : undefined;
  const pickupStop = stops?.find((s) => s) ?? stops?.[0];
  const optimizerLoadKey =
    optimizerLoadId ||
    reservationUuid ||
    "00000000-0000-4000-8000-000000000000";
  const teamsQuery = useQuery({
    queryKey: ["book-load-driver-teams", operatingCompanyId],
    queryFn: () => listDriverTeams(String(operatingCompanyId)),
    enabled: Boolean(operatingCompanyId),
  });
  const trailerEquipmentQuery = useQuery({
    queryKey: ["book-load-trailer-equipment", operatingCompanyId],
    queryFn: async () => {
      const limit = 200;
      const rows: DispatchCatalogRow[] = [];
      for (let offset = 0; ; offset += limit) {
        const page = await loadTrailerEquipmentCatalogClient.list({
          operating_company_id: String(operatingCompanyId),
          is_active: "true",
          limit,
          offset,
        });
        rows.push(...page.rows);
        if (rows.length >= page.total || page.rows.length < limit) return { rows, total: page.total };
      }
    },
    enabled: Boolean(operatingCompanyId),
  });
  useEffect(() => {
    if (!watch || !setValue || watch("load_trailer_equipment_id")) return;
    const match = trailerEquipmentQuery.data?.rows?.find((row) => row.code.toLowerCase() === trailerType);
    if (match) setValue("load_trailer_equipment_id", match.id);
  }, [setValue, trailerEquipmentQuery.data?.rows, trailerType, watch]);
  // C9: all six equipment requirement chips persist on mdata.loads (requires_tarps historically;
  // the other five via HOLD migration 202609170000).
  const toggles = [
    { field: "requires_reefer_fuel", label: "Reefer fuel" },
    { field: "requires_pulp_probe", label: "Pulp probe" },
    { field: "requires_locking_jacks", label: "Locking jacks" },
    { field: "requires_tarps", label: "Tarps" },
    { field: "requires_load_locks", label: "Load locks" },
    { field: "requires_straps", label: "Straps" },
  ] as const;

  return (
    <section className="space-y-2">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        {/* render-v6 §B labels: Reefer / Flatbed / Dry Van (/ Lowboy — needs a trailer_type enum value via a
            gated migration; flagged). power_only_* kept — real data; removing them would break power-only loads. */}
        <Field label="Trailer type" input={
          <ReferenceSelect
            value={watch ? String(watch("load_trailer_equipment_id") ?? "") || null : null}
            onChange={(next) => {
              const row = trailerEquipmentQuery.data?.rows?.find((item) => item.id === next);
              setValue?.("load_trailer_equipment_id", next ?? "", { shouldDirty: true });
              if (row) setValue?.("trailer_type", row.code.toLowerCase(), { shouldDirty: true });
            }}
            options={(trailerEquipmentQuery.data?.rows ?? []).map((row) => ({ value: row.id, label: row.display_name, type: row.code }))}
            createKind="load_trailer_equipment"
            operatingCompanyId={operatingCompanyId ?? ""}
            loading={trailerEquipmentQuery.isLoading}
            placeholder="Select trailer requirement"
            onOptionCreated={() => void trailerEquipmentQuery.refetch()}
          />
        } />
        <Field
          label="Truck unit"
          input={
            <EntityPicker
              kind="unit"
              operatingCompanyId={operatingCompanyId ?? ""}
              value={assignedUnitId || null}
              onChange={(next, option) => {
                setUnitOption(option ?? null);
                setValue?.("assigned_unit_id", next ?? "", { shouldDirty: true });
              }}
              onSelectedOptionResolved={setUnitOption}
              className="h-7 w-full text-xs"
              placeholder={operatingCompanyId ? "Select truck unit" : "Select company first"}
              dataField="assigned_unit_id"
              disabled={!operatingCompanyId}
            />
          }
        />
        <Field
          label="Trailer unit"
          input={
            <EntityPicker
              kind="trailer"
              operatingCompanyId={operatingCompanyId ?? ""}
              value={assignedTrailerUnitId || null}
              onChange={(next, option) => {
                setTrailerOption(option ?? null);
                setValue?.("assigned_trailer_unit_id", next ?? "", { shouldDirty: true });
              }}
              onSelectedOptionResolved={setTrailerOption}
              className="h-7 w-full text-xs"
              placeholder={operatingCompanyId ? "Select trailer unit" : "Select company first"}
              dataField="assigned_trailer_unit_id"
              disabled={!operatingCompanyId}
            />
          }
        />
      </div>
      {/* Exact Leaves dispatch.parity.book_load_equipment_section:driver|unit|trailer —
          pickers alone leave selected identities non-navigable; expose EntityLinks. */}
      {assignedUnitId || assignedTrailerUnitId || primaryDriverId || secondaryDriverId ? (
        <div
          className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600"
          data-testid="book-load-equipment-selected-entitylinks"
        >
          {primaryDriverId ? (
            <span data-testid="book-load-equipment-driver-link">
              Driver:{" "}
              <EntityLinkOrTombstone kind="driver" id={primaryDriverId} name={primaryDriverOption?.label ?? null} noun="Driver" />
            </span>
          ) : null}
          {secondaryDriverId ? (
            <span data-testid="book-load-equipment-team-driver-link">
              Team:{" "}
              <EntityLinkOrTombstone kind="driver" id={secondaryDriverId} name={secondaryDriverOption?.label ?? null} noun="Driver" />
            </span>
          ) : null}
          {assignedUnitId ? (
            <span data-testid="book-load-equipment-unit-link">
              Unit: <EntityLinkOrTombstone kind="unit" id={assignedUnitId} name={unitOption?.label ?? null} noun="Unit" />
            </span>
          ) : null}
          {assignedTrailerUnitId ? (
            <span data-testid="book-load-equipment-trailer-link">
              Trailer:{" "}
              <EntityLinkOrTombstone kind="trailer" id={assignedTrailerUnitId} name={trailerOption?.label ?? null} noun="Trailer" />
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <Field
          label="Driver"
          input={
            <DriverPickerWithCreate
              operatingCompanyId={operatingCompanyId ?? ""}
              value={primaryDriverId || null}
              onChange={(next, option) => {
                setPrimaryDriverOption(option ?? null);
                setValue?.("assigned_primary_driver_id", next ?? "", { shouldDirty: true });
              }}
              onSelectedOptionResolved={setPrimaryDriverOption}
              className="h-7 w-full text-xs"
              placeholder="Select driver"
              dataField="assigned_primary_driver_id"
              // FAIL-CA1: driver create defaults to Probation — Active-only hid SAMPLE Cascade-1612 class.
              driverRoster="active_or_probation"
              // BookLoadModalV4 is a centered portal modal (not ParityDrawer) → default shell="modal".
            />
          }
        />
        <Field
          label="Team driver"
          input={
            <DriverPickerWithCreate
              operatingCompanyId={operatingCompanyId ?? ""}
              value={secondaryDriverId || null}
              onChange={(next, option) => {
                setSecondaryDriverOption(option ?? null);
                setValue?.("assigned_secondary_driver_id", next ?? "", { shouldDirty: true });
              }}
              onSelectedOptionResolved={setSecondaryDriverOption}
              className="h-7 w-full text-xs"
              placeholder="Solo load (optional)"
              dataField="assigned_secondary_driver_id"
              driverRoster="active_or_probation"
            />
          }
        />
      </div>
      {operatingCompanyId && pickupStop?.city ? (
        <OptimalDriversPanel
          loadId={optimizerLoadKey}
          operatingCompanyId={operatingCompanyId}
          selectedDriverId={primaryDriverId}
          onSelectDriver={(id) => setValue?.("assigned_primary_driver_id", id, { shouldDirty: true })}
          preview={{
            pickup_city: pickupStop.city,
            pickup_state: pickupStop.state,
            hazmat,
            trailer_type: trailerType,
          }}
        />
      ) : null}
      {/* RENDER-A-v2 §B: deadhead-optimizer aid sits with the driver-assignment helpers, before reefer/flatbed. */}
      {assignedUnitId && operatingCompanyId ? (
        <DeadheadOptimizerPanel
          operatingCompanyId={operatingCompanyId}
          unitUuid={assignedUnitId}
          unitName={unitOption?.label ?? null}
          afterDeliveryAt={deadheadAfterAt ?? ""}
          dropCity={deadheadDropCity ?? ""}
          dropState={deadheadDropState ?? ""}
        />
      ) : null}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto] md:items-center">
        <Field
          label="Assignment mode"
          input={
            <div className="inline-flex h-7 overflow-hidden rounded-sm border border-gray-300 bg-white text-[11px]">
              <label className={`flex cursor-pointer items-center px-3 ${assignmentMode === "solo" ? "bg-[#1f2a44] text-white" : "text-gray-700"}`}>
                <input type="radio" value="solo" className="hidden" {...register("assignment_mode")} />
                Solo
              </label>
              <label className={`flex cursor-pointer items-center border-l border-gray-300 px-3 ${assignmentMode === "team" ? "bg-[#1f2a44] text-white" : "text-gray-700"}`}>
                <input type="radio" value="team" className="hidden" {...register("assignment_mode")} />
                Team
              </label>
            </div>
          }
        />
        <Field
          label="Team preset"
          input={
            <SelectCombobox {...register("team_id")} className="h-7 min-w-[240px] text-xs">
              <option value="">{teamsQuery.isLoading ? "Loading teams..." : "Optional team preset"}</option>
              {(teamsQuery.data?.teams ?? []).map((team) => (
                <option key={team.id} value={team.id}>
                  {team.team_name}
                </option>
              ))}
            </SelectCombobox>
          }
        />
      </div>
      {/* RENDER-A-v2 §B: Driver pay rate / mi is TOP-LEVEL, half-row (standard field width). The separate
          "Reefer setpoint" field is REMOVED — the reefer panel's temperature IS the single setpoint. */}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <Field
          label="Driver pay rate / mi"
          input={
            <input
              type="number"
              step="0.01"
              min="0"
              {...register("driver_pay_rate_per_mile", { valueAsNumber: true })}
              className="h-7 w-full rounded-sm border border-gray-300 px-2 text-xs"
            />
          }
        />
      </div>
      {/* RENDER-A-v2 §B REEFER PANEL (amber, "Refrigerated") — reefer trailer only. "Temperature type"
          (Frozen/Fresh) is asked FIRST, THEN "Reefer temperature (°F)" (the single setpoint reefer_temp_f).
          temperature_type persists via migration 202606231600 (W-FIX-1). Reefer mode + Pre-cool removed. */}
      {isReefer ? (
        <div data-testid="reefer-panel" className="grid grid-cols-1 gap-2 rounded-sm border border-slate-200 bg-slate-100 p-2 md:grid-cols-2">
          <Field
            label="Temperature type"
            input={
              <div data-testid="temperature-type-segmented" className="flex h-7 overflow-hidden rounded-sm border border-gray-300 text-xs">
                {/* register keeps the value in form state; the buttons drive it via setValue (segmented control,
                    RENDER-A-v2). Asked FIRST, before "Reefer temperature (°F)". */}
                <input type="hidden" {...register("temperature_type")} />
                {([
                  { value: "frozen", label: "Frozen" },
                  { value: "fresh", label: "Fresh" },
                ] as const).map((opt, idx) => {
                  const active = temperatureType === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setValue?.("temperature_type", opt.value, { shouldDirty: true })}
                      className={`flex-1 px-2 ${idx === 0 ? "border-r border-gray-300" : ""} ${active ? "bg-[#1F2A44] text-white" : "bg-white text-slate-700"}`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            }
          />
          <Field
            label="Reefer temperature (°F)"
            input={<input data-testid="reefer-temp-field" type="number" step="0.1" {...register("reefer_temp_f", { valueAsNumber: true })} className="h-7 w-full rounded-sm border border-gray-300 px-2 text-xs" />}
          />
        </div>
      ) : null}
      {/* Render-v6 §B conditional detail: revealed by trailer type. Reefer setpoint above (reefer only);
          flatbed reveals the tarp-type detail (the "Tarps" required toggle stays in the Equipment chips). */}
      {isFlatbed ? (
        <div data-testid="flatbed-tarp-detail" className="grid grid-cols-1 gap-2 rounded-sm border border-slate-200 bg-slate-100 p-2 md:grid-cols-3">
          {/* RENDER-A-v2 §B flatbed = Tarp required? · Tarp qty · Tarp size. The old "Tarp type" material
              dropdown is a separate extra beyond the size dropdown → kept hidden for round-trip. */}
          <input type="hidden" {...register("tarp_type")} />
          <Field
            label="Tarp required?"
            input={
              <label className="flex h-7 items-center gap-2 text-xs">
                <input type="checkbox" {...register("requires_tarps")} className="h-3.5 w-3.5" /> Required
              </label>
            }
          />
          <Field
            label="Tarp qty"
            input={<input data-testid="tarp-qty-field" type="number" min={0} step={1} disabled={!tarpRequired} {...register("tarp_qty", { valueAsNumber: true })} className="h-7 w-full rounded-sm border border-gray-300 px-2 text-xs disabled:bg-gray-100" />}
          />
          <Field
            label="Tarp size"
            input={
              <SelectCombobox {...register("tarp_size")} disabled={!tarpRequired} className="h-7 w-full text-xs disabled:bg-gray-100">
                <option value="">—</option>
                <option value="4ft">4'</option>
                <option value="6ft">6'</option>
                <option value="8ft">8'</option>
                <option value="steel">Steel</option>
                <option value="lumber">Lumber</option>
              </SelectCombobox>
            }
          />
        </div>
      ) : null}
      {/* RENDER-A-v2 §B: "Equipment & driver instructions" expander — equipment requirement chips + the
          driver-visible instructions, combined into one expander after the trailer panels. */}
      <details open data-testid="equipment-driver-instructions" className="rounded-sm border border-gray-200">
        <summary className="cursor-pointer px-2 py-1 text-[11px] font-semibold text-[#1f2a44]">
          Equipment &amp; driver instructions <span className="font-normal text-gray-400">requirements · visible to driver</span>
        </summary>
        <div className="space-y-2 border-t border-gray-200 p-2">
          <div>
            <div className="mb-1 text-[9px] font-semibold uppercase tracking-[0.4px] text-gray-600">Equipment</div>
            <div className="flex flex-wrap gap-1.5">
              {toggles.map((toggle) => (
                <label key={toggle.field} className="cursor-pointer">
                  <input type="checkbox" {...register(toggle.field)} className="peer sr-only" />
                  <span className="inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-[0.3px] text-gray-600 ring-1 ring-gray-300 peer-checked:bg-[#1f2a44] peer-checked:text-white peer-checked:ring-[#1f2a44]">
                    {toggle.label}
                  </span>
                </label>
              ))}
            </div>
          </div>
          <DriverInstructionsTextarea register={register as never} />
        </div>
      </details>
      {/* RENDER-A-v2 §B: "Expected adjustments" (HOS · detention · late risk) is the LAST §B block. Holds the
          Driver HOS clock set (always shown; "No HOS data" until a driver + Samsara HOS) + the chargeback /
          detention / late-risk callout. */}
      <details open data-testid="expected-adjustments" className="rounded-sm border border-gray-200">
        <summary className="cursor-pointer px-2 py-1 text-[11px] font-semibold text-[#1f2a44]">
          Expected adjustments <span className="font-normal text-gray-400">HOS · detention · late risk</span>
        </summary>
        <div className="space-y-2 border-t border-gray-200 p-2">
          <DriverHosClocksBlock driverId={primaryDriverId} operatingCompanyId={operatingCompanyId} heading="Driver HOS (hours of service)" />
          {assignmentMode === "team" && secondaryDriverId ? (
            <DriverHosClocksBlock driverId={secondaryDriverId} operatingCompanyId={operatingCompanyId} heading="Team driver HOS" />
          ) : null}
          <ExpectedAdjustmentsCallout
            register={register as never}
            operatingCompanyId={operatingCompanyId ?? ""}
            watch={(watch ?? (() => undefined)) as never}
            setValue={(setValue ?? (() => undefined)) as never}
          />
        </div>
      </details>
      <div className="hidden">
        <input type="number" {...register("temp_fahrenheit", { valueAsNumber: true })} />
      </div>
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
