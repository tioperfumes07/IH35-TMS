/**
 * ROUND 441.5 Phase 1 — the ONE writer of an expense document paid straight from a bank line.
 *
 * Owner, 2026-10-07: "ours should work exactly as quickbooks." When QuickBooks categorizes a money-out bank-feed line to
 * an expense account it creates an Expense document with the payee; it does not write a bare journal entry. Two callers:
 *   - banking/bank-feed-gl-posting.service.ts — a categorized money-out line to an Expense / COGS / Other Expense account
 *   - banking/recon-adjustments.service.ts — the bank service charge entered during a reconciliation
 * Both insert the document, its one line, post it through the EXISTING expense poster (postSourceTransactionInClientTx
 * 'expense', never new GL math) and stamp the posted state, on the caller's transaction.
 *
 * Every line names a catalog item (expense_lines_item_id_required, Lead order 2026-09-30). resolveExpenseItemForAccount
 * picks it: the operator's item, else the ONE item mapped to the account. Several items or none are refused by name, never
 * guessed.
 */
import { nextExpenseDisplayId } from "./display-id.js";
import { postSourceTransactionInClientTx } from "./posting-engine.service.js";

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

export class BankLineExpenseError extends Error {
  constructor(
    readonly code: "category_account_has_no_item" | "category_account_item_ambiguous" | "item_not_usable" | "expense_insert_failed",
    message: string
  ) {
    super(message);
    this.name = "BankLineExpenseError";
  }
}

/**
 * The catalog item for an expense line on `accountId`. An explicit item must be this company's, active; otherwise the
 * single active item whose default_expense_account_id is the account. Throws BankLineExpenseError when none or several.
 */
export async function resolveExpenseItemForAccount(
  client: Queryable,
  input: { operatingCompanyId: string; accountId: string; explicitItemId?: string | null; accountLabel?: string | null }
): Promise<string> {
  if (input.explicitItemId) {
    const r = await client.query<{ id: string }>(
      `SELECT id::text FROM catalogs.items WHERE id = $1::uuid AND operating_company_id = $2::uuid AND deactivated_at IS NULL LIMIT 1`,
      [input.explicitItemId, input.operatingCompanyId]
    );
    if (!r.rows[0]) throw new BankLineExpenseError("item_not_usable", "The chosen item is not an active item of this company.");
    return r.rows[0].id;
  }
  const mapped = await client.query<{ id: string; item_name: string }>(
    `SELECT id::text, item_name FROM catalogs.items
      WHERE operating_company_id = $1::uuid AND deactivated_at IS NULL AND default_expense_account_id = $2::uuid
      ORDER BY item_name`,
    [input.operatingCompanyId, input.accountId]
  );
  const label = input.accountLabel ? `account ${input.accountLabel}` : "this account";
  if (mapped.rows.length === 1) return mapped.rows[0]!.id;
  if (mapped.rows.length === 0) {
    throw new BankLineExpenseError(
      "category_account_has_no_item",
      `No product/service item is mapped to ${label}. Every expense line names an item: create one for it, or choose an item.`
    );
  }
  throw new BankLineExpenseError(
    "category_account_item_ambiguous",
    `${mapped.rows.length} items are mapped to ${label} (${mapped.rows.map((r) => r.item_name).join(", ")}). Choose the item.`
  );
}

export type BankLineExpenseInput = {
  operatingCompanyId: string;
  transactionDate: string;
  amountCents: number;
  memo: string;
  vendorId: string | null;
  /** The bank's ledger account the money left from (Cr side of the expense poster). */
  paymentAccountId: string;
  /** The chosen expense / cost account (Dr side). */
  expenseAccountId: string;
  itemId: string;
  lineDescription: string;
  /** The bank line that created this expense (null for a reconciliation service charge). */
  sourceBankTransactionId: string | null;
  loadId?: string | null;
  unitId?: string | null;
  trailerId?: string | null;
  driverId?: string | null;
};

export async function createAndPostBankLineExpenseOnClient(
  client: Queryable,
  input: BankLineExpenseInput,
  actor: { userId: string }
): Promise<{ expense_id: string; journal_entry_id: string; posting_batch_id: string | null }> {
  const expenseNumber = await nextExpenseDisplayId(
    client as never,
    input.operatingCompanyId,
    new Date(`${input.transactionDate}T00:00:00.000Z`)
  );

  const inserted = await client.query<{ id: string }>(
    `INSERT INTO accounting.expenses (
        operating_company_id, status, posting_status, transaction_date, total_amount_cents,
        memo, expense_number, vendor_uuid, payment_account_uuid,
        is_sample_data, is_company_expense, is_reimbursable,
        source_bank_transaction_id, load_id, unit_id, trailer_id, driver_uuid,
        created_by_user_id, updated_by_user_id
      ) VALUES (
        $1::uuid, 'draft', 'unposted', $2::date, $3::bigint,
        $4, $5, $6::uuid, $7::uuid,
        false, true, false,
        $8::uuid, $9::uuid, $10::uuid, $11::uuid, $12::uuid,
        $13::uuid, $13::uuid
      )
      RETURNING id::text AS id`,
    [
      input.operatingCompanyId,
      input.transactionDate,
      input.amountCents,
      input.memo,
      expenseNumber,
      input.vendorId,
      input.paymentAccountId,
      input.sourceBankTransactionId,
      input.loadId ?? null,
      input.unitId ?? null,
      input.trailerId ?? null,
      input.driverId ?? null,
      actor.userId,
    ]
  );
  const expenseId = inserted.rows[0]?.id;
  if (!expenseId) throw new BankLineExpenseError("expense_insert_failed", "The expense could not be created.");

  await client.query(
    `INSERT INTO accounting.expense_lines (
        operating_company_id, expense_id, line_sequence, amount, amount_cents,
        description, load_required, expense_account_uuid, item_id,
        quantity, rate_cents, unit_of_measure,
        load_id, unit_id, trailer_id, driver_id
      ) VALUES (
        $1::uuid, $2::uuid, 1, $3::numeric, $4::bigint,
        $5, false, $6::uuid, $7::uuid,
        1, $4::bigint, 'each',
        $8::uuid, $9::uuid, $10::uuid, $11::uuid
      )`,
    [
      input.operatingCompanyId,
      expenseId,
      input.amountCents / 100,
      input.amountCents,
      input.lineDescription,
      input.expenseAccountId,
      input.itemId,
      input.loadId ?? null,
      input.unitId ?? null,
      input.trailerId ?? null,
      input.driverId ?? null,
    ]
  );

  const posting = await postSourceTransactionInClientTx(
    client as never,
    { operating_company_id: input.operatingCompanyId, source_transaction_type: "expense", source_transaction_id: expenseId },
    { userId: actor.userId }
  );

  await client.query(
    `UPDATE accounting.expenses
        SET status = 'posted', posting_status = 'posted', posted_at = now(), journal_entry_id = $2::uuid, updated_at = now()
      WHERE id = $1::uuid AND operating_company_id = $3::uuid`,
    [expenseId, posting.journal_entry_id, input.operatingCompanyId]
  );

  return {
    expense_id: expenseId,
    journal_entry_id: posting.journal_entry_id,
    posting_batch_id: (posting as { posting_batch_id?: string | null }).posting_batch_id ?? null,
  };
}
