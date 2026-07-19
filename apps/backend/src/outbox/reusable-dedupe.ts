/**
 * Event types whose dedupe_key is cleared on terminal (delivered / failed / exhausted)
 * so a later legitimate re-enqueue of the same identity is not blocked by the lifetime
 * partial unique index ux_outbox_events_dedupe_key (migration 0212).
 *
 * Alert routing and other lifetime-dedupe emitters must NOT be listed here.
 */
export const OUTBOX_REUSABLE_DEDUPE_EVENT_TYPES = ["fmcsa.customer.verify_requested"] as const;

export function shouldReleaseOutboxDedupeKey(eventType: string): boolean {
  return (OUTBOX_REUSABLE_DEDUPE_EVENT_TYPES as readonly string[]).includes(eventType);
}
