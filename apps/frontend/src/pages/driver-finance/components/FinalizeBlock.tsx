import { Button } from "../../../components/Button";

type Props = {
  checked: boolean;
  pendingAcks: boolean;
  staleDebt: boolean;
  onCheckedChange: (checked: boolean) => void;
  onSaveDraft: () => void;
  onFinalize: () => void;
};

export function FinalizeBlock({ checked, pendingAcks, staleDebt, onCheckedChange, onSaveDraft, onFinalize }: Props) {
  const blocked = pendingAcks || !checked || staleDebt;
  const reason = pendingAcks
    ? "Cannot finalize while pending acknowledgments exist"
    : !checked
    ? "Acknowledge debt summary to continue"
    : staleDebt
    ? "Debt summary stale. Refresh required."
    : "Ready to finalize";

  return (
    <div className="rounded border border-gray-200 bg-white p-3 text-xs">
      <label className="flex items-start gap-2 rounded border border-amber-200 bg-amber-50 px-2 py-2">
        <input type="checkbox" checked={checked} onChange={(event) => onCheckedChange(event.target.checked)} />
        <span>
          I have reviewed active debt, pending acknowledgments, and deductions applied this period.
        </span>
      </label>
      <div className="mt-2 flex gap-2">
        <Button size="sm" variant="secondary" onClick={onSaveDraft}>Save Draft</Button>
        <Button size="sm" onClick={onFinalize} disabled={blocked}>Finalize Settlement</Button>
      </div>
      <div className={`mt-2 ${blocked ? "text-amber-700" : "text-green-700"}`}>{reason}</div>
    </div>
  );
}
