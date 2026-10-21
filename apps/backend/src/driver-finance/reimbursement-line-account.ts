// 443.203 R (ACCT-F4432034) — THE ONE RULE for the account a driver-reimbursement settlement line posts to.
//
//   1. the account stamped on the line at creation (posting_account_id) wins;
//   2. else the line's own item -> that item's expense account, through the one line resolver
//      (resolveLineItemAndAccount — the same resolver the Creator's expense / reimbursement writers use);
//   3. only a line with NO item falls back to the reimbursement-type map (resolveReimbursementExpenseAccount).
//
// Before this rule an itemed line with no stamped account (a Scale reimbursement, item -> 5300 Tolls & Scales) fell
// to the type map with a NULL type -> USMCA 5310 Lumper Expense, and the per-load A/P bill was refused by
// assertLineAccountMatchesItem ("line_account_differs_from_item"). An item whose account does not resolve is refused
// by name — never replaced by the type default.
import { resolveLineItemAndAccount } from "../accounting/line-item-account.js";

type Queryable = { query: (text: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> };

export type ReimbursementLineAccountInput = {
  posting_account_id: string | null;
  item_id: string | null;
  reimbursement_type: string | null;
};

export async function resolveReimbursementLineAccount(
  client: Queryable,
  operatingCompanyId: string,
  line: ReimbursementLineAccountInput,
  byType: (reimbursementType: string | null) => Promise<string | null>
): Promise<{ accountId: string } | { refused: string }> {
  if (line.posting_account_id) return { accountId: line.posting_account_id };
  if (line.item_id) {
    const picked = await resolveLineItemAndAccount(client, operatingCompanyId, { item_id: line.item_id });
    if (!picked) return { refused: `reimbursement item ${line.item_id} did not resolve` };
    if ("refused" in picked) return { refused: picked.refused };
    return { accountId: picked.account_id };
  }
  const acct = await byType(line.reimbursement_type);
  return acct
    ? { accountId: acct }
    : { refused: `No active reimbursement expense account resolved for type '${line.reimbursement_type ?? "unknown"}'` };
}
