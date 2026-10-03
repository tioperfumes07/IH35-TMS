import type { DriverBillListRow, VendorBill } from "../../api/accounting";

/**
 * BILLS-STATUS-VOCAB-01 — the Bills register's status filter, expressed ONCE in the SAME
 * vocabulary the server uses, for both bill tables.
 *
 * THE DEFECT THIS FILE EXISTS TO MAKE IMPOSSIBLE (measured live 2026-10-03, USMCA):
 *   /accounting/bills printed "Vendor bills: 93 · $64,457.23" and "Driver bills: 136 · $94,640.08"
 *   directly beneath two tables that both read "No bills found." — on the DEFAULT view, for every
 *   user, every time. 229 real bills, zero rows rendered, true totals on screen.
 *
 *   Cause: the page's default status selection is `["active"]`. `active` is a SERVER PSEUDO-STATUS
 *   (`applyBillListStatusFilter`, apps/backend/src/accounting/bills.service.ts:192-209 — "active"
 *   means `b.status NOT IN ('void','voided')`). The server honoured it and returned all 229 rows.
 *   The page then re-applied the SAME selection as a literal membership test against the row's
 *   canonical status — `statusFilter.includes(bill.status)` — and no bill row's status is ever the
 *   string "active" (`BillStatus = "open" | "partial" | "paid" | "voided"`). Every row was dropped
 *   client-side. The KPI tiles read billsQuery.data directly, bypassing that filter, which is why
 *   the tiles were right while the tables were empty. Four of the seven selectable values
 *   (`active`, `all`, `unpaid`, `posted`) are pseudo-statuses, so each of them emptied the screen.
 *
 * THE RULE, not a patch for `active`:
 *   1. A filter value the SERVER already applied is NEVER re-applied here. The register narrows
 *      server-side only when exactly one value is selected (BillsPage `statusParam`); re-testing it
 *      against a different vocabulary can only subtract rows the server already decided belong.
 *   2. A filter value this layer CANNOT express is NEVER silently applied. `posted` means "has a
 *      journal entry whose status is 'posted'" (bills.service.ts:177-190) — a server-side join this
 *      list row does not carry. Rather than approximate it and hide real rows, a selection that
 *      includes an inexpressible value does not narrow here at all, and
 *      {@link statusFilterNeedsServerNarrowing} reports that so the surface can SAY so. Empty is a
 *      question, not an answer (LAW 368.3).
 *   3. Every selectable value has a branch. `BILL_STATUS_FILTER_VALUES` is the single source of the
 *      option list, and `vendorStatusPredicate` switches over that union exhaustively — adding a
 *      value without deciding its meaning is a TypeScript error, not an empty screen.
 */

export const BILL_STATUS_FILTER_VALUES = [
  "unpaid",
  "partial",
  "paid",
  "voided",
  "active",
  "all",
  "posted",
] as const;

export type BillStatusFilterValue = (typeof BILL_STATUS_FILTER_VALUES)[number];

export function isBillStatusFilterValue(raw: string): raw is BillStatusFilterValue {
  return (BILL_STATUS_FILTER_VALUES as readonly string[]).includes(raw);
}

/**
 * Values whose meaning lives in a server-side join this list row cannot carry. Mirrors
 * `applyBillListStatusFilter`'s `posted` branch (bills.service.ts:199-203), which requires a
 * journal_entries row with status='posted'. The register's row shape exposes `journal_entry_id`
 * (resolved from journal_entry_postings), which is NOT the same predicate — a JE id says a posting
 * exists, not that the entry is posted — so it is not substituted for it here.
 */
const SERVER_ONLY_VALUES: ReadonlySet<BillStatusFilterValue> = new Set<BillStatusFilterValue>(["posted"]);

/**
 * True when the selection can only be honoured by the server. The register narrows server-side for
 * a single selected value, so this is only reachable with 2+ selected — the case where the server
 * deliberately fetches unnarrowed and this layer does the OR. The caller must disclose it.
 */
export function statusFilterNeedsServerNarrowing(selected: readonly string[]): boolean {
  return selected.length > 1 && selected.some((v) => isBillStatusFilterValue(v) && SERVER_ONLY_VALUES.has(v));
}

/**
 * Vendor-bill predicate for ONE filter value, against the row's CANONICAL status
 * (`canonicalStatus`, bills.service.ts:796 → "open" | "partial" | "paid" | "voided").
 * Each branch mirrors the matching branch of `applyBillListStatusFilter`.
 */
function vendorStatusPredicate(value: BillStatusFilterValue, bill: VendorBill): boolean {
  switch (value) {
    // Register route maps the UI's "unpaid" to the server's "open" before querying
    // (bills.routes.ts:327), and the server's "open" is `b.status IN ('open','unpaid')`, which
    // canonicalises to "open".
    case "unpaid":
      return bill.status === "open";
    case "partial":
      return bill.status === "partial";
    case "paid":
      return bill.status === "paid";
    case "voided":
      return bill.status === "voided";
    case "active":
      return bill.status !== "voided";
    case "all":
      return true;
    // Unreachable: guarded by statusFilterNeedsServerNarrowing before any predicate runs. Returning
    // true keeps the failure mode "shows too much and says why", never "silently shows nothing".
    case "posted":
      return true;
  }
}

/**
 * driver_finance.driver_bills carries its own status vocabulary — measured live in USMCA on
 * 2026-10-03: 'paid' (90) and 'open' (46), plus 'void' / voided_at for voids (the register SQL's
 * own void predicate, bills.routes.ts:59). "partial" genuinely does not exist on a driver bill, so
 * selecting it correctly yields no driver rows; that is an answer, not a dropped row.
 */
function driverStatusPredicate(value: BillStatusFilterValue, bill: DriverBillListRow): boolean {
  const isVoid = bill.status === "void" || bill.status === "voided" || bill.voided_at != null;
  switch (value) {
    case "unpaid":
      return !isVoid && bill.status === "open";
    case "partial":
      return false;
    case "paid":
      return !isVoid && bill.status === "paid";
    case "voided":
      return isVoid;
    case "active":
      return !isVoid;
    case "all":
      return true;
    case "posted":
      return true;
  }
}

function matches<T>(
  selected: readonly string[],
  serverAlreadyNarrowed: boolean,
  row: T,
  predicate: (value: BillStatusFilterValue, row: T) => boolean
): boolean {
  // Rule 1 — nothing selected, or the server already narrowed for this exact selection.
  if (selected.length === 0 || serverAlreadyNarrowed) return true;
  // Rule 2 — an inexpressible value is in play; do not narrow, and let the caller disclose it.
  if (statusFilterNeedsServerNarrowing(selected)) return true;
  // Rule 3 — OR the expressible values. An unrecognised string narrows nothing rather than
  // emptying the list (the exact failure this file replaces).
  const usable = selected.filter(isBillStatusFilterValue);
  if (usable.length === 0) return true;
  return usable.some((value) => predicate(value, row));
}

/** @param serverAlreadyNarrowed BillsPage passes `statusFilter.length === 1` — the register's own rule. */
export function vendorBillMatchesStatusFilter(
  bill: VendorBill,
  selected: readonly string[],
  serverAlreadyNarrowed: boolean
): boolean {
  return matches(selected, serverAlreadyNarrowed, bill, vendorStatusPredicate);
}

export function driverBillMatchesStatusFilter(
  bill: DriverBillListRow,
  selected: readonly string[],
  serverAlreadyNarrowed: boolean
): boolean {
  return matches(selected, serverAlreadyNarrowed, bill, driverStatusPredicate);
}
