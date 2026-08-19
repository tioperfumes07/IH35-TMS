import { EntityPicker } from "../parity/EntityPicker";
import { EntityLink } from "../shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";
import type { WizardFormState } from "./borderCrossingApi";

type Props = {
  form: WizardFormState;
  onChange: (patch: Partial<WizardFormState>) => void;
  /** C1: the rosters behind the load/unit/driver pickers are company-scoped on every read. */
  operatingCompanyId: string;
};

export function WizardStep1({ form, onChange, operatingCompanyId }: Props) {
  const hasSelected = Boolean(form.loadId || form.unitId || form.driverId);
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
          // Load create belongs on Book Load — not inline from the border wizard.
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
      {/* Exact Leaves dispatch.wizard.border_crossing_wizard_page:load|unit|driver —
          pickers alone leave selected identities non-navigable; expose EntityLinks. */}
      {hasSelected ? (
        <div
          className="flex flex-wrap gap-x-3 gap-y-1 rounded-sm border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] text-slate-700"
          data-testid="border-wizard-step-1-entitylinks"
        >
          {form.loadId ? (
            <span>
              Load:{" "}
              <EntityLink kind="load" id={form.loadId} label={entityLabel(null, form.loadId, "Load")} />
            </span>
          ) : null}
          {form.unitId ? (
            <span>
              Unit: <EntityLink kind="unit" id={form.unitId} label={entityLabel(null, form.unitId, "Unit")} />
            </span>
          ) : null}
          {form.driverId ? (
            <span>
              Driver:{" "}
              <EntityLink kind="driver" id={form.driverId} label={entityLabel(null, form.driverId, "Driver")} />
            </span>
          ) : null}
        </div>
      ) : null}
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
