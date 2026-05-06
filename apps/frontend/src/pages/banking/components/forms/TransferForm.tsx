type Props = {
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
};

export function TransferForm({ value, onChange }: Props) {
  return (
    <div className="space-y-2 text-xs">
      <label className="block">
        Destination Account ID
        <input
          className="mt-1 h-8 w-full rounded border border-gray-300 px-2"
          value={String(value.to_account_id ?? "")}
          onChange={(event) => onChange({ ...value, to_account_id: event.target.value })}
        />
      </label>
    </div>
  );
}
