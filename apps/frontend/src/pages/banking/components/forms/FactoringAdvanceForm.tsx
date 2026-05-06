type Props = {
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
};

export function FactoringAdvanceForm({ value, onChange }: Props) {
  return (
    <label className="block text-xs">
      Factoring Advance ID
      <input
        className="mt-1 h-8 w-full rounded border border-gray-300 px-2"
        value={String(value.factoring_advance_id ?? "")}
        onChange={(event) => onChange({ ...value, factoring_advance_id: event.target.value })}
      />
    </label>
  );
}
