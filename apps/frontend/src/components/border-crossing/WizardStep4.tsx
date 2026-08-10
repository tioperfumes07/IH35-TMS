import type { CustomsBroker, WizardFormState } from "./borderCrossingApi";
import { Combobox } from "../Combobox";

type Props = {
  form: WizardFormState;
  brokers: CustomsBroker[];
  onChange: (patch: Partial<WizardFormState>) => void;
};

export function WizardStep4({ form, brokers, onChange }: Props) {
  const brokerOptions = brokers.map((broker) => ({ value: broker.id, label: broker.name }));

  return (
    <section data-testid="border-wizard-step-4" className="space-y-3">
      <h3 className="text-sm font-semibold">Step 4 — Customs broker & bond</h3>
      <div className="block text-sm">
        <label htmlFor="border-crossing-broker-picker">Customs broker</label>
        <Combobox
          id="border-crossing-broker-picker"
          className="mt-1"
          options={brokerOptions}
          value={form.customsBrokerId || null}
          onChange={(next) => onChange({ customsBrokerId: next ?? "" })}
          placeholder="Select broker (vendor category customs_broker)…"
          allowClear
        />
      </div>
      <label className="block text-sm">
        Bond number
        <input
          className="mt-1 w-full rounded-sm border px-2 py-1.5"
          value={form.bondNumber}
          onChange={(e) => onChange({ bondNumber: e.target.value })}
        />
      </label>
    </section>
  );
}
