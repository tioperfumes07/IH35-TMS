type Props = {
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
};

export function DriverSettlementForm({ value, onChange }: Props) {
  return (
    <label className="block text-xs">
      Settlement ID
      <input
        className="mt-1 h-8 w-full rounded border border-gray-300 px-2"
        value={String(value.settlement_id ?? "")}
        onChange={(event) => onChange({ ...value, settlement_id: event.target.value })}
      />
    </label>
  );
}
