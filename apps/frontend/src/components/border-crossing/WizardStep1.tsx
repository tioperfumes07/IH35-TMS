import { EntityPicker } from "../parity/EntityPicker";
import type { WizardFormState } from "./borderCrossingApi";

type Props = {
  form: WizardFormState;
  onChange: (patch: Partial<WizardFormState>) => void;
  /** C1: the rosters behind the load/unit/driver pickers are company-scoped on every read. */
  operatingCompanyId: string;
};

export function WizardStep1({ form, onChange, operatingCompanyId }: Props) {
  return (
    <section data-testid="border-wizard-step-1" className="space-y-3">
      <h3 className="text-sm font-semibold">Step 1 — Load & direction</h3>
      <label className="block text-sm">
        Load
        <EntityPicker
          kind="load"
          operatingCompanyId={operatingCompanyId}
          value={form.loadId || null}
          onChange={(next) => onChange({ loadId: next ?? "" })}
          allowCreate={false}
          placeholder="Select load"
          className="mt-1"
        />
      </label>
      <label className="block text-sm">
        Unit *
        <EntityPicker
          kind="unit"
          operatingCompanyId={operatingCompanyId}
          value={form.unitId || null}
          onChange={(next) => onChange({ unitId: next ?? "" })}
          placeholder="Select unit"
          className="mt-1"
        />
      </label>
      <label className="block text-sm">
        Driver
        <EntityPicker
          kind="driver"
          operatingCompanyId={operatingCompanyId}
          value={form.driverId || null}
          onChange={(next) => onChange({ driverId: next ?? "" })}
          placeholder="Select driver (FAST card check)"
          className="mt-1"
        />
      </label>
      <label className="block text-sm">
        Direction *
        <select
          className="mt-1 w-full rounded-sm border px-2 py-1.5"
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
