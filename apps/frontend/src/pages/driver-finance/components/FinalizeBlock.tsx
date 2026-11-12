import { Button } from "../../../components/Button";
import { BoardSection } from "../../../components/v3/BoardSection";

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
    <BoardSection title="Finalize settlement" testId="settlement-finalize-block">
      <div className="space-y-2 px-3.5 py-2 text-xs">
        <label className="flex items-start gap-2 rounded-sm border border-[#E5E7EB] bg-[#F7F8FA] px-2 py-2">
          <input type="checkbox" checked={checked} onChange={(event) => onCheckedChange(event.target.checked)} />
          <span>
            I have reviewed active debt, pending acknowledgments, and deductions applied this period.
          </span>
        </label>
        <div className="flex gap-2">
          {/* Save Draft persists the debt-summary acknowledgment via PATCH …/acknowledge (same as the checkbox). */}
          <Button
            size="sm"
            variant="secondary"
            onClick={onSaveDraft}
            disabled={pendingAcks || !checked || staleDebt}
            title={
              pendingAcks
                ? "Cannot save draft while pending acknowledgments exist"
                : !checked
                ? "Acknowledge debt summary to save draft"
                : staleDebt
                ? "Debt summary stale. Refresh required."
                : "Save debt-summary acknowledgment"
            }
          >
            Save Draft
          </Button>
          <Button size="sm" onClick={onFinalize} disabled={blocked}>
            Finalize Settlement
          </Button>
        </div>
        <div className={blocked ? "text-[#1F2A44]" : "text-[#4B5563]"}>{reason}</div>
      </div>
    </BoardSection>
  );
}
