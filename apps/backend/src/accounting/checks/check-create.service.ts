// R-154 §4 (PR 3/7) — the one place a check is actually written. checks.routes.ts (HTTP: auth, role,
// company membership, request validation, status-code mapping) calls this; a db test calls it
// directly the same way accept-bill-match.service.ts's acceptBillMatch() is tested in PR 1/7 --
// no HTTP/membership layer needed to prove the write itself is correct.
import { withLuciaBypass } from "../../auth/db.js";
import { resolveCheckPayee, CheckPayeeError } from "./check-payee.service.js";
import {
  resolveCheckBankAccount,
  resolveCheckLineDebitAccount,
  assertNotDriverAdvanceCheck,
  CheckAccountError,
  type CheckDebitLineInput,
} from "./check-account-rules.service.js";
import { ensureOpenPeriod, postSourceTransactionInClientTx, PostingEngineError } from "../posting-engine.service.js";
import { resolveExpenseCategoryId } from "../expense-category-catalog.js";
import { reassignDraftAttachments } from "../../documents/attachments.service.js";
import { isEnabled } from "../../lib/feature-flags/service.js";
import { EXPENSE_GL_POSTING_FLAG_KEY } from "../expenses.routes.js";
import { advanceCheckStockAfterUse } from "./check-stock.service.js";

export type CreateCheckLineInput = {
  line_kind: "category" | "item";
  category_kind?: string | null;
  category_code?: string | null;
  item_id?: string | null;
  amount_cents: number;
  description?: string | null;
  billable_customer_uuid?: string | null;
  load_id?: string | null;
  // R-172 step 3 -- per-line fleet linkage (accounting.expense_lines, 202614360000). Omitted/null
  // means "use the check header's own value for this dimension" (createCheck() applies that fallback).
  driver_id?: string | null;
  unit_id?: string | null;
  trailer_id?: string | null;
  linked_work_order_uuid?: string | null;
  // R-172 step 4 -- item grid Qty/Rate (R-83 owner ruling: amount is computed, never typed).
  // Required together for an item line; createCheck() recomputes amount_cents from these itself.
  quantity?: number | null;
  rate_cents?: number | null;
  unit_of_measure?: string | null;
};

export type CreateCheckInput = {
  bank_account_id: string;
  payee_kind: string;
  payee_id: string;
  check_date: string;
  print_later: boolean;
  check_number?: string | null;
  memo?: string | null;
  // R-172 step 3 -- the check's own attribution driver (distinct from a driver PAYEE, which sets
  // accounting.expenses.driver_uuid separately below); feeds each line's linkage fallback only, e.g.
  // "this vendor repair check was for driver X's truck" even though the payee is the repair shop.
  driver_id?: string | null;
  unit_id?: string | null;
  trailer_id?: string | null;
  load_id?: string | null;
  linked_work_order_uuid?: string | null;
  insurance_claim_id?: string | null;
  legal_matter_id?: string | null;
  class_id?: string | null;
  recover_from_driver?: boolean;
  // R-172 step 2 -- QBO Write Check Tags field.
  tags?: string[] | null;
  // R-172 step 6 -- footer Attachments (docs.files). UploadZone uploads under a random client-side
  // draft id before the check exists; reassignDraftAttachments (the same Option B mechanism
  // VendorBillForm/RecordExpenseForm already use) re-keys those rows onto the real expense id,
  // atomically inside the same transaction as the INSERT below, so a receipt attached during create
  // is never orphaned.
  attachment_draft_id?: string | null;
  // R-172 step 2 -- the operator's edited copy of the payee's auto-filled mailing address, if
  // they changed it before saving; null/omitted means use the payee's resolved address as-is.
  remit_to_address?: {
    address_line1?: string | null;
    address_line2?: string | null;
    city?: string | null;
    state?: string | null;
    postal_code?: string | null;
    country?: string | null;
  } | null;
  // ROUND 215.2 (verify-money-create-tags-sample-data, ACCT-F208): omitted/default-false-on-omit,
  // same convention as expenses.routes.ts's own body.is_sample_data === true -- a caller that
  // omits it gets real money, never a silent guess either way.
  is_sample_data?: boolean;
  lines: CreateCheckLineInput[];
};

