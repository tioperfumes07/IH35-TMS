type VehicleAssignmentStepProps = {
  unitId: string;
  unitOptions: Array<{ id: string; label: string }>;
  onChange: (unitId: string) => void;
  disabled?: boolean;
};

export function OnboardingStepVehicleAssignment({ unitId, unitOptions, onChange, disabled }: VehicleAssignmentStepProps) {
  return (
    <div data-testid="onboarding-step-vehicle-assignment" className="space-y-3">
      <p className="text-sm text-slate-600">Assign primary unit (optional — can be set later on driver profile).</p>
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-slate-700">Unit</span>
        <select
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          value={unitId}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">— Select unit —</option>
          {unitOptions.map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
