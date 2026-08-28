import { withCurrentUser } from "../auth/db.js";
import { bankAccountHiddenFilterSql, isBankAccountHideEnabled } from "../banking/bank-account-visibility.js";
import { resolveRoleAccountOptional } from "./coa-roles/resolver.service.js";
import { STANDING_LATCH_JE_PREDICATE } from "./revrec-delivery-posting/poster.service.js";
import { resolveAccountForCategory } from "./expense-category-map/resolver.service.js";
import { resolveBillLineDebitAccount, BillLineAccountError } from "./bill-account-resolver.js";
import {
  assertLoadRevenueHasSourceLoad,
  InvoiceLoadSourceRequiredError as SharedInvoiceLoadSourceError,
} from "./invoice-linkage-guards.js";
import { resolveReversalDate, todayIso } from "./void.service.js";
// ACCT-F59 second arm — single source of truth for "this load is delivered"; see
// loadReachedDeliveryEvidence below for why this is imported rather than re-listed.
// SYS-F5509 — imported from the small leaf module the predicate lives in, not the full latch module
// (which itself depends on accounting/invoice-send.service.ts) — importing the latch module here
// closed an import cycle: invoice-gl -> posting-engine -> delivery-evidence-latch -> invoice-send ->
// invoice-gl. Same function, same behavior, just a narrower dependency.
import { isDeliveryEvidenceStatus } from "../dispatch/delivery-evidence-status.js";

// CHAIN-05 (BLOCK-03) adds "bank_categorization" (a categorized bank-feed line → direction-aware balanced
// JE; built by buildBankCategorizationLines). NOTE: kept on ONE line — verify-posting-engine-mvp-contract
// prefix-matches the leading four MVP types on a single line.
/**
 * The posting source types, as ONE list.
 *
 * This used to be a hand-written union PLUS a hand-written array inside assertKnownSourceType() — two
 * copies of the same truth, which is a drift waiting to happen: adding a type to the union without the
 * array compiles fine and then throws UNKNOWN_SOURCE_TYPE at runtime, and adding it to the array
 * without the union fails to typecheck at every call site. The union is now DERIVED from the array, so
 * a new source type is a one-line change that cannot be half-applied.
 */
export const POSTING_SOURCE_TYPES = [
  "invoice",
  "bill",
  "customer_payment",
  "bill_payment",
  "cash_advance",
  "driver_advance",
  "expense",
  "bank_categorization",
  "driver_reimbursement",
  "transfer",
  // LOAN-02: related-party lending (owner/spouse/employee/driver, both directions). Posts through the
  // shared poster onto accounting.journal_entries — no new GL math, no second ledger.
  "related_party_loan",
] as const;

export type PostingSourceType = (typeof POSTING_SOURCE_TYPES)[number];
export type PostingPurpose = "initial_post" | "reversal" | "repost";

/**
 * BANK-F04 — the canonical poster CAN now re-post a source transaction whose previous posting was
 * reversed. This is the capability BANK-F03 declared missing.
 *
 * WHY IT COULD NOT BEFORE. The batch idempotency key is
 *     ih35:posting-mvp:v1:<opco>:<type>:<source_id>:<line_id>:<posting_purpose>
 * and PostingPurpose had two members, so exactly ONE `initial_post` batch could ever exist per source
 * transaction. Calling the poster after a reversal returned the EXISTING batch and reported success.
 * Proven on a prod fork: 20 reversed bank categorizations, fuel down exactly $4,593.94, target
 * accounts ZERO lines, `posted: true` carrying the ORIGINAL journal-entry id. The expense did not move
 * to the right account — it vanished.
 *
 * HOW IT WORKS NOW. A corrected posting uses purpose `repost` and carries an explicit
 * `repost_revision` (1 for the first correction, 2 for a correction of that correction, ...). The
 * revision is appended to the idempotency key, so each successive correction gets a DISTINCT key and
 * posts a NEW balanced batch, while a genuine double-submit of the SAME correction repeats the SAME
 * revision, hits the SAME key, and still dedups exactly as before.
 *
 * WHY THE REVISION IS EXPLICIT RATHER THAN INFERRED. The obvious design is to derive it from how many
 * batches are already reversed. That is silently wrong here: the reversal path this actually serves
 * (reverseJournalEntryNoFlip) does NOT touch accounting.posting_batches at all — only postVoidReversal
 * marks batch_status='reversed' (line ~2211). An inferred revision would therefore compute 0 on the
 * live path and collide with the original key, reproducing the very defect this closes. Explicit beats
 * inferred when the inference is silently wrong.
 *
 * ADDITIVE BY CONSTRUCTION: the revision segment is appended ONLY for `repost`, so `initial_post` and
 * `reversal` keys are byte-identical to every key already stored in accounting.posting_batches. No
 * existing caller, and no already-posted batch, changes behaviour.
 */
export const POSTING_ENGINE_SUPPORTS_REPOST = true;
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
  /**
   * Required when posting_purpose === "repost": which correction this is (1-based). Appended to the
   * idempotency key so successive corrections are distinct while a double-submit of the same
   * correction still dedups. Ignored for initial_post / reversal.
   */
  repost_revision?: number;
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
  | "CREDIT_ACCOUNT_CROSS_ENTITY"
  | "ADVANCE_NOT_POSTING_ELIGIBLE"
  | "BILL_LINE_ACCOUNT_UNRESOLVED"
  | "INVOICE_LINE_REVENUE_UNRESOLVED"
  | "INVOICE_LOAD_SOURCE_REQUIRED"
  | "INVOICE_REVREC_LATCH_OWNS_LOAD"
  | "EXPENSE_NOT_POSTING_ELIGIBLE"
  | "BANK_CATEGORIZATION_NOT_POSTING_ELIGIBLE"
  | "TRANSFER_NOT_POSTING_ELIGIBLE"
  | "QBO_BILL_POST_GL_REFUSED"
  | "QBO_BILL_PAYMENT_POST_GL_REFUSED"
  | "EXPENSE_POST_GL_REFUSED"
  | "QBO_CUSTOMER_PAYMENT_POST_GL_REFUSED"
  | "QBO_INVOICE_POST_GL_REFUSED"
  | "POSTING_BATCH_SETTLED_WITHOUT_LINES"
  | "POSTING_BATCH_RECLAIM_HAS_LINES";

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
          `the line's account_id — refusing to post revenue to a default account (HOLD designate if ` +
          `role/map missing; do not invent CoA accounts).`
    );
    this.invoice_line_id = invoiceLineId;
    this.display_order = displayOrder;
    this.qbo_item_id = qboItemId;
  }
}

export class InvoiceLoadSourceRequiredError extends PostingEngineError {
  constructor(detail?: string) {
    super(
      "INVOICE_LOAD_SOURCE_REQUIRED",
      detail ??
        "invoice_load_source_required: load-revenue invoice lines require accounting.invoices.source_load_id " +
          "(create via from-load) — refusing orphan load revenue post."
    );
  }
}

/**
 * ACCT-F59 — REVREC/INVOICE DOUBLE-RECOGNITION INTERLOCK.
 *
 * The DISP-01 two-event delivery latch and the invoice A/R poster BOTH credit revenue and BOTH debit
 * A/R for the same load, so running both over one load double-states revenue AND A/R:
 *   latch Event 1  DR Unbilled Revenue / CR Freight Revenue   ← revenue recognized
 *   latch Event 2  DR A/R              / CR Unbilled Revenue  ← A/R established
 *   invoice post   DR A/R              / CR income (per line) ← revenue + A/R recognized AGAIN
 *
 * revrec-delivery-posting/poster.service.ts already documents the incompatibility and instructs that
 * INVOICE_AR_GL_POSTING_ENABLED be kept OFF for load-sourced invoices while the latch is ON. That is
 * an instruction in a comment, not a control: on prod both flags are ON for TRANSP and USMCA
 * (verified 2026-08-01, lib.feature_flag_overrides read with bypass, visible == n_live_tup). Nothing
 * had double-posted yet only because zero of 11,977 invoices carried source_load_id — they are all
 * QBO clone history. The ND-INV-01 proforma pipeline creates load-sourced invoices at
 * delivered_pending_docs, so the first genuinely delivered load arms it. This makes the interlock a
 * mechanism instead of a comment.
 *
 * KEYED ON THE LATCH ROW, NOT ON THE FLAG — deliberately. If the flag were consulted, turning
 * REVENUE_RECOGNITION_POST_ENABLED off AFTER a load had already earned would reopen the hole: the
 * Event 1 revenue is on the books whether or not the flag is still on. An active latch row is the
 * durable fact that the load's revenue is already recognized. More protective reading wins.
 *
 * REFUSE, never silently skip. A refusal surfaces as a named posting error (and in the backfill
 * sweep as a recorded failure with its message) — a visible, correctable exception. A silent skip
 * would leave an invoice looking posted while its GL effect lived somewhere else.
 *
 * Releasing the interlock is the LATCH's job: `is_active` is the latch's own liveness flag, so
 * deactivating the latch row when its journal entry is reversed both un-blocks this invoice and
 * lets the load re-recognize. That reconciliation is tracked separately — today a reversal leaves
 * the latch row active (proven on prod: load L-20260624-0083's two rows are still status='posted',
 * is_active=true after their 2026-08-01 owner-authorized reversal).
 */
export class InvoiceRevrecLatchOwnsLoadError extends PostingEngineError {
  source_load_id: string;

