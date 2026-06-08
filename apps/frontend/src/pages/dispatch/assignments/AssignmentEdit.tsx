import { useState } from "react";
import { AuthGatePanel } from "../../../components/dispatch/AuthGatePanel";
import { Button } from "../../../components/Button";

type Props = {
  operatingCompanyId: string;
  loadUuid: string;
  unitUuid?: string;
  driverUuid?: string;
  onSave?: () => void;
};

/** GAP-47: Assignment edit with inline auth gate panel. */
export function AssignmentEdit({ operatingCompanyId, loadUuid, unitUuid, driverUuid, onSave }: Props) {
  const [blocked, setBlocked] = useState(false);
  return (
    <div className="space-y-3" data-testid="assignment-edit-auth-gates">
      <AuthGatePanel
        operatingCompanyId={operatingCompanyId}
        action="assign_driver"
        loadUuid={loadUuid}
        unitUuid={unitUuid}
        driverUuid={driverUuid}
        onBlockersChange={setBlocked}
      />
      <Button type="button" disabled={blocked} onClick={onSave}>Save assignment</Button>
    </div>
  );
}
