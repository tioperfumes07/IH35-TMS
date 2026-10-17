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
import { resolveLineLoadExemption } from "./expense-line-load-exemption.js";
import { readLoadAttribution, reconcileExpenseWithLoad, type ExpenseAttribution } from "./expense-load-attribution.js";
<<<<<<< HEAD
import { EXPENSE_SQL_NOW, reserveExpenseNumber, writeExpenseDocumentInClientTx, type ExpenseRow } from "./expense-writer.service.js";
=======
import { EXPENSE_SQL_NOW, insertExpenseHeader, insertExpenseLine } from "./expense-writer.service.js";
>>>>>>> origin/main

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

export class BankLineExpenseError extends Error {
  constructor(
    readonly code: "category_account_has_no_item" | "category_account_item_ambiguous" | "item_not_usable" | "expense_insert_failed" | "load_not_in_company" | "load_attribution_mismatch",
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
  /** 443.105 — why a line with no load is not a load cost; derived from the account + bank line when omitted. */
  loadExemptionReason?: string | null;
};

export async function createAndPostBankLineExpenseOnClient(
  client: Queryable,
  input: BankLineExpenseInput,
  actor: { userId: string }
): Promise<{ expense_id: string; journal_entry_id: string; posting_batch_id: string | null }> {
  // G6: categorization tags are claims, not a second source of load assignments. Use the same
  // company-scoped resolver and mismatch policy as Record Expense, before allocating or writing.
  let dimensions: ExpenseAttribution = {
    unitId: input.unitId ?? null, driverId: input.driverId ?? null,
    trailerId: input.trailerId ?? null, nonOwnedTrailerId: null,
  };
  if (input.loadId) {
    const load = await readLoadAttribution(client, input.operatingCompanyId, input.loadId);
    if (!load) throw new BankLineExpenseError("load_not_in_company", "The load does not belong to this company.");
    const resolved = reconcileExpenseWithLoad(input, load);
    if ("mismatch" in resolved) {
      throw new BankLineExpenseError("load_attribution_mismatch", `Expense ${resolved.mismatch} mismatch with the selected load.`);
    }
    dimensions = resolved;
  }
  // DEGH-06 / 443.113-C — a load-tagged bank-line expense uses the load spine (12225, 12225-1, …),
<<<<<<< HEAD
  // never the generic EXP-YYYY-##### series. 443.182 C — numbered, written, linked and posted by the one expense engine
  // (expense-writer.service.ts); this function keeps the bank-line policy as engine options: company cost, no unit
  // required, no memo dedup, ALWAYS posted (draft -> posted, status moves with posting_status).
  const number = await reserveExpenseNumber(client, input.operatingCompanyId, {
=======
  // never the generic EXP-YYYY-##### series. Same allocator as expenses.routes / fuel documents.
  let expenseNumber: string;
  let loadAttribution: { number: string; seq: number; loadNumber: string } | null = null;
  if (input.loadId) {
    loadAttribution = await generateExpenseNumber(client as never, input.loadId, input.operatingCompanyId);
    expenseNumber = loadAttribution.number;
  } else {
    expenseNumber = await nextExpenseDisplayId(
      client as never,
      input.operatingCompanyId,
      new Date(`${input.transactionDate}T00:00:00.000Z`)
    );
  }

  // 443.182 C — persisted through the one expense writer (expense-writer.service.ts); this function keeps the bank-line
  // policy: draft -> post through the expense poster unconditionally, company cost, no unit required, no memo dedup.
  const expenseId = await insertExpenseHeader(client, {
    operating_company_id: input.operatingCompanyId,
    status: "draft",
    posting_status: "unposted",
    transaction_date: input.transactionDate,
    total_amount_cents: input.amountCents,
    memo: input.memo,
    expense_number: expenseNumber,
    vendor_uuid: input.vendorId,
    payment_account_uuid: input.paymentAccountId,
    is_sample_data: false,
    is_company_expense: true,
    is_reimbursable: false,
    source_bank_transaction_id: input.sourceBankTransactionId,
    load_id: input.loadId ?? null,
    unit_id: dimensions.unitId,
    trailer_id: dimensions.trailerId,
    driver_uuid: dimensions.driverId,
    created_by_user_id: actor.userId,
    updated_by_user_id: actor.userId,
    non_owned_trailer_id: dimensions.nonOwnedTrailerId,
  });
  if (!expenseId) throw new BankLineExpenseError("expense_insert_failed", "The expense could not be created.");

  if (loadAttribution && input.loadId) {
    await insertExpenseLoadLink(client as never, {
      operatingCompanyId: input.operatingCompanyId,
      expenseId,
      loadId: input.loadId,
      loadNumber: loadAttribution.loadNumber,
      seq: loadAttribution.seq,
      expenseNumber: loadAttribution.number,
      method: "user_assigned",
      confidence: "high",
      reason: "Bank-line expense attributed to its tagged load",
      userId: actor.userId,
    });
  }

  // 443.105 #2 — a bank-line expense with no load says why: company cost on <account>, from this bank line.
  const accountLabel = input.loadId
    ? null
    : (
        await client.query<{ label: string | null }>(
          `SELECT NULLIF(concat_ws(' ', a.account_number, a.account_name), '') AS label
             FROM catalogs.accounts a WHERE a.id = $1::uuid AND a.operating_company_id = $2::uuid`,
          [input.expenseAccountId, input.operatingCompanyId]
        )
      ).rows[0]?.label ?? null;
  const loadExemptionReason = resolveLineLoadExemption({
>>>>>>> origin/main
    loadId: input.loadId ?? null,
    referenceDate: new Date(`${input.transactionDate}T00:00:00.000Z`),
  });

<<<<<<< HEAD
  // 443.105 #2 — a bank-line expense with no load says why: company cost on <account>, from this bank line.
  const lineFor = async (): Promise<ExpenseRow> => {
    const accountLabel = input.loadId
      ? null
      : (
          await client.query<{ label: string | null }>(
            `SELECT NULLIF(concat_ws(' ', a.account_number, a.account_name), '') AS label
               FROM catalogs.accounts a WHERE a.id = $1::uuid AND a.operating_company_id = $2::uuid`,
            [input.expenseAccountId, input.operatingCompanyId]
          )
        ).rows[0]?.label ?? null;
    const loadExemptionReason = resolveLineLoadExemption({
      loadId: input.loadId ?? null,
      reason: input.loadExemptionReason ?? null,
      accountLabel,
      context: input.sourceBankTransactionId
        ? `bank line ${input.transactionDate}`
        : `reconciliation service charge ${input.transactionDate}`,
    });
    return {
      operating_company_id: input.operatingCompanyId,
      line_sequence: 1,
      amount: input.amountCents / 100,
      amount_cents: input.amountCents,
      description: input.lineDescription,
      load_required: false,
      expense_account_uuid: input.expenseAccountId,
      item_id: input.itemId,
      quantity: 1,
      rate_cents: input.amountCents,
      unit_of_measure: "each",
      load_id: input.loadId ?? null,
      unit_id: dimensions.unitId,
      trailer_id: dimensions.trailerId,
      driver_id: dimensions.driverId,
      load_exemption_reason: loadExemptionReason,
    };
  };
=======
  await insertExpenseLine(client, {
    operating_company_id: input.operatingCompanyId,
    expense_id: expenseId,
    line_sequence: 1,
    amount: input.amountCents / 100,
    amount_cents: input.amountCents,
    description: input.lineDescription,
    load_required: false,
    expense_account_uuid: input.expenseAccountId,
    item_id: input.itemId,
    quantity: 1,
    rate_cents: input.amountCents,
    unit_of_measure: "each",
    load_id: input.loadId ?? null,
    unit_id: dimensions.unitId,
    trailer_id: dimensions.trailerId,
    driver_id: dimensions.driverId,
    load_exemption_reason: loadExemptionReason,
  });
>>>>>>> origin/main

  const written = await writeExpenseDocumentInClientTx(client, {
    header: {
      operating_company_id: input.operatingCompanyId,
      status: "draft",
      posting_status: "unposted",
      transaction_date: input.transactionDate,
      total_amount_cents: input.amountCents,
      memo: input.memo,
      vendor_uuid: input.vendorId,
      payment_account_uuid: input.paymentAccountId,
      is_sample_data: false,
      is_company_expense: true,
      is_reimbursable: false,
      source_bank_transaction_id: input.sourceBankTransactionId,
      load_id: input.loadId ?? null,
      unit_id: dimensions.unitId,
      trailer_id: dimensions.trailerId,
      driver_uuid: dimensions.driverId,
      created_by_user_id: actor.userId,
      updated_by_user_id: actor.userId,
      non_owned_trailer_id: dimensions.nonOwnedTrailerId,
    },
    number,
    lines: async ({ insertLine }) => {
      await insertLine(await lineFor());
    },
    loadLink: input.loadId
      ? { method: "user_assigned", confidence: "high", reason: "Bank-line expense attributed to its tagged load", userId: actor.userId }
      : undefined,
    post: { actorUserId: actor.userId, stamp: "status_and_posting" },
  });
  if (!written) throw new BankLineExpenseError("expense_insert_failed", "The expense could not be created.");
  const post = written.post as { posted: true; journalEntryId: string; postingBatchId: string | null };

  return {
    expense_id: written.expenseId,
    journal_entry_id: post.journalEntryId,
    posting_batch_id: post.postingBatchId,
  };
}

/**
 * DEGH-02 / G6 adopt — a legacy bare bank_categorization JE that already debited an expense account
 * gets an expense DOCUMENT that ADOPTS that JE (one JE, never two). Same shape as fuel's
 * adoptRelayFillExpenseDocument: INSERT expense + line pointing at the live JE, stamp matched_expense_id.
 * Never re-posts. The caller's itemId must already be resolved (preferred name / create-if-missing is
 * the backfill's job — resolveExpenseItemForAccount still refuses ambiguous / empty accounts).
 */
export type AdoptBankCategorizationExpenseInput = {
  operatingCompanyId: string;
  bankTransactionId: string;
  itemId: string;
  /** Optional override when the bank line's description is empty. */
  memo?: string | null;
};

export type AdoptBankCategorizationExpenseResult =
  | { outcome: "created"; expense_id: string; journal_entry_id: string; expense_number: string }
  | { outcome: "already_exists"; expense_id: string; journal_entry_id: string };

export async function adoptBankCategorizationExpenseDocument(
  client: Queryable,
  input: AdoptBankCategorizationExpenseInput,
  actor: { userId: string }
): Promise<AdoptBankCategorizationExpenseResult> {
  const company = input.operatingCompanyId;

  const lineRes = await client.query<{
    transaction_date: string;
    description: string | null;
    categorization_memo: string | null;
    vendor_id: string | null;
    load_id: string | null;
    unit_id: string | null;
    trailer_id: string | null;
    driver_id: string | null;
    amount_cents: string;
    matched_je: string | null;
    matched_expense: string | null;
  }>(
    `SELECT bt.transaction_date::text AS transaction_date, bt.description, bt.categorization_memo,
            bt.categorization_vendor_id::text AS vendor_id, bt.categorization_load_id::text AS load_id,
            bt.categorization_unit_id::text AS unit_id, bt.categorization_trailer_id::text AS trailer_id,
            bt.categorization_driver_id::text AS driver_id, bt.amount_cents::text AS amount_cents,
            bt.matched_journal_entry_id::text AS matched_je, bt.matched_expense_id::text AS matched_expense
       FROM banking.bank_transactions bt
      WHERE bt.id = $1::uuid AND bt.operating_company_id = $2::uuid AND bt.voided_at IS NULL
      LIMIT 1`,
    [input.bankTransactionId, company]
  );
  const line = lineRes.rows[0];
  if (!line) throw new BankLineExpenseError("expense_insert_failed", `Bank line ${input.bankTransactionId} not found for this company.`);
  if (!line.matched_je) {
    throw new BankLineExpenseError("expense_insert_failed", `Bank line ${input.bankTransactionId} has no matched journal entry to adopt.`);
  }

  if (line.matched_expense) {
    return { outcome: "already_exists", expense_id: line.matched_expense, journal_entry_id: line.matched_je };
  }
  const byJe = await client.query<{ id: string }>(
    `SELECT id::text FROM accounting.expenses
      WHERE operating_company_id = $1::uuid AND journal_entry_id = $2::uuid AND voided_at IS NULL LIMIT 1`,
    [company, line.matched_je]
  );
  if (byJe.rows[0]) {
    await client.query(
      `UPDATE banking.bank_transactions
          SET matched_expense_id = $1::uuid, review_state = 'matched', resolution_kind = COALESCE(resolution_kind, 'added'),
              reviewed_at = COALESCE(reviewed_at, now()), updated_at = now()
        WHERE id = $2::uuid AND operating_company_id = $3::uuid AND matched_expense_id IS NULL`,
      [byJe.rows[0].id, input.bankTransactionId, company]
    );
    return { outcome: "already_exists", expense_id: byJe.rows[0].id, journal_entry_id: line.matched_je };
  }
  const bySource = await client.query<{ id: string; je: string | null }>(
    `SELECT id::text, journal_entry_id::text AS je FROM accounting.expenses
      WHERE operating_company_id = $1::uuid AND source_bank_transaction_id = $2::uuid AND voided_at IS NULL LIMIT 1`,
    [company, input.bankTransactionId]
  );
  if (bySource.rows[0]) {
    await client.query(
      `UPDATE banking.bank_transactions
          SET matched_expense_id = $1::uuid, review_state = 'matched', resolution_kind = COALESCE(resolution_kind, 'added'),
              reviewed_at = COALESCE(reviewed_at, now()), updated_at = now()
        WHERE id = $2::uuid AND operating_company_id = $3::uuid AND matched_expense_id IS NULL`,
      [bySource.rows[0].id, input.bankTransactionId, company]
    );
    return {
      outcome: "already_exists",
      expense_id: bySource.rows[0].id,
      journal_entry_id: bySource.rows[0].je ?? line.matched_je,
    };
  }

  // Live bank_categorization legs of this JE for this bank line — refuse if not exactly one expense debit + one credit.
  const legs = await client.query<{
    account_id: string;
    debit_or_credit: string;
    amount_cents: string;
    account_type: string;
    account_number: string | null;
    account_name: string | null;
  }>(
    `SELECT p.account_id::text, p.debit_or_credit, p.amount_cents::text,
            a.account_type, a.account_number, a.account_name
       FROM accounting.journal_entry_postings p
       JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid
       JOIN catalogs.accounts a ON a.id = p.account_id
      WHERE p.journal_entry_uuid = $1::uuid AND p.operating_company_id = $2::uuid
        AND p.source_transaction_type = 'bank_categorization'
        AND p.source_transaction_id::text = $3
        AND je.status = 'posted' AND je.voided_at IS NULL
        AND je.reversed_by_je_id IS NULL AND je.reverses_je_id IS NULL
      ORDER BY p.line_sequence`,
    [line.matched_je, company, input.bankTransactionId]
  );
  const expenseDebits = legs.rows.filter(
    (l) => l.debit_or_credit === "debit" && ["Expense", "CostOfGoodsSold", "OtherExpense"].includes(l.account_type)
  );
  const credits = legs.rows.filter((l) => l.debit_or_credit === "credit");
  if (expenseDebits.length !== 1 || credits.length !== 1) {
    throw new BankLineExpenseError(
      "expense_insert_failed",
      `Journal entry ${line.matched_je} is not one live bank_categorization expense posting of line ${input.bankTransactionId} (expense debits ${expenseDebits.length}, credits ${credits.length}).`
    );
  }
  const debit = expenseDebits[0]!;
  const credit = credits[0]!;
  const totalCents = Math.round(Number(debit.amount_cents));
  if (totalCents !== Math.round(Number(credit.amount_cents)) || totalCents <= 0) {
    throw new BankLineExpenseError(
      "expense_insert_failed",
      `Journal entry ${line.matched_je} does not foot (debit ${debit.amount_cents} vs credit ${credit.amount_cents}).`
    );
  }

  // Confirm the caller's item is this company's and active (never invent one here).
  await resolveExpenseItemForAccount(client, {
    operatingCompanyId: company,
    accountId: debit.account_id,
    explicitItemId: input.itemId,
    accountLabel: [debit.account_number, debit.account_name].filter(Boolean).join(" "),
  });

  const txnDate = line.transaction_date;
  const description =
    (input.memo ?? "").trim() ||
    (line.categorization_memo ?? "").trim() ||
    (line.description ?? "").trim() ||
    "Bank categorization";
  const memo = `${description.slice(0, 400)} — document for journal entry ${line.matched_je} (G6: one JE, the document adopts it)`;

<<<<<<< HEAD
  // 443.182 C — numbered, written and linked by the one expense engine; the adopting document is born posted on the
  // existing JE and never re-posts.
  const number = await reserveExpenseNumber(client, company, {
    loadId: line.load_id,
    referenceDate: new Date(`${txnDate}T00:00:00.000Z`),
  });
  const expenseNumber = number.number;
=======
  let expenseNumber: string;
  let loadAttribution: { number: string; seq: number; loadNumber: string } | null = null;
  if (line.load_id) {
    loadAttribution = await generateExpenseNumber(client as never, line.load_id, company);
    expenseNumber = loadAttribution.number;
  } else {
    expenseNumber = await nextExpenseDisplayId(client as never, company, new Date(`${txnDate}T00:00:00.000Z`));
  }

  // 443.182 C — persisted through the one expense writer; the adopting document is born posted on the existing JE.
  const expenseId = await insertExpenseHeader(client, {
    operating_company_id: company,
    status: "posted",
    posting_status: "posted",
    transaction_date: txnDate,
    total_amount_cents: totalCents,
    memo: memo.slice(0, 500),
    expense_number: expenseNumber,
    vendor_uuid: line.vendor_id,
    payment_account_uuid: credit.account_id,
    is_sample_data: false,
    is_company_expense: true,
    is_reimbursable: false,
    source_bank_transaction_id: input.bankTransactionId,
    load_id: line.load_id,
    unit_id: line.unit_id,
    trailer_id: line.trailer_id,
    driver_uuid: line.driver_id,
    journal_entry_id: line.matched_je,
    posted_at: EXPENSE_SQL_NOW,
    created_by_user_id: actor.userId,
    updated_by_user_id: actor.userId,
  });
  if (!expenseId) throw new BankLineExpenseError("expense_insert_failed", "The adopting expense could not be created.");

  if (loadAttribution && line.load_id) {
    await insertExpenseLoadLink(client as never, {
      operatingCompanyId: company,
      expenseId,
      loadId: line.load_id,
      loadNumber: loadAttribution.loadNumber,
      seq: loadAttribution.seq,
      expenseNumber: loadAttribution.number,
      method: "user_assigned",
      confidence: "high",
      reason: "Adopted bank-categorization expense attributed to its tagged load",
      userId: actor.userId,
    });
  }
>>>>>>> origin/main

  const accountLabel = [debit.account_number, debit.account_name].filter(Boolean).join(" ") || null;
  const loadExemptionReason = resolveLineLoadExemption({
    loadId: line.load_id,
    reason: null,
    accountLabel,
    context: `bank line ${txnDate} — adopted categorization`,
  });

<<<<<<< HEAD
  const written = await writeExpenseDocumentInClientTx(client, {
    header: {
      operating_company_id: company,
      status: "posted",
      posting_status: "posted",
      transaction_date: txnDate,
      total_amount_cents: totalCents,
      memo: memo.slice(0, 500),
      vendor_uuid: line.vendor_id,
      payment_account_uuid: credit.account_id,
      is_sample_data: false,
      is_company_expense: true,
      is_reimbursable: false,
      source_bank_transaction_id: input.bankTransactionId,
      load_id: line.load_id,
      unit_id: line.unit_id,
      trailer_id: line.trailer_id,
      driver_uuid: line.driver_id,
      journal_entry_id: line.matched_je,
      posted_at: EXPENSE_SQL_NOW,
      created_by_user_id: actor.userId,
      updated_by_user_id: actor.userId,
    },
    number,
    lines: [
      {
        operating_company_id: company,
        line_sequence: 1,
        amount: totalCents / 100,
        amount_cents: totalCents,
        description: description.slice(0, 500),
        load_required: false,
        expense_account_uuid: debit.account_id,
        item_id: input.itemId,
        quantity: 1,
        rate_cents: totalCents,
        unit_of_measure: "each",
        load_id: line.load_id,
        unit_id: line.unit_id,
        trailer_id: line.trailer_id,
        driver_id: line.driver_id,
        load_exemption_reason: loadExemptionReason,
      },
    ],
    loadLink: line.load_id
      ? { method: "user_assigned", confidence: "high", reason: "Adopted bank-categorization expense attributed to its tagged load", userId: actor.userId }
      : undefined,
  });
  if (!written) throw new BankLineExpenseError("expense_insert_failed", "The adopting expense could not be created.");
  const expenseId = written.expenseId;
=======
  await insertExpenseLine(client, {
    operating_company_id: company,
    expense_id: expenseId,
    line_sequence: 1,
    amount: totalCents / 100,
    amount_cents: totalCents,
    description: description.slice(0, 500),
    load_required: false,
    expense_account_uuid: debit.account_id,
    item_id: input.itemId,
    quantity: 1,
    rate_cents: totalCents,
    unit_of_measure: "each",
    load_id: line.load_id,
    unit_id: line.unit_id,
    trailer_id: line.trailer_id,
    driver_id: line.driver_id,
    load_exemption_reason: loadExemptionReason,
  });
>>>>>>> origin/main

  await client.query(
    `UPDATE banking.bank_transactions
        SET matched_expense_id = $1::uuid,
            matched_journal_entry_id = COALESCE(matched_journal_entry_id, $2::uuid),
            review_state = 'matched',
            resolution_kind = COALESCE(resolution_kind, 'added'),
            reviewed_at = COALESCE(reviewed_at, now()),
            updated_at = now()
      WHERE id = $3::uuid AND operating_company_id = $4::uuid AND matched_expense_id IS NULL`,
    [expenseId, line.matched_je, input.bankTransactionId, company]
  );

  return { outcome: "created", expense_id: expenseId, journal_entry_id: line.matched_je, expense_number: expenseNumber };
}
