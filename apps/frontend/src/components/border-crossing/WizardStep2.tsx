import type { PortOfEntry, WizardFormState } from "./borderCrossingApi";
import { DateTimePicker } from "../forms/DateTimePicker";
import { CbpWaitTimesWidget } from "./CbpWaitTimesWidget";
import { Combobox } from "../Combobox";

type Props = {
  form: WizardFormState;
  ports: PortOfEntry[];
  onChange: (patch: Partial<WizardFormState>) => void;
};

export function WizardStep2({ form, ports, onChange }: Props) {
  const selected = ports.find((p) => p.id === form.portOfEntryId);
  const portOptions = ports.map((port) => ({
    value: port.id,
    label: `${port.short_name ?? port.name} (${port.country})`,
  }));

  return (
    <section data-testid="border-wizard-step-2" className="grid gap-4 lg:grid-cols-[1fr_260px]">
      <div className="space-y-3">
        <h3 className="text-xs font-semibold">Step 2 — Port & planned date</h3>
        <div className="block text-xs">
          <label htmlFor="border-crossing-port-picker">Port of entry *</label>
          <Combobox
            id="border-crossing-port-picker"
            className="mt-1"
            options={portOptions}
            value={form.portOfEntryId || null}
            onChange={(next) => onChange({ portOfEntryId: next ?? "" })}
            placeholder="Select port…"
            allowClear
          />
        </div>
        <label className="block text-xs">
          Planned crossing date *
          <DateTimePicker
            className="mt-1 w-full"
            aria-label="Planned crossing date"
            value={form.plannedDate}
            onChange={(v) => onChange({ plannedDate: v })}
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
