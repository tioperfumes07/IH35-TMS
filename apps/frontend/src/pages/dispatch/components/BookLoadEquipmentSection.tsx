import { useQuery } from "@tanstack/react-query";
import type { UseFormRegister, UseFormSetValue, UseFormWatch } from "react-hook-form";
import { listDrivers, listDriverTeams, listUnits } from "../../../api/mdata";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";
import { OptimalDriversPanel } from "../../../components/dispatch/OptimalDriversPanel";
import { DriverHosClocksBlock } from "../../../components/dispatch/hos/DriverHosClocks";

type Props = {
  register: UseFormRegister<any>;
  watch?: UseFormWatch<any>;
  setValue?: UseFormSetValue<any>;
  operatingCompanyId?: string;
  /** Existing load id when editing; preview seam uses reservation uuid for new books. */
  optimizerLoadId?: string;
};

type Option = { id: string; label: string };

function getTextValue(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function toUnitOption(row: unknown, index: number): Option {
  if (!row || typeof row !== "object") return { id: `unit-${index}`, label: `Unit ${index + 1}` };
  const rec = row as Record<string, unknown>;
  const id = typeof rec.id === "string" ? rec.id : `unit-${index}`;
  const unitNumber = getTextValue(rec, ["unit_number", "truck_number", "number"]);
  const trailerNumber = getTextValue(rec, ["trailer_number", "trailer_unit", "trailer"]);
  const make = getTextValue(rec, ["make", "manufacturer"]);
  const model = getTextValue(rec, ["model"]);
  const title = [unitNumber || trailerNumber, [make, model].filter(Boolean).join(" ")].filter(Boolean).join(" · ");
  return { id, label: title || `Unit ${index + 1}` };
}

function toDriverOption(row: unknown, index: number): Option {
  if (!row || typeof row !== "object") return { id: `driver-${index}`, label: `Driver ${index + 1}` };
  const rec = row as Record<string, unknown>;
  const id = typeof rec.id === "string" ? rec.id : `driver-${index}`;
  // mdata.drivers exposes first_name/last_name (no full_name) — compose from those so the
  // dropdown shows real names instead of "Driver N".
  const composed = [getTextValue(rec, ["first_name"]), getTextValue(rec, ["last_name"])].filter(Boolean).join(" ");
  const fullName = getTextValue(rec, ["full_name", "display_name", "name"]) || composed;
  const shortName = getTextValue(rec, ["short_name", "driver_code"]);
  return { id, label: [fullName, shortName].filter(Boolean).join(" · ") || `Driver ${index + 1}` };
}

export function BookLoadEquipmentSection({ register, watch, setValue, operatingCompanyId, optimizerLoadId }: Props) {
  const assignmentMode = watch ? watch("assignment_mode") : "solo";
  const primaryDriverId = watch ? String(watch("assigned_primary_driver_id") ?? "") : "";
  const secondaryDriverId = watch ? String(watch("assigned_secondary_driver_id") ?? "") : "";
  const reservationUuid = watch ? String(watch("reservation_uuid") ?? "") : "";
  const trailerType = watch ? String(watch("trailer_type") ?? "") : "";
  // Conditional equipment detail reveals (render-v6 §B): reefer detail only on a reefer trailer, tarp detail
  // only on a flatbed. Previously the reefer setpoint always showed and flatbed tarp detail never revealed.
  const isReefer = trailerType === "refrigerated_van";
  const isFlatbed = trailerType === "flatbed";
  const hazmat = watch ? Boolean(watch("hazmat")) : false;
  const stops = watch ? (watch("stops") as Array<{ city?: string; state?: string }> | undefined) : undefined;
  const pickupStop = stops?.find((s) => s) ?? stops?.[0];
  const optimizerLoadKey =
    optimizerLoadId ||
    reservationUuid ||
    "00000000-0000-4000-8000-000000000000";
  const unitsQuery = useQuery({
    queryKey: ["book-load-units", operatingCompanyId],
    // Unified fleet: trucks (mdata.units) + trailers (mdata.equipment), kind-tagged + active-filtered.
    queryFn: () => listUnits({ operating_company_id: operatingCompanyId, include: "trailers", limit: 500 }),
    enabled: Boolean(operatingCompanyId),
  });
  const driversQuery = useQuery({
    queryKey: ["book-load-drivers", operatingCompanyId],
    queryFn: () => listDrivers({ operating_company_id: operatingCompanyId }),
    enabled: Boolean(operatingCompanyId),
  });
  const teamsQuery = useQuery({
    queryKey: ["book-load-driver-teams", operatingCompanyId],
    queryFn: () => listDriverTeams(String(operatingCompanyId)),
    enabled: Boolean(operatingCompanyId),
  });
  const fleet = unitsQuery.data?.units ?? [];
  // Bug #5: Truck dropdown shows ONLY trucks (mdata.units); Trailer dropdown ONLY trailers (mdata.equipment).
  const trucks = fleet
    .filter((row) => (row as { kind?: string }).kind !== "trailer")
    .map((row, index) => toUnitOption(row, index));
  const trailers = fleet
    .filter((row) => (row as { kind?: string }).kind === "trailer")
    .map((row, index) => toUnitOption(row, index));
  const drivers = (driversQuery.data?.drivers ?? []).map((row, index) => toDriverOption(row, index));
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
        <Field
          label="Trailer type"
          input={
            <SelectCombobox {...register("trailer_type")} className="h-7 w-full text-xs">
              <option value="refrigerated_van">Refrigerated van</option>
              <option value="dry_van">Dry van</option>
              <option value="flatbed">Flatbed</option>
              <option value="power_only_no_trailer">Power-only · no trailer</option>
              <option value="power_only_customer_trailer">Power-only · customer trailer</option>
            </SelectCombobox>
          }
        />
        <Field
          label="Truck unit"
          input={
            <SelectCombobox {...register("assigned_unit_id")} className="h-7 w-full text-xs">
              <option value="">{unitsQuery.isLoading ? "Loading units..." : "Select truck unit"}</option>
              {trucks.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.label}
                </option>
              ))}
            </SelectCombobox>
          }
        />
        <Field
          label="Trailer unit"
          input={
            <SelectCombobox {...register("assigned_trailer_unit_id")} className="h-7 w-full text-xs">
              <option value="">{unitsQuery.isLoading ? "Loading units..." : "Select trailer unit"}</option>
              {trailers.map((unit) => (
                <option key={`trailer-${unit.id}`} value={unit.id}>
                  {unit.label}
                </option>
              ))}
            </SelectCombobox>
          }
        />
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <Field
          label="Driver"
          input={
            <SelectCombobox {...register("assigned_primary_driver_id")} className="h-7 w-full text-xs">
              <option value="">{driversQuery.isLoading ? "Loading drivers..." : "Select driver"}</option>
              {drivers.map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {driver.label}
                </option>
              ))}
            </SelectCombobox>
          }
        />
        <Field
          label="Team driver"
          input={
            <SelectCombobox {...register("assigned_secondary_driver_id")} className="h-7 w-full text-xs">
              <option value="">{driversQuery.isLoading ? "Loading drivers..." : "Solo load (optional)"}</option>
              {drivers.map((driver) => (
                <option key={`team-${driver.id}`} value={driver.id}>
                  {driver.label}
                </option>
              ))}
            </SelectCombobox>
          }
        />
      </div>
      {/* DISPATCH-UI-REFINE-2 ITEM 3 — driver HOS from the in-app store (#1109), shown before assigning.
          Team driver clocks appear too in Team mode. "No HOS data" until the Samsara HOS pull is seeded. */}
      {primaryDriverId ? (
        <DriverHosClocksBlock driverId={primaryDriverId} operatingCompanyId={operatingCompanyId} heading="Driver HOS" />
      ) : null}
      {assignmentMode === "team" && secondaryDriverId ? (
        <DriverHosClocksBlock driverId={secondaryDriverId} operatingCompanyId={operatingCompanyId} heading="Team driver HOS" />
      ) : null}
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
      <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto] md:items-center">
        <Field
          label="Assignment mode"
          input={
            <div className="inline-flex h-7 overflow-hidden rounded border border-gray-300 bg-white text-[11px]">
              <label className={`flex cursor-pointer items-center px-3 ${assignmentMode === "solo" ? "bg-[#16203a] text-white" : "text-gray-700"}`}>
                <input type="radio" value="solo" className="hidden" {...register("assignment_mode")} />
                Solo
              </label>
              <label className={`flex cursor-pointer items-center border-l border-gray-300 px-3 ${assignmentMode === "team" ? "bg-[#16203a] text-white" : "text-gray-700"}`}>
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
      <div>
        <div className="mb-1 text-[9px] font-semibold uppercase tracking-[0.4px] text-gray-600">Equipment</div>
        <div className="flex flex-wrap gap-1.5">
          {toggles.map((toggle) => (
            <label key={toggle.field} className="cursor-pointer">
              <input type="checkbox" {...register(toggle.field)} className="peer sr-only" />
              <span className="inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-[0.3px] text-gray-600 ring-1 ring-gray-300 peer-checked:bg-[#16203a] peer-checked:text-white peer-checked:ring-[#16203a]">
                {toggle.label}
              </span>
            </label>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <Field
          label="Driver pay rate / mi"
          input={
            <input
              type="number"
              step="0.01"
              min="0"
              {...register("driver_pay_rate_per_mile", { valueAsNumber: true })}
              className="h-7 w-full rounded border border-gray-300 px-2 text-xs"
            />
          }
        />
        {isReefer ? (
          <Field
            label="Reefer setpoint (°F)"
            input={<input data-testid="reefer-setpoint-field" {...register("reefer_setpoint")} className="h-7 w-full rounded border border-gray-300 px-2 text-xs" />}
          />
        ) : null}
      </div>
      {/* Render-v6 §B conditional detail: revealed by trailer type. Reefer setpoint above (reefer only);
          flatbed reveals the tarp-type detail (the "Tarps" required toggle stays in the Equipment chips). */}
      {isFlatbed ? (
        <div data-testid="flatbed-tarp-detail" className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <Field
            label="Tarp type"
            input={
              <SelectCombobox {...register("tarp_type")} className="h-7 w-full text-xs">
                <option value="">Select tarp type</option>
                <option value="steel">Steel tarp</option>
                <option value="lumber">Lumber tarp</option>
                <option value="smoke">Smoke tarp</option>
                <option value="coil">Coil/machinery tarp</option>
              </SelectCombobox>
            }
          />
        </div>
      ) : null}
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
