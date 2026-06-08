import { PwaButton } from "../PwaButton";

export type WitnessEntry = {
  id: string;
  name: string;
  phone: string;
  statement: string;
};

export function WitnessForm({
  value,
  onChange,
  labels,
}: {
  value: WitnessEntry[];
  onChange: (next: WitnessEntry[]) => void;
  labels: {
    title: string;
    add: string;
    remove: string;
    name: string;
    phone: string;
    statement: string;
    none: string;
  };
}) {
  function addWitness() {
    onChange([
      ...value,
      {
        id: crypto.randomUUID(),
        name: "",
        phone: "",
        statement: "",
      },
    ]);
  }

  function updateWitness(id: string, patch: Partial<WitnessEntry>) {
    onChange(value.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));
  }

  function removeWitness(id: string) {
    onChange(value.filter((entry) => entry.id !== id));
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-pwa-text-secondary">{labels.title}</div>
      {value.length === 0 ? <div className="text-xs text-pwa-text-secondary">{labels.none}</div> : null}
      {value.map((entry) => (
        <div key={entry.id} className="space-y-2 rounded-lg border border-pwa-border bg-[#111827] p-3">
          <input
            type="text"
            value={entry.name}
            onChange={(event) => updateWitness(entry.id, { name: event.target.value })}
            className="h-10 w-full rounded border border-pwa-border bg-[#0d1320] px-2 text-sm text-pwa-text-primary"
            placeholder={labels.name}
          />
          <input
            type="tel"
            value={entry.phone}
            onChange={(event) => updateWitness(entry.id, { phone: event.target.value })}
            className="h-10 w-full rounded border border-pwa-border bg-[#0d1320] px-2 text-sm text-pwa-text-primary"
            placeholder={labels.phone}
          />
          <textarea
            value={entry.statement}
            onChange={(event) => updateWitness(entry.id, { statement: event.target.value })}
            className="min-h-20 w-full rounded border border-pwa-border bg-[#0d1320] p-2 text-sm text-pwa-text-primary"
            placeholder={labels.statement}
          />
          <button type="button" className="text-xs text-[#fca5a5]" onClick={() => removeWitness(entry.id)}>
            {labels.remove}
          </button>
        </div>
      ))}
      <PwaButton variant="secondary" className="w-full" onClick={addWitness}>
        {labels.add}
      </PwaButton>
    </div>
  );
}
