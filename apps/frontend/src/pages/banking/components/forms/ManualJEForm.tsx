type Props = {
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
};

export function ManualJEForm({ value, onChange }: Props) {
  return (
    <div className="space-y-2 text-xs">
      <label className="block">
        JE Date
        <input
          type="date"
          className="mt-1 h-8 w-full rounded border border-gray-300 px-2"
          value={String(value.date ?? "")}
          onChange={(event) => onChange({ ...value, date: event.target.value })}
        />
      </label>
      <label className="block">
        Memo
        <input
          className="mt-1 h-8 w-full rounded border border-gray-300 px-2"
          value={String(value.memo ?? "")}
          onChange={(event) => onChange({ ...value, memo: event.target.value })}
        />
      </label>
    </div>
  );
}
