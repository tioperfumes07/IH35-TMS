import type { PortOfEntry, WizardFormState } from "./borderCrossingApi";
import { CbpWaitTimesWidget } from "./CbpWaitTimesWidget";

type Props = {
  form: WizardFormState;
  ports: PortOfEntry[];
  onChange: (patch: Partial<WizardFormState>) => void;
};

export function WizardStep2({ form, ports, onChange }: Props) {
  const selected = ports.find((p) => p.id === form.portOfEntryId);

  return (
    <section data-testid="border-wizard-step-2" className="grid gap-4 lg:grid-cols-[1fr_260px]">
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Step 2 — Port & planned date</h3>
        <label className="block text-sm">
          Port of entry *
          <select
            className="mt-1 w-full rounded border px-2 py-1.5"
            value={form.portOfEntryId}
            onChange={(e) => onChange({ portOfEntryId: e.target.value })}
          >
            <option value="">Select port…</option>
            {ports.map((port) => (
              <option key={port.id} value={port.id}>
                {port.short_name ?? port.name} ({port.country})
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          Planned crossing date *
          <input
            type="datetime-local"
            className="mt-1 w-full rounded border px-2 py-1.5"
            value={form.plannedDate}
            onChange={(e) => onChange({ plannedDate: e.target.value })}
          />
        </label>
        {selected?.cbp_port_code ? (
          <p className="text-xs text-gray-600">CBP port code: {selected.cbp_port_code}</p>
        ) : null}
      </div>
      <CbpWaitTimesWidget title="Nearby port wait times" />
    </section>
  );
}
