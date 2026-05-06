type Props = {
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
};

export function BillPaymentForm({ value, onChange }: Props) {
  return (
    <div className="space-y-2 text-xs">
      <label className="block">
        Bill IDs (comma separated)
        <input
          className="mt-1 h-8 w-full rounded border border-gray-300 px-2"
          value={String(value.bill_ids ?? "")}
          onChange={(event) => onChange({ ...value, bill_ids: event.target.value })}
        />
      </label>
      <label className="block">
        Payment method
        <input
          className="mt-1 h-8 w-full rounded border border-gray-300 px-2"
          value={String(value.payment_method ?? "")}
          onChange={(event) => onChange({ ...value, payment_method: event.target.value })}
        />
      </label>
    </div>
  );
}
