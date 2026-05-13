import { useState } from "react";
import { Button } from "../../../components/Button";
import { ConfirmDiscardDialog } from "../../../components/dialogs/ConfirmDiscardDialog";
import { SaveDropdown } from "../../../components/forms/SaveDropdown";

type Props = {
  checked: boolean;
  pendingAcks: boolean;
  staleDebt: boolean;
  onCheckedChange: (checked: boolean) => void;
  onSaveDraft: () => void;
  onFinalize: () => void | Promise<void>;
  /** After successful finalize: print / pdf hint / navigate to list. */
  onFinalizeFollowUp?: (kind: "print" | "pdf" | "list") => void;
};

export function FinalizeBlock({
  checked,
  pendingAcks,
  staleDebt,
  onCheckedChange,
  onSaveDraft,
  onFinalize,
  onFinalizeFollowUp,
}: Props) {
  const blocked = pendingAcks || !checked || staleDebt;
  const reason = pendingAcks
    ? "Cannot finalize while pending acknowledgments exist"
    : !checked
      ? "Acknowledge debt summary to continue"
      : staleDebt
        ? "Debt summary stale. Refresh required."
        : "Ready to finalize";

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingFollowUp, setPendingFollowUp] = useState<"default" | "print" | "pdf" | "list">("default");

  const requestFinalize = (followUp: "default" | "print" | "pdf" | "list") => {
    if (blocked) return;
    setPendingFollowUp(followUp);
    setConfirmOpen(true);
  };

  const runFinalize = async () => {
    setConfirmOpen(false);
    try {
      await Promise.resolve(onFinalize());
    } catch {
      return;
    }
    if (pendingFollowUp === "print") {
      onFinalizeFollowUp?.("print");
    } else if (pendingFollowUp === "pdf") {
      onFinalizeFollowUp?.("pdf");
    } else if (pendingFollowUp === "list") {
      onFinalizeFollowUp?.("list");
    }
  };

  return (
    <div className="rounded border border-gray-200 bg-white p-3 text-xs">
      <label className="flex items-start gap-2 rounded border border-amber-200 bg-amber-50 px-2 py-2">
        <input type="checkbox" checked={checked} onChange={(event) => onCheckedChange(event.target.checked)} />
        <span>I have reviewed active debt, pending acknowledgments, and deductions applied this period.</span>
      </label>
      <div className="mt-2 flex flex-wrap gap-2">
        <SaveDropdown
          storageKey="settlement-finalize"
          primaryLabel="Finalize settlement"
          disabled={blocked}
          onSave={() => requestFinalize("default")}
          onSaveAndClose={() => requestFinalize("default")}
          onSaveAndPrint={() => requestFinalize("print")}
          onSaveAndDownload={() => requestFinalize("pdf")}
          onSaveAndViewList={() => requestFinalize("list")}
        />
        <Button size="sm" variant="secondary" type="button" onClick={onSaveDraft}>
          Save draft
        </Button>
      </div>
      <div className={`mt-2 ${blocked ? "text-amber-700" : "text-green-700"}`}>{reason}</div>
      <ConfirmDiscardDialog
        open={confirmOpen}
        title="Finalize this settlement?"
        message="Finalizing is irreversible in this workflow. Confirm when you are ready to lock totals and continue payment steps."
        discardButtonLabel="Finalize"
        onCancel={() => setConfirmOpen(false)}
        onDiscard={() => void runFinalize()}
      />
    </div>
  );
}
