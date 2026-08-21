import { useMemo, useState } from "react";
import type { CustomsBroker, WizardFormState } from "./borderCrossingApi";
import { Combobox } from "../Combobox";
import { entityLabel } from "../../lib/entity-label";
import { EntityLink } from "../shared/EntityLink";
import { InlineCreateDrawer } from "../parity/InlineCreateDrawer";

type Props = {
  form: WizardFormState;
  brokers: CustomsBroker[];
  operatingCompanyId: string;
  onChange: (patch: Partial<WizardFormState>) => void;
};

export function WizardStep4({ form, brokers, operatingCompanyId, onChange }: Props) {
  const [createOpen, setCreateOpen] = useState(false);
  const [createdBroker, setCreatedBroker] = useState<{ id: string; name: string } | null>(null);
  const scopedBrokers = useMemo(
    () => (createdBroker && !brokers.some((broker) => broker.id === createdBroker.id) ? [createdBroker, ...brokers] : brokers),
    [brokers, createdBroker],
  );
  const brokerOptions = scopedBrokers.map((broker) => ({ value: broker.id, label: broker.name }));
  const selectedBroker = scopedBrokers.find((b) => b.id === form.customsBrokerId);

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
          onChange={(next) => {
            const broker = scopedBrokers.find((candidate) => candidate.id === next);
            onChange({ customsBrokerId: next ?? "", customsBrokerLabel: broker?.name ?? "" });
          }}
          placeholder="Select broker (vendor category customs_broker)…"
          allowClear
          allowAddNew={{ label: "+ Add new vendor", onAdd: () => setCreateOpen(true) }}
        />
      </div>
      {/* Exact Leaves border_crossing_wizard:vendor — Combobox alone left broker UUID non-navigable */}
      {form.customsBrokerId ? (
        <div
          className="flex flex-wrap gap-x-3 gap-y-1 rounded-sm border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] text-slate-700"
          data-testid="border-wizard-step-4-entitylinks"
        >
          <span>
            Broker:{" "}
            <EntityLink
              kind="vendor"
              id={form.customsBrokerId}
              label={entityLabel(selectedBroker?.name ?? form.customsBrokerLabel, form.customsBrokerId, "Vendor")}
              data-testid="border-wizard-broker-link"
            />
          </span>
        </div>
      ) : null}
      <label className="block text-sm">
        Bond number
        <input
          className="mt-1 w-full rounded-sm border px-2 py-1.5"
          value={form.bondNumber}
          onChange={(e) => onChange({ bondNumber: e.target.value })}
        />
      </label>
      <InlineCreateDrawer
        open={createOpen}
        kind="vendor"
        operatingCompanyId={operatingCompanyId}
        onClose={() => setCreateOpen(false)}
        onCreated={(record) => {
          setCreatedBroker({ id: record.id, name: record.label });
          onChange({ customsBrokerId: record.id, customsBrokerLabel: record.label });
          setCreateOpen(false);
        }}
      />
    </section>
  );
}
