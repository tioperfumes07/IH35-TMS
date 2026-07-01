import { withCurrentUser } from "../auth/db.js";
import { resolveRoleAccountOptional } from "./coa-roles/resolver.service.js";
import { resolveAccountForCategory } from "./expense-category-map/resolver.service.js";
import { resolveBillLineDebitAccount, BillLineAccountError } from "./bill-account-resolver.js";

// CHAIN-05 (BLOCK-03) adds "bank_categorization" (a categorized bank-feed line → direction-aware balanced
// JE; built by buildBankCategorizationLines). NOTE: kept on ONE line — verify-posting-engine-mvp-contract
// prefix-matches the leading four MVP types on a single line.
export type PostingSourceType = "invoice" | "bill" | "customer_payment" | "bill_payment" | "cash_advance" | "driver_advance" | "expense" | "bank_categorization";
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
  // CHAIN-06 GAP #1 kill switch — the backfill sweep posts invoice A/R too, so it must honor the same
  // per-entity INVOICE_AR_GL_POSTING_ENABLED gate. Resolved by the caller (route) and passed in.
  // Safe-by-default: when omitted or false, the sweep SKIPS invoices and posts nothing for them.
  invoiceArPostingEnabled?: boolean;
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
  | "BILL_AP_NOT_POSTED"
  | "PERIOD_LOCKED"
  | "UNBALANCED_ENTRY"
  | "ACCOUNT_MAPPING_MISSING"
  | "ADVANCE_NOT_POSTING_ELIGIBLE"
  | "BILL_LINE_ACCOUNT_UNRESOLVED"
  | "INVOICE_LINE_REVENUE_UNRESOLVED"
  | "EXPENSE_NOT_POSTING_ELIGIBLE"
  | "BANK_CATEGORIZATION_NOT_POSTING_ELIGIBLE";

export class PostingEngineError extends Error {
  code: PostingErrorCode;