  constructor(sourceLoadId: string, invoiceLabel: string, detail?: string) {
    super(
      "INVOICE_REVREC_LATCH_OWNS_LOAD",
      detail ??
        `invoice_revrec_latch_owns_load: ${invoiceLabel} is sourced from load ${sourceLoadId}, which ` +
          `already carries an active accounting.load_revenue_recognition_postings row. That load's ` +
          `revenue and A/R are recognized by the DISP-01 two-event delivery latch; posting this ` +
          `invoice would credit revenue and debit A/R a second time. Refusing to post. If the latch ` +
          `entry was reversed, deactivate its latch row (is_active=false) — do not post around it.`
    );
    this.source_load_id = sourceLoadId;
  }
}

const REVREC_LATCH_REGCLASS = "accounting.load_revenue_recognition_postings";

/**
 * True when the load already has an active revenue-recognition latch row (either event).
 *
 * Event 1 duplicates the revenue credit; Event 2 duplicates the A/R debit — either one alone means
 * the invoice would double-post, so ANY active row blocks.
 *
 * `to_regclass` first: on an environment where migration 202609290000 has not been applied the latch
 * table does not exist, so no latch can have posted and there is nothing to double. Returning false
 * there is the correct answer, not a fail-open — the poster itself refuses with `latch_table_missing`
 * on that same environment, so the two are consistent.
 */
async function revrecLatchOwnsLoad(
  client: DbClient,
  operatingCompanyId: string,
  loadId: string
): Promise<boolean> {
  const present = await client.query<{ ok: boolean }>(`SELECT to_regclass($1::text) IS NOT NULL AS ok`, [
    REVREC_LATCH_REGCLASS,
  ]);
  if (!present.rows[0]?.ok) return false;

  const res = await client.query<{ id: string }>(
    `
      SELECT p.id::text
      FROM accounting.load_revenue_recognition_postings p
      WHERE p.operating_company_id = $1::uuid
        AND p.load_id = $2::uuid
        AND p.is_active
        AND ${STANDING_LATCH_JE_PREDICATE}
      LIMIT 1
    `,
    [operatingCompanyId, loadId]
  );
  return Boolean(res.rows[0]?.id);
}

/**
 * ACCT-F59 SECOND ARM — the load has REACHED delivery evidence, so the latch either has recognized it
 * or is about to, in this same request.
 *
 * WHY THIS EXISTS. `revrecLatchOwnsLoad` above asks "does a latch row exist YET?", which is a question
 * about the past. On the delivery transition the invoice posts FIRST and the latch posts SECOND, inside
 * one handler (`dispatch/loads.routes.ts`: convertProformaToOfficial -> sendDraftInvoice -> latchOn-
 * DeliveryEvidence). Measured on prod for load L-20260806-0008: the invoice JE landed at
 * 07:14:33.413711 and the latch's earn JE at 07:14:33.886651 — **473 ms later**. So the interlock ran,
 * honestly found no latch row, allowed the post, and `4000 Freight/Line-haul Income` was credited twice
 * for the same $1,875.50. Nothing was misconfigured and no guard was missing: the check was simply
 * one-directional — it blocked invoice-after-latch and was blind to latch-after-invoice.
 *
 * Asking "has this load reached delivery evidence?" is a question about the load's OWN state, which is
 * already true when the invoice posts. That makes the interlock ORDER-INDEPENDENT: reordering the
 * handler, adding a fourth delivery path, or posting the invoice a millisecond earlier can no longer
 * reopen the defect. Fixing the ordering alone would have left correctness resting on statement order in
 * one function — the next edit to that block silently undoes it.
 *
 * Reuses `isDeliveryEvidenceStatus` rather than re-listing the statuses: that helper is deliberately the
 * single definition of "delivered" shared by the office and driver paths, and duplicating it here is
 * exactly how the two would drift apart.
 */
async function loadReachedDeliveryEvidence(
  client: DbClient,
  operatingCompanyId: string,
  loadId: string
): Promise<boolean> {
  const res = await client.query<{ status: string | null }>(
    `
      SELECT l.status::text AS status
      FROM mdata.loads l
      WHERE l.operating_company_id = $1::uuid
        AND l.id = $2::uuid
        AND l.soft_deleted_at IS NULL
      LIMIT 1
    `,
    [operatingCompanyId, loadId]
  );
  const status = res.rows[0]?.status ?? null;
  return status ? isDeliveryEvidenceStatus(status) : false;
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
  // Reads the SAME array the type is derived from — the runtime check and the compile-time type can no
  // longer disagree.
  if (!(POSTING_SOURCE_TYPES as readonly string[]).includes(value)) {
    throw new PostingEngineError("UNKNOWN_SOURCE_TYPE", `Unknown source_transaction_type: ${value}`);
  }
}

function normalizeSourceType(value: string): PostingSourceType {
  const normalized = value.trim().toLowerCase();
  assertKnownSourceType(normalized);
  return normalized;
}

