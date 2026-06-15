import { withCurrentUser } from "../auth/db.js";
import { resolveRoleAccountOptional } from "./coa-roles/resolver.service.js";
import { resolveAccountForCategory } from "./expense-category-map/resolver.service.js";

export type PostingSourceType = "invoice" | "bill" | "customer_payment" | "bill_payment" | "cash_advance" | "driver_advance" | "expense";
export type PostingPurpose = "initial_post" | "reversal";
type BatchStatus = "queued" | "in_progress" | "posted" | "reversed" | "failed";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number }>;
};

type PostingLineDraft = {
  account_id: string;
  debit_or_credit: "debit" | "credit";
  amount_cents: number;
  description: string | null;
  source_transaction_line_id: string | null;
  relationship_role?: string | null;
};

type PostingDraft = {
  postingDate: string;
  memo: string;
  lines: PostingLineDraft[];
  accountResolutionTrace?: Array<Record<string, unknown>>;
};

type PostSourceInput = {
  operating_company_id: string;
  source_transaction_type: PostingSourceType;
  source_transaction_id: string;
  source_transaction_line_id?: string | null;
  posting_purpose?: PostingPurpose;
  // Optional credit (cash/bank) account for cash_advance postings. When omitted, the
  // company-default cash-like account is used (same fallback as bill_payment). B5's approve
  // path passes the operator-chosen source account here. Ignored by other source types.
  credit_account_id?: string | null;
};

type ReverseBatchInput = {
  operating_company_id: string;
  source_transaction_type: PostingSourceType;
  source_transaction_id: string;
};

type BackfillInput = {
  operating_company_id: string;
};

type Actor = {
  userId: string;
};

export type PostingErrorCode =
  | "UNKNOWN_SOURCE_TYPE"
  | "SOURCE_NOT_FOUND"
  | "INVOICE_NOT_POSTING_ELIGIBLE"
  | "BILL_NOT_POSTING_ELIGIBLE"
  | "PAYMENT_NOT_POSTING_ELIGIBLE"
  | "PERIOD_LOCKED"
  | "UNBALANCED_ENTRY"
  | "ACCOUNT_MAPPING_MISSING"
  | "ADVANCE_NOT_POSTING_ELIGIBLE"
  | "BILL_LINE_ACCOUNT_UNRESOLVED"
  | "EXPENSE_NOT_POSTING_ELIGIBLE";

export class PostingEngineError extends Error {
  code: PostingErrorCode;

