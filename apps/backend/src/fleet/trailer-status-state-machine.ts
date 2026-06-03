export type TrailerEquipmentStatus =
  | "InService"
  | "OutOfService"
  | "InMaintenance"
  | "Sold"
  | "Lost"
  | "Damaged"
  | "Transferred";

export const TRAILER_STATUS_VALUES: readonly TrailerEquipmentStatus[] = [
  "InService",
  "OutOfService",
  "InMaintenance",
  "Sold",
  "Lost",
  "Damaged",
  "Transferred",
] as const;

/** Explicit transition graph — every enum value must appear as a key. */
export const TRAILER_STATUS_TRANSITIONS: Record<TrailerEquipmentStatus, readonly TrailerEquipmentStatus[]> = {
  InService: ["Sold", "Transferred", "Damaged", "OutOfService", "InMaintenance"],
  OutOfService: ["InService", "Damaged", "Sold", "Transferred", "InMaintenance"],
  InMaintenance: ["InService", "OutOfService", "Damaged", "Sold", "Transferred"],
  Damaged: ["OutOfService", "Sold", "Transferred"],
  Sold: [],
  Transferred: [],
  Lost: [],
} as const;

export type TrailerStatusTransitionError = {
  error: "illegal_trailer_status_transition";
  current_status: TrailerEquipmentStatus;
  requested_status: TrailerEquipmentStatus;
  reason: string;
};

export function validateTrailerStatusTransition(
  currentStatus: string,
  nextStatus: string,
  options?: { adminOverride?: boolean; actorRole?: string }
): TrailerStatusTransitionError | null {
  const current = currentStatus as TrailerEquipmentStatus;
  const next = nextStatus as TrailerEquipmentStatus;
  if (!TRAILER_STATUS_VALUES.includes(current)) {
    return {
      error: "illegal_trailer_status_transition",
      current_status: current,
      requested_status: next,
      reason: `unknown_current_status:${currentStatus}`,
    };
  }
  if (!TRAILER_STATUS_VALUES.includes(next)) {
    return {
      error: "illegal_trailer_status_transition",
      current_status: current,
      requested_status: next,
      reason: `unknown_requested_status:${nextStatus}`,
    };
  }
  if (current === next) return null;

  const allowed = TRAILER_STATUS_TRANSITIONS[current];
  if (allowed.includes(next)) return null;

  const reopenFromTerminal =
    (current === "Sold" || current === "Transferred" || current === "Lost") &&
    next === "InService" &&
    options?.adminOverride === true &&
    options?.actorRole === "Owner";

  if (reopenFromTerminal) return null;

  return {
    error: "illegal_trailer_status_transition",
    current_status: current,
    requested_status: next,
    reason:
      current === "Sold" && next === "InService"
        ? "SOLD_to_ACTIVE_requires_owner_admin_override"
        : `transition_not_allowed:${current}_to_${next}`,
  };
}
