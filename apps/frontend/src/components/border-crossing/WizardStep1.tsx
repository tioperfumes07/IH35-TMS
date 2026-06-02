import type { WizardFormState } from "./borderCrossingApi";

type Props = {
  form: WizardFormState;
  onChange: (patch: Partial<WizardFormState>) => void;
};

export function WizardStep1({ form, onChange }: Props) {
  return (
    <section data-testid="border-wizard-step-1" className="space-y-3">
      <h3 className="text-sm font-semibold">Step 1 — Load & direction</h3>
      <label className="block text-sm">
        Load ID
        <input
          className="mt-1 w-full rounded border px-2 py-1.5"
          value={form.loadId}
          onChange={(e) => onChange({ loadId: e.target.value })}
          placeholder="Optional load UUID"
        />
      </label>
      <label className="block text-sm">
        Unit ID *
        <input
          className="mt-1 w-full rounded border px-2 py-1.5"
          value={form.unitId}
          onChange={(e) => onChange({ unitId: e.target.value })}
          placeholder="Unit UUID"
          required
        />
      </label>
      <label className="block text-sm">
        Driver ID
        <input
          className="mt-1 w-full rounded border px-2 py-1.5"
          value={form.driverId}
          onChange={(e) => onChange({ driverId: e.target.value })}
          placeholder="Driver UUID (FAST card check)"
        />
      </label>
      <label className="block text-sm">
        Direction *
        <select
          className="mt-1 w-full rounded border px-2 py-1.5"
          value={form.direction}
          onChange={(e) => onChange({ direction: e.target.value as WizardFormState["direction"] })}
        >
          <option value="">Select…</option>
          <option value="northbound">Northbound (into US)</option>
          <option value="southbound">Southbound (into MX)</option>
        </select>
      </label>
    </section>
  );
}