export type CreateCheckResult = {
  id: string;
  check_number: string | null;
  print_status: "not_set" | "need_to_print";
  payee_kind: string;
  print_on_check_name: string;
  total_amount_cents: number;
  // R-172 step 7 -- honest posting outcome (never a silent fake success): 'unposted' when the
  // EXPENSE_GL_POSTING_ENABLED flag is off for this entity, the check's load has an open tour, or
  // the poster itself threw a PostingEngineError -- the check row is still valid and re-postable.
  posting_status: "posted" | "unposted";
  journal_entry_id: string | null;
};

export class CreateCheckConflictError extends Error {
  code = "CHECK_NUMBER_IN_USE" as const;
  constructor() {
    super("This check number is already used on this bank account.");
    this.name = "CreateCheckConflictError";
  }
}

export async function createCheck(
  operating_company_id: string,
  actorUserId: string,
  input: CreateCheckInput
): Promise<CreateCheckResult> {
  if (!input.print_later && !input.check_number) {
    throw new CheckAccountError("CHECK_NUMBER_REQUIRED", "check_number is required unless print_later is true");
  }

  // 0. R-83 owner ruling ("amount = qty x rate, computed, never typed") -- an item line's amount_cents
  // is ALWAYS derived from quantity x rate_cents here, never trusted from the client, so
  // expense_lines_item_qty_rate_amount_check holds by construction (same shape as
  // vendorBillLines.ts's deriveItemQtyRate for accounting.bill_lines). Done before totalCents so the
  // check total reflects the real, recomputed line amounts.
  const lines: CreateCheckLineInput[] = input.lines.map((line) => {
    if (line.line_kind !== "item") return line;
    const quantity = Number(line.quantity ?? 0);
    const rateCents = Number(line.rate_cents ?? 0);
    if (!(quantity > 0) || !(rateCents > 0)) {
      throw new CheckAccountError("ITEM_QTY_RATE_REQUIRED", "An item line requires a positive quantity and rate.");
    }
    return { ...line, quantity, rate_cents: rateCents, unit_of_measure: line.unit_of_measure ?? "each", amount_cents: Math.round(quantity * rateCents) };
  });

  const totalCents = lines.reduce((sum, l) => sum + l.amount_cents, 0);
  if (totalCents <= 0) throw new CheckAccountError("TOTAL_MUST_BE_POSITIVE", "The check's line total must be positive.");

  // 1. Payee -- also carries print_on_check_name / remit_to_address for the check face.
  const payee = await resolveCheckPayee(operating_company_id, input.payee_kind, input.payee_id);

  // 2. §A closed law -- a driver + cash_advance line is a bill payment, never an expense.
  for (const line of lines) {
    if (line.line_kind === "category") assertNotDriverAdvanceCheck(input.payee_kind, line.category_kind ?? null);
  }

  // 3. Bank account -- depository only, must carry a ledger_account_id.
  const bankAccount = await resolveCheckBankAccount(operating_company_id, input.bank_account_id);

  // 4. Resolve every line's debit account BEFORE writing anything (fail loud, not half-written).
  const resolvedLines = await Promise.all(
    lines.map((line) =>
      resolveCheckLineDebitAccount(
        operating_company_id,
        (line.line_kind === "category"
          ? { line_kind: "category", category_kind: line.category_kind ?? null, category_code: line.category_code ?? null }
          : { line_kind: "item", item_id: line.item_id as string }) as CheckDebitLineInput
      )
    )
  );

  const checkNumber = input.print_later ? null : (input.check_number as string);

  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operating_company_id]);

    if (checkNumber) {
      try {
        await client.query(
          `INSERT INTO banking.check_number_registry
             (operating_company_id, bank_account_id, check_number, source_kind, status, amount_cents, payee_label, created_by_user_id)
           VALUES ($1::uuid, $2::uuid, $3, 'check', 'issued', $4, $5, $6::uuid)`,
          [operating_company_id, input.bank_account_id, checkNumber, totalCents, payee.print_on_check_name, actorUserId]
        );
      } catch (err) {
        const message = String((err as { message?: string })?.message ?? "");
        if (/duplicate key|unique constraint/i.test(message)) throw new CreateCheckConflictError();
        throw err;
      }
    }

    await ensureOpenPeriod(client, operating_company_id, input.check_date);

    // "Auto-fills and stays editable" (spec §2) -- an operator-edited address (input.remit_to_address)
    // wins over the payee's freshly-resolved one; omitted/null means save the resolved address as-is.
    const remitToAddress = input.remit_to_address ?? payee.remit_to_address ?? null;

    const expenseRes: { rows: Array<{ id: string }> } = await client.query(
      `INSERT INTO accounting.expenses (
         operating_company_id, transaction_date, payment_account_uuid, total_amount_cents, memo,
         vendor_uuid, driver_uuid, payee_customer_uuid, payee_kind, payment_type, check_number,
         print_status, print_on_check_name, remit_to_address, tags,
         unit_id, trailer_id, load_id, linked_work_order_uuid, insurance_claim_id, legal_matter_id,
         class_id, recover_from_driver, status, posting_status, created_by_user_id, updated_by_user_id,
         is_sample_data
       ) VALUES (
         $1::uuid, $2::date, $3::uuid, $4, $5,
         $6::uuid, $7::uuid, $8::uuid, $9, 'check', $10,
         $11, $12, $13::jsonb, $14::text[],
         $15::uuid, $16::uuid, $17::uuid, $18::uuid, $19::uuid, $20::uuid,
         $21::uuid, $22, 'draft', 'unposted', $23::uuid, $23::uuid,
         $24
       ) RETURNING id::text`,
      [
        operating_company_id,
        input.check_date,
        // payment_account_uuid is a catalogs.accounts (GL) id, not a banking.bank_accounts id --
        // confirmed live in posting-engine.service.ts's buildExpenseLines. The bank account's OWN
        // ledger_account_id (resolved above) is what belongs here.
        bankAccount.ledger_account_id,
        totalCents,
        input.memo ?? `Check${checkNumber ? ` #${checkNumber}` : ""} · ${payee.print_on_check_name}`,
        input.payee_kind === "vendor" ? input.payee_id : null,
        input.payee_kind === "driver" ? input.payee_id : null,
        input.payee_kind === "customer" ? input.payee_id : null,
        input.payee_kind,
        checkNumber,
        checkNumber ? "not_set" : "need_to_print",
        payee.print_on_check_name,
        JSON.stringify(remitToAddress),
        input.tags ?? [],
        input.unit_id ?? null,
        input.trailer_id ?? null,
        input.load_id ?? null,
        input.linked_work_order_uuid ?? null,
        input.insurance_claim_id ?? null,
        input.legal_matter_id ?? null,
        input.class_id ?? null,
        input.recover_from_driver ?? false,
        actorUserId,
        input.is_sample_data === true,
      ]
    );
    const expenseId = expenseRes.rows[0].id;

    // R-172 step 6 -- re-key any files the operator attached during create (Option B, same mechanism
    // bills/expenses already use) onto the real expense id, inside this same transaction.
    await reassignDraftAttachments(client, {
      operatingCompanyId: operating_company_id,
      entityType: "expense",
      draftId: input.attachment_draft_id ?? null,
      newId: expenseId,
    });

    if (checkNumber) {
      await client.query(
        `UPDATE banking.check_number_registry SET source_id = $1::uuid
           WHERE operating_company_id = $2::uuid AND bank_account_id = $3::uuid AND check_number = $4 AND source_kind = 'check'`,
        [expenseId, operating_company_id, input.bank_account_id, checkNumber]
      );
      // R-190 — advance stock so the next Write Check shows used+1 (QBO parity). Creates the stock
      // row from the operator-typed number when none existed yet — never invents a starting number.
      await advanceCheckStockAfterUse(client, {
        operating_company_id,
        bank_account_id: input.bank_account_id,
        used_check_number: checkNumber,
        actor_user_id: actorUserId,
      });
    }

    let seq = 1;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const resolved = resolvedLines[i];
      const expenseCategoryUuid =
        line.line_kind === "category"
          ? await resolveExpenseCategoryId(client, {
              operatingCompanyId: operating_company_id,
              categoryCode: line.category_code ?? null,
              accountId: resolved.account_id,
            })
          : null;
      await client.query(
        `INSERT INTO accounting.expense_lines (
           expense_id, line_sequence, amount, amount_cents, description, expense_account_uuid,
           expense_category_uuid, item_id, billable_customer_uuid, load_id, operating_company_id,
           driver_id, unit_id, trailer_id, linked_work_order_uuid, quantity, rate_cents, unit_of_measure
         ) VALUES ($1::uuid, $2, $3, $4, $5, $6::uuid, $7::uuid, $8::uuid, $9::uuid, $10::uuid, $11::uuid,
                   $12::uuid, $13::uuid, $14::uuid, $15::uuid, $16, $17, $18)`,
        [
          expenseId,
          seq++,
          line.amount_cents / 100,
          line.amount_cents,
          line.description ?? payee.print_on_check_name,
          resolved.account_id,
          expenseCategoryUuid,
          line.line_kind === "item" ? line.item_id : null,
          line.billable_customer_uuid ?? null,
          line.load_id ?? input.load_id ?? null,
          operating_company_id,
          // A per-line value wins; omitted/null falls back to the check header's own dimension --
          // e.g. a single-truck repair check needs no per-line override at all.
          line.driver_id ?? input.driver_id ?? null,
          line.unit_id ?? input.unit_id ?? null,
          line.trailer_id ?? input.trailer_id ?? null,
          line.linked_work_order_uuid ?? input.linked_work_order_uuid ?? null,
          // R-83: quantity/rate_cents/unit_of_measure travel together, item lines only (normalized
          // above); a category line sends null for all three, matching the DB's own CHECK.
          line.line_kind === "item" ? line.quantity : null,
          line.line_kind === "item" ? line.rate_cents : null,
          line.line_kind === "item" ? line.unit_of_measure : null,
        ]
      );
    }

    // R-172 step 7 -- post via the ONLY existing poster (postSourceTransactionInClientTx), atomically
    // inside this same transaction: either the check + its JE both exist, or neither does. Same
    // feature-flag gate as a regular expense's own create-time post (expenses.routes.ts) -- a check
    // IS an accounting.expenses row (R-154 §2), so it gets no posting shortcut. ACC-50 REMOVED
    // (claude/00-SEAT-CONTRACT.md §3 corollary, owner ruling 2026-09-29) -- no tour-open check here.
    let postingStatus: "posted" | "unposted" = "unposted";
    let journalEntryId: string | null = null;
    if (await isEnabled(client, EXPENSE_GL_POSTING_FLAG_KEY, { operating_company_id, user_uuid: actorUserId })) {
      try {
        const posting = await postSourceTransactionInClientTx(
          client,
          { operating_company_id, source_transaction_type: "expense", source_transaction_id: expenseId },
          { userId: actorUserId }
        );
        journalEntryId = posting.journal_entry_id;
        // Spec step 7: "after posting, READ the JE back and assert Dr = Cr and the accounts are
        // correct (the engine is idempotent and can return stale JEs)." Never trust the posting
        // result alone -- a stale/idempotency-collided JE id would otherwise silently mark this check
        // posted against the wrong journal entry.
        await assertCheckJournalEntryBalanced(client, operating_company_id, journalEntryId, expenseId, bankAccount.ledger_account_id, totalCents);
        await client.query(
          `UPDATE accounting.expenses
              SET posting_status = 'posted', posted_at = now(), journal_entry_id = $2::uuid, updated_at = now()
            WHERE id = $1::uuid`,
          [expenseId, journalEntryId]
        );
        postingStatus = "posted";
      } catch (err) {
        if (!(err instanceof PostingEngineError)) throw err;
        // leave unposted -- surfaced honestly via posting_status, never a silent fake success.
      }
    }

    return {
      id: expenseId,
      check_number: checkNumber,
      print_status: (checkNumber ? "not_set" : "need_to_print") as "not_set" | "need_to_print",
      payee_kind: input.payee_kind,
      print_on_check_name: payee.print_on_check_name,
      total_amount_cents: totalCents,
      posting_status: postingStatus,
      journal_entry_id: journalEntryId,
    };
  });
}

