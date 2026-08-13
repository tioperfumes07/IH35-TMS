// @archived — Workflow-B form: superseded by BankingTransactionsDesignView categorization. Enforced by verify-banking-workflow-b-archived.mjs.
import { DatePicker } from "../../../../components/forms/DatePicker";

type Props = {
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
};

export function ManualJEForm({ value, onChange }: Props) {
  return (
    <div className="space-y-2 text-xs">
      <label className="block">
        JE Date
        <DatePicker
          className="mt-1 h-8 w-full"
          value={String(value.date ?? "")}
          onChange={(next) => onChange({ ...value, date: next })}
        />
      </label>
      <label className="block">
        Memo
        <input
          className="mt-1 h-8 w-full rounded-sm border border-gray-300 px-2"
          value={String(value.memo ?? "")}
          onChange={(event) => onChange({ ...value, memo: event.target.value })}
        />
      </label>
    </div>
  );
}
