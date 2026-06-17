import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { postLoadReassign } from "../../api/dispatch";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { AssignDriverDropdown, REASSIGN_REASON_CODES, type AssignDriverDropdownProps } from "./AssignDriverDropdown";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import { OptimalDriversPanel } from "../../components/dispatch/OptimalDriversPanel";

type Props = {
  open: boolean;
  onClose: () => void;
  loadId: string;
  operatingCompanyId: string;
  loadNumber: string;
  driversOverride?: AssignDriverDropdownProps["driversOverride"];
};

export function LoadReassignModal({ open, onClose, loadId, operatingCompanyId, loadNumber, driversOverride }: Props) {
  const { pushToast } = useToast();
  const qc = useQueryClient();
  const [driverId, setDriverId] = useState("");
  const [reasonCode, setReasonCode] = useState<string>(REASSIGN_REASON_CODES[0].value);
  const [notes, setNotes] = useState("");

  const mut = useMutation({
    mutationFn: () =>
      postLoadReassign(loadId, {
        operating_company_id: operatingCompanyId,
        new_driver_id: driverId,
        reason_code: reasonCode,
        notes: notes.trim() || undefined,
      }),
    onSuccess: async () => {
      pushToast("Load reassigned", "success");
      await qc.invalidateQueries({ queryKey: ["loads", "detail", loadId] });
      await qc.invalidateQueries({ queryKey: ["dispatch", "assignment-history", loadId] });
      await qc.invalidateQueries({ queryKey: ["loads", "list"] });
      onClose();
    },
  });

  return (
    <Modal open={open} onClose={onClose} title={`Reassign load ${loadNumber}`}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!driverId) return;
          void mut.mutateAsync();
        }}
      >
        <OptimalDriversPanel
          loadId={loadId}
          operatingCompanyId={operatingCompanyId}
          selectedDriverId={driverId}
          onSelectDriver={setDriverId}
        />
        <AssignDriverDropdown
          loadId={loadId}
          operatingCompanyId={operatingCompanyId}
          value={driverId}
          onChange={setDriverId}
          driversOverride={driversOverride}
        />
        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-600">Reason</label>
          <SelectCombobox
            className="h-9 w-full rounded border border-gray-300 px-2 text-sm"
            value={reasonCode}
            onChange={(e) => setReasonCode(e.target.value)}
          >
            {REASSIGN_REASON_CODES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </SelectCombobox>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-600">Notes (optional)</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full rounded border border-gray-300 px-2 py-1.5 text-[13px]" />
        </div>
        {mut.isError ? <div className="text-xs text-red-600">Could not reassign. Check permissions and try again.</div> : null}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button type="submit" size="sm" loading={mut.isPending} disabled={!driverId}>
            Reassign
          </Button>
        </div>
      </form>
    </Modal>
  );
}
