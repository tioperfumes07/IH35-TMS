import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { postLoadReassign } from "../../api/dispatch";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { AssignDriverDropdown, REASSIGN_REASON_CODES, type AssignDriverDropdownProps } from "./AssignDriverDropdown";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import { OptimalDriversPanel } from "../../components/dispatch/OptimalDriversPanel";
import { AuthGatePanel } from "../../components/dispatch/AuthGatePanel";
import { userFacingApiError } from "../../lib/api-error-message";
import { entityLabel } from "../../lib/entity-label";
import { EntityLink } from "../../components/shared/EntityLink";

type Props = {
  open: boolean;
  onClose: () => void;
  loadId: string;
  operatingCompanyId: string;
  loadNumber: string;
  driversOverride?: AssignDriverDropdownProps["driversOverride"];
};

/**
 * SKIP inventing a second driver picker here — create-worthy select lives in AssignDriverDropdown
 * (wired with CreateDriverModal + "+ Create driver"); this modal inherits via composition.
 */
export function LoadReassignModal({ open, onClose, loadId, operatingCompanyId, loadNumber, driversOverride }: Props) {
  const { pushToast } = useToast();
  const qc = useQueryClient();
  const [driverId, setDriverId] = useState("");
  const [reasonCode, setReasonCode] = useState<string>(REASSIGN_REASON_CODES[0].value);
  const [notes, setNotes] = useState("");
  // GAP-47 — dispatch authorization gates preview; the server enforces the same check on the
  // PATCH .../assignment mutation (422 dispatch_auth_gate_blocked), this is an early, read-only warning.
  const [gateBlocked, setGateBlocked] = useState(false);
  const scopeGenerationRef = useRef(0);

  const mut = useMutation({
    mutationFn: (input: { loadId: string; operatingCompanyId: string; driverId: string; reasonCode: string; notes: string; generation: number }) =>
      postLoadReassign(input.loadId, {
        operating_company_id: input.operatingCompanyId,
        new_driver_id: input.driverId,
        reason_code: input.reasonCode,
        notes: input.notes.trim() || undefined,
      }),
    onSuccess: async (_result, input) => {
      if (input.generation !== scopeGenerationRef.current || input.loadId !== loadId || input.operatingCompanyId !== operatingCompanyId) return;
      pushToast("Load reassigned", "success");
      await qc.invalidateQueries({ queryKey: ["loads", "detail", input.loadId] });
      await qc.invalidateQueries({ queryKey: ["dispatch", "assignment-history", input.loadId] });
      await qc.invalidateQueries({ queryKey: ["loads", "list"] });
      onClose();
    },
  });

  useEffect(() => {
    scopeGenerationRef.current += 1;
    setDriverId("");
    setReasonCode(REASSIGN_REASON_CODES[0].value);
    setNotes("");
    setGateBlocked(false);
    mut.reset();
  // The mutation object is intentionally excluded: only modal identity changes retire submitted state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loadId, operatingCompanyId]);

  const closeIfIdle = () => {
    if (!mut.isPending) onClose();
  };

  return (
    <Modal open={open} onClose={closeIfIdle} title={`Reassign load ${loadNumber}`}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!driverId) return;
          mut.mutate({ loadId, operatingCompanyId, driverId, reasonCode, notes, generation: scopeGenerationRef.current });
        }}
      >
        {/* Exact Leaves dispatch.modal.load_reassign:load — title used loadNumber text only. */}
        <div className="text-xs text-slate-600" data-testid="load-reassign-modal-load-entitylink">
          Load:{" "}
          <EntityLink kind="load" id={loadId} label={entityLabel(loadNumber, loadId, "Load")} />
        </div>
        <OptimalDriversPanel
          loadId={loadId}
          operatingCompanyId={operatingCompanyId}
          selectedDriverId={driverId}
          onSelectDriver={setDriverId}
          disabled={mut.isPending}
        />
        <AssignDriverDropdown
          loadId={loadId}
          operatingCompanyId={operatingCompanyId}
          value={driverId}
          onChange={setDriverId}
          driversOverride={driversOverride}
          disabled={mut.isPending}
        />
        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-600">Reason</label>
          <SelectCombobox
            className="h-9 w-full rounded-sm border border-gray-300 px-2 text-sm"
            value={reasonCode}
            disabled={mut.isPending}
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
          <textarea value={notes} disabled={mut.isPending} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full rounded-sm border border-gray-300 px-2 py-1.5 text-[13px]" />
        </div>
        {driverId ? (
          <AuthGatePanel
            operatingCompanyId={operatingCompanyId}
            action="assign_driver"
            loadUuid={loadId}
            loadLabel={loadNumber}
            driverUuid={driverId}
            onBlockersChange={setGateBlocked}
          />
        ) : null}
        {mut.isError ? (
          <div className="text-xs text-red-600">{userFacingApiError(mut.error, "Could not reassign load")}</div>
        ) : null}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" size="sm" onClick={closeIfIdle} disabled={mut.isPending}>
            Close
          </Button>
          <Button type="submit" size="sm" loading={mut.isPending} disabled={!driverId || gateBlocked}>
            Reassign
          </Button>
        </div>
      </form>
    </Modal>
  );
}