// ACCT-LINK-05: catalogs.posting_templates is a code-mirrored catalog (MUST 3.18.5.4) keyed by
// template_code. Every posting_batches row stamps source_template_code (the PostingSourceType code
// constant it was built from) unconditionally, and best-effort resolves posting_template_id when a
// matching active template row exists. LST-F03 made templates per-entity (`operating_company_id`) —
// resolve MUST filter the posting opco or a seeded row on entity A can stamp entity B's batch.
// Until the owner seeds catalogs.posting_templates this always returns null (0 rows on prod
// 2026-07-28 lucia) — expected, not an error; new batches self-resolve once seeded.
export async function resolvePostingTemplateId(
  client: DbClient,
  templateCode: string,
  operatingCompanyId: string
): Promise<string | null> {
  const res = await client.query<{ id: string }>(
    `SELECT id::text
       FROM catalogs.posting_templates
      WHERE template_code = $1
        AND operating_company_id = $2::uuid
        AND is_active = true
        AND deactivated_at IS NULL
      LIMIT 1`,
    [templateCode, operatingCompanyId]
  );
  return res.rows[0]?.id ?? null;
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
  repost_revision?: number | null;
}) {
  // ADDITIVE: appended ONLY for `repost`, so initial_post/reversal keys are byte-identical to before.
  const revisionSuffix = input.posting_purpose === "repost" ? [String(input.repost_revision ?? 1)] : [];
  return [
    "ih35:posting-mvp:v1",
    input.operating_company_id.toLowerCase(),
    input.source_transaction_type,
    input.source_transaction_id,
    input.source_transaction_line_id ?? "-",
    input.posting_purpose,
    ...revisionSuffix,
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

/**
 * ACCT-F345 — the cash account a DISBURSEMENT credits when the operator did not pick a source.
 *
 * WHY THIS IS NOT resolveCashLikeAccountForCompany. That helper returns undeposited_funds, then
 * cash_clearing. Both are RECEIPT-side clearing accounts — "money received, not yet deposited" — and
 * crediting one for money LEAVING the business is wrong by definition. On USMCA it drove
 * 1090 Undeposited Funds to a -$350.00 credit balance (a negative asset) and left the books claiming
 * $250 more at Bank of America than the bank actually held, so the bank reconciliation could not tie.
 *
 * AND ITS "FALLBACK" WAS NOT ONE: USMCA maps BOTH undeposited_funds AND cash_clearing to the SAME
 * account (1090). A two-tier chain where both tiers resolve identically offers the appearance of a
 * second chance and none of the substance — there was no configuration in which an un-sourced
 * disbursement could reach the real operating bank.
 *
 * FAILS CLOSED. Returns null when operating_bank is not designated, and every caller raises
 * ACCOUNT_MAPPING_MISSING. A refused post is recoverable in seconds; a silent post to the wrong
 * control account is the family that produced ACCT-F330, F331 and F333 — each found weeks later.
 * Never falls back to a clearing account: that is the defect, not a safety net.
 */
async function resolveDisbursementCashAccountForCompany(
  client: DbClient,
  operatingCompanyId: string
): Promise<string | null> {
  return resolveRoleAccountOptional(client, operatingCompanyId, "operating_bank");
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
  // BANK-ACCOUNT-HIDE: an account hidden for THIS entity resolves to no bridge, so the caller fails
  // closed rather than post to it (flag OFF by default — see docs/accounting/BANK-ACCOUNT-ENTITY-HIDE-DESIGN.md).
  const hideOn = await isBankAccountHideEnabled(client, operatingCompanyId);
  const res = await client.query<{ ledger_account_id: string | null }>(
    `
      SELECT ledger_account_id::text AS ledger_account_id
      FROM banking.bank_accounts
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
        ${bankAccountHiddenFilterSql(hideOn, "banking.bank_accounts")}
      LIMIT 1
    `,
    [bankAccountId, operatingCompanyId]
  );
  return res.rows[0]?.ledger_account_id ?? null;
}

// ACCT-F5653 — a caller-supplied credit_account_id (the operator's chosen source/bank account at
// approve/disburse time — cash-advance approve, driver-advance disburse, driver-reimbursement
// immediate pay) previously went straight into a journal_entry_postings.account_id write with NO
// check that it belongs to THIS company's chart of accounts. accounting.journal_entry_postings'
// account_id FK to catalogs.accounts is a single-column FK (migration 0092), not a composite
// (operating_company_id, account_id) constraint, so nothing at the schema level stops a UUID
// belonging to a DIFFERENT entity's chart of accounts from being posted under this entity's
// operating_company_id — catalogs.accounts' own FORCE RLS only guards direct reads/writes of that
// table, never FK references made from a foreign INSERT. A cross-entity (or simply mistyped/stale)
// UUID here would silently attribute a dollar amount to another entity's GL account, or render a
// foreign account's name/number on this entity's own JE preview/GL screens. Mirrors
// resolveBankLedgerAccountId's own operating_company_id-scoped lookup immediately above — fail
// closed on no match, never silently substitute or accept.
async function verifyCreditAccountBelongsToCompany(
  client: DbClient,
  operatingCompanyId: string,
  creditAccountId: string
): Promise<string> {
  const res = await client.query<{ id: string }>(
    `SELECT id::text FROM catalogs.accounts WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1`,
    [creditAccountId, operatingCompanyId]
  );
  if (!res.rows[0]?.id) {
    throw new PostingEngineError(
      "CREDIT_ACCOUNT_CROSS_ENTITY",
      `credit_account_id ${creditAccountId} does not resolve to a catalogs.accounts row owned by ` +
        `operating_company_id=${operatingCompanyId} — refusing to post a caller-supplied account that ` +
        `does not exist or belongs to a different entity.`
    );
  }
  return res.rows[0].id;
}

/**
 * Customer payment deposit GL resolver.
 * Values historically written into accounting.payments.deposited_to_account_id include:
 * - catalogs.accounts.id (correct — posting debit)
 * - banking.bank_accounts.id (legacy customer-payments path — bridge via ledger_account_id)
 * - free-text "ops_checking" (broken slug — never a GL id)
 * Fail soft to undeposited_funds / cash_clearing so historical rows can still post.
 */
export async function resolveCustomerPaymentDepositAccount(
  client: DbClient,
  operatingCompanyId: string,
  depositedTo: string | null | undefined
): Promise<string | null> {
  const raw = depositedTo?.trim() || null;
  if (!raw || raw === "ops_checking") {
    return resolveCashLikeAccountForCompany(client, operatingCompanyId);
  }

  const uuidOk = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw);
  if (!uuidOk) {
    return resolveCashLikeAccountForCompany(client, operatingCompanyId);
  }

  const coa = await client.query<{ id: string }>(
    `
      SELECT id::text AS id
      FROM catalogs.accounts
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
        AND deactivated_at IS NULL
        -- is_postable: a non-postable HEADER account (e.g. a parent roll-up) must never become the
        -- debit leg. A historical row pointing at one now falls through to the bank bridge and then
        -- to the undeposited_funds / cash_clearing role, both of which enforce postability.
        AND is_postable = true
      LIMIT 1
    `,
    [raw, operatingCompanyId]
  );
  if (coa.rows[0]?.id) return coa.rows[0].id;

  const bankLedger = await resolveBankLedgerAccountId(client, operatingCompanyId, raw);
  if (bankLedger) return bankLedger;

  return resolveCashLikeAccountForCompany(client, operatingCompanyId);
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
  // Source-level posting/reversal batches always use a NULL line component. posting_purpose already
  // distinguishes initial vs reversal. Using sourceId here only for reversal made the pre-check key
  // differ from the key inserted below (which uses NULL), defeating retry/concurrency idempotency.
  const lineId = null;
  const key = buildPostingMvpIdempotencyKey({
    operating_company_id: operatingCompanyId,
    source_transaction_type: sourceType,
    source_transaction_id: sourceId,
    source_transaction_line_id: lineId,
    posting_purpose: postingPurpose,
  });
  return getExistingPostingResultByIdempotencyKey(client, operatingCompanyId, key, postingPurpose, sourceType, sourceId);
}

/**
 * ACCT-F212 — does this source document carry the SAMPLE flag?
 *
 * Every journal entry the canonical poster writes inherits the sample flag of the document it posts.
 * Without this, a SAMPLE invoice (tagged) produced a REAL journal entry, so the subledger and the
 * ledger disagreed about the same transaction: the invoice was excluded from a real-money report while
 * its own GL lines were counted. That is the ACCT-F211 contradiction on the main posting path rather
 * than the void path, and it reaches far more rows.
 *
 * ONLY the five source types whose tables actually carry is_sample_data are mapped — verified on prod
 * (migration 202612370000). Everything else returns false rather than guessing: a fuel event or a bank
 * categorisation has no sample column, and inventing one would be fabricating a financial
 * classification. Defaulting false keeps real books real, which is the safe direction here because the
 * poster's output is the ledger itself.
 */
export const SAMPLE_TAGGED_SOURCE_TABLES: Partial<Record<PostingSourceType, string>> = {
  invoice: "accounting.invoices",
  bill: "accounting.bills",
  expense: "accounting.expenses",
  bill_payment: "accounting.bill_payments",
  customer_payment: "accounting.payments",
};

// ACCT-F353 stage 2 — exported so the JE writers OUTSIDE the canonical poster (void reversals,
// amortization, settlement-posting, fuel-overage, period-close, bank-recon-match) can derive the
// SAME sample flag from a source row that DOES carry it, rather than each reinventing this lookup
// (or worse, silently defaulting false for a document type that actually has the column).
export async function readSourceIsSampleData(
  client: DbClient,
  operatingCompanyId: string,
  sourceType: PostingSourceType,
  sourceId: string
): Promise<boolean> {
  const table = SAMPLE_TAGGED_SOURCE_TABLES[sourceType];
  if (!table) return false;
  const res = await client.query<{ is_sample_data: boolean }>(
    `
      SELECT COALESCE(is_sample_data, false) AS is_sample_data
      FROM ${table}
      WHERE id = $1::uuid AND operating_company_id = $2::uuid
      LIMIT 1
    `,
    [sourceId, operatingCompanyId]
  );
  return res.rows[0]?.is_sample_data === true;
}

async function createJournalEntryHeader(
  client: DbClient,
  operatingCompanyId: string,
  entryDate: string,
  memo: string,
  createdByUserId: string,
  isSampleData: boolean
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
        is_sample_data,
        created_at,
        updated_at
      )
      VALUES ($1::uuid, $2::date, $3, 'posted', 'auto', $4::uuid, true, $5, now(), now())
      RETURNING id::text
    `,
    [operatingCompanyId, entryDate, memo, createdByUserId, isSampleData]
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
    source_system: string | null;
  }>(
    `
      SELECT
        id::text,
        status::text,
        issue_date::text,
        total_cents::bigint AS total_cents,
        tax_cents::bigint AS tax_cents,
        display_id,
        source_load_id::text,
        source_system::text
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
  // Parallel books: QBO-origin invoices already have A/R + revenue in QBO. Posting them here would
  // create duplicate journal entries. Mirror the bill/payment refuse pattern.
  if ((invoice.source_system ?? "").toLowerCase() === "qbo") {
    throw new PostingEngineError(
      "QBO_INVOICE_POST_GL_REFUSED",
      "Refusing Invoice\u2192GL post for source_system=qbo \u2014 parallel books; QBO already holds this A/R + revenue. Do not invent a second TMS journal entry."
    );
  }
  if (!INVOICE_ELIGIBLE_STATUSES.has(invoice.status)) {
    throw new PostingEngineError(
      "INVOICE_NOT_POSTING_ELIGIBLE",
      `Invoice status ${invoice.status} is not posting-eligible`
    );
  }

  // ACCT-F59 — refuse before resolving any account: if the DISP-01 latch already recognized this
  // load, the invoice's A/R + revenue legs are already on the books and posting again doubles both.
  //
  // TWO ARMS, deliberately. The first asks whether a latch row exists YET (invoice-after-latch). The
  // second asks whether the LOAD has reached delivery evidence at all (latch-after-invoice) — the
  // 473 ms race that put $1,875.50 of duplicate revenue on prod. Only the second arm is
  // order-independent; see loadReachedDeliveryEvidence above.
  if (invoice.source_load_id) {
    const latchOwns = await revrecLatchOwnsLoad(client, operatingCompanyId, invoice.source_load_id);
    const delivered = latchOwns
      ? false
      : await loadReachedDeliveryEvidence(client, operatingCompanyId, invoice.source_load_id);
    if (latchOwns || delivered) {
      throw new InvoiceRevrecLatchOwnsLoadError(
        invoice.source_load_id,
        invoice.display_id ? `Invoice ${invoice.display_id}` : `Invoice ${sourceId}`,
        latchOwns
          ? undefined
          : `invoice_revrec_latch_owns_load: ${
              invoice.display_id ? `Invoice ${invoice.display_id}` : `Invoice ${sourceId}`
            } is sourced from load ${invoice.source_load_id}, which has REACHED DELIVERY EVIDENCE. The ` +
            `DISP-01 two-event latch owns this load's revenue and A/R; it posts later in the same ` +
            `delivery transition, so a latch row may not exist yet at this instant. Posting this ` +
            `invoice would credit revenue a second time 473ms before the latch does. Refusing to post. ` +
            `The invoice's A/R belongs to latch Event 2 (DR A/R / CR Unbilled) — do not post around it.`
      );
    }
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
        AND it.operating_company_id = $2::uuid
        AND it.deactivated_at IS NULL
      LEFT JOIN catalogs.accounts itm
        ON itm.id = it.default_income_account_id
        AND itm.operating_company_id = $2::uuid
        AND itm.deactivated_at IS NULL
        AND itm.is_postable = true
        -- REVENUE MUST CREDIT AN INCOME ACCOUNT. catalogs.items.default_income_account_id is not
        -- type-constrained, and on prod at least one TRANSP item ("Driver Deduction-Escrow for
        -- Claims") points it at a LIABILITY (2026-Damage Claim Escrow). For a driver DEDUCTION that
        -- credit is correct — escrow is a liability — but this is the INVOICE revenue resolver, so if
        -- that item ever lands on a customer invoice the poster would credit a liability as revenue:
        -- income understated, liabilities overstated, and nothing raised. Restricting the join makes
        -- the account unresolvable instead, which routes to the existing fail-closed error naming the
        -- line — a refusal a human can act on, rather than a silent misclassification.
        AND itm.account_type IN ('Income', 'Revenue', 'OtherIncome')
      WHERE il.invoice_id = $1::uuid
        -- ACCT-F5655 — void-not-delete means a soft-deleted line STAYS in accounting.invoice_lines
        -- carrying its original amount. recomputeInvoiceTotals (shared.ts, ACCT-F156) already excludes
        -- soft-deleted lines from invoices.total_cents, but this poster read the same table without
        -- that predicate — so a line removed from a draft invoice before it was sent/posted would still
        -- be booked to revenue and A/R here, permanently overstating both by the removed line's amount
        -- (the JE is internally balanced, so assertBalanced and the DB trigger both pass; nothing else
        -- catches the divergence from the invoice's own total). Zero soft-deleted invoice lines exist
        -- today (matching shared.ts's own "armed but not yet fired" note), so this has never produced a
        -- wrong number — applying the SAME already-decided exclusion this poster simply missed.
        AND il.soft_deleted_at IS NULL
      ORDER BY il.display_order ASC, il.id ASC
    `,
    [sourceId, operatingCompanyId]
  );

  // P-INVOICE P0 (#3177): load-revenue lines fail closed without source_load_id (Law §9 load hop).
  try {
    assertLoadRevenueHasSourceLoad(invoice.source_load_id, lineRows.rows);
  } catch (err) {
    if (err instanceof SharedInvoiceLoadSourceError) {
      throw new InvoiceLoadSourceRequiredError(err.message);
    }
    throw err;
  }

  // LV-JE-MEMO-RECORD-NOT-VISIBLE — same class as buildBillLines/buildExpenseLines: this is the
  // PERMANENT JE memo text (see `memo: \`${descriptionBase} posting\`` below), not an error message —
  // unlike the InvoiceRevrecLatchOwnsLoadError uses of `Invoice ${sourceId}` above, which are thrown
  // diagnostics, not stored data. journal-entries.service.ts's list resolver ties this JE to its
  // invoice via journal_entry_postings.source_transaction_id, not memo text, so an honest "Invoice"
  // with no id is strictly better than a raw UUID nobody can read.
  const descriptionBase = invoice.display_id ? `Invoice ${invoice.display_id}` : "Invoice";
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
      // HARD FAIL — no default. Refuse to post revenue to a generic / invented account.
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
    source_system: string | null;
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
        revoked_at::text,
        source_system::text
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
  // LV-060 — A DRAFT IS NOT A LIABILITY YET.
  //
  // This guard refused voided bills and stopped there, so a bill still in `draft` posted happily.
  // It happened: bill f8f8e5a4-8c66-4d16-a4c9-44beff6b79e2 (TRK, $25.00, auto-created from work order
  // WO-TEST-TRUCK-1-IS-08-03-2026-0001) is status='draft' on prod with TWO transaction_source_links —
  // DR Repair & Maintenance / CR Accounts Payable — and a NULL bill_number. The books therefore carry
  // an expense and an A/P liability for a document nobody finalised and that has no number to cite.
  //
  // Draft is the state where amounts, the vendor and the account mapping can all still change. Posting
  // it recognises an obligation that may never exist, and correcting it later needs a reversing entry
  // for money that should not have moved.
  //
  // Safe to enforce, measured rather than assumed (prod 2026-08-05): of the 5 TMS-native bills, the 3
  // `unpaid` and 1 `paid` are all posted and all finalised; exactly ONE `draft` is posted — this
  // defect. No legitimate posting path depends on posting a draft.
  if (bill.status === "draft") {
    throw new PostingEngineError(
      "BILL_NOT_POSTING_ELIGIBLE",
      "Draft bill is not posting-eligible — a draft is not yet an approved liability. Finalise the bill (its amounts, vendor and account mapping can still change) before posting to the ledger."
    );
  }
  // Parallel books: QBO-origin bills already have A/P economics in QBO. Projecting Line[] into
  // accounting.bill_lines must NOT unlock a second TMS JE via post-gl (BILL_GL_POSTING_ENABLED is ON
  // for live entities). Mirror the JE-push refuse pattern — clone/reconcile only, never invent GL.
  if ((bill.source_system ?? "").toLowerCase() === "qbo") {
    throw new PostingEngineError(
      "QBO_BILL_POST_GL_REFUSED",
      "Refusing Bill→GL post for source_system=qbo — parallel books; QBO already holds this A/P. Do not invent a second TMS journal entry."
    );
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
        AND bl.voided_at IS NULL
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
  // LV-JE-MEMO-RECORD-NOT-VISIBLE — same fix as buildExpenseLines' label below: bill_number is
  // 96.6% populated live (ACCT-F5708), but the rare null case previously baked the raw bill UUID into
  // the permanent JE memo. journal-entries.service.ts's list resolver ties this JE to its bill via
  // journal_entry_postings.source_transaction_id, not memo text, so an honest "Bill" with no id is
  // strictly better than a raw UUID.
  const billLabel = bill.bill_number ? `Bill ${bill.bill_number}` : "Bill";
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
    qbo_purchase_id: string | null;
  }>(
    `
      SELECT id::text, status::text, posting_status::text, transaction_date::text,
             total_amount_cents::bigint, payment_account_uuid::text, vendor_uuid::text, memo, expense_number,
             qbo_purchase_id::text
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
  // Parallel books: a QBO-origin expense (projected from a QBO Purchase — qbo_purchase_id set) already
  // has its GL economics in QuickBooks. It is projected into accounting.expenses as SUBLEDGER ONLY
  // (posting_status='unposted'). Refuse to build a second TMS journal entry for it — mirrors the
  // buildBillLines QBO_BILL_POST_GL_REFUSED guard. Never invent GL for source_system=qbo.
  if ((exp.qbo_purchase_id ?? "").trim() !== "") {
    throw new PostingEngineError(
      "EXPENSE_POST_GL_REFUSED",
      "Refusing Expense→GL post for a QBO-origin expense (qbo_purchase_id set) — parallel books; QBO already holds this spend's GL. Do not invent a second TMS journal entry."
    );
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

  // LV-JE-MEMO-RECORD-NOT-VISIBLE — expense_number is NULL by design for driverless/unattributed
  // expenses (no load to scope a load-scoped number to; see expenses.routes.ts + migration
  // 202608131400's header). The old ${sourceId} fallback baked the raw expense UUID straight into the
  // permanent JE memo text for every one of those rows. journal-entries.service.ts's list resolver
  // already ties this JE to its expense via journal_entry_postings.source_transaction_id (not memo
  // text), so the memo itself no longer needs to carry an identifier for display to work — an honest
  // "Expense" with no id is strictly better than a raw UUID nobody can read.
  const label = exp.expense_number ? `Expense ${exp.expense_number}` : "Expense";
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
    source_system: string | null;
    qbo_payment_id: string | null;
  }>(
    `
      SELECT id::text, payment_date::text, amount_cents::bigint, display_id, deposited_to_account_id, voided_at::text,
             source_system::text, qbo_payment_id
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

  // Parallel books: a QBO-origin customer payment (projected from a QBO Payment — qbo_payment_id set)
  // already has its GL recorded IN QuickBooks. Posting it here would invent a second TMS journal entry
  // for a receipt QuickBooks already owns — refuse (mirrors QBO_BILL_PAYMENT_POST_GL_REFUSED /
  // EXPENSE_POST_GL_REFUSED). Never invent GL for source_system=qbo.
  if ((payment.source_system ?? "").toLowerCase() === "qbo" || (payment.qbo_payment_id ?? "").trim() !== "") {
    throw new PostingEngineError(
      "QBO_CUSTOMER_PAYMENT_POST_GL_REFUSED",
      "Refusing Customer Payment→GL post for a QBO-origin payment (source_system=qbo / qbo_payment_id set) — parallel books; QBO already holds this receipt's GL. Do not invent a second TMS journal entry."
    );
  }

  const arAccountId = await resolveArAccountForCompany(client, operatingCompanyId);
  if (!arAccountId) throw new PostingEngineError("ACCOUNT_MAPPING_MISSING", "AR account mapping is missing");

  // Resolve deposit GL: catalogs.accounts UUID, OR banking.bank_accounts.id → ledger_account_id,
  // OR legacy slug "ops_checking" / blank → undeposited_funds / cash_clearing. Never post a slug.
  let debitCashAccount = await resolveCustomerPaymentDepositAccount(
    client,
    operatingCompanyId,
    payment.deposited_to_account_id
  );
  if (!debitCashAccount) throw new PostingEngineError("ACCOUNT_MAPPING_MISSING", "Cash account mapping is missing");

  // LV-JE-MEMO-RECORD-NOT-VISIBLE — see buildBillLines/buildExpenseLines: honest "Customer payment"
  // with no id beats baking the raw payment UUID into the permanent JE memo.
  const label = payment.display_id ? `Customer payment ${payment.display_id}` : "Customer payment";
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
    cc_account_id: string | null;
    revoked_at: string | null;
    status: string;
    settlement_deduction_noncash: boolean | null;
  }>(
    `
      SELECT
        id::text,
        bill_id::text,
        payment_date::text,
        amount_cents::bigint,
        amount::text,
        from_bank_account_id::text,
        cc_account_id::text,
        revoked_at::text,
        status::text,
        COALESCE(settlement_deduction_noncash, false) AS settlement_deduction_noncash
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
  // SETTLEMENT-BILL-PAYMENT: a non-cash settlement DEDUCTION bill_payment (advance repaid / escrow
  // withheld — from_bank_account_id NULL) exists ONLY to close its bill's A/P in the subledger. Its GL
  // is OWNED by the settlement deduction JE (Dr A/P / Cr the driver's own sub-account). Posting it here
  // (Dr A/P / Cr bank) would double-reduce A/P and credit cash it never touched — refuse (skip).
  if (payment.settlement_deduction_noncash === true) {
    throw new PostingEngineError(
      "PAYMENT_NOT_POSTING_ELIGIBLE",
      "Non-cash settlement-deduction bill payment — GL is owned by the settlement deduction JE; not independently posting-eligible"
    );
  }

  // Parallel books: QBO-origin bills never get a TMS Bill→GL leg (#3386 QBO_BILL_POST_GL_REFUSED).
  // Paying them must NOT invent a TMS bill_payment JE either — that would DR ap_control with no matching
  // TMS CR (BILL_AP_NOT_POSTED) or invent a second cash/AP story already in QBO. Subledger payment stands;
  // refuse GL here so payBill can skip without rolling back the payment row.
  if (!payment.bill_id) {
    throw new PostingEngineError("BILL_AP_NOT_POSTED", "Bill payment has no bill_id; cannot verify the bill's A/P leg is posted");
  }
  const billSrcRes = await client.query<{ source_system: string | null; bill_number: string | null }>(
    `
      SELECT source_system::text, bill_number
      FROM accounting.bills
      WHERE operating_company_id = $1::uuid
        AND id::text = $2
      LIMIT 1
    `,
    [operatingCompanyId, payment.bill_id]
  );
  if ((billSrcRes.rows[0]?.source_system ?? "").toLowerCase() === "qbo") {
    throw new PostingEngineError(
      "QBO_BILL_PAYMENT_POST_GL_REFUSED",
      "Refusing BillPayment→GL post for source_system=qbo — parallel books; QBO already holds this A/P settlement. TMS records the subledger payment only."
    );
  }

  // CHAIN-04 GAP #3 — accrual-sequencing guard (bill-posted-first). The payment JE always does
  // DR ap_control / CR bank, which ASSUMES CHAIN-03 already posted DR expense / CR ap_control for
  // this bill. If the bill's A/P leg was never posted, debiting ap_control here has no matching
  // credit -> A/P goes NEGATIVE and the QBO A/P tie-out breaks. Refuse to post; NEVER post an A/P
  // leg from the payment path (design doc §10-A open decision #2 = enforce bill-posted-first).
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
  // bank has no ledger_account_id.
  // CC-PAYMENT GAP FIX — a bill paid BY CREDIT CARD (bill-payments/cc-payment.routes.ts) carries
  // cc_account_id instead of from_bank_account_id: cc_account_id is already a catalogs.accounts id (the
  // route validates it is an active credit-card-type account before the insert), so credit it directly —
  // no bridge lookup needed. Dr ap_control / Cr the CC-liability account.
  // When the payment carries NEITHER (e.g. a cash payment recorded without a bank), keep the
  // company-default cash-like fallback (mirrors buildCustomerPaymentLines' deposited_to_account_id-then-
  // cash-like resolution).
  let cashAccountId: string | null;
  let creditRole: "bank" | "cc" | "operating_bank";
  if (payment.from_bank_account_id) {
    cashAccountId = await resolveBankLedgerAccountId(client, operatingCompanyId, payment.from_bank_account_id);
    if (!cashAccountId) {
      throw new PostingEngineError(
        "ACCOUNT_MAPPING_MISSING",
        `Bank ledger account mapping is missing (banking.bank_accounts.ledger_account_id) for from_bank_account_id ${payment.from_bank_account_id}`
      );
    }
    creditRole = "bank";
  } else if (payment.cc_account_id) {
    cashAccountId = payment.cc_account_id;
    creditRole = "cc";
  } else {
    // ACCT-F345 — last-resort bill-payment credit is operating_bank, never receipt-side clearing.
    // Function-level (not file-level): customer payments may still call resolveCashLikeAccountForCompany.
    // Live 2026-08-28: USMCA e8010d5a $1,200 and e12d04d9 $150 unreversed CR 1090; 8122d6e8 reversed;
    // TRANSP dcbe5700 $5 CR QBO-168. Owner: TRANSP WF …6103 / QBO-1150040141 is operating bank.
    cashAccountId = await resolveDisbursementCashAccountForCompany(client, operatingCompanyId);
    if (!cashAccountId) {
      throw new PostingEngineError(
        "ACCOUNT_MAPPING_MISSING",
        `operating_bank is not bound for operating_company_id=${operatingCompanyId} — refusing to credit undeposited_funds/cash_clearing on a bill payment outflow`
      );
    }
    creditRole = "operating_bank";
  }

  const amount = Number(payment.amount_cents ?? Math.round(Number(payment.amount ?? "0") * 100));
  // JE-MEMO-STORES-RAW-UUID-AT-POSTER — name the bill, not the payment's own uuid. billSrcRes is
  // already fetched above for the source_system check; bill_number rides along for free.
  const billNumber = billSrcRes.rows[0]?.bill_number;
  const label = billNumber ? `Bill payment for bill ${billNumber}` : "Bill payment";
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
        description: `${label} ${creditRole === "cc" ? "CC liability" : "cash"}`,
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
    display_id: string | null;
    from_bank_account_id: string | null;
  }>(
    `
      SELECT
        id::text,
        requested_amount_cents::bigint,
        status::text,
        COALESCE(reviewed_at, submitted_at, created_at)::date::text AS posting_date,
        display_id,
        from_bank_account_id::text
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

  // ACCT-F5687 — same precedence as buildDriverAdvanceLines' CHAIN-04 fix (ACCT-F358): an explicit
  // caller-supplied credit_account_id still overrides, THEN the request's own from_bank_account_id
  // resolves via the bank->GL bridge (banking.bank_accounts.ledger_account_id) — fail LOUD if that
  // bank has no bridge, never a silent clearing-account fallback — and only when the request names
  // no bank at all does the ACCT-F345 fail-closed company default apply.
  let creditAccount: string | null;
  if (creditAccountId) {
    // ACCT-F5653 — validate a caller-supplied credit_account_id belongs to THIS company's chart of
    // accounts before it is ever written into journal_entry_postings; see verifyCreditAccountBelongsToCompany.
    creditAccount = await verifyCreditAccountBelongsToCompany(client, operatingCompanyId, creditAccountId);
  } else if (request.from_bank_account_id) {
    creditAccount = await resolveBankLedgerAccountId(client, operatingCompanyId, request.from_bank_account_id);
    if (!creditAccount) {
      throw new PostingEngineError(
        "ACCOUNT_MAPPING_MISSING",
        `Bank ledger account mapping is missing (banking.bank_accounts.ledger_account_id) for from_bank_account_id ${request.from_bank_account_id}`
      );
    }
  } else {
    creditAccount = await resolveDisbursementCashAccountForCompany(client, operatingCompanyId);
    if (!creditAccount) {
      throw new PostingEngineError("ACCOUNT_MAPPING_MISSING", "Cash account mapping for cash advance is missing");
    }
  }

  const amount = Number(request.requested_amount_cents);
  // JE-MEMO-STORES-RAW-UUID-AT-POSTER — name the request, not its own uuid.
  const label = request.display_id ? `Cash advance ${request.display_id}` : "Cash advance";
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
    from_bank_account_id: string | null;
    display_id: string | null;
  }>(
    `
      SELECT
        id::text,
        amount::text,
        disbursement_status::text,
        posting_date::text,
        disbursed_at::text,
        created_at::text,
        from_bank_account_id::text,
        display_id
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

  // CLS-CASH-OUT-CREDITS-CLEARING-ACCOUNT / LV-ADVANCE-CREDITS-UNDEPOSITED-NOT-THE-BANK — this used to
  // be `creditAccountId ?? resolveDisbursementCashAccountForCompany(...)`, so an advance that named its
  // own from_bank_account_id (stamped at create time) was IGNORED at post time; the credit landed on a
  // company-default account instead of the bank the money actually left, and the bank's own cache was
  // never decremented. Precedence now matches buildBillPaymentLines' CHAIN-04 shape: an explicit
  // caller-supplied credit_account_id still overrides (the disburse route's own operator choice at
  // disbursement time), THEN the advance's own from_bank_account_id resolves via the SAME bank->GL
  // bridge (banking.bank_accounts.ledger_account_id) every other bank-facing poster uses — fail LOUD if
  // that bank has no bridge, never silently fall through to a clearing account. Only when the advance
  // names no bank at all does the existing ACCT-F345 fail-closed company fallback apply.
  let creditAccount: string | null;
  if (creditAccountId) {
    // ACCT-F5653 — validate the caller-supplied credit_account_id belongs to THIS company's chart of
    // accounts before it is written into journal_entry_postings; see verifyCreditAccountBelongsToCompany.
    creditAccount = await verifyCreditAccountBelongsToCompany(client, operatingCompanyId, creditAccountId);
  } else if (advance.from_bank_account_id) {
    creditAccount = await resolveBankLedgerAccountId(client, operatingCompanyId, advance.from_bank_account_id);
    if (!creditAccount) {
      throw new PostingEngineError(
        "ACCOUNT_MAPPING_MISSING",
        `Bank ledger account mapping is missing (banking.bank_accounts.ledger_account_id) for from_bank_account_id ${advance.from_bank_account_id}`
      );
    }
  } else {
    creditAccount = await resolveDisbursementCashAccountForCompany(client, operatingCompanyId);
    if (!creditAccount) {
      throw new PostingEngineError("ACCOUNT_MAPPING_MISSING", "Cash account mapping for driver advance is missing");
    }
  }

  // posting_date is the user-settable book date; fall back to disbursed_at / created_at.
  const postingDate =
    advance.posting_date ??
    (advance.disbursed_at ? advance.disbursed_at.slice(0, 10) : advance.created_at.slice(0, 10));
  // amount is numeric(10,2) dollars → cents for the ledger.
  const amountCents = Math.round(Number(advance.amount) * 100);
  // JE-MEMO-STORES-RAW-UUID-AT-POSTER — name the advance, not its own uuid.
  const label = advance.display_id ? `Driver advance ${advance.display_id}` : "Driver advance";
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

// Driver REIMBURSEMENT immediate pay-out — the OPPOSITE of a driver advance. A reimbursement is money the
// COMPANY owes the DRIVER for out-of-pocket tolls/fuel, paid IMMEDIATELY (no settlement needed). Balanced JE:
//   DEBIT  reimbursement_expense  (role-mapped; same role the settlement poster uses for the aggregate leg)
//   CREDIT the operator-chosen source/bank account (creditAccountId) or the company-default cash-like account.
// Reads driver_finance.driver_reimbursements directly; posts only when status='paid' (the service flips it
// first, then posts — mirrors the two-phase driver_advance disburse). NO new GL math — the standard
// two-leg cash↔expense structure through the same spine as every other source type.
async function buildDriverReimbursementLines(
  client: DbClient,
  operatingCompanyId: string,
  sourceId: string,
  creditAccountId: string | null
): Promise<PostingDraft> {
  const reimbRes = await client.query<{
    id: string;
    amount_cents: string;
    status: string;
    reimbursement_type: string;
    posting_date: string | null;
    paid_at: string | null;
    created_at: string;
    from_bank_account_id: string | null;
  }>(
    `
      SELECT id::text, amount_cents::text, status::text, reimbursement_type::text,
             posting_date::text, paid_at::text, created_at::text, from_bank_account_id::text
      FROM driver_finance.driver_reimbursements
      WHERE operating_company_id = $1::uuid AND id::text = $2
      LIMIT 1
      FOR UPDATE
    `,
    [operatingCompanyId, sourceId]
  );
  const reimb = reimbRes.rows[0];
  if (!reimb) throw new PostingEngineError("SOURCE_NOT_FOUND", "Driver reimbursement not found");
  if (reimb.status !== "paid") {
    throw new PostingEngineError(
      "ADVANCE_NOT_POSTING_ELIGIBLE",
      `Driver reimbursement is not posting-eligible (status=${reimb.status}; must be 'paid')`
    );
  }

  // reimbursement_expense is resolved via the CoA-roles resolver: PRIMARY accounting.chart_of_accounts_roles
  // first, then the legacy catalogs.account_role_bindings binding as a fallback tier (the same account the
  // settlement poster resolves for its aggregate reimbursement leg) — entity-pinned, so an immediate
  // pay-out and a settlement-close pay-out hit the SAME expense account.
  const debitAccountId = await resolveRoleAccountOptional(client, operatingCompanyId, "reimbursement_expense");
  if (!debitAccountId) {
    throw new PostingEngineError("ACCOUNT_MAPPING_MISSING", "No 'reimbursement_expense' role designation for driver reimbursement");
  }
  // ACCT-F5687 — same precedence as buildDriverAdvanceLines' CHAIN-04 fix (ACCT-F358): an explicit
  // caller-supplied credit_account_id still overrides, THEN the reimbursement's own
  // from_bank_account_id resolves via the bank->GL bridge — fail LOUD if that bank has no bridge,
  // never a silent clearing-account fallback — and only when the reimbursement names no bank at all
  // does the ACCT-F345 fail-closed company default apply.
  let creditAccount: string | null;
  if (creditAccountId) {
    // ACCT-F5653 — validate a caller-supplied credit_account_id belongs to THIS company's chart of
    // accounts before it is ever written into journal_entry_postings; see verifyCreditAccountBelongsToCompany.
    creditAccount = await verifyCreditAccountBelongsToCompany(client, operatingCompanyId, creditAccountId);
  } else if (reimb.from_bank_account_id) {
    creditAccount = await resolveBankLedgerAccountId(client, operatingCompanyId, reimb.from_bank_account_id);
    if (!creditAccount) {
      throw new PostingEngineError(
        "ACCOUNT_MAPPING_MISSING",
        `Bank ledger account mapping is missing (banking.bank_accounts.ledger_account_id) for from_bank_account_id ${reimb.from_bank_account_id}`
      );
    }
  } else {
    creditAccount = await resolveDisbursementCashAccountForCompany(client, operatingCompanyId);
    if (!creditAccount) {
      throw new PostingEngineError("ACCOUNT_MAPPING_MISSING", "Cash account mapping for driver reimbursement is missing");
    }
  }

  const postingDate =
    reimb.posting_date ?? (reimb.paid_at ? reimb.paid_at.slice(0, 10) : reimb.created_at.slice(0, 10));
  const amountCents = Math.round(Number(reimb.amount_cents));
  // JE-MEMO-STORES-RAW-UUID-AT-POSTER — driver_reimbursements has no display_id/number column
  // (verified live against prod information_schema), so a per-document identifier still has to come
  // from the id — but the TYPE is real, readable information a bare uuid alone never carried, and
  // keeping a short id suffix (not the full uuid) preserves per-row uniqueness for a memo that would
  // otherwise collide across every reimbursement of the same type.
  const label = reimb.reimbursement_type
    ? `Driver reimbursement (${reimb.reimbursement_type}) ${sourceId.slice(0, 8)}`
    : `Driver reimbursement ${sourceId.slice(0, 8)}`;
  return {
    postingDate,
    memo: `${label} posting`,
    lines: [
      {
        account_id: debitAccountId,
        debit_or_credit: "debit",
        amount_cents: amountCents,
        description: `${label} (${reimb.reimbursement_type})`,
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
    description: string | null;
  }>(
    `
      SELECT
        bt.id::text,
        bt.status::text,
        bt.is_credit,
        bt.amount_cents::bigint AS amount_cents,
        bt.transaction_date::text AS transaction_date,
        bt.categorization_gl_account_id::text AS categorization_gl_account_id,
        ba.ledger_account_id::text AS bank_ledger_account_id,
        bt.description
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

  // JE-MEMO-STORES-RAW-UUID-AT-POSTER — name the transaction by its own bank-statement description
  // (real information), not its uuid. Truncated + a short id suffix: descriptions repeat across many
  // rows (e.g. "Wire Transfer Fee"), so the suffix keeps the memo unique per transaction.
  const txnDescription = (txn.description ?? "").trim();
  const label = txnDescription
    ? `Bank categorization: ${txnDescription.slice(0, 60)} ${sourceId.slice(0, 8)}`
    : "Bank categorization";
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

// BANKING-GL-COMPLETION — resolve one transfer LEG (from_account_id/to_account_id + its kind) to the GL
// account that leg actually posts against. "bank" legs go through the SAME bank->GL bridge
// (banking.bank_accounts.ledger_account_id) every other bank-facing poster uses (resolveBankLedgerAccountId
// — CHAIN-04's bridge, no new lookup). "cc"/"coa" legs are ALREADY a catalogs.accounts id at transfer-create
// time (transfers.service.ts's validateAccountOwnership only ever validates non-"bank" kinds against
// catalogs.accounts — never banking.bank_accounts), so re-validate it is still active and use it directly.
async function resolveTransferLegAccountId(
  client: DbClient,
  operatingCompanyId: string,
  accountId: string,
  accountKind: "bank" | "cc" | "coa"
): Promise<string | null> {
  if (accountKind === "bank") {
    return resolveBankLedgerAccountId(client, operatingCompanyId, accountId);
  }
  const res = await client.query<{ id: string }>(
    `
      SELECT id::text
      FROM catalogs.accounts
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
        AND deactivated_at IS NULL
      LIMIT 1
    `,
    [accountId, operatingCompanyId]
  );
  return res.rows[0]?.id ?? null;
}

// BANKING-GL-COMPLETION — banking.transfers -> balanced JE. Every TransferType (bank_to_bank, cc_payment,
// cash_deposit, owner_contribution, owner_distribution) shares the SAME two-leg shape: DEBIT the
// destination account's GL register, CREDIT the source account's GL register — e.g. transfer_type
// 'cc_payment' (paying down a card balance from a bank account, POST /banking/cc-payments ->
// createTransfer) posts Dr CC-liability (to_account) / Cr bank (from_account). NO new GL math: both legs
// resolve through the SAME account-bridge helper every other banking poster already uses
// (resolveTransferLegAccountId above). Reversal (a revoked transfer) is handled by the generic
// reversePostedSourceTransaction — no transfer-specific reversal logic needed.
async function buildTransferLines(client: DbClient, operatingCompanyId: string, sourceId: string): Promise<PostingDraft> {
  const transferRes = await client.query<{
    id: string;
    transfer_type: string;
    from_account_id: string;
    from_account_kind: "bank" | "cc" | "coa";
    to_account_id: string;
    to_account_kind: "bank" | "cc" | "coa";
    amount_cents: number;
    transfer_date: string;
    memo: string | null;
    revoked_at: string | null;
    reference_number: string | null;
  }>(
    `
      SELECT
        id::text,
        transfer_type::text,
        from_account_id::text,
        from_account_kind::text AS from_account_kind,
        to_account_id::text,
        to_account_kind::text AS to_account_kind,
        amount_cents::bigint,
        transfer_date::text,
        memo,
        revoked_at::text,
        reference_number
      FROM banking.transfers
      WHERE operating_company_id = $1::uuid
        AND id::text = $2
      LIMIT 1
      FOR UPDATE
    `,
    [operatingCompanyId, sourceId]
  );
  const transfer = transferRes.rows[0];
  if (!transfer) throw new PostingEngineError("SOURCE_NOT_FOUND", "Transfer not found");
  if (transfer.revoked_at) {
    throw new PostingEngineError("TRANSFER_NOT_POSTING_ELIGIBLE", "Revoked transfer is not posting-eligible");
  }

  const amountCents = Math.abs(Number(transfer.amount_cents ?? 0));
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    throw new PostingEngineError("TRANSFER_NOT_POSTING_ELIGIBLE", "Transfer has a zero/non-finite amount");
  }

  const debitAccountId = await resolveTransferLegAccountId(client, operatingCompanyId, transfer.to_account_id, transfer.to_account_kind);
  if (!debitAccountId) {
    throw new PostingEngineError(
      "ACCOUNT_MAPPING_MISSING",
      `Transfer destination account has no resolvable GL account (${transfer.to_account_kind} account ${transfer.to_account_id})`
    );
  }
  const creditAccountId = await resolveTransferLegAccountId(client, operatingCompanyId, transfer.from_account_id, transfer.from_account_kind);
  if (!creditAccountId) {
    throw new PostingEngineError(
      "ACCOUNT_MAPPING_MISSING",
      `Transfer source account has no resolvable GL account (${transfer.from_account_kind} account ${transfer.from_account_id})`
    );
  }

  // JE-MEMO-STORES-RAW-UUID-AT-POSTER — name the transfer by its own reference_number when the
  // operator gave it one; the type is real information either way, so it always leads.
  const label = transfer.reference_number
    ? `Transfer (${transfer.transfer_type}) ${transfer.reference_number}`
    : `Transfer (${transfer.transfer_type})`;
  return {
    postingDate: transfer.transfer_date,
    memo: transfer.memo ? `${label} — ${transfer.memo}` : `${label} posting`,
    lines: [
      {
        account_id: debitAccountId,
        debit_or_credit: "debit",
        amount_cents: amountCents,
        description: `${label} destination`,
        source_transaction_line_id: null,
      },
      {
        account_id: creditAccountId,
        debit_or_credit: "credit",
        amount_cents: amountCents,
        description: `${label} source`,
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
  if (sourceType === "bank_categorization") return buildBankCategorizationLines(client, operatingCompanyId, sourceId);
  if (sourceType === "driver_reimbursement") return buildDriverReimbursementLines(client, operatingCompanyId, sourceId, creditAccountId);
  if (sourceType === "transfer") return buildTransferLines(client, operatingCompanyId, sourceId);
  throw new PostingEngineError("UNKNOWN_SOURCE_TYPE", `Unknown source type: ${sourceType}`);
}

// ACCT-F348 — failure bookkeeping must never DOWNGRADE a settled batch. The DO UPDATE below was
// unconditional, so an error raised anywhere in a later attempt (the duplicate-key crash this finding
// is about, among others) could stamp `failed` onto the batch of an entry whose journal lines are
// posted and real. The books would then disagree with their own audit trail about whether that money
// reached the ledger. A `posted`/`reversed` batch is terminal in both directions.
async function markBatchFailed(
  actor: Actor,
  operatingCompanyId: string,
  sourceType: PostingSourceType,
  sourceId: string,
  idempotencyKey: string
) {
  await withCurrentUser(actor.userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    const postingTemplateId = await resolvePostingTemplateId(client, sourceType, operatingCompanyId);
    await client.query(
      `
        INSERT INTO accounting.posting_batches (
          operating_company_id,
          batch_status,
          source_transaction_type,
          source_transaction_id,
          idempotency_key,
          created_by_user_id,
          posting_template_id,
          source_template_code,
          created_at,
          updated_at
        )
        VALUES ($1::uuid, 'failed', $2, $3, $4, $5::uuid, $6::uuid, $7, now(), now())
        ON CONFLICT (operating_company_id, idempotency_key) WHERE idempotency_key IS NOT NULL
        DO UPDATE SET batch_status = 'failed', updated_at = now()
          WHERE accounting.posting_batches.batch_status NOT IN ('posted', 'reversed')
      `,
      [operatingCompanyId, sourceType, sourceId, idempotencyKey, actor.userId, postingTemplateId, sourceType]
    );
  });
}

type PostingExecCtx = {
  input: PostSourceInput;
  actor: Actor;
  sourceType: PostingSourceType;
  sourceId: string;
  postingPurpose: PostingPurpose;
  idempotencyKey: string;
};

function buildPostingExecCtx(input: PostSourceInput, actor: Actor): PostingExecCtx {
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
    // Only consumed for `repost`; ignored otherwise, so existing keys are unchanged.
    repost_revision: input.repost_revision ?? null,
  });
  return { input, actor, sourceType, sourceId, postingPurpose, idempotencyKey };
}

// The core posting logic, operating on a CALLER-SUPPLIED client so it can run inside the caller's own
// transaction. Extracted verbatim from the former postSourceTransaction body (no behavior change) so
// P1-BILLPAY-GL can post a bill_payment JE ATOMICALLY with payBill's bank-cache decrement (both commit
// or both roll back — never diverge). Idempotent, balanced, and closed-period-gated exactly as before.
async function executePostingOnClient(client: DbClient, ctx: PostingExecCtx): Promise<PostingResult> {
  const { input, actor, sourceType, sourceId, postingPurpose, idempotencyKey } = ctx;
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

  const postingTemplateId = await resolvePostingTemplateId(client, sourceType, input.operating_company_id);
  // ACCT-F348 — RECLAIM THE BATCH, NEVER INSERT A SECOND ONE UNDER THE SAME KEY.
  //
  // A bare INSERT here made every FAILURE PERMANENT. The idempotency key is deterministic, and
  // markBatchFailed COMMITS a `failed` batch row under that exact key in its own transaction after a
  // post throws. The pre-check above only short-circuits on `posted`/`reversed`, so the next attempt
  // fell through to this INSERT and died on uq_posting_batches_company_idempotency_key — the document
  // could never post again, no matter what was fixed. The failure record poisoned its own retry.
  //
  // Measured on prod 2026-08-11: 11,980 documents carry a `failed` batch with zero GL lines and are
  // therefore un-postable forever. The one that blocked USMCA is bill L-20260810-0003
  // (35b8ce38, $297.60 of real driver pay): postSettlementBillPayment creates the Bill, BILL_GL_POSTING_ENABLED
  // auto-posts it before its bill_lines exist (BILL_LINE_ACCOUNT_UNRESOLVED -> failed batch), then the
  // settlement adds the line and posts explicitly — straight into the duplicate key. That is why
  // driver_settlement_gl_runs / gl_bills were 0 on every entity. bills.service.ts called this state
  // "retriable"; it was not.
  //
  // WHY RECLAIM IS SAFE: a non-terminal batch NEVER owns GL lines. executePostingOnClient runs inside a
  // single transaction (withCurrentUser BEGINs), so a failed attempt rolls its batch AND its lines back
  // together; the only committed non-terminal rows are the line-less ones markBatchFailed writes. The
  // assertion below enforces that rather than trusting it — reclaiming a batch that somehow held lines
  // would attach a second JE's worth of postings to it.
  //
  // WHY THE WHERE CLAUSE: a `posted`/`reversed` batch is settled money and must never be reopened here.
  // If the conflicting row is terminal, DO UPDATE matches nothing, RETURNING is empty, and we resolve it
  // as an existing posting instead (concurrent-writer case: Postgres blocks this upsert on the other
  // transaction's row lock, so we observe its committed result rather than racing it).
  const batch = await client.query<{ id: string }>(
    `
      INSERT INTO accounting.posting_batches (
        operating_company_id,
        batch_status,
        source_transaction_type,
        source_transaction_id,
        idempotency_key,
        created_by_user_id,
        posting_template_id,
        source_template_code,
        created_at,
        updated_at
      )
      VALUES ($1::uuid, 'queued', $2, $3, $4, $5::uuid, $6::uuid, $7, now(), now())
      ON CONFLICT (operating_company_id, idempotency_key) WHERE idempotency_key IS NOT NULL
      DO UPDATE SET batch_status = 'queued',
                    created_by_user_id = EXCLUDED.created_by_user_id,
                    posting_template_id = EXCLUDED.posting_template_id,
                    source_template_code = EXCLUDED.source_template_code,
                    updated_at = now()
        WHERE accounting.posting_batches.batch_status NOT IN ('posted', 'reversed')
      RETURNING id::text
    `,
    [input.operating_company_id, sourceType, sourceId, idempotencyKey, actor.userId, postingTemplateId, sourceType]
  );
  const postingBatchId = batch.rows[0]?.id;
  if (!postingBatchId) {
    // The key is taken by a settled batch. Re-read it: normally that is a concurrent writer that just
    // committed, and its result is the correct answer to return.
    const settled = await getExistingPostingResultByIdempotencyKey(
      client,
      input.operating_company_id,
      idempotencyKey,
      postingPurpose,
      sourceType,
      sourceId
    );
    if (settled) return settled;
    // Terminal batch with no readable lines — corrupt, and reposting would write a JE that the batch
    // does not account for. Fail loud instead of duplicating (prod count of this state: 0).
    throw new PostingEngineError(
      "POSTING_BATCH_SETTLED_WITHOUT_LINES",
      `Posting batch ${idempotencyKey} is already posted/reversed but exposes no journal lines — refusing to post a second entry under a settled key`
    );
  }

  const reclaimedLines = await client.query<{ n: string }>(
    `
      SELECT count(*)::text AS n
      FROM accounting.journal_entry_postings
      WHERE operating_company_id = $1::uuid
        AND posting_batch_id = $2::uuid
    `,
    [input.operating_company_id, postingBatchId]
  );
  if (Number(reclaimedLines.rows[0]?.n ?? "0") > 0) {
    throw new PostingEngineError(
      "POSTING_BATCH_RECLAIM_HAS_LINES",
      `Posting batch ${postingBatchId} was non-terminal but already carries journal lines — refusing to post onto it`
    );
  }

  await client.query(
    `
      UPDATE accounting.posting_batches
      SET batch_status = 'in_progress',
          updated_at = now()
      WHERE id = $1::uuid
    `,
    [postingBatchId]
  );

  // ACCT-F212 — the JE inherits the SOURCE DOCUMENT's sample flag, so subledger and ledger agree.
  const sourceIsSample = await readSourceIsSampleData(client, input.operating_company_id, sourceType, sourceId);

  const journalEntryId = await createJournalEntryHeader(
    client,
    input.operating_company_id,
    draft.postingDate,
    draft.memo,
    actor.userId,
    sourceIsSample
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
}

/**
 * Post a source transaction WITHIN the caller's existing transaction/client (atomic with the caller's
 * other writes). Used by payBill so the bill_payment JE + bank-cache decrement commit or roll back
 * together. Same idempotency + balance + closed-period guarantees as postSourceTransaction; because the
 * caller owns the transaction, a failure rolls back the caller's whole txn (no separate failed-batch
 * record is written — nothing was committed).
 */
export async function postSourceTransactionInClientTx(
  client: DbClient,
  input: PostSourceInput,
  actor: Actor
): Promise<PostingResult> {
  return executePostingOnClient(client, buildPostingExecCtx(input, actor));
}

export async function postSourceTransaction(input: PostSourceInput, actor: Actor): Promise<PostingResult> {
  const ctx = buildPostingExecCtx(input, actor);
  const { sourceType, sourceId, idempotencyKey } = ctx;
  try {
    return await withCurrentUser(actor.userId, (client) => executePostingOnClient(client, ctx));
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
        error.code !== "BANK_CATEGORIZATION_NOT_POSTING_ELIGIBLE" &&
        error.code !== "TRANSFER_NOT_POSTING_ELIGIBLE" &&
        error.code !== "QBO_BILL_POST_GL_REFUSED" &&
        error.code !== "QBO_BILL_PAYMENT_POST_GL_REFUSED" &&
        error.code !== "EXPENSE_POST_GL_REFUSED" &&
        error.code !== "QBO_CUSTOMER_PAYMENT_POST_GL_REFUSED"
      ) {
        await markBatchFailed(actor, input.operating_company_id, sourceType, sourceId, idempotencyKey);
      }
    } catch (recordError) {
      console.error("[posting-engine] markBatchFailed failed; preserving original error", recordError);
    }
    throw error;
  }
}

async function executeSourceReversalOnClient(
  client: DbClient,
  input: ReverseBatchInput,
  actor: Actor,
  currentBusinessDate: string
): Promise<PostingResult> {
  const sourceType = normalizeSourceType(input.source_transaction_type);
  const sourceId = normalizeSourceId(input.source_transaction_id);

  const original = await getPostingBySource(client, input.operating_company_id, sourceType, sourceId, "initial_post");
  if (!original) throw new PostingEngineError("SOURCE_NOT_FOUND", "No posted batch found to reverse");

  const existingReversal = await getPostingBySource(client, input.operating_company_id, sourceType, sourceId, "reversal");
  if (existingReversal) return existingReversal;

  const originalLines = await client.query<{
    id: string;
    account_id: string;
    class_id: string | null;
    entity_uuid: string | null;
    debit_or_credit: "debit" | "credit";
    amount_cents: number;
    description: string | null;
  }>(
    `
      SELECT id::text, account_id::text, class_id::text, entity_uuid::text,
             debit_or_credit, amount_cents::bigint, description
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
        AND je.operating_company_id = $2::uuid
      LIMIT 1
    `,
    [original.journal_entry_id, input.operating_company_id]
  );
  const originalDate = headerDate.rows[0]?.entry_date;
  if (!originalDate) throw new PostingEngineError("SOURCE_NOT_FOUND", "Original journal entry missing");

  // Canonical closed-period reversal policy (shared with postVoidReversal):
  // open original period -> original date; closed original period -> current company-business date.
  // This prevents a settlement's bill/payment legs from failing PERIOD_LOCKED while its deduction leg
  // posts in the current period. The final ensureOpenPeriod is the fail-closed backstop if even the
  // current company date is closed.
  const cutoff = await client.query<{ cutoff: string | null }>(
    `SELECT accounting.closed_period_cutoff($1::uuid)::text AS cutoff`,
    [input.operating_company_id]
  );
  const reversalDate = resolveReversalDate(originalDate, cutoff.rows[0]?.cutoff ?? null, currentBusinessDate);
  await ensureOpenPeriod(client, input.operating_company_id, reversalDate);

  const idempotencyKey = buildPostingMvpIdempotencyKey({
    operating_company_id: input.operating_company_id,
    source_transaction_type: sourceType,
    source_transaction_id: sourceId,
    source_transaction_line_id: null,
    posting_purpose: "reversal",
  });

  const reversalPostingTemplateId = await resolvePostingTemplateId(client, sourceType, input.operating_company_id);
  const reversalBatch = await client.query<{ id: string }>(
    `
      INSERT INTO accounting.posting_batches (
        operating_company_id,
        batch_status,
        source_transaction_type,
        source_transaction_id,
        idempotency_key,
        created_by_user_id,
        posting_template_id,
        source_template_code,
        created_at,
        updated_at
      )
      VALUES ($1::uuid, 'in_progress', $2, $3, $4, $5::uuid, $6::uuid, $7, now(), now())
      RETURNING id::text
    `,
    [input.operating_company_id, sourceType, sourceId, idempotencyKey, actor.userId, reversalPostingTemplateId, sourceType]
  );
  const reversalBatchId = reversalBatch.rows[0]?.id;
  if (!reversalBatchId) throw new Error("reversal_batch_create_failed");

  // ACCT-F212 — a reversal inherits the SAME flag as the source document it unwinds, exactly as the
  // initial post does. If it did not, reversing a sample posting would leave a real entry with no
  // matching original in a real-money report — the ACCT-F211 contradiction, reproduced here.
  const reversalSourceIsSample = await readSourceIsSampleData(
    client,
    input.operating_company_id,
    sourceType,
    sourceId
  );

  const reversalJeId = await createJournalEntryHeader(
    client,
    input.operating_company_id,
    reversalDate,
    `Reversal of ${original.journal_entry_id}`,
    actor.userId,
    reversalSourceIsSample
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
          class_id,
          entity_uuid,
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
        VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5::uuid, $6::uuid, $7, $8, $9, $10, $11, NULL, $12::uuid, $13, $14::uuid, now(), now())
        RETURNING id::text
      `,
      [
        input.operating_company_id,
        reversalJeId,
        lineSequence,
        row.account_id,
        row.class_id,
        row.entity_uuid,
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
  // LV-INVOICE-VOID-REVERSAL-HAS-NO-JE-LINKAGE — link the reversal to its original AT THE JOURNAL-ENTRY
  // level, both directions. The LINE level was already linked (reversal_of_line_id / reversed_by_line_id
  // above); the JE level was not, so the pair was discoverable only by string-parsing the memo
  // `Reversal of <uuid>`.
  //
  // WHY A MEMO IS NOT A LINK: counting journal_entries with voided_at IS NOT NULL is 0 — no journal
  // entry is ever voided in place, because reversal-by-new-JE is the only mechanism WORM permits.
  // That makes reverses_je_id / reversed_by_je_id THE ONLY machine-readable audit link between a JE
  // and its reversal, and a NULL makes the reversal invisible to every structural query. Measured on
  // prod 2026-08-08: 26 JEs carry a "Reversal of …" memo, only 24 carry the FK, and one of the two
  // memo-only rows (8fd32bec, USMCA bill-payment void) was created THAT DAY — a live path, not
  // historical residue.
  //
  // This is not academic: my own ACCT-F251 sweep had to fall back to memo-matching to find unreversed
  // voided bills, precisely because this FK could not be trusted. A guard that greps memos is a guard
  // that breaks the day someone rewords a memo.
  await client.query(
    `
      UPDATE accounting.journal_entries
      SET reverses_je_id = $2::uuid,
          updated_at = now()
      WHERE id = $1::uuid
        AND operating_company_id = $3::uuid
        AND reverses_je_id IS NULL
    `,
    [reversalJeId, original.journal_entry_id, input.operating_company_id]
  );
  await client.query(
    `
      UPDATE accounting.journal_entries
      SET reversed_by_je_id = $2::uuid,
          updated_at = now()
      WHERE id = $1::uuid
        AND operating_company_id = $3::uuid
        AND reversed_by_je_id IS NULL
    `,
    [original.journal_entry_id, reversalJeId, input.operating_company_id]
  );

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
}

/**
 * Reverse a posted source inside the caller's existing transaction. This is the reversal counterpart
 * to postSourceTransactionInClientTx and carries the same deterministic posting-batch idempotency,
 * source links, line-level reversal links, and closed-period policy. A caller can therefore reverse a
 * multi-leg workflow atomically: any failed leg rolls every preceding leg back.
 */
export async function reversePostedSourceTransactionInClientTx(
  client: DbClient,
  input: ReverseBatchInput,
  actor: Actor,
  currentBusinessDate: string
): Promise<PostingResult> {
  return executeSourceReversalOnClient(client, input, actor, currentBusinessDate);
}

export async function reversePostedSourceTransaction(input: ReverseBatchInput, actor: Actor): Promise<PostingResult> {
  const currentBusinessDate = todayIso();
  return withCurrentUser(actor.userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);
    return executeSourceReversalOnClient(client, input, actor, currentBusinessDate);
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
          -- SETTLEMENT-BILL-PAYMENT: skip non-cash settlement-deduction payments (GL owned by the
          -- settlement deduction JE; posting them here would double-reduce A/P + credit phantom cash).
          AND COALESCE(settlement_deduction_noncash, false) = false
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
