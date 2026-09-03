import { EntityPicker } from "../../../components/EntityPicker";
import { CappedListNotice } from "../../../components/CappedListNotice";

type VehicleAssignmentStepProps = {
  unitId: string;
  operatingCompanyId: string;
  onChange: (unitId: string) => void;
  disabled?: boolean;
};

export function OnboardingStepVehicleAssignment({
  unitId,
  operatingCompanyId,
  onChange,
  disabled,
}: VehicleAssignmentStepProps) {
  return (
    <div data-testid="onboarding-step-vehicle-assignment" className="space-y-3">
      <p className="text-sm text-slate-600">Assign primary unit (optional — can be set later on driver profile).</p>
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-slate-700">Unit</span>
        {/* Picker law: EntityPicker server-searches units — no silent static roster select. */}
        <EntityPicker
          kind="unit"
          operatingCompanyId={operatingCompanyId}
          value={unitId || null}
          onChange={(next) => onChange(next ?? "")}
          // Wizard CREATE chrome — picker law: inline + Create unit (not allowCreate={false} filter-mode).
          allowCreate
          disabled={disabled}
          placeholder="Search unit…"
          className="w-full"
          dataField="onboarding-vehicle-unit"
          dataTestId="onboarding-vehicle-unit"
        />
        <CappedListNotice
          shown={unitId ? 1 : 0}
          limit={500}
          hint="Type in the unit picker to search the full fleet catalog."
          className="mt-1 text-xs text-slate-600"
        />
      </label>
    </div>
  );
}
