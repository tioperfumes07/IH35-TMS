/**
 * Canonical notification preference event ids (UI + API + dispatcher).
 */
export const NOTIFICATION_PREFERENCE_EVENT_TYPES = [
  "load.assigned",
  "load.delivered",
  "settlement.created",
  "settlement.approved",
  "settlement.disputed",
  "wo.created",
  "wo.approved",
  "banking.plaid.login-required",
  "banking.transaction.flagged",
  "qbo.sync.failed",
  "report.scheduled.delivered",
  "driver.invited",
  "driver.removed",
  "advance.created",
  "factoring.invoice.funded",
] as const;

export type NotificationPreferenceEventType = (typeof NOTIFICATION_PREFERENCE_EVENT_TYPES)[number];

/**
 * Legacy dispatch keys (pre–preference-schema); map to dot-notation prefs in
 * `preferenceEventForDispatch`. Keep in sync with callers still using underscore ids.
 */
export type NotificationDispatchLegacyEventType =
  | "load_assignment"
  | "settlement_ready"
  | "settlement_approved"
  | "cash_advance_request"
  | "qbo_sync_error"
  | "plaid_item_login_required";

/** Events that can be dispatched; includes internal-only keys not exposed as preference rows. */
export type NotificationDispatchEventType =
  | NotificationPreferenceEventType
  | "abandoned_load"
  | NotificationDispatchLegacyEventType;

const PREF_SET = new Set<string>(NOTIFICATION_PREFERENCE_EVENT_TYPES);

const LEGACY_DISPATCH_TO_PREF: Record<NotificationDispatchLegacyEventType, NotificationPreferenceEventType> = {
  load_assignment: "load.assigned",
  settlement_ready: "settlement.created",
  settlement_approved: "settlement.approved",
  cash_advance_request: "advance.created",
  qbo_sync_error: "qbo.sync.failed",
  plaid_item_login_required: "banking.plaid.login-required",
};

export function isPreferenceEventType(value: string): value is NotificationPreferenceEventType {
  return PREF_SET.has(value);
}

export function preferenceEventForDispatch(event: NotificationDispatchEventType): NotificationPreferenceEventType | null {
  if (event === "abandoned_load") return null;
  const legacy = LEGACY_DISPATCH_TO_PREF[event as NotificationDispatchLegacyEventType];
  if (legacy) return legacy;
  return event as NotificationPreferenceEventType;
}
