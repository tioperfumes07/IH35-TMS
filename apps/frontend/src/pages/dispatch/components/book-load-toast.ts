/**
 * LV-DISPATCH-TOAST-LIES — the book-load success toast must report the status the SERVER returned,
 * never the one the click intended.
 *
 * THE DEFECT, live-proven on prod by CC-3 (2026-08-07, USMCA): after `Override & dispatch` on
 * `L-20260806-0008` the UI showed a green **"Load booked and dispatched"**. On prod that load was — and
 * stayed — **`assigned_not_dispatched`** (`created_at 02:05:48`, `updated_at 02:05:51`, unchanged on
 * re-query). The toast was derived from the local `saveMode` variable, so it asserted the POST-dispatch
 * outcome while the record sat in the PRE-dispatch state.
 *
 * This is NOT a naming artifact: `mdata.load_status_enum` carries a real, distinct `dispatched` member
 * alongside `assigned_not_dispatched`. And the server never promised otherwise — `book-load.service.ts`
 * writes `save_mode === "draft" ? "draft" : toMdataStatus(input.status)`, so `save_mode: "book_dispatch"`
 * does NOT force `dispatched`; the status comes from `input.status`. The truth was in the response all
 * along (`RETURNING *` → the row carries `status`); the UI simply never read it.
 *
 * WHY THIS IS NOT COSMETIC: that override was recorded specifically to permit dispatch past two DOT
 * blockers (no CDL expiry on file, no DOT medical card). A dispatcher reading the toast believes a truck
 * is rolling under an audited override; the record says it never left. An override audit trail attesting
 * to an action that did not happen is worse than no override at all — which is exactly what a DOT/FMCSA
 * reviewer or an insurer reads.
 */

/** Human label for the statuses this modal can actually produce. Unknown values are shown verbatim. */
const STATUS_LABEL: Record<string, string> = {
  draft: "saved as draft",
  assigned_not_dispatched: "assigned, NOT dispatched",
  dispatched: "dispatched",
  unassigned: "unassigned",
  in_transit: "in transit",
  delivered_pending_docs: "delivered, pending docs",
  completed_docs_received: "completed",
  cancelled: "cancelled",
};

/**
 * Build the success toast from what the server actually returned.
 *
 * @param saveMode  the button the dispatcher pressed ("draft" | "book_dispatch")
 * @param serverStatus  `status` off the 201 response row, or null when the server did not return one
 */
export function bookLoadToastMessage(saveMode: string, serverStatus: string | null | undefined): string {
  if (saveMode === "draft") return "Draft saved";

  // No status on the response: say what we KNOW (it was created) and nothing we don't. Claiming dispatch
  // here is precisely the defect — silence is honest, a green "dispatched" is not.
  if (!serverStatus) return "Load booked — status unconfirmed";

  if (serverStatus === "dispatched") return "Load booked and dispatched";

  const label = STATUS_LABEL[serverStatus] ?? serverStatus;
  return `Load booked — ${label}`;
}

/**
 * The toast severity must follow the same truth. A book-and-dispatch that did NOT reach `dispatched`
 * finished in a state the dispatcher did not ask for, so it cannot render as an unqualified green.
 */
export function bookLoadToastTone(saveMode: string, serverStatus: string | null | undefined): "success" | "info" {
  if (saveMode === "draft") return "success";
  return serverStatus === "dispatched" ? "success" : "info";
}
