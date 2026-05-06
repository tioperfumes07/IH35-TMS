type Props = {
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
};

export function CreateExpenseForm({ value, onChange }: Props) {
  return (
    <div className="space-y-2 text-xs">
      <label className="block">
        Vendor
        <input
          className="mt-1 h-8 w-full rounded border border-gray-300 px-2"
          value={String(value.vendor ?? "")}
          onChange={(event) => onChange({ ...value, vendor: event.target.value })}
        />
      </label>
      <label className="block">
        Expense account
        <input
          className="mt-1 h-8 w-full rounded border border-gray-300 px-2"
          value={String(value.expense_account ?? "")}
          onChange={(event) => onChange({ ...value, expense_account: event.target.value })}
        />
      </label>
    </div>
  );
}