  constructor(code: PostingErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

// Per-line invoice revenue must resolve to that line's mapped income account (the line's explicit
// account_id override → its Product/Service item's default_income_account_id). There is NO default
// revenue account: a revenue-bearing line with no resolvable income account FAILS CLOSED (refuse to
// post) instead of silently lumping revenue into a generic/native 4100 account. Mirrors the
// ControlAccountDesignationError fail-closed contract the AR-control fix added — owner decision
// (ACCOUNTING-1, locked 2026-06-30): revenue = hard-fail, no default account.
export class InvoiceRevenueAccountError extends PostingEngineError {
  invoice_line_id: string | null;
  display_order: number | null;
  qbo_item_id: string | null;

  constructor(
    operatingCompanyId: string,
    invoiceLineId: string | null,
    displayOrder: number | null,
    qboItemId: string | null,
    detail?: string
  ) {
    super(
      "INVOICE_LINE_REVENUE_UNRESOLVED",
      detail ??
        `invoice_line_revenue_account_unresolved: invoice line ${invoiceLineId ?? "(none)"} ` +
          `(display_order=${displayOrder ?? "?"}, qbo_item_id=${qboItemId ?? "none"}) has no mapped, ` +
          `active income account for operating_company_id=${operatingCompanyId}. Map the line's ` +
          `Product/Service item to an income account (catalogs.items.default_income_account_id) or set ` +
          `the line's account_id — refusing to post revenue to a default account.`
    );
    this.invoice_line_id = invoiceLineId;
    this.display_order = displayOrder;
    this.qbo_item_id = qboItemId;
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
  if (
    !["invoice", "bill", "customer_payment", "bill_payment", "cash_advance", "driver_advance", "expense", "bank_categorization"].includes(
      value
    )
  ) {
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

// CHAIN-04 — resolve a bank account's cash GL account via the bank->GL bridge
// banking.bank_accounts.ledger_account_id (the column the Cash-GL setup screen reads/writes; FK to
// catalogs.accounts added by migration 202606280100, backfilled by 202606300070). Returns null when
// the bank account is not found for this entity OR has no ledger_account_id mapped (caller fails
// closed). Deliberately does NOT read a "coa-account" column — no such column exists on
// banking.bank_accounts and reading it was the documented CHAIN-04 bug.
async function resolveBankLedgerAccountId(
  client: DbClient,
  operatingCompanyId: string,
  bankAccountId: string
): Promise<string | null> {
  const res = await client.query<{ ledger_account_id: string | null }>(
    `
      SELECT ledger_account_id::text AS ledger_account_id
      FROM banking.bank_accounts
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
      LIMIT 1
    `,
    [bankAccountId, operatingCompanyId]
  );
  return res.rows[0]?.ledger_account_id ?? null;
}

// Exported for reuse by sibling posters (e.g. FIN-22 lease ASC 842) so the closed-period gate is
// enforced identically everywhere (no duplicated period-lock logic). Additive — no behavior change.
export async function ensureOpenPeriod(client: DbClient, operatingCompanyId: string, postingDate: string) {
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

  // PER-LINE revenue resolution (owner decision ACCOUNTING-1, 2026-06-30): each revenue-bearing invoice
  // line credits the income account mapped to THAT line — its explicit account_id (Block 33, migration
  // 0221), else its Product/Service item's catalogs.items.default_income_account_id (keyed on qbo_item_id).
  // Both candidate accounts must be active (deactivated_at IS NULL) + postable. No default fallback:
  // a line with no resolvable income account FAILS CLOSED below.
  const lineRows = await client.query<{
    id: string | null;
    line_type: string | null;
    line_total_cents: number | null;
    display_order: number | null;
    description: string | null;
    qbo_item_id: string | null;
    income_account_id: string | null;
  }>(
    `
      SELECT
        il.id::text AS id,
        il.line_type::text AS line_type,
        il.line_total_cents::bigint AS line_total_cents,
        il.display_order,
        il.description,
        il.qbo_item_id,
        COALESCE(expl.id, itm.id)::text AS income_account_id
      FROM accounting.invoice_lines il
      LEFT JOIN catalogs.accounts expl
        ON expl.id = il.account_id
        AND expl.operating_company_id = $2::uuid
        AND expl.deactivated_at IS NULL
        AND expl.is_postable = true
      LEFT JOIN catalogs.items it
        ON it.qbo_item_id = il.qbo_item_id
        AND it.deactivated_at IS NULL
      LEFT JOIN catalogs.accounts itm
        ON itm.id = it.default_income_account_id
        AND itm.operating_company_id = $2::uuid
        AND itm.deactivated_at IS NULL
        AND itm.is_postable = true
      WHERE il.invoice_id = $1::uuid
      ORDER BY il.display_order ASC, il.id ASC
    `,
    [sourceId, operatingCompanyId]
  );

  const descriptionBase = invoice.display_id ? `Invoice ${invoice.display_id}` : `Invoice ${sourceId}`;
  const accountResolutionTrace: Array<Record<string, unknown>> = [];
  const revenueCredits: PostingLineDraft[] = [];
  let revenueTotal = 0;

  for (const row of lineRows.rows) {
    // Tax is posted from the invoice header (tax_cents) to sales_tax_payable below — a 'tax' line
    // is not a revenue line and is intentionally not resolved to an income account.
    if ((row.line_type ?? "").toLowerCase() === "tax") continue;
    const lineCents = row.line_total_cents != null ? Number(row.line_total_cents) : 0;
    if (lineCents <= 0) continue; // non-revenue-bearing line (zero/credit) — nothing to post.
    if (!row.income_account_id) {
      // HARD FAIL — no default. Refuse to post revenue to a generic account.
      throw new InvoiceRevenueAccountError(operatingCompanyId, row.id, row.display_order, row.qbo_item_id);
    }
    revenueCredits.push({
      account_id: row.income_account_id,
      debit_or_credit: "credit",
      amount_cents: lineCents,
      description: row.description ? `${descriptionBase} Revenue — ${row.description}` : `${descriptionBase} Revenue`,
      source_transaction_line_id: row.id ?? null,
    });
    revenueTotal += lineCents;
    accountResolutionTrace.push({
      invoice_line_id: row.id,
      display_order: row.display_order,
      qbo_item_id: row.qbo_item_id,
      account_id: row.income_account_id,
      method: "invoice_line_income_account",
    });
  }

  const taxAmount = Math.max(0, Number(invoice.tax_cents ?? 0));
  let salesTaxPayableAccountId: string | null = null;
  if (taxAmount > 0) {
    salesTaxPayableAccountId = await resolveRoleAccountOptional(client, operatingCompanyId, "sales_tax_payable");
    if (!salesTaxPayableAccountId) {
      throw new PostingEngineError("ACCOUNT_MAPPING_MISSING", "Sales tax payable account mapping is missing");
    }
  }

  if (revenueCredits.length === 0 && taxAmount <= 0) {
    // No revenue-bearing lines and no header tax — nothing resolvable. Fail loud (mirror the bill path's
    // empty/unresolved fail-closed) rather than emitting a zero/AR-only entry.
    throw new InvoiceRevenueAccountError(operatingCompanyId, null, null, null, "Invoice has no revenue-bearing lines to resolve");
  }

  const creditLines: PostingLineDraft[] = [...revenueCredits];
  if (taxAmount > 0 && salesTaxPayableAccountId) {
    creditLines.push({
      account_id: salesTaxPayableAccountId,
      debit_or_credit: "credit",
      amount_cents: taxAmount,
      description: `${descriptionBase} Sales tax payable`,
      source_transaction_line_id: null,
    });
  }

  // AR debit is built from the resolved parts (per-line revenue + header tax) so the entry is balanced
  // by construction regardless of any header total_cents drift.
  const arAmount = revenueTotal + taxAmount;
  return {
    postingDate: invoice.issue_date,
    memo: `${descriptionBase} posting`,
    accountResolutionTrace,
    lines: [
      {
        account_id: arAccountId,
        debit_or_credit: "debit",
        amount_cents: arAmount,
        description: `${descriptionBase} AR`,
        source_transaction_line_id: null,
      },
      ...creditLines,
    ],
  };
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

  // Each line carries account_id (explicit override), category_kind, category_code (migration 0220).
  const lineRows = await client.query<{
    id: string | null;
    line_sequence: number | null;
    amount: string | null;
    description: string | null;
    account_id: string | null;
    category_kind: string | null;
    category_code: string | null;
  }>(
    `
      SELECT
        bl.id::text,
        bl.line_sequence,
        bl.amount::text,
        bl.description,
        bl.account_id::text,
        bl.category_kind,
        bl.category_code
      FROM accounting.bill_lines bl
      WHERE bl.bill_id::uuid = $1::uuid
      ORDER BY bl.line_sequence ASC
    `,
    [sourceId]
  );

  const debitLines: PostingLineDraft[] = [];
  const accountResolutionTrace: Array<Record<string, unknown>> = [];

  // A bill with no lines cannot be resolved under the canonical order (no silent header/expense_default
  // fallback any longer) — FAIL LOUD, same as the draft preview's EMPTY_BILL.
  if (lineRows.rows.length === 0) {
    throw new PostingEngineError("BILL_LINE_ACCOUNT_UNRESOLVED", "Bill has no lines to resolve");
  }

  for (const row of lineRows.rows) {
    const amountCents = Math.round(Number(row.amount ?? "0") * 100);
    // THE ONE shared resolver — identical to the draft preview: explicit override → category map →
    // uncategorized (QBO-25) → FAIL LOUD. The dropped silent header/expense_default tiers are gone.
    let resolved;
    try {
      resolved = await resolveBillLineDebitAccount(client, operatingCompanyId, {
        explicit_account_id: row.account_id,
        category_kind: row.category_kind,
        category_code: row.category_code,
      });
    } catch (err) {
      if (err instanceof BillLineAccountError) {
        throw new PostingEngineError(
          "BILL_LINE_ACCOUNT_UNRESOLVED",
          `Bill line ${row.id ?? row.line_sequence ?? "unknown"}: [${err.code}] ${err.message}`
        );
      }
      throw err;
    }
    accountResolutionTrace.push({
      bill_line_id: row.id,
      line_sequence: row.line_sequence,
      method: resolved.method,
      account_id: resolved.account_id,
    });
    debitLines.push({
      account_id: resolved.account_id,
      debit_or_credit: "debit",
      amount_cents: amountCents,
      description: row.description ?? `Bill line ${row.line_sequence ?? ""}`.trim(),
      source_transaction_line_id: row.id ?? null,
      relationship_role: null,
    });
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
    expense_account_uuid: string | null;
  }>(
    `
      SELECT id::text, line_sequence, amount_cents::bigint, description,
             expense_category_uuid::text, expense_account_uuid::text
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
      // Prefer a DIRECT GL account on the line (e.g. driverless Record-Expense, where the form's QBO
      // category was resolved server-side to a catalogs.accounts id). Falls back to the existing
      // category→metadata.account_id mapping, then the uncategorized role.
      if (row.expense_account_uuid) {
        accountId = row.expense_account_uuid;
        method = "line_direct_account";
      }
      if (!accountId && row.expense_category_uuid) {
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
    bill_id: string | null;
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
        bill_id::text,
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

  // CHAIN-04 GAP #3 — accrual-sequencing guard (bill-posted-first). The payment JE always does
  // DR ap_control / CR bank, which ASSUMES CHAIN-03 already posted DR expense / CR ap_control for
  // this bill. If the bill's A/P leg was never posted, debiting ap_control here has no matching
  // credit -> A/P goes NEGATIVE and the QBO A/P tie-out breaks. Refuse to post; NEVER post an A/P
  // leg from the payment path (design doc §10-A open decision #2 = enforce bill-posted-first).
  if (!payment.bill_id) {
    throw new PostingEngineError("BILL_AP_NOT_POSTED", "Bill payment has no bill_id; cannot verify the bill's A/P leg is posted");
  }
  const billPosting = await getPostingBySource(client, operatingCompanyId, "bill", payment.bill_id, "initial_post");
  if (!billPosting || billPosting.result !== "already_posted") {
    throw new PostingEngineError(
      "BILL_AP_NOT_POSTED",
      `Bill ${payment.bill_id} A/P leg is not posted (CHAIN-03) — refusing to post the bill payment to avoid a negative A/P`
    );
  }

  const apAccountId = await resolveApAccountForCompany(client, operatingCompanyId);
  if (!apAccountId) throw new PostingEngineError("ACCOUNT_MAPPING_MISSING", "AP account mapping is missing");

  // CHAIN-04 GAP #2 — bank leg fix. The engine used to CR resolveCashLikeAccountForCompany
  // (undeposited_funds / cash_clearing) and IGNORE the payment's own from_bank_account_id. Fix:
  // credit the REAL bank the money left, via the bank->GL bridge banking.bank_accounts.ledger_account_id
  // (migrations 202606280100 FK + 202606300070 backfill). NB: a "coa-account" column does NOT exist on
  // banking.bank_accounts (reading it was the documented bug) — never read it. Fail-closed if the chosen
  // bank has no ledger_account_id. When the payment carries no from_bank_account_id (e.g. a cash
  // payment recorded without a bank), keep the company-default cash-like fallback (mirrors
  // buildCustomerPaymentLines' deposited_to_account_id-then-cash-like resolution).
  let cashAccountId: string | null;
  if (payment.from_bank_account_id) {
    cashAccountId = await resolveBankLedgerAccountId(client, operatingCompanyId, payment.from_bank_account_id);
    if (!cashAccountId) {
      throw new PostingEngineError(
        "ACCOUNT_MAPPING_MISSING",
        `Bank ledger account mapping is missing (banking.bank_accounts.ledger_account_id) for from_bank_account_id ${payment.from_bank_account_id}`
      );
    }
  } else {
    cashAccountId = await resolveCashLikeAccountForCompany(client, operatingCompanyId);
    if (!cashAccountId) throw new PostingEngineError("ACCOUNT_MAPPING_MISSING", "Cash account mapping is missing");
  }

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

// CHAIN-05 (BLOCK-03) — a categorized bank-feed line → a direction-aware balanced JE. This is the
// GENERALIZATION of BLOCK-6 (bank-driver-advance): the same two-leg cash↔category structure, for ANY
// categorized bank transaction (not just the driver-advance branch). NO new GL math — it reads the row
// the operator already tagged and the bank's cash-GL bridge, then emits the standard double entry.
//
//   CAT  = banking.bank_transactions.categorization_gl_account_id  (the account the operator chose)
//   BANK = banking.bank_accounts.ledger_account_id                 (the source bank's COA register)
//
// DIRECTION IS DRIVEN ONLY BY is_credit — NEVER by the sign of amount_cents (money-out is stored as a
// NEGATIVE amount_cents; we post Math.abs). This mirrors bank-driver-advance.service.ts exactly:
//   is_credit=false (money OUT): DR CAT / CR BANK   (paid an expense / bought an asset / paid a liability)
//   is_credit=true  (money IN):  DR BANK / CR CAT   (deposited revenue / borrowed / received held funds)
// Both legs equal by construction → balanced. Fails CLOSED on any unresolved input (the higher-level
// interlocks — flag, transfer, matched-to-bill, driver-advance cede — live in bank-feed-gl-posting.service).
async function buildBankCategorizationLines(client: DbClient, operatingCompanyId: string, sourceId: string): Promise<PostingDraft> {
  const txnRes = await client.query<{
    id: string;
    status: string | null;
    is_credit: boolean;
    amount_cents: string | number | null;
    transaction_date: string;
    categorization_gl_account_id: string | null;
    bank_ledger_account_id: string | null;
  }>(
    `
      SELECT
        bt.id::text,
        bt.status::text,
        bt.is_credit,
        bt.amount_cents::bigint AS amount_cents,
        bt.transaction_date::text AS transaction_date,
        bt.categorization_gl_account_id::text AS categorization_gl_account_id,
        ba.ledger_account_id::text AS bank_ledger_account_id
      FROM banking.bank_transactions bt
      LEFT JOIN banking.bank_accounts ba
        ON ba.id = bt.bank_account_id
        AND ba.operating_company_id = bt.operating_company_id
      WHERE bt.operating_company_id = $1::uuid
        AND bt.id::text = $2
      LIMIT 1
      FOR UPDATE OF bt
    `,
    [operatingCompanyId, sourceId]
  );
  const txn = txnRes.rows[0];
  if (!txn) throw new PostingEngineError("SOURCE_NOT_FOUND", "Bank transaction not found");
  if (txn.status !== "categorized") {
    throw new PostingEngineError(
      "BANK_CATEGORIZATION_NOT_POSTING_ELIGIBLE",
      `Bank transaction is not posting-eligible (status=${txn.status ?? "null"}; must be 'categorized')`
    );
  }

  const catAccountId = txn.categorization_gl_account_id;
  if (!catAccountId) {
    throw new PostingEngineError("ACCOUNT_MAPPING_MISSING", "Bank transaction has no categorization_gl_account_id to post against");
  }
  const bankAccountId = txn.bank_ledger_account_id;
  if (!bankAccountId) {
    throw new PostingEngineError(
      "ACCOUNT_MAPPING_MISSING",
      "Source bank account has no linked ledger_account_id (cash-GL bridge) — cannot post the bank leg"
    );
  }

  // Sign landmine: money-out is stored NEGATIVE. Post the magnitude; take direction from is_credit only.
  const amountCents = Math.abs(Number(txn.amount_cents ?? 0));
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    throw new PostingEngineError("BANK_CATEGORIZATION_NOT_POSTING_ELIGIBLE", "Bank transaction has a zero/non-finite amount");
  }

  const label = `Bank categorization ${sourceId}`;
  const moneyIn = txn.is_credit === true;
  const catLine: PostingLineDraft = {
    account_id: catAccountId,
    debit_or_credit: moneyIn ? "credit" : "debit",
    amount_cents: amountCents,
    description: `${label} category`,
    source_transaction_line_id: null,
  };
  const bankLine: PostingLineDraft = {
    account_id: bankAccountId,
    debit_or_credit: moneyIn ? "debit" : "credit",
    amount_cents: amountCents,
    description: `${label} bank`,
    source_transaction_line_id: null,
  };
  // Order legs debit-first for readability (money-in → bank debit first; money-out → category debit first).
  return {
    postingDate: txn.transaction_date,
    memo: `${label} posting`,
    lines: moneyIn ? [bankLine, catLine] : [catLine, bankLine],
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
  if (sourceType === "bank_categorization") return buildBankCategorizationLines(client, operatingCompanyId, sourceId);
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
        ON CONFLICT (operating_company_id, idempotency_key) WHERE idempotency_key IS NOT NULL
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
    // Failure-recording must NEVER mask the original posting error. If markBatchFailed
    // itself throws (e.g. its own SQL/RLS issue), preserve and rethrow the original.
    try {
      if (!(error instanceof PostingEngineError)) {
        await markBatchFailed(actor, input.operating_company_id, sourceType, sourceId, idempotencyKey);
      } else if (
        error.code !== "INVOICE_NOT_POSTING_ELIGIBLE" &&
        error.code !== "BILL_NOT_POSTING_ELIGIBLE" &&
        error.code !== "PAYMENT_NOT_POSTING_ELIGIBLE" &&
        error.code !== "ADVANCE_NOT_POSTING_ELIGIBLE" &&
        error.code !== "BANK_CATEGORIZATION_NOT_POSTING_ELIGIBLE"
      ) {
        await markBatchFailed(actor, input.operating_company_id, sourceType, sourceId, idempotencyKey);
      }
    } catch (recordError) {
      console.error("[posting-engine] markBatchFailed failed; preserving original error", recordError);
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
    // CHAIN-06 GAP #1 — count invoices deliberately skipped because the per-entity kill switch is OFF,
    // so the sweep is auditable (skipped != failed).
    skipped_invoice_ar_disabled: 0,
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
    // CHAIN-06 GAP #1 — invoice A/R stays behind the per-entity kill switch. When it is not explicitly
    // enabled for this entity, do NOT post any invoices (no-op) — same behavior as the MVP post route's OFF path.
    if (sourceType === "invoice" && input.invoiceArPostingEnabled !== true) {
      totals.skipped_invoice_ar_disabled += ids.invoice.length;
      continue;
    }
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
