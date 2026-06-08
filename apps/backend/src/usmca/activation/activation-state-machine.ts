/**
 * CLOSURE-13 — USMCA activation state machine.
 * Valid states: hidden → soft_launch → pilot_drivers → full_active; any → rollback; rollback → hidden.
 */

export type ActivationState =
  | "hidden"
  | "soft_launch"
  | "pilot_drivers"
  | "full_active"
  | "rollback";

export type ChecklistItem = {
  id: string;
  label: string;
  required_for: ActivationState;
  completed: boolean;
};

export const CHECKLIST_ITEMS: ChecklistItem[] = [
  { id: "qbo_subaccount", label: "QBO subaccount created for USMCA LLC", required_for: "soft_launch", completed: false },
  { id: "coa_cloned", label: "Chart of Accounts cloned from TRANSP", required_for: "soft_launch", completed: false },
  { id: "admin_users", label: "2 admin users provisioned with USMCA RLS access", required_for: "soft_launch", completed: false },
  { id: "dot_registered", label: "DOT number registered", required_for: "soft_launch", completed: false },
  { id: "mc_authority", label: "MC authority active", required_for: "soft_launch", completed: false },
  { id: "insurance_binder", label: "Insurance binder on file", required_for: "soft_launch", completed: false },
  { id: "fmcsa_green", label: "Compliance check (FMCSA SAFER) green", required_for: "soft_launch", completed: false },
  { id: "truck_assigned", label: "At least 1 truck assigned to USMCA carrier", required_for: "soft_launch", completed: false },
  { id: "driver_onboarded", label: "At least 1 driver onboarded with USMCA assignment", required_for: "pilot_drivers", completed: false },
  { id: "customer_onboarded", label: "At least 1 customer onboarded under USMCA", required_for: "pilot_drivers", completed: false },
  { id: "test_load_e2e", label: "1 test load completed end-to-end (dispatch → POD → invoice → factored → settled)", required_for: "pilot_drivers", completed: false },
  { id: "test_bill_paid", label: "1 test bill paid (vendor → bill → BillPayment → bank rec)", required_for: "pilot_drivers", completed: false },
  { id: "five_drivers", label: "5+ drivers fully onboarded", required_for: "full_active", completed: false },
  { id: "ten_loads", label: "10+ loads completed under USMCA", required_for: "full_active", completed: false },
  { id: "bank_rec_30d", label: "Bank reconciliation pristine for 30 days", required_for: "full_active", completed: false },
  { id: "owner_signoff", label: "Owner sign-off (Jorge approves transition to full)", required_for: "full_active", completed: false },
];

export const VALID_TRANSITIONS: Record<ActivationState, ActivationState[]> = {
  hidden: ["soft_launch", "rollback"],
  soft_launch: ["pilot_drivers", "rollback"],
  pilot_drivers: ["full_active", "rollback"],
  full_active: ["rollback"],
  rollback: ["hidden"],
};

export function canTransition(from: ActivationState, to: ActivationState): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function getRequiredChecklist(targetState: ActivationState, items: ChecklistItem[]): ChecklistItem[] {
  const stateOrder: ActivationState[] = ["soft_launch", "pilot_drivers", "full_active"];
  const idx = stateOrder.indexOf(targetState);
  if (idx === -1) return [];
  const required = stateOrder.slice(0, idx + 1);
  return items.filter((item) => required.includes(item.required_for));
}

export function isChecklistComplete(targetState: ActivationState, completedIds: string[]): boolean {
  const required = getRequiredChecklist(targetState, CHECKLIST_ITEMS);
  return required.every((item) => completedIds.includes(item.id));
}

export function validateTransition(
  from: ActivationState,
  to: ActivationState,
  completedIds: string[]
): { valid: boolean; reason?: string } {
  if (!canTransition(from, to)) {
    return { valid: false, reason: `Transition from '${from}' to '${to}' is not allowed.` };
  }
  if (to === "rollback") {
    return { valid: true };
  }
  if (!isChecklistComplete(to, completedIds)) {
    return { valid: false, reason: `Checklist not complete for transition to '${to}'.` };
  }
  return { valid: true };
}
