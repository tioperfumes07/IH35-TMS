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
      {/* C1 PICKER LAW — only `unit` is migrated here, and the omission is a RULING, not an oversight.
          The owner's binding clause is that a raw-uuid may only be replaced by a picker when the id
          resolves to an ENFORCED FK; a picker over a column the database does not constrain is the
          same defect wearing a dropdown, because it still accepts an orphan.
            unit_id   -> mdata.unit_border_crossings.unit_id   REFERENCES mdata.units(id)
                         (db/migrations/0295_vehicle_profile_part1.sql:103)  => MIGRATED
            driver_id -> mdata.unit_border_crossings.driver_id  plain uuid, NO FK
                         (db/migrations/0295_vehicle_profile_part1.sql:104)  => reported, left as-is
            load_id   -> mdata.unit_border_crossings.load_id    plain uuid, NO FK
                         (db/migrations/0295_vehicle_profile_part1.sql:105)  => reported, left as-is
          Remedy for the two: an FK migration on mdata.unit_border_crossings — a schema change, which
          is the other lane's and is HELD for the owner to apply. C1 is frontend-only. */}
      <label className="block text-sm">
        Load ID
        <input
          className="mt-1 w-full rounded-sm border px-2 py-1.5"
          value={form.loadId}
          onChange={(e) => onChange({ loadId: e.target.value })}
          placeholder="Optional load UUID"
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
        Driver ID
        <input
          className="mt-1 w-full rounded-sm border px-2 py-1.5"
          value={form.driverId}
          onChange={(e) => onChange({ driverId: e.target.value })}
          placeholder="Driver UUID (FAST card check)"
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
