import { useQuery } from "@tanstack/react-query";
import type { UseFormRegister, UseFormWatch } from "react-hook-form";
import { listDrivers, listDriverTeams, listUnits } from "../../../api/mdata";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";

type Props = {
  register: UseFormRegister<any>;
  watch?: UseFormWatch<any>;
  operatingCompanyId?: string;
};

type UnitOption = { id: string; label: string };

function getTextValue(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function toUnitOption(row: unknown, fallbackIndex: number): UnitOption {
  if (!row || typeof row !== "object") return { id: `unit-${fallbackIndex}`, label: `Unit ${fallbackIndex + 1}` };
  const rec = row as Record<string, unknown>;
  const id = typeof rec.id === "string" ? rec.id : `unit-${fallbackIndex}`;
  const unitNumber = getTextValue(rec, ["unit_number", "truck_number", "number"]);
  const trailerNumber = getTextValue(rec, ["trailer_number", "trailer_unit", "trailer"]);
  const make = getTextValue(rec, ["make", "manufacturer"]);
  const model = getTextValue(rec, ["model"]);
  const parts = [unitNumber || trailerNumber, [make, model].filter(Boolean).join(" ")].filter(Boolean);
  return { id, label: parts.length > 0 ? parts.join(" · ") : `Unit ${fallbackIndex + 1}` };
}

function toDriverOption(row: unknown, fallbackIndex: number) {
  if (!row || typeof row !== "object") return { id: `driver-${fallbackIndex}`, label: `Driver ${fallbackIndex + 1}` };
  const rec = row as Record<string, unknown>;
  const id = typeof rec.id === "string" ? rec.id : `driver-${fallbackIndex}`;
  const fullName = getTextValue(rec, ["full_name", "display_name", "name"]);
  const shortName = getTextValue(rec, ["short_name", "driver_code"]);
  const label = [fullName, shortName].filter(Boolean).join(" · ");
  return { id, label: label || `Driver ${fallbackIndex + 1}` };
}

export function BookLoadEquipmentSection({ register, watch, operatingCompanyId }: Props) {
  const assignmentMode = watch ? watch("assignment_mode") : "solo";
  const togglePills = [
    { field: "requires_reefer_fuel" as const, label: "Reefer fuel" },
    { field: "requires_pulp_probe" as const, label: "Pulp probe" },
    { field: "requires_locking_jacks" as const, label: "Locking jacks" },
    { field: "requires_tarps" as const, label: "Tarps" },
    { field: "requires_load_locks" as const, label: "Load locks" },
    { field: "requires_straps" as const, label: "Straps" },
  ];

  const unitsQuery = useQuery({
    queryKey: ["book-load-units", operatingCompanyId],
    queryFn: () => listUnits({ operating_company_id: operatingCompanyId }),
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

  const unitOptions = (unitsQuery.data?.units ?? []).map((row, index) => toUnitOption(row, index));
  const driverOptions = (driversQuery.data?.drivers ?? []).map((row, index) => toDriverOption(row, index));

  return (
    <section className="space-y-2">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <Field
          label="Trailer type"
          input={
            <SelectCombobox {...register("trailer_type")} className="h-7 w-full rounded border border-gray-300 bg-white px-2 text-xs">
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
            <SelectCombobox {...register("assigned_unit_id")} className="h-7 w-full rounded border border-gray-300 bg-white px-2 text-xs">
              <option value="">{unitsQuery.isLoading ? "Loading units..." : "Select truck unit"}</option>
              {unitOptions.map((unit) => (
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
            <SelectCombobox {...register("assigned_trailer_unit_id")} className="h-7 w-full rounded border border-gray-300 bg-white px-2 text-xs">
              <option value="">{unitsQuery.isLoading ? "Loading units..." : "Select trailer unit"}</option>
              {unitOptions.map((unit) => (
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
            <SelectCombobox
              {...register("assigned_primary_driver_id")}
              className="h-7 w-full rounded border border-gray-300 bg-white px-2 text-xs"
            >
              <option value="">{driversQuery.isLoading ? "Loading drivers..." : "Select driver"}</option>
              {driverOptions.map((driver) => (
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
            <SelectCombobox
              {...register("assigned_secondary_driver_id")}
              className="h-7 w-full rounded border border-gray-300 bg-white px-2 text-xs"
            >
              <option value="">{driversQuery.isLoading ? "Loading drivers..." : "Solo load (optional)"}</option>
              {driverOptions.map((driver) => (
                <option key={`team-${driver.id}`} value={driver.id}>
                  {driver.label}
                </option>
              ))}
            </SelectCombobox>
          }
        />
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto] md:items-center">
        <Field
          label="Assignment mode"
          input={
            <div className="inline-flex h-7 overflow-hidden rounded border border-gray-300 bg-white text-[11px]">
              <label className={`flex cursor-pointer items-center px-3 ${assignmentMode === "solo" ? "bg-[#1A1F36] text-white" : "text-gray-700"}`}>
                <input type="radio" value="solo" className="hidden" {...register("assignment_mode")} />
                Solo
              </label>
              <label className={`flex cursor-pointer items-center border-l border-gray-300 px-3 ${assignmentMode === "team" ? "bg-[#1A1F36] text-white" : "text-gray-700"}`}>
                <input type="radio" value="team" className="hidden" {...register("assignment_mode")} />
                Team
              </label>
            </div>
          }
        />
        <div className="grid grid-cols-1 gap-2 md:min-w-[240px]">
          <Field
            label="Team preset"
            input={
              <SelectCombobox {...register("team_id")} className="h-7 w-full rounded border border-gray-300 bg-white px-2 text-xs">
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
      </div>
      <div>
        <div className="mb-1 text-[9px] font-semibold uppercase tracking-[0.4px] text-gray-600">Equipment toggles</div>
        <div className="flex flex-wrap gap-1.5">
          {togglePills.map((pill) => (
            <label key={pill.field} className="cursor-pointer">
              <input type="checkbox" {...register(pill.field)} className="peer sr-only" />
              <span className="inline-flex rounded px-2 py-0.5 text-[10px] font-semibold tracking-[0.3px] text-gray-600 ring-1 ring-gray-300 peer-checked:bg-[#DBEAFE] peer-checked:text-[#1E3A8A] peer-checked:ring-[#93C5FD]">
                {pill.label}
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
        <Field
          label="Reefer setpoint"
          input={<input {...register("reefer_setpoint")} className="h-7 w-full rounded border border-gray-300 px-2 text-xs" />}
        />
      </div>
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
