import type { CustomsBroker, WizardFormState } from "./borderCrossingApi";

type Props = {
  form: WizardFormState;
  brokers: CustomsBroker[];
  onChange: (patch: Partial<WizardFormState>) => void;
};

export function WizardStep4({ form, brokers, onChange }: Props) {
  return (
    <section data-testid="border-wizard-step-4" className="space-y-3">
      <h3 className="text-sm font-semibold">Step 4 — Customs broker & bond</h3>
      <label className="block text-sm">
        Customs broker
        <select
          className="mt-1 w-full rounded border px-2 py-1.5"
          value={form.customsBrokerId}
          onChange={(e) => onChange({ customsBrokerId: e.target.value })}
        >
          <option value="">Select broker (vendor category customs_broker)…</option>
          {brokers.map((broker) => (
            <option key={broker.id} value={broker.id}>
              {broker.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        Bond number
        <input
          className="mt-1 w-full rounded border px-2 py-1.5"
          value={form.bondNumber}
          onChange={(e) => onChange({ bondNumber: e.target.value })}
        />
      </label>
    </section>
  );
}