  constructor(code: PostingErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

type PostingResult = {
  result: "posted" | "already_posted" | "reversed";
  posting_batch_id: string;
  journal_entry_id: string;
  journal_entry_posting_ids: string[];
  idempotency_key: string;
  posting_purpose: PostingPurpose;
  source_transaction_type: PostingSourceType;
  source_transaction_id: string;
  account_resolution_trace?: Array<Record<string, unknown>>;
};

const INVOICE_ELIGIBLE_STATUSES = new Set(["sent", "partial", "paid", "factored"]);
const PERIOD_LOCKED_TOKEN = "IH35_CLOSED_PERIOD";

function assertKnownSourceType(value: string): asserts value is PostingSourceType {
  if (!["invoice", "bill", "customer_payment", "bill_payment", "cash_advance", "driver_advance", "expense"].includes(value)) {
    throw new PostingEngineError("UNKNOWN_SOURCE_TYPE", `Unknown source_transaction_type: ${value}`);
  }
}

function normalizeSourceType(value: string): PostingSourceType {
  const normalized = value.trim().toLowerCase();
  assertKnownSourceType(normalized);
  return normalized;
}

function normalizeSourceId(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new PostingEngineError("SOURCE_NOT_FOUND", "source_transaction_id must not be empty");
  if (/[^\x20-\x7E]/.test(trimmed)) {
    throw new PostingEngineError("SOURCE_NOT_FOUND", "source_transaction_id contains unsupported control characters");
  }
  const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidLike.test(trimmed) ? trimmed.toLowerCase() : trimmed;
}

function normalizeSourceLineId(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const normalized = normalizeSourceId(raw);
  return normalized || null;
}

export function buildPostingMvpIdempotencyKey(input: {
  operating_company_id: string;
  source_transaction_type: PostingSourceType;
  source_transaction_id: string;
  source_transaction_line_id: string | null;
  posting_purpose: PostingPurpose;
}) {
  return [
    "ih35:posting-mvp:v1",
    input.operating_company_id.toLowerCase(),
    input.source_transaction_type,
    input.source_transaction_id,
    input.source_transaction_line_id ?? "-",
    input.posting_purpose,
  ].join(":");
}

async function resolveFirstAccountByType(client: DbClient, accountType: string): Promise<string | null> {
  const account = await client.query<{ id: string }>(
    `
      SELECT id::text AS id
      FROM catalogs.accounts
      WHERE account_type = $1
        AND deactivated_at IS NULL
        AND is_postable = true
      ORDER BY updated_at DESC
      LIMIT 1
    `,
    [accountType]
  );
  return account.rows[0]?.id ?? null;
}

async function resolveArAccountForCompany(client: DbClient, operatingCompanyId: string): Promise<string | null> {
  return resolveRoleAccountOptional(client, operatingCompanyId, "ar_control");
}

async function resolveApAccountForCompany(client: DbClient, operatingCompanyId: string): Promise<string | null> {
  return resolveRoleAccountOptional(client, operatingCompanyId, "ap_control");
}

async function resolveCashLikeAccountForCompany(client: DbClient, operatingCompanyId: string): Promise<string | null> {
  return (
    (await resolveRoleAccountOptional(client, operatingCompanyId, "undeposited_funds")) ??
    (await resolveRoleAccountOptional(client, operatingCompanyId, "cash_clearing"))
  );
}

async function ensureOpenPeriod(client: DbClient, operatingCompanyId: string, postingDate: string) {
  const cutoff = await client.query<{ cutoff: string | null }>(
    `SELECT accounting.closed_period_cutoff($1::uuid)::text AS cutoff`,
    [operatingCompanyId]
  );
  const closedThrough = cutoff.rows[0]?.cutoff;
  if (closedThrough && postingDate <= closedThrough) {
    throw new PostingEngineError(
      "PERIOD_LOCKED",
      `${PERIOD_LOCKED_TOKEN} closed_through=${closedThrough} txn_date=${postingDate}`
    );
  }
}

async function getExistingPostingResultByIdempotencyKey(
  client: DbClient,
  operatingCompanyId: string,
  idempotencyKey: string,
  postingPurpose: PostingPurpose,
  sourceType: PostingSourceType,
  sourceId: string
): Promise<PostingResult | null> {
  const batchRes = await client.query<{ id: string; batch_status: BatchStatus }>(
    `
      SELECT id::text, batch_status
      FROM accounting.posting_batches
      WHERE operating_company_id = $1::uuid
        AND idempotency_key = $2
      LIMIT 1
    `,
    [operatingCompanyId, idempotencyKey]
  );
  const batch = batchRes.rows[0];
  if (!batch || (batch.batch_status !== "posted" && batch.batch_status !== "reversed")) return null;

  const rows = await client.query<{ posting_id: string; journal_entry_uuid: string }>(
    `
      SELECT id::text AS posting_id, journal_entry_uuid::text
      FROM accounting.journal_entry_postings
      WHERE operating_company_id = $1::uuid
        AND posting_batch_id = $2::uuid
      ORDER BY line_sequence ASC, created_at ASC
    `,
    [operatingCompanyId, batch.id]
  );
  const postingIds = rows.rows.map((r) => r.posting_id);
  const journalEntryId = rows.rows[0]?.journal_entry_uuid ?? "";
  if (!journalEntryId || postingIds.length === 0) return null;

  return {
    result: batch.batch_status === "reversed" ? "reversed" : "already_posted",
    posting_batch_id: batch.id,
    journal_entry_id: journalEntryId,
    journal_entry_posting_ids: postingIds,
    idempotency_key: idempotencyKey,
    posting_purpose: postingPurpose,
    source_transaction_type: sourceType,
    source_transaction_id: sourceId,
  };
}

async function getPostingBySource(
  client: DbClient,
  operatingCompanyId: string,
  sourceType: PostingSourceType,
  sourceId: string,
  postingPurpose: PostingPurpose
): Promise<PostingResult | null> {
  const lineId = postingPurpose === "initial_post" ? null : sourceId;
  const key = buildPostingMvpIdempotencyKey({
    operating_company_id: operatingCompanyId,
    source_transaction_type: sourceType,
    source_transaction_id: sourceId,
    source_transaction_line_id: lineId,
    posting_purpose: postingPurpose,
  });
  return getExistingPostingResultByIdempotencyKey(client, operatingCompanyId, key, postingPurpose, sourceType, sourceId);
}

async function createJournalEntryHeader(
  client: DbClient,
  operatingCompanyId: string,
  entryDate: string,
  memo: string,
  createdByUserId: string
) {
  const created = await client.query<{ id: string }>(
    `
      INSERT INTO accounting.journal_entries (
        operating_company_id,
        entry_date,
        memo,
        status,
        source,
        created_by_user_id,
        qbo_sync_pending,
        created_at,
        updated_at
      )
      VALUES ($1::uuid, $2::date, $3, 'posted', 'auto', $4::uuid, true, now(), now())
      RETURNING id::text
    `,
    [operatingCompanyId, entryDate, memo, createdByUserId]
  );
  const journalEntryId = created.rows[0]?.id;
  if (!journalEntryId) throw new Error("posting_journal_entry_create_failed");
  return journalEntryId;
}

async function insertPostingLines(input: {
  client: DbClient;
  operatingCompanyId: string;
  journalEntryId: string;
  postingBatchId: string;
  idempotencyKey: string;
  sourceType: PostingSourceType;
  sourceId: string;
  lines: PostingLineDraft[];
}) {
  const postingIds: string[] = [];
  let sequence = 1;
  for (const line of input.lines) {
    const ins = await input.client.query<{ id: string }>(
      `
        INSERT INTO accounting.journal_entry_postings (
          operating_company_id,
          journal_entry_uuid,
          line_sequence,
          account_id,
          debit_or_credit,
          amount_cents,
          description,
          source_transaction_type,
          source_transaction_id,
          source_transaction_line_id,
          posting_batch_id,
          idempotency_key,
          created_at,
          updated_at
        )
        VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5, $6, $7, $8, $9, $10, $11::uuid, $12, now(), now())
        RETURNING id::text
      `,
      [
        input.operatingCompanyId,
        input.journalEntryId,
        sequence,
        line.account_id,
        line.debit_or_credit,
        line.amount_cents,
        line.description,
        input.sourceType,
        input.sourceId,
        line.source_transaction_line_id,
        input.postingBatchId,
        input.idempotencyKey,
      ]
    );
    const postingId = ins.rows[0]?.id;
    if (!postingId) throw new Error("posting_line_insert_failed");
    postingIds.push(postingId);
    await input.client.query(
      `
        INSERT INTO accounting.transaction_source_links (
          operating_company_id,
          journal_entry_posting_id,
          linked_object_type,
          linked_object_id,
          relationship_role
        )
        VALUES ($1::uuid, $2::uuid, $3, $4, $5)
      `,
      [input.operatingCompanyId, postingId, input.sourceType, input.sourceId, line.relationship_role ?? "source_transaction"]
    );
    sequence += 1;
  }
  return postingIds;
}

function assertBalanced(lines: PostingLineDraft[]) {
  const debitTotal = lines.filter((l) => l.debit_or_credit === "debit").reduce((sum, l) => sum + l.amount_cents, 0);
  const creditTotal = lines.filter((l) => l.debit_or_credit === "credit").reduce((sum, l) => sum + l.amount_cents, 0);
  if (debitTotal <= 0 || creditTotal <= 0 || debitTotal !== creditTotal) {
    throw new PostingEngineError(
      "UNBALANCED_ENTRY",
      `Posting must be balanced (debits=${debitTotal}, credits=${creditTotal})`
    );
  }
}

async function buildInvoiceLines(client: DbClient, operatingCompanyId: string, sourceId: string): Promise<PostingDraft> {
  const invoiceRes = await client.query<{
    id: string;
    status: string;
    issue_date: string;
    total_cents: number;
    tax_cents: number;
    display_id: string | null;
    source_load_id: string | null;
  }>(
    `
      SELECT
        id::text,
        status::text,
        issue_date::text,
        total_cents::bigint AS total_cents,
        tax_cents::bigint AS tax_cents,
        display_id,
        source_load_id::text
      FROM accounting.invoices
      WHERE operating_company_id = $1::uuid
        AND id::text = $2
      LIMIT 1
      FOR UPDATE
    `,
    [operatingCompanyId, sourceId]
  );
  const invoice = invoiceRes.rows[0];
  if (!invoice) throw new PostingEngineError("SOURCE_NOT_FOUND", "Invoice not found");
  if (!INVOICE_ELIGIBLE_STATUSES.has(invoice.status)) {
    throw new PostingEngineError(
      "INVOICE_NOT_POSTING_ELIGIBLE",
      `Invoice status ${invoice.status} is not posting-eligible`
    );
  }
  const arAccountId = await resolveArAccountForCompany(client, operatingCompanyId);
  if (!arAccountId) throw new PostingEngineError("ACCOUNT_MAPPING_MISSING", "AR account mapping is missing");

  const revenueFromLines = await client.query<{ account_id: string }>(
    `
      SELECT i.default_income_account_id::text AS account_id
      FROM accounting.invoice_lines il
      JOIN catalogs.items i ON i.qbo_item_id = il.qbo_item_id
      WHERE il.invoice_id = $1::uuid
        AND i.default_income_account_id IS NOT NULL
      LIMIT 1
    `,
    [sourceId]
  );
  const revenueAccountId =
    revenueFromLines.rows[0]?.account_id ??
    (await resolveRoleAccountOptional(client, operatingCompanyId, "revenue_default")) ??
    (await resolveFirstAccountByType(client, "Income"));
  if (!revenueAccountId) throw new PostingEngineError("ACCOUNT_MAPPING_MISSING", "Revenue account mapping is missing");
  const salesTaxPayableAccountId = await resolveRoleAccountOptional(client, operatingCompanyId, "sales_tax_payable");

  const amount = Number(invoice.total_cents ?? 0);
  const taxAmountRaw = Number(invoice.tax_cents ?? 0);
  const taxAmount = Math.max(0, Math.min(taxAmountRaw, amount));
  const revenueAmount = amount - taxAmount;
  if (taxAmount > 0 && !salesTaxPayableAccountId) {
    throw new PostingEngineError("ACCOUNT_MAPPING_MISSING", "Sales tax payable account mapping is missing");
  }
  const descriptionBase = invoice.display_id ? `Invoice ${invoice.display_id}` : `Invoice ${sourceId}`;
  const creditLines: PostingLineDraft[] = [];
  if (revenueAmount > 0) {
    creditLines.push({
      account_id: revenueAccountId,
      debit_or_credit: "credit",
      amount_cents: revenueAmount,
      description: `${descriptionBase} Revenue`,
      source_transaction_line_id: null,
    });
  }
  if (taxAmount > 0 && salesTaxPayableAccountId) {
    creditLines.push({
      account_id: salesTaxPayableAccountId,
      debit_or_credit: "credit",
      amount_cents: taxAmount,
      description: `${descriptionBase} Sales tax payable`,
      source_transaction_line_id: null,
    });
  }
  return {
    postingDate: invoice.issue_date,
    memo: `${descriptionBase} posting`,
    lines: [
      {
        account_id: arAccountId,
        debit_or_credit: "debit",
        amount_cents: amount,
        description: `${descriptionBase} AR`,
        source_transaction_line_id: null,
      },
      ...creditLines,
    ],
  };
}

async function detectBillLineAccountColumn(client: DbClient): Promise<"account_id" | "coa_account_id" | null> {
  const res = await client.query<{ column_name: string }>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'accounting'
        AND table_name = 'bill_lines'
        AND column_name IN ('account_id', 'coa_account_id')
      ORDER BY CASE column_name WHEN 'account_id' THEN 1 ELSE 2 END
      LIMIT 1
    `
  );
  const col = res.rows[0]?.column_name;
  if (col === "account_id" || col === "coa_account_id") return col;
  return null;
}

async function resolveBillCategoryAccount(client: DbClient, categoryId: string): Promise<string | null> {
  const fromMetadata = await client.query<{ account_id: string | null }>(
    `
      SELECT
        COALESCE(
          NULLIF(metadata->>'account_id', ''),
          NULLIF(metadata->>'account_uuid', ''),
          NULLIF(metadata->>'coa_account_id', '')
        ) AS account_id
      FROM catalogs.expense_categories
      WHERE id = $1::uuid
      LIMIT 1
    `,
    [categoryId]
  );
  const maybe = fromMetadata.rows[0]?.account_id?.trim() ?? "";
  return maybe || null;
}

async function buildBillLines(client: DbClient, operatingCompanyId: string, sourceId: string): Promise<PostingDraft> {
  const billRes = await client.query<{
    id: string;
    status: string;
    bill_date: string;
    amount_cents: number | null;
    total_amount: string | null;
    coa_account_id: string | null;
    memo: string | null;
    bill_number: string | null;
    revoked_at: string | null;
  }>(
    `
      SELECT
        id::text,
        status::text,
        bill_date::text,
        amount_cents::bigint,
        total_amount::text,
        coa_account_id::text,
        memo,
        bill_number,
        revoked_at::text
      FROM accounting.bills
      WHERE operating_company_id = $1::uuid
        AND id::text = $2
      LIMIT 1
      FOR UPDATE
    `,
    [operatingCompanyId, sourceId]
  );
  const bill = billRes.rows[0];
  if (!bill) throw new PostingEngineError("SOURCE_NOT_FOUND", "Bill not found");
  if (bill.revoked_at || bill.status === "void" || bill.status === "voided") {
    throw new PostingEngineError("BILL_NOT_POSTING_ELIGIBLE", "Voided bill is not posting-eligible");
  }

  const apAccountId = await resolveApAccountForCompany(client, operatingCompanyId);
  if (!apAccountId) throw new PostingEngineError("ACCOUNT_MAPPING_MISSING", "AP account mapping is missing");

  const lineAccountColumn = await detectBillLineAccountColumn(client);
  const directColumnSelection = lineAccountColumn ? `bl.${lineAccountColumn}::text AS direct_account_id,` : `NULL::text AS direct_account_id,`;

  const lineRows = await client.query<{
    id: string | null;
    line_sequence: number | null;
    amount: string | null;
    description: string | null;
    expense_category_uuid: string | null;
    direct_account_id: string | null;
  }>(
    `
      SELECT
        bl.id::text,
        bl.line_sequence,
        bl.amount::text,
        bl.description,
        bl.expense_category_uuid::text,
        ${directColumnSelection}
        bl.bill_id::text
      FROM accounting.bill_lines bl
      WHERE bl.bill_id::uuid = $1::uuid
      ORDER BY bl.line_sequence ASC
    `,
    [sourceId]
  );

  const debitLines: PostingLineDraft[] = [];
  const accountResolutionTrace: Array<Record<string, unknown>> = [];
  const headerFallback = bill.coa_account_id;
  const roleExpenseDefault = await resolveRoleAccountOptional(client, operatingCompanyId, "expense_default");

  if (lineRows.rows.length === 0) {
    const amountCents =
      bill.amount_cents != null ? Number(bill.amount_cents) : Math.round(Number(bill.total_amount ?? "0") * 100);
    if (!headerFallback && !roleExpenseDefault) {
      throw new PostingEngineError("BILL_LINE_ACCOUNT_UNRESOLVED", "Bill header/line account mapping is unresolved");
    }
    debitLines.push({
      account_id: headerFallback ?? roleExpenseDefault!,
      debit_or_credit: "debit",
      amount_cents: amountCents,
      description: bill.memo ?? "Bill expense",
      source_transaction_line_id: null,
      relationship_role: "bill_header_coa_fallback",
    });
    accountResolutionTrace.push({
      bill_line_id: null,
      method: "header_coa_account_fallback",
      account_id: headerFallback,
    });
  } else {
    for (const row of lineRows.rows) {
      const amountCents = Math.round(Number(row.amount ?? "0") * 100);
      let accountId = row.direct_account_id?.trim() || null;
      let method: string | null = null;
      if (accountId) {
        method = "bill_line_explicit_account";
      } else if (row.expense_category_uuid) {
        accountId = await resolveBillCategoryAccount(client, row.expense_category_uuid);
        if (accountId) method = "expense_category_mapping";
      }
      if (!accountId && headerFallback) {
        accountId = headerFallback;
        method = "header_coa_account_fallback";
      }
      if (!accountId && roleExpenseDefault) {
        accountId = roleExpenseDefault;
        method = "role_expense_default";
      }
      if (!accountId) {
        throw new PostingEngineError(
          "BILL_LINE_ACCOUNT_UNRESOLVED",
          `Bill line ${row.id ?? row.line_sequence ?? "unknown"} has no resolvable debit account`
        );
      }
      accountResolutionTrace.push({
        bill_line_id: row.id,
        line_sequence: row.line_sequence,
        method,
        account_id: accountId,
      });
      debitLines.push({
        account_id: accountId,
        debit_or_credit: "debit",
        amount_cents: amountCents,
        description: row.description ?? `Bill line ${row.line_sequence ?? ""}`.trim(),
        source_transaction_line_id: row.id ?? null,
        relationship_role: method === "header_coa_account_fallback" ? "bill_header_coa_fallback" : null,
      });
    }
  }

  const totalDebit = debitLines.reduce((sum, line) => sum + line.amount_cents, 0);
  const billLabel = bill.bill_number ? `Bill ${bill.bill_number}` : `Bill ${sourceId}`;
  return {
    postingDate: bill.bill_date,
    memo: `${billLabel} posting`,
    lines: [
      ...debitLines,
      {
        account_id: apAccountId,
        debit_or_credit: "credit",
        amount_cents: totalDebit,
        description: `${billLabel} AP`,
        source_transaction_line_id: null,
      },
    ],
    accountResolutionTrace,
  };
}

// GAP-EXPENSES Phase 2 Step 3 — expense → balanced JE (cash-basis primary). Mirrors buildBillLines.
// DR each expense_line (category → resolveBillCategoryAccount → uncategorized_expense role → fail loud);
// a direct line-less expense's single uncategorized expense_lines row is synthesized by the post action
// BEFORE this runs (so total = SUM(lines) holds). CR cash (payment_account_uuid) else AP-with-vendor;
// orphan guard (no payment account AND no vendor) fails loud. amounts are integer cents already.
async function buildExpenseLines(client: DbClient, operatingCompanyId: string, sourceId: string): Promise<PostingDraft> {
  const expRes = await client.query<{
    id: string;
    status: string;
    posting_status: string;
    transaction_date: string;
    total_amount_cents: number | null;
    payment_account_uuid: string | null;
    vendor_uuid: string | null;
    memo: string | null;
    expense_number: string | null;
  }>(
    `
      SELECT id::text, status::text, posting_status::text, transaction_date::text,
             total_amount_cents::bigint, payment_account_uuid::text, vendor_uuid::text, memo, expense_number
      FROM accounting.expenses
      WHERE operating_company_id = $1::uuid AND id::text = $2
      LIMIT 1
      FOR UPDATE
    `,
    [operatingCompanyId, sourceId]
  );
  const exp = expRes.rows[0];
  if (!exp) throw new PostingEngineError("SOURCE_NOT_FOUND", "Expense not found");
  if (exp.status === "void" || exp.posting_status === "reversed") {
    throw new PostingEngineError("EXPENSE_NOT_POSTING_ELIGIBLE", "Voided/reversed expense is not posting-eligible");
  }

  const lineRows = await client.query<{
    id: string | null;
    line_sequence: number | null;
    amount_cents: number | null;
    description: string | null;
    expense_category_uuid: string | null;
  }>(
    `
      SELECT id::text, line_sequence, amount_cents::bigint, description, expense_category_uuid::text
      FROM accounting.expense_lines
      WHERE expense_id = $1::uuid
      ORDER BY line_sequence ASC
    `,
    [sourceId]
  );

  const uncategorizedAccount = await resolveRoleAccountOptional(client, operatingCompanyId, "uncategorized_expense");
  const debitLines: PostingLineDraft[] = [];
  const accountResolutionTrace: Array<Record<string, unknown>> = [];

  if (lineRows.rows.length === 0) {
    // Safety net: a direct expense should have had its uncategorized line synthesized by the post
    // action. If it reached here line-less, DR the uncategorized account for the header total.
    const totalCents = exp.total_amount_cents != null ? Number(exp.total_amount_cents) : 0;
    if (!uncategorizedAccount) throw new PostingEngineError("ACCOUNT_MAPPING_MISSING", "uncategorized_expense role account is unresolved");
    debitLines.push({
      account_id: uncategorizedAccount,
      debit_or_credit: "debit",
      amount_cents: totalCents,
      description: exp.memo ?? "Uncategorized expense",
      source_transaction_line_id: null,
      relationship_role: "expense_uncategorized_synthesized",
    });
    accountResolutionTrace.push({ expense_line_id: null, method: "synthesized_uncategorized", account_id: uncategorizedAccount });
  } else {
    for (const row of lineRows.rows) {
      const amountCents = row.amount_cents != null ? Number(row.amount_cents) : 0;
      let accountId: string | null = null;
      let method: string | null = null;
      if (row.expense_category_uuid) {
        accountId = await resolveBillCategoryAccount(client, row.expense_category_uuid);
        if (accountId) method = "expense_category_mapping";
      }
      if (!accountId && uncategorizedAccount) {
        accountId = uncategorizedAccount;
        method = "uncategorized_role";
      }
      if (!accountId) {
        throw new PostingEngineError(
          "ACCOUNT_MAPPING_MISSING",
          `Expense line ${row.id ?? row.line_sequence ?? "unknown"} has no resolvable debit account`
        );
      }
      accountResolutionTrace.push({ expense_line_id: row.id, line_sequence: row.line_sequence, method, account_id: accountId });
      debitLines.push({
        account_id: accountId,
        debit_or_credit: "debit",
        amount_cents: amountCents,
        description: row.description ?? `Expense line ${row.line_sequence ?? ""}`.trim(),
        source_transaction_line_id: row.id ?? null,
        relationship_role: method === "uncategorized_role" ? "expense_uncategorized" : null,
      });
    }
  }

  const totalDebit = debitLines.reduce((sum, line) => sum + line.amount_cents, 0);

  // CREDIT side — CASH-BASIS PRIMARY: bank/cash when a payment account is set; else AP-with-vendor (accrual exception).
  let creditAccount: string | null;
  let creditRole: string;
  if (exp.payment_account_uuid) {
    creditAccount = exp.payment_account_uuid; // a catalogs.accounts id (the bank/cash account)
    creditRole = "expense_cash_payment";
  } else if (exp.vendor_uuid) {
    creditAccount = await resolveApAccountForCompany(client, operatingCompanyId);
    creditRole = "expense_ap";
    if (!creditAccount) throw new PostingEngineError("ACCOUNT_MAPPING_MISSING", "AP account (ap_control) is unresolved for the accrual expense path");
  } else {
    // ORPHAN GUARD: no payment account AND no vendor → fail loud (no orphan payable).
    throw new PostingEngineError("ACCOUNT_MAPPING_MISSING", "Expense has neither a payment account nor a vendor — cannot post (no orphan payable)");
  }

  const label = exp.expense_number ? `Expense ${exp.expense_number}` : `Expense ${sourceId}`;
  return {
    postingDate: exp.transaction_date,
    memo: `${label} posting`,
    lines: [
      ...debitLines,
      {
        account_id: creditAccount,
        debit_or_credit: "credit",
        amount_cents: totalDebit,
        description: `${label} ${creditRole === "expense_ap" ? "AP" : "payment"}`,
        source_transaction_line_id: null,
        relationship_role: creditRole,
      },
    ],
    accountResolutionTrace,
  };
}

async function buildCustomerPaymentLines(client: DbClient, operatingCompanyId: string, sourceId: string): Promise<PostingDraft> {
  const paymentRes = await client.query<{
    id: string;
    payment_date: string;
    amount_cents: number;
    display_id: string | null;
    deposited_to_account_id: string | null;
    voided_at: string | null;
  }>(
    `
      SELECT id::text, payment_date::text, amount_cents::bigint, display_id, deposited_to_account_id, voided_at::text
      FROM accounting.payments
      WHERE operating_company_id = $1::uuid
        AND id::text = $2
      LIMIT 1
      FOR UPDATE
    `,
    [operatingCompanyId, sourceId]
  );
  const payment = paymentRes.rows[0];
  if (!payment) throw new PostingEngineError("SOURCE_NOT_FOUND", "Customer payment not found");
  if (payment.voided_at) throw new PostingEngineError("PAYMENT_NOT_POSTING_ELIGIBLE", "Voided customer payment is not posting-eligible");

  const arAccountId = await resolveArAccountForCompany(client, operatingCompanyId);
  if (!arAccountId) throw new PostingEngineError("ACCOUNT_MAPPING_MISSING", "AR account mapping is missing");

  let debitCashAccount = payment.deposited_to_account_id?.trim() || null;
  if (!debitCashAccount) {
    debitCashAccount = await resolveCashLikeAccountForCompany(client, operatingCompanyId);
  }
  if (!debitCashAccount) throw new PostingEngineError("ACCOUNT_MAPPING_MISSING", "Cash account mapping is missing");

  const label = payment.display_id ? `Customer payment ${payment.display_id}` : `Customer payment ${sourceId}`;
  const amount = Number(payment.amount_cents ?? 0);
  return {
    postingDate: payment.payment_date,
    memo: `${label} posting`,
    lines: [
      {
        account_id: debitCashAccount,
        debit_or_credit: "debit",
        amount_cents: amount,
        description: `${label} cash`,
        source_transaction_line_id: null,
      },
      {
        account_id: arAccountId,
        debit_or_credit: "credit",
        amount_cents: amount,
        description: `${label} AR`,
        source_transaction_line_id: null,
      },
    ],
  };
}

async function buildBillPaymentLines(client: DbClient, operatingCompanyId: string, sourceId: string): Promise<PostingDraft> {
  const paymentRes = await client.query<{
    id: string;
    payment_date: string;
    amount_cents: number | null;
    amount: string | null;
    from_bank_account_id: string | null;
    revoked_at: string | null;
    status: string;
  }>(
    `
      SELECT
        id::text,
        payment_date::text,
        amount_cents::bigint,
        amount::text,
        from_bank_account_id::text,
        revoked_at::text,
        status::text
      FROM accounting.bill_payments
      WHERE operating_company_id = $1::uuid
        AND id::text = $2
      LIMIT 1
      FOR UPDATE
    `,
    [operatingCompanyId, sourceId]
  );
  const payment = paymentRes.rows[0];
  if (!payment) throw new PostingEngineError("SOURCE_NOT_FOUND", "Bill payment not found");
  if (payment.revoked_at || payment.status === "void") {
    throw new PostingEngineError("PAYMENT_NOT_POSTING_ELIGIBLE", "Voided bill payment is not posting-eligible");
  }

  const apAccountId = await resolveApAccountForCompany(client, operatingCompanyId);
  if (!apAccountId) throw new PostingEngineError("ACCOUNT_MAPPING_MISSING", "AP account mapping is missing");
  const cashAccountId = await resolveCashLikeAccountForCompany(client, operatingCompanyId);
  if (!cashAccountId) throw new PostingEngineError("ACCOUNT_MAPPING_MISSING", "Cash account mapping is missing");

  const amount = Number(payment.amount_cents ?? Math.round(Number(payment.amount ?? "0") * 100));
  const label = `Bill payment ${sourceId}`;
  return {
    postingDate: payment.payment_date,
    memo: `${label} posting`,
    lines: [
      {
        account_id: apAccountId,
        debit_or_credit: "debit",
        amount_cents: amount,
        description: `${label} AP`,
        source_transaction_line_id: null,
      },
      {
        account_id: cashAccountId,
        debit_or_credit: "credit",
        amount_cents: amount,
        description: `${label} cash`,
        source_transaction_line_id: null,
      },
    ],
  };
}

// Cash advance posting (modeled on buildBillPaymentLines):
//   DEBIT  the cash_advance mapped account (B1 expense_category_account_map, resolved by
//          category + operating_company_id — never hardcoded).
//   CREDIT the operator-chosen source/bank account (creditAccountId, passed by B5's approve
//          path) or, when omitted, the company-default cash-like account (bill_payment fallback).
// Posts only when status='approved'. The central postSourceTransaction emits the audit spine
// (transaction_source_links) and assertBalanced enforces debit==credit.
async function buildCashAdvanceLines(
  client: DbClient,
  operatingCompanyId: string,
  sourceId: string,
  creditAccountId: string | null
): Promise<PostingDraft> {
  const requestRes = await client.query<{
    id: string;
    requested_amount_cents: string;
    status: string;
    posting_date: string;
  }>(
    `
      SELECT
        id::text,
        requested_amount_cents::bigint,
        status::text,
        COALESCE(reviewed_at, submitted_at, created_at)::date::text AS posting_date
      FROM driver_finance.cash_advance_requests
      WHERE operating_company_id = $1::uuid
        AND id::text = $2
      LIMIT 1
      FOR UPDATE
    `,
    [operatingCompanyId, sourceId]
  );
  const request = requestRes.rows[0];
  if (!request) throw new PostingEngineError("SOURCE_NOT_FOUND", "Cash advance request not found");
  if (request.status !== "approved") {
    throw new PostingEngineError(
      "ADVANCE_NOT_POSTING_ELIGIBLE",
      `Cash advance request is not posting-eligible (status=${request.status})`
    );
  }

  const mapped = await resolveAccountForCategory(operatingCompanyId, "cash_advance", "cash_advance");
  const debitAccountId = mapped.account_id;

  const creditAccount = creditAccountId ?? (await resolveCashLikeAccountForCompany(client, operatingCompanyId));
  if (!creditAccount) {
    throw new PostingEngineError("ACCOUNT_MAPPING_MISSING", "Cash account mapping for cash advance is missing");
  }

  const amount = Number(request.requested_amount_cents);
  const label = `Cash advance ${sourceId}`;
  return {
    postingDate: request.posting_date,
    memo: `${label} posting`,
    lines: [
      {
        account_id: debitAccountId,
        debit_or_credit: "debit",
        amount_cents: amount,
        description: `${label} driver advance`,
        source_transaction_line_id: null,
      },
      {
        account_id: creditAccount,
        debit_or_credit: "credit",
        amount_cents: amount,
        description: `${label} cash`,
        source_transaction_line_id: null,
      },
    ],
  };
}

// B3 — Driver advance / employee-loan disbursement posting (Design 2, modeled on
// buildCashAdvanceLines but reading the disbursement record directly):
//   DEBIT  the cash_advance mapped account (QBO-149 Driver Cash Advance receivable,
//          resolved via the B1 map — never hardcoded).
//   CREDIT the operator-chosen source/bank account (creditAccountId from the disburse
//          call) or the company-default cash-like account when omitted.
// Reads driver_finance.driver_advances directly, so it posts for ANY advance (request-
// backed or direct). Posts only when disbursement_status='disbursed'. The journal
// entry_date = the user-settable posting_date (falls back to disbursed_at / created_at).
// amount is numeric(10,2) DOLLARS → converted to cents. assertBalanced + the central
// transaction_source_links spine apply as for every source type.
async function buildDriverAdvanceLines(
  client: DbClient,
  operatingCompanyId: string,
  sourceId: string,
  creditAccountId: string | null
): Promise<PostingDraft> {
  const advanceRes = await client.query<{
    id: string;
    amount: string;
    disbursement_status: string;
    posting_date: string | null;
    disbursed_at: string | null;
    created_at: string;
  }>(
    `
      SELECT
        id::text,
        amount::text,
        disbursement_status::text,
        posting_date::text,
        disbursed_at::text,
        created_at::text
      FROM driver_finance.driver_advances
      WHERE operating_company_id = $1::uuid
        AND id::text = $2
      LIMIT 1
      FOR UPDATE
    `,
    [operatingCompanyId, sourceId]
  );
  const advance = advanceRes.rows[0];
  if (!advance) throw new PostingEngineError("SOURCE_NOT_FOUND", "Driver advance not found");
  if (advance.disbursement_status !== "disbursed") {
    throw new PostingEngineError(
      "ADVANCE_NOT_POSTING_ELIGIBLE",
      `Driver advance is not posting-eligible (disbursement_status=${advance.disbursement_status})`
    );
  }

  const mapped = await resolveAccountForCategory(operatingCompanyId, "cash_advance", "cash_advance");
  const debitAccountId = mapped.account_id;

  const creditAccount = creditAccountId ?? (await resolveCashLikeAccountForCompany(client, operatingCompanyId));
  if (!creditAccount) {
    throw new PostingEngineError("ACCOUNT_MAPPING_MISSING", "Cash account mapping for driver advance is missing");
  }

  // posting_date is the user-settable book date; fall back to disbursed_at / created_at.
  const postingDate =
    advance.posting_date ??
    (advance.disbursed_at ? advance.disbursed_at.slice(0, 10) : advance.created_at.slice(0, 10));
  // amount is numeric(10,2) dollars → cents for the ledger.
  const amountCents = Math.round(Number(advance.amount) * 100);
  const label = `Driver advance ${sourceId}`;
  return {
    postingDate,
    memo: `${label} posting`,
    lines: [
      {
        account_id: debitAccountId,
        debit_or_credit: "debit",
        amount_cents: amountCents,
        description: `${label} driver advance`,
        source_transaction_line_id: null,
      },
      {
        account_id: creditAccount,
        debit_or_credit: "credit",
        amount_cents: amountCents,
        description: `${label} cash`,
        source_transaction_line_id: null,
      },
    ],
  };
}

async function buildPostingDraft(
  client: DbClient,
  sourceType: PostingSourceType,
  operatingCompanyId: string,
  sourceId: string,
  creditAccountId: string | null = null
): Promise<PostingDraft> {
  if (sourceType === "invoice") return buildInvoiceLines(client, operatingCompanyId, sourceId);
  if (sourceType === "bill") return buildBillLines(client, operatingCompanyId, sourceId);
  if (sourceType === "expense") return buildExpenseLines(client, operatingCompanyId, sourceId);
  if (sourceType === "customer_payment") return buildCustomerPaymentLines(client, operatingCompanyId, sourceId);
  if (sourceType === "bill_payment") return buildBillPaymentLines(client, operatingCompanyId, sourceId);
  if (sourceType === "cash_advance") return buildCashAdvanceLines(client, operatingCompanyId, sourceId, creditAccountId);
  if (sourceType === "driver_advance") return buildDriverAdvanceLines(client, operatingCompanyId, sourceId, creditAccountId);
  throw new PostingEngineError("UNKNOWN_SOURCE_TYPE", `Unknown source type: ${sourceType}`);
}

async function markBatchFailed(
  actor: Actor,
  operatingCompanyId: string,
  sourceType: PostingSourceType,
  sourceId: string,
  idempotencyKey: string
) {
  await withCurrentUser(actor.userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    await client.query(
      `
        INSERT INTO accounting.posting_batches (
          operating_company_id,
          batch_status,
          source_transaction_type,
          source_transaction_id,
          idempotency_key,
          created_by_user_id,
          created_at,
          updated_at
        )
        VALUES ($1::uuid, 'failed', $2, $3, $4, $5::uuid, now(), now())
        ON CONFLICT (operating_company_id, idempotency_key)
        DO UPDATE SET batch_status = 'failed', updated_at = now()
      `,
      [operatingCompanyId, sourceType, sourceId, idempotencyKey, actor.userId]
    );
  });
}

export async function postSourceTransaction(input: PostSourceInput, actor: Actor): Promise<PostingResult> {
  const sourceType = normalizeSourceType(input.source_transaction_type);
  const sourceId = normalizeSourceId(input.source_transaction_id);
  const postingPurpose: PostingPurpose = input.posting_purpose ?? "initial_post";
  const normalizedLineId = normalizeSourceLineId(input.source_transaction_line_id ?? null);
  const idempotencyLinePart = postingPurpose === "initial_post" ? null : normalizedLineId;

  const idempotencyKey = buildPostingMvpIdempotencyKey({
    operating_company_id: input.operating_company_id,
    source_transaction_type: sourceType,
    source_transaction_id: sourceId,
    source_transaction_line_id: idempotencyLinePart,
    posting_purpose: postingPurpose,
  });

  try {
    return await withCurrentUser(actor.userId, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);

      const existing = await getExistingPostingResultByIdempotencyKey(
        client,
        input.operating_company_id,
        idempotencyKey,
        postingPurpose,
        sourceType,
        sourceId
      );
      if (existing) return existing;

      const draft = await buildPostingDraft(
        client,
        sourceType,
        input.operating_company_id,
        sourceId,
        input.credit_account_id ?? null
      );
      await ensureOpenPeriod(client, input.operating_company_id, draft.postingDate);
      assertBalanced(draft.lines);

      const batch = await client.query<{ id: string }>(
        `
          INSERT INTO accounting.posting_batches (
            operating_company_id,
            batch_status,
            source_transaction_type,
            source_transaction_id,
            idempotency_key,
            created_by_user_id,
            created_at,
            updated_at
          )
          VALUES ($1::uuid, 'queued', $2, $3, $4, $5::uuid, now(), now())
          RETURNING id::text
        `,
        [input.operating_company_id, sourceType, sourceId, idempotencyKey, actor.userId]
      );
      const postingBatchId = batch.rows[0]?.id;
      if (!postingBatchId) throw new Error("posting_batch_create_failed");

      await client.query(
        `
          UPDATE accounting.posting_batches
          SET batch_status = 'in_progress',
              updated_at = now()
          WHERE id = $1::uuid
        `,
        [postingBatchId]
      );

      const journalEntryId = await createJournalEntryHeader(
        client,
        input.operating_company_id,
        draft.postingDate,
        draft.memo,
        actor.userId
      );

      const postingIds = await insertPostingLines({
        client,
        operatingCompanyId: input.operating_company_id,
        journalEntryId,
        postingBatchId,
        idempotencyKey,
        sourceType,
        sourceId,
        lines: draft.lines,
      });

      await client.query(
        `
          UPDATE accounting.posting_batches
          SET batch_status = 'posted',
              updated_at = now()
          WHERE id = $1::uuid
        `,
        [postingBatchId]
      );

      return {
        result: "posted",
        posting_batch_id: postingBatchId,
        journal_entry_id: journalEntryId,
        journal_entry_posting_ids: postingIds,
        idempotency_key: idempotencyKey,
        posting_purpose: postingPurpose,
        source_transaction_type: sourceType,
        source_transaction_id: sourceId,
        account_resolution_trace: draft.accountResolutionTrace,
      };
    });
  } catch (error) {
    if (!(error instanceof PostingEngineError)) {
      await markBatchFailed(actor, input.operating_company_id, sourceType, sourceId, idempotencyKey);
    } else if (
      error.code !== "INVOICE_NOT_POSTING_ELIGIBLE" &&
      error.code !== "BILL_NOT_POSTING_ELIGIBLE" &&
      error.code !== "PAYMENT_NOT_POSTING_ELIGIBLE" &&
      error.code !== "ADVANCE_NOT_POSTING_ELIGIBLE"
    ) {
      await markBatchFailed(actor, input.operating_company_id, sourceType, sourceId, idempotencyKey);
    }
    throw error;
  }
}

export async function reversePostedSourceTransaction(input: ReverseBatchInput, actor: Actor): Promise<PostingResult> {
  const sourceType = normalizeSourceType(input.source_transaction_type);
  const sourceId = normalizeSourceId(input.source_transaction_id);

  return withCurrentUser(actor.userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);

    const original = await getPostingBySource(client, input.operating_company_id, sourceType, sourceId, "initial_post");
    if (!original) throw new PostingEngineError("SOURCE_NOT_FOUND", "No posted batch found to reverse");

    const existingReversal = await getPostingBySource(client, input.operating_company_id, sourceType, sourceId, "reversal");
    if (existingReversal) return existingReversal;

    const originalLines = await client.query<{
      id: string;
      account_id: string;
      debit_or_credit: "debit" | "credit";
      amount_cents: number;
      description: string | null;
    }>(
      `
        SELECT id::text, account_id::text, debit_or_credit, amount_cents::bigint, description
        FROM accounting.journal_entry_postings
        WHERE operating_company_id = $1::uuid
          AND posting_batch_id = $2::uuid
        ORDER BY line_sequence ASC, created_at ASC
      `,
      [input.operating_company_id, original.posting_batch_id]
    );
    if (!originalLines.rows.length) throw new PostingEngineError("SOURCE_NOT_FOUND", "No posted lines found to reverse");

    const headerDate = await client.query<{ entry_date: string }>(
      `
        SELECT je.entry_date::text
        FROM accounting.journal_entries je
        WHERE je.id = $1::uuid
        LIMIT 1
      `,
      [original.journal_entry_id]
    );
    const reversalDate = headerDate.rows[0]?.entry_date;
    if (!reversalDate) throw new PostingEngineError("SOURCE_NOT_FOUND", "Original journal entry missing");
    await ensureOpenPeriod(client, input.operating_company_id, reversalDate);

    const idempotencyKey = buildPostingMvpIdempotencyKey({
      operating_company_id: input.operating_company_id,
      source_transaction_type: sourceType,
      source_transaction_id: sourceId,
      source_transaction_line_id: null,
      posting_purpose: "reversal",
    });

    const reversalBatch = await client.query<{ id: string }>(
      `
        INSERT INTO accounting.posting_batches (
          operating_company_id,
          batch_status,
          source_transaction_type,
          source_transaction_id,
          idempotency_key,
          created_by_user_id,
          created_at,
          updated_at
        )
        VALUES ($1::uuid, 'in_progress', $2, $3, $4, $5::uuid, now(), now())
        RETURNING id::text
      `,
      [input.operating_company_id, sourceType, sourceId, idempotencyKey, actor.userId]
    );
    const reversalBatchId = reversalBatch.rows[0]?.id;
    if (!reversalBatchId) throw new Error("reversal_batch_create_failed");

    const reversalJeId = await createJournalEntryHeader(
      client,
      input.operating_company_id,
      reversalDate,
      `Reversal of ${original.journal_entry_id}`,
      actor.userId
    );

    const reversalPostingIds: string[] = [];
    let lineSequence = 1;
    for (const row of originalLines.rows) {
      const opposite = row.debit_or_credit === "debit" ? "credit" : "debit";
      const ins = await client.query<{ id: string }>(
        `
          INSERT INTO accounting.journal_entry_postings (
            operating_company_id,
            journal_entry_uuid,
            line_sequence,
            account_id,
            debit_or_credit,
            amount_cents,
            description,
            source_transaction_type,
            source_transaction_id,
            source_transaction_line_id,
            posting_batch_id,
            idempotency_key,
            reversal_of_line_id,
            created_at,
            updated_at
          )
          VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5, $6, $7, $8, $9, NULL, $10::uuid, $11, $12::uuid, now(), now())
          RETURNING id::text
        `,
        [
          input.operating_company_id,
          reversalJeId,
          lineSequence,
          row.account_id,
          opposite,
          row.amount_cents,
          row.description ? `REVERSAL: ${row.description}` : "REVERSAL",
          sourceType,
          sourceId,
          reversalBatchId,
          idempotencyKey,
          row.id,
        ]
      );
      const reversalLineId = ins.rows[0]?.id;
      if (!reversalLineId) throw new Error("reversal_line_insert_failed");
      reversalPostingIds.push(reversalLineId);
      await client.query(
        `
          UPDATE accounting.journal_entry_postings
          SET reversed_by_line_id = $2::uuid,
              updated_at = now()
          WHERE id = $1::uuid
        `,
        [row.id, reversalLineId]
      );
      await client.query(
        `
          INSERT INTO accounting.transaction_source_links (
            operating_company_id,
            journal_entry_posting_id,
            linked_object_type,
            linked_object_id,
            relationship_role
          )
          VALUES ($1::uuid, $2::uuid, $3, $4, 'reversal')
        `,
        [input.operating_company_id, reversalLineId, sourceType, sourceId]
      );
      lineSequence += 1;
    }
    await client.query(`UPDATE accounting.posting_batches SET batch_status = 'reversed', updated_at = now() WHERE id = $1::uuid`, [
      original.posting_batch_id,
    ]);
    await client.query(`UPDATE accounting.posting_batches SET batch_status = 'posted', updated_at = now() WHERE id = $1::uuid`, [
      reversalBatchId,
    ]);
    return {
      result: "reversed",
      posting_batch_id: reversalBatchId,
      journal_entry_id: reversalJeId,
      journal_entry_posting_ids: reversalPostingIds,
      idempotency_key: idempotencyKey,
      posting_purpose: "reversal",
      source_transaction_type: sourceType,
      source_transaction_id: sourceId,
    };
  });
}

export async function runPostingEngineMvpBackfill(input: BackfillInput, actor: Actor) {
  const totals = {
    posted: 0,
    already_posted: 0,
    failed: 0,
    by_source: {
      invoice: 0,
      bill: 0,
      customer_payment: 0,
      bill_payment: 0,
    } as Record<PostingSourceType, number>,
    errors: [] as Array<{ source_transaction_type: PostingSourceType; source_transaction_id: string; error: string }>,
  };

  const ids = await withCurrentUser(actor.userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);
    const invoices = await client.query<{ id: string }>(
      `
        SELECT id::text
        FROM accounting.invoices
        WHERE operating_company_id = $1::uuid
          AND status IN ('sent', 'partial', 'paid', 'factored')
      `,
      [input.operating_company_id]
    );
    const bills = await client.query<{ id: string }>(
      `
        SELECT id::text
        FROM accounting.bills
        WHERE operating_company_id = $1::uuid
          AND COALESCE(revoked_at::text, '') = ''
          AND status NOT IN ('void', 'voided')
      `,
      [input.operating_company_id]
    );
    const customerPayments = await client.query<{ id: string }>(
      `
        SELECT id::text
        FROM accounting.payments
        WHERE operating_company_id = $1::uuid
          AND voided_at IS NULL
      `,
      [input.operating_company_id]
    );
    const billPayments = await client.query<{ id: string }>(
      `
        SELECT id::text
        FROM accounting.bill_payments
        WHERE operating_company_id = $1::uuid
          AND revoked_at IS NULL
          AND status <> 'void'
      `,
      [input.operating_company_id]
    );
    return {
      invoice: invoices.rows.map((r) => r.id),
      bill: bills.rows.map((r) => r.id),
      customer_payment: customerPayments.rows.map((r) => r.id),
      bill_payment: billPayments.rows.map((r) => r.id),
    };
  });

  // cash_advance is intentionally excluded from batch backfill — it posts via B5's explicit
  // approve path (which supplies the credit account), not this unposted-source sweep.
  const sourceOrder = ["invoice", "bill", "customer_payment", "bill_payment"] as const;
  for (const sourceType of sourceOrder) {
    for (const sourceId of ids[sourceType]) {
      try {
        const result = await postSourceTransaction(
          {
            operating_company_id: input.operating_company_id,
            source_transaction_type: sourceType,
            source_transaction_id: sourceId,
            posting_purpose: "initial_post",
          },
          actor
        );
        if (result.result === "posted") totals.posted += 1;
        if (result.result === "already_posted") totals.already_posted += 1;
        totals.by_source[sourceType] += 1;
      } catch (error) {
        totals.failed += 1;
        totals.errors.push({
          source_transaction_type: sourceType,
          source_transaction_id: sourceId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return totals;
}
