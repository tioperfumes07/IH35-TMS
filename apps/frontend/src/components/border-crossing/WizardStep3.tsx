import type { WizardFormState } from "./borderCrossingApi";
import { MoneyInput } from "../forms/MoneyInput";

type Props = {
  form: WizardFormState;
  onChange: (patch: Partial<WizardFormState>) => void;
};

export function WizardStep3({ form, onChange }: Props) {
  return (
    <section data-testid="border-wizard-step-3" className="space-y-3">
      <h3 className="text-sm font-semibold">Step 3 — Cargo details</h3>
      <label className="block text-sm">
        Commodity *
        <input
          className="mt-1 w-full rounded border px-2 py-1.5"
          value={form.commodity}
          onChange={(e) => onChange({ commodity: e.target.value })}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          Weight (lbs)
          <input
            type="number"
            min={0}
            className="mt-1 w-full rounded border px-2 py-1.5"
            value={form.weight}
            onChange={(e) => onChange({ weight: e.target.value })}
          />
        </label>
        <label className="block text-sm">
          Value (USD)
          {/* M-1: dollars-mode QBO money entry; parent sends commodity_value (dollars) → backend ×100. Byte-for-byte. */}
          <MoneyInput
            valueDollars={form.commodityValue ? Number(form.commodityValue) : null}
            onChangeDollars={(d) => onChange({ commodityValue: d == null ? "" : String(d) })}
            ariaLabel="Value (USD)"
            className="mt-1 w-full"
          />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.hazmat} onChange={(e) => onChange({ hazmat: e.target.checked })} />
        Hazmat declared
      </label>
    </section>
  );
}