type PostVerifyClient = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };

/**
 * R-172 step 7 readback assertion. Reads the JE's own postings back (not the poster's in-memory
 * return value) and asserts:
 *   1. Dr total === Cr total (a balanced JE, by definition of double-entry).
 *   2. The bank's ledger_account_id was credited for exactly the check's total.
 *   3. Every check line's resolved debit account appears as a debit posting for that line's amount,
 *      traced via source_transaction_line_id -> accounting.expense_lines.id (the same linkage
 *      buildExpenseLines already writes -- no new column, no new poster).
 * Throws loud (rolling back the whole create-check transaction) rather than mark a check posted
 * against a JE that doesn't actually balance or doesn't actually reflect this check's own lines.
 */
export async function assertCheckJournalEntryBalanced(
  client: PostVerifyClient,
  operatingCompanyId: string,
  journalEntryId: string,
  expenseId: string,
  bankLedgerAccountId: string,
  totalCents: number
): Promise<void> {
  const postingsRes = await client.query<{
    account_id: string;
    debit_or_credit: string;
    amount_cents: string | number;
    source_transaction_line_id: string | null;
  }>(
    `SELECT account_id::text AS account_id, debit_or_credit, amount_cents, source_transaction_line_id
       FROM accounting.journal_entry_postings
      WHERE operating_company_id = $1::uuid AND journal_entry_uuid = $2::uuid`,
    [operatingCompanyId, journalEntryId]
  );
  const postings = postingsRes.rows;
  if (postings.length === 0) {
    throw new Error(`CHECK_JE_READBACK_EMPTY: journal entry ${journalEntryId} for check ${expenseId} has no postings`);
  }

  const debitTotal = postings.filter((p) => p.debit_or_credit === "debit").reduce((sum, p) => sum + Number(p.amount_cents), 0);
  const creditTotal = postings.filter((p) => p.debit_or_credit === "credit").reduce((sum, p) => sum + Number(p.amount_cents), 0);
  if (debitTotal !== creditTotal) {
    throw new Error(`CHECK_JE_UNBALANCED: check ${expenseId} JE ${journalEntryId} Dr ${debitTotal} != Cr ${creditTotal}`);
  }

  const bankCredit = postings.find((p) => p.debit_or_credit === "credit" && p.account_id === bankLedgerAccountId);
  if (!bankCredit || Number(bankCredit.amount_cents) !== totalCents) {
    throw new Error(
      `CHECK_JE_BANK_NOT_CREDITED: check ${expenseId} JE ${journalEntryId} expected a ${totalCents}-cent credit to bank account ${bankLedgerAccountId}, found ${bankCredit ? bankCredit.amount_cents : "none"}`
    );
  }

  const lineRes = await client.query<{ id: string; expense_account_uuid: string | null; amount_cents: string | number }>(
    `SELECT id::text, expense_account_uuid::text AS expense_account_uuid, amount_cents
       FROM accounting.expense_lines
      WHERE expense_id = $1::uuid`,
    [expenseId]
  );
  for (const line of lineRes.rows) {
    const debitPosting = postings.find((p) => p.debit_or_credit === "debit" && p.source_transaction_line_id === line.id);
    if (!debitPosting) {
      throw new Error(`CHECK_JE_LINE_NOT_POSTED: check ${expenseId} line ${line.id} has no matching debit posting in JE ${journalEntryId}`);
    }
    if (Number(debitPosting.amount_cents) !== Number(line.amount_cents)) {
      throw new Error(
        `CHECK_JE_LINE_AMOUNT_MISMATCH: check ${expenseId} line ${line.id} amount ${line.amount_cents} != posted ${debitPosting.amount_cents}`
      );
    }
    if (line.expense_account_uuid && debitPosting.account_id !== line.expense_account_uuid) {
      throw new Error(
        `CHECK_JE_LINE_ACCOUNT_MISMATCH: check ${expenseId} line ${line.id} expected account ${line.expense_account_uuid}, posted to ${debitPosting.account_id}`
      );
    }
  }
}

export { CheckPayeeError, CheckAccountError };
