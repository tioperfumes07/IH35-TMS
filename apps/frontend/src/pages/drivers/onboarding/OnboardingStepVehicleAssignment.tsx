import { EntityPicker } from "../../../components/parity/EntityPicker";

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
        {/* Picker law: never a silent <select> over listUnits(limit:500). EntityPicker searches server-side. */}
        <EntityPicker
          kind="unit"
          operatingCompanyId={operatingCompanyId}
          value={unitId || null}
          onChange={(next) => onChange(next ?? "")}
          allowCreate={false}
          disabled={disabled}
          placeholder="Search unit…"
          className="w-full"
          dataField="onboarding-vehicle-unit"
          dataTestId="onboarding-vehicle-unit"
        />
      </label>
    </div>
  );
}
