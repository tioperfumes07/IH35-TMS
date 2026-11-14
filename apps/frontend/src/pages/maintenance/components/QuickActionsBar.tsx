import type { CSSProperties } from "react";
import { ActionButton } from "../../../components/shared/ActionButton";
import type { WorkOrderType } from "../../../api/maintenance";

type Props = {
  onCreate: (type: WorkOrderType) => void;
  style?: CSSProperties;
};

/**
 * LIVE FAIL maintenance:wo.create (Devin HANDOFF): "+ Create Work Order" only toggled a type
 * submenu — operators waited for a modal and reported dead create chrome. Types already live
 * inside CreateWorkOrderModal (TypeTabBar). Primary click must open the wizard immediately.
 */
export function QuickActionsBar({ onCreate, style }: Props) {
  return (
    <ActionButton
      type="button"
      data-testid="maint-create-wo-primary"
      style={style}
      onClick={() => onCreate("pm")}
    >
      + Create Work Order
    </ActionButton>
  );
}
