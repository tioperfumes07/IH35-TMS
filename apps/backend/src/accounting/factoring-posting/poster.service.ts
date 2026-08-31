// CODER-34 — Factoring GL poster, re-architected from the SALE model to SECURED BORROWING (ASC 860).
//
// The old poster booked FARO's advance as a `customer_payment` (Dr Cash / Cr A/R) and recorded NO
// liability — sale/derecognition, which misstates A/R and liabilities under the CPA's secured-borrowing
// ruling (full recourse + mandatory repurchase + security interest + guaranty => retained control =>
// borrowing). This rewrite implements the 5-step borrowing lifecycle (see
// docs package 02_ACCOUNTING_secured-borrowing.md):
//
//   FUNDING           Dr Cash + Dr Factoring Reserves + Dr Factoring Fees (+ Dr Bank/ACH)
//                     / Cr Factoring Advance (LIABILITY = FULL net invoice).  A/R is UNTOUCHED.
//   CUSTOMER PAYMENT  Dr Factoring Advance / Cr A/R.  This is the ONLY place A/R goes down.
//   RESERVE RELEASE   Dr Cash / Cr Factoring Reserves.  Not a customer_payment, not against A/R.
//   CHARGEBACK        Dr Factoring Advance + Dr Default Interest / Cr Cash;  and
//                     Dr Factoring Recoursed Invoices / Cr A/R.
//
// Design notes (see PR body):
//  * Every entry is routed through createJournalEntry (accounting.journal_entries /
//    journal_entry_postings — the DB double-entry trigger tables), which asserts debits===credits>0 and
//    writes the transaction_source_links spine + audit + QBO-sync. We deliberately do NOT use the
//    posting-engine's customer_payment source type any more (that is the sale-model defect), and we do
//    NOT edit the shared posting-engine (lane lock).
//  * Idempotency: each entry is keyed to a deterministic memo per (advance, step[, amount]); a re-run
//    finds the existing JE and no-ops (no double-post) — mirrors factoring-fees-posting's guard.
//  * FLAG GATE: FACTORING_GL_POSTING_ENABLED (per-entity, DEFAULT OFF) is checked via
//    isEnabled(client, KEY, {operating_company_id}) — never a global env read. Off => nothing posts.
//  * Per-entity isolation: all accounts resolve via the entity-pinned role resolver (fail-closed); a
//    TRANSP post can never resolve a TRK/USMCA account.
//  * The optional A/R => "A/R – Assigned to Faro" reclass is intentionally NOT applied at funding, so
//    that funding never credits ar_control (leaves total A/R exactly as-is and satisfies the
//    verify-factoring-treatment guard). ar_assigned_to_factor is created/bound for that optional
//    presentation + the chargeback path.
//
// CONN-2 (this revision) — two additions, both storage/subledger-only, NO new GL math:
//  1. AR-subledger fix (CHAIN-06-FACTORING-AR-TIEOUT-PROOF.md §5/§7-A, surfaced by PR #2188, not fixed
//     there by design). postFactoringCustomerPaymentEvent / postFactoringChargebackEvent relieved
//     `ar_control` at the GL but never touched `accounting.invoices.amount_paid_cents`/`status` — AR
//     Aging (`views.ar_aging`, filtered on `status IN ('sent','partial')`) would diverge from the GL the
//     moment the flag flips ON. Fixed here by applying a DETERMINISTIC SET (not an increment) to every
//     invoice linked to the advance right after the JE posts — idempotent regardless of retry timing, and
//     self-healing on an `already_posted` re-entry (covers a prior run that posted the JE but crashed
//     before the subledger sync). Customer-payment => the invoice was actually collected (via Faro) =>
//     amount_paid_cents set (proportionally across the advance's invoices, reusing allocateByProportion —
//     zero new math) + status 'paid'/'partial'. Chargeback's A/R-relief leg => the receivable was NOT
//     collected, it was reclassed off trade A/R into `factoring_recoursed_ar` => status only moves to the
//     schema's own pre-existing 'factored' CHECK value (0060) so it leaves the `ar_aging`
//     sent/partial pool without misrepresenting it as paid; amount_paid_cents is untouched.
//  2. Faro Reserve Tracker (accounting.factoring_reserve_movements, migration 202607130000, HELD) — a
//     per-advance ledger of reserve HELD (at funding)/RELEASED (at release) events, mirroring the
//     already-shipped default-interest-accrual ledger pattern 1:1. Recorded as a side effect of the SAME
//     funding/release JE this file already posts — no new GL entry, just a structural (non-memo-parsed)
//     record for the reserve-balance view (`views.factoring_reserve_balances`) and the advance packet.

import { withCurrentUser, withLuciaBypass } from "../../auth/db.js";
import { isEnabled } from "../../lib/feature-flags/service.js";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import {
  createJournalEntry,
  createJournalEntryOnClient,
  enqueueJournalEntrySideEffects,
  reverseJournalEntryNoFlip,
  type CreateJournalEntryInput,
} from "../journal-entries.service.js";
import { resolveRoleAccount } from "../coa-roles/resolver.service.js";
import { ensureOpenPeriod } from "../posting-engine.service.js";
import { companyBusinessDate } from "../../lib/company-business-date.js";
import {
  FACTORING_DEFAULT_INTEREST_DAILY_RATE,
  FACTORING_INTEREST_ACCRUAL_AFTER_DAY,
} from "./contract-config.js";
import {
  FACTORING_LIFECYCLE_SOURCE_TYPES,
  type ExpectedLifecycleLeg,
  type FactoringLifecycleSourceType,
  FactoringLifecyclePostingKeyRaceError,
  attachFactoringLifecycleSourceLinksStrict,
  calendarDayIndexBetween,
  claimFactoringLifecyclePostingKey,
  findAllLifecyclePostingKeyJes,
  findLifecyclePostingKeyJe,
  findStrictLifecycleRepairCandidate,
  liveJournalEntryNotReversedSql,
  validateLifecycleJeExactShape,
} from "./lifecycle-repair.js";
import {
  advanceBoundToFaroVendor,
  requireEffectiveFaroFullRecourseAgreement,
} from "./faro-agreement-gate.js";

export { FACTORING_LIFECYCLE_SOURCE_TYPES, type FactoringLifecycleSourceType };
export { findStrictLifecycleRepairCandidate, validateLifecycleJeExactShape };
export type { ExpectedLifecycleLeg };

/** Test-only inject hooks — prove outer txn rollback (unit + DB). */
export const __posterAtomicityTestHooks = {
  failAfterJeBeforeLifecycleLinks: false as boolean,
  failAfterChargebackRepayBeforeReturn: false as boolean,
  failAfterChargebackReturnBeforeStatus: false as boolean,
};

export const FACTORING_GL_POSTING_FLAG = "FACTORING_GL_POSTING_ENABLED";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

type PostResult = {
  posted: boolean;
  reason?:
    | "flag_off"
    | "already_posted"
    | "zero_amount"
    | "advance_not_found"
    | "no_invoices"
    | "not_outstanding"
    | "before_grace"
    | "policy_partial_or_ambiguous_recourse"
    | "policy_invalid_entry_date"
    | "policy_missing_entry_date"
    | "policy_overpayment"
    | "policy_over_release"
    | "policy_faro_agreement"
    | "policy_advance_not_bound_to_faro"
    | "repair_ambiguous"
    | "repair_candidate_invalid";
  journal_entry_id?: string;
  memo?: string;
  closing_balance_cents?: number;
};

export class FactoringEntryDateError extends Error {
  readonly reason: "policy_invalid_entry_date" | "policy_missing_entry_date";
  constructor(reason: "policy_invalid_entry_date" | "policy_missing_entry_date", message: string) {
    super(message);
    this.name = "FactoringEntryDateError";
    this.reason = reason;
  }
}

/** Strict calendar YYYY-MM-DD (zero-padded) — rejects ambiguous / malformed dates. */
function isStrictYmd(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  if (!y || !m || !d) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * Convert timestamptz / ISO / YYYY-MM-DD into company-local business date (never UTC slice).
 * Malformed / ambiguous inputs return null (caller fails closed — never salvage to today).
 *
 * Accepts:
 *   - strict YYYY-MM-DD
 *   - ISO-8601 datetime with `T` separator
 *   - Postgres `timestamptz::text` (`YYYY-MM-DD HH:MM:SS.fff+00`) from loadAdvance casts
 * Rejects slash/US forms and non-zero-padded calendar dates (ambiguous caller input).
 */
function toCompanyBusinessDate(isoOrDate: string | Date | null | undefined): string | null {
  if (isoOrDate == null) return null;
  if (typeof isoOrDate === "string") {
    const trimmed = isoOrDate.trim();
    if (!trimmed) return null;
    if (isStrictYmd(trimmed)) return trimmed;
    // Ambiguous / non-ISO calendar forms fail closed (never Date.parse salvage).
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(trimmed) && !isStrictYmd(trimmed)) return null;
    if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(trimmed)) return null;
    if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(trimmed)) return null;
    // ISO datetime OR Postgres timestamptz::text (space separator, optional fractional seconds + offset).
    const tsMatch = trimmed.match(
      /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2}(?:\.\d+)?)(Z|[+-]\d{2}(?::?\d{2})?)?$/
    );
    if (!tsMatch) return null;
    let iso = `${tsMatch[1]}T${tsMatch[2]}${tsMatch[3] ?? "Z"}`;
    // Normalize bare ±HH offsets (`+00`) to ±HH:MM for ECMAScript Date.
    iso = iso.replace(/([+-]\d{2})$/, "$1:00");
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return companyBusinessDate(d);
  }
  if (Number.isNaN(isoOrDate.getTime())) return null;
  return companyBusinessDate(isoOrDate);
}

/**
 * Resolve entry date from supplied candidates. Invalid supplied values fail closed —
 * NEVER fall back to today to salvage bad input. Callers that intentionally mean "today"
 * must pass `companyBusinessDate()` as an explicit candidate.
 */
export function resolveCanonicalEntryDate(
  ...candidates: Array<string | Date | null | undefined>
): string {
  let sawSupplied = false;
  for (const c of candidates) {
    if (c == null) continue;
    if (typeof c === "string" && c.trim() === "") continue;
    sawSupplied = true;
    const ymd = toCompanyBusinessDate(c);
    if (ymd) return ymd;
    throw new FactoringEntryDateError(
      "policy_invalid_entry_date",
      `Invalid or ambiguous factoring entry date: ${String(c)}`
    );
  }
  throw new FactoringEntryDateError(
    "policy_missing_entry_date",
    sawSupplied
      ? "Factoring entry date could not be resolved"
      : "Factoring entry date required — no today fallback"
  );
}

async function requireFaroBoundAdvance(
  client: DbClient,
  operatingCompanyId: string,
  factoringAdvanceId: string,
  asOfBusinessDate: string
): Promise<{ ok: true; vendorId: string; agreementId: string } | { ok: false; reason: PostResult["reason"] }> {
  const gate = await requireEffectiveFaroFullRecourseAgreement(client, operatingCompanyId, asOfBusinessDate);
  if (!gate.ok) return { ok: false, reason: "policy_faro_agreement" };
  const bound = await advanceBoundToFaroVendor(client, operatingCompanyId, factoringAdvanceId, gate.vendorId);
  if (!bound) return { ok: false, reason: "policy_advance_not_bound_to_faro" };
  return { ok: true, vendorId: gate.vendorId, agreementId: gate.agreementId };
}

// Whole-day gap on company business dates (no UTC wall-clock). Purchase = funding business date.
function dayIndexBetween(purchaseIso: string, accrualIso: string): number {
  const purchase = toCompanyBusinessDate(purchaseIso) ?? purchaseIso.slice(0, 10);
  const accrual = toCompanyBusinessDate(accrualIso) ?? accrualIso.slice(0, 10);
  return calendarDayIndexBetween(purchase, accrual);
}

const FLAG_OFF: PostResult = { posted: false, reason: "flag_off" };

// Proportional allocation (floor + largest-remainder) — no penny created/lost. Preserved verbatim from
// the prior poster so batch amounts split identically across invoices where a per-invoice split is needed.
export function allocateByProportion(total: number, lines: Array<{ invoice_id: string; total_cents: number }>) {
  if (total <= 0 || lines.length === 0) return new Map<string, number>();
  const sumBase = lines.reduce((acc, row) => acc + row.total_cents, 0);
  if (sumBase <= 0) return new Map<string, number>();

  const provisional = lines.map((row) => {
    const raw = (row.total_cents / sumBase) * total;
    const floor = Math.floor(raw);
    return { invoice_id: row.invoice_id, floor, remainder: raw - floor };
  });

  let assigned = provisional.reduce((acc, row) => acc + row.floor, 0);
  let remaining = total - assigned;
  provisional.sort((a, b) => b.remainder - a.remainder);
  for (const row of provisional) {
    if (remaining <= 0) break;
    row.floor += 1;
    remaining -= 1;
  }

  const out = new Map<string, number>();
  for (const row of provisional) out.set(row.invoice_id, row.floor);
  return out;
}

async function factoringPostingEnabled(client: DbClient, operatingCompanyId: string): Promise<boolean> {
  return isEnabled(client as never, FACTORING_GL_POSTING_FLAG, { operating_company_id: operatingCompanyId });
}

// Idempotency: an auto factoring JE is uniquely identified by its deterministic memo. If one already
// exists for this (advance, step[, amount]) we do not post again — no double-post on a re-run/re-import.
async function journalEntryExistsByMemo(client: DbClient, operatingCompanyId: string, memo: string): Promise<boolean> {
  const res = await client.query<{ id: string }>(
    `
      SELECT id::text
      FROM accounting.journal_entries
      WHERE operating_company_id = $1::uuid
        AND source = 'auto'
        AND memo = $2
        AND status <> 'voided'
      LIMIT 1
    `,
    [operatingCompanyId, memo]
  );
  return Boolean(res.rows[0]?.id);
}

type AdvanceRow = {
  id: string;
  display_id: string;
  status: string;
  invoice_total_cents: number;
  advance_amount_cents: number;
  reserve_amount_cents: number;
  factor_fee_cents: number;
  release_amount_cents: number;
  submitted_at: string | null;
  advanced_at: string | null;
  collected_at: string | null;
  released_at: string | null;
};

async function loadAdvance(client: DbClient, operatingCompanyId: string, factoringAdvanceId: string): Promise<AdvanceRow | null> {
  const res = await client.query<AdvanceRow>(
    `
      SELECT
        id::text,
        display_id,
        status::text               AS status,
        invoice_total_cents::int   AS invoice_total_cents,
        advance_amount_cents::int  AS advance_amount_cents,
        reserve_amount_cents::int  AS reserve_amount_cents,
        factor_fee_cents::int      AS factor_fee_cents,
        release_amount_cents::int  AS release_amount_cents,
        submitted_at::text,
        advanced_at::text,
        collected_at::text,
        released_at::text
      FROM accounting.factoring_advances
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
      LIMIT 1
    `,
    [factoringAdvanceId, operatingCompanyId]
  );
  return res.rows[0] ?? null;
}

// ---------------------------------------------------------------------------------------------------
// CONN-2 helpers — AR subledger relief (CHAIN-06 §5/§7-A fix) + Faro Reserve Tracker (migration
// 202607130000). Storage/subledger only — no new GL math, no new JE.
// ---------------------------------------------------------------------------------------------------

type AdvanceInvoiceRow = { id: string; total_cents: number; voided_at: string | null };

async function loadAdvanceInvoices(
  client: DbClient,
  operatingCompanyId: string,
  factoringAdvanceId: string
): Promise<AdvanceInvoiceRow[]> {
  const res = await client.query<{ id: string; total_cents: string; voided_at: string | null }>(
    `
      SELECT id::text, total_cents::text, voided_at::text
      FROM accounting.invoices
      WHERE factoring_advance_id = $1::uuid
        AND operating_company_id = $2::uuid
      ORDER BY issue_date ASC, created_at ASC
    `,
    [factoringAdvanceId, operatingCompanyId]
  );
  return res.rows.map((r) => ({ id: r.id, total_cents: Number(r.total_cents ?? 0), voided_at: r.voided_at }));
}

/**
 * Cumulative ledger-backed customer payments against an advance (AR-credit legs).
 * Authoritative for amount_paid_cents — never the latest allocation alone.
 */
async function linkedCustomerPaymentPaidCents(
  client: DbClient,
  operatingCompanyId: string,
  factoringAdvanceId: string
): Promise<number> {
  const notReversed = await liveJournalEntryNotReversedSql(client);
  const res = await client.query<{ paid: string }>(
    `
      SELECT COALESCE(SUM(jep.amount_cents), 0)::text AS paid
        FROM accounting.journal_entry_postings jep
        JOIN accounting.journal_entries je
          ON je.id = jep.journal_entry_uuid
         AND je.operating_company_id = jep.operating_company_id
        JOIN accounting.chart_of_accounts_roles r
          ON r.account_id = jep.account_id
         AND r.operating_company_id = jep.operating_company_id
         AND r.is_active = true
         AND r.role = 'ar_control'
       WHERE jep.operating_company_id = $1::uuid
         AND jep.source_transaction_id = $2::text
         AND jep.source_transaction_type = 'factoring_customer_payment'
         AND jep.debit_or_credit = 'credit'
         AND je.status = 'posted'
         AND je.voided_at IS NULL
         ${notReversed}
    `,
    [operatingCompanyId, factoringAdvanceId]
  );
  return Number(res.rows[0]?.paid ?? 0);
}

// Deterministic SET from CUMULATIVE ledger-backed payments (never latest-allocation overwrite).
// Safe on fresh post AND already_posted repair: re-reading the JE sum yields the same paid total.
async function applyCustomerPaymentSubledgerRelief(
  client: DbClient,
  operatingCompanyId: string,
  factoringAdvanceId: string
): Promise<void> {
  const invoices = (await loadAdvanceInvoices(client, operatingCompanyId, factoringAdvanceId)).filter(
    (inv) => !inv.voided_at
  );
  // No linked invoices: nothing to sync on the subledger (GL already posted).
  if (invoices.length === 0) return;

  const paidTotal = await linkedCustomerPaymentPaidCents(client, operatingCompanyId, factoringAdvanceId);
  if (paidTotal <= 0) return;

  const invoiceFace = invoices.reduce((acc, inv) => acc + inv.total_cents, 0);
  if (paidTotal > invoiceFace) {
    throw new Error(
      `factoring_customer_payment_over_invoice_face: paid=${paidTotal} face=${invoiceFace}`
    );
  }

  const allocations = allocateByProportion(
    paidTotal,
    invoices.map((inv) => ({ invoice_id: inv.id, total_cents: inv.total_cents }))
  );

  for (const inv of invoices) {
    const allocated = allocations.get(inv.id) ?? 0;
    if (allocated > inv.total_cents) {
      throw new Error(
        `factoring_customer_payment_allocation_exceeds_invoice: inv=${inv.id} alloc=${allocated} total=${inv.total_cents}`
      );
    }
    await client.query(
      `
        UPDATE accounting.invoices
        SET amount_paid_cents = $2,
            status = CASE
              WHEN status = 'void' THEN 'void'
              WHEN $2 >= total_cents AND total_cents > 0 THEN 'paid'
              WHEN $2 > 0 THEN 'partial'
              ELSE status
            END,
            updated_at = now()
        WHERE id = $1::uuid AND operating_company_id = $3::uuid
      `,
      [inv.id, allocated, operatingCompanyId]
    );
  }
}

// The chargeback's A/R-relief leg (Dr factoring_recoursed_ar / Cr ar_control) removes the receivable from
// trade A/R entirely — no cash changed hands, so amount_paid_cents is intentionally left untouched; only
// `status` moves to the schema's own pre-existing 'factored' terminal value (accounting.invoices CHECK,
// migration 0060) so the invoice leaves the ar_aging sent/partial pool without being misreported as
// collected. Idempotent (re-setting the same status is a no-op); scoped to the whole advance, matching the
// existing route-layer granularity (reserve-held/release/recourse-return already update factoring_status
// for every invoice on the advance in one statement — no per-invoice split exists at that layer either).
async function applyChargebackSubledgerRelief(
  client: DbClient,
  operatingCompanyId: string,
  factoringAdvanceId: string
): Promise<void> {
  await client.query(
    `
      UPDATE accounting.invoices
      SET status = CASE WHEN status = 'void' THEN 'void' ELSE 'factored' END,
          updated_at = now()
      WHERE factoring_advance_id = $1::uuid AND operating_company_id = $2::uuid
    `,
    [factoringAdvanceId, operatingCompanyId]
  );
}

// Faro Reserve Tracker — records one ledger row per (advance, movement_type), linked to the JE that moved
// it. ON CONFLICT DO NOTHING against the table's (operating_company_id, factoring_advance_id,
// movement_type) unique constraint — idempotent, mirrors the JE memo-idempotency this file already uses.
async function recordReserveMovement(
  client: DbClient,
  operatingCompanyId: string,
  factoringAdvanceId: string,
  movementType: "held" | "released",
  amountCents: number,
  movementDate: string,
  journalEntryId: string
): Promise<void> {
  if (amountCents <= 0) return;
  await client.query(
    `
      INSERT INTO accounting.factoring_reserve_movements (
        operating_company_id, factoring_advance_id, movement_type, amount_cents, movement_date, journal_entry_id
      )
      VALUES ($1::uuid, $2::uuid, $3, $4, $5::date, $6::uuid)
      ON CONFLICT (operating_company_id, factoring_advance_id, movement_type) DO NOTHING
    `,
    [operatingCompanyId, factoringAdvanceId, movementType, amountCents, movementDate, journalEntryId]
  );
}

/**
 * Additive lifecycle linkage (CPA VETO 0280-05) — no new GL math.
 * Strict attach: never overwrites foreign provenance (see lifecycle-repair.ts).
 * Must run in the SAME caller-owned txn as JE creation; already_posted uses deterministic repair.
 */
export async function attachFactoringLifecycleSourceLinks(
  client: DbClient,
  opts: {
    operating_company_id: string;
    journal_entry_id: string;
    factoring_advance_id: string;
    source_transaction_type: FactoringLifecycleSourceType;
  }
): Promise<void> {
  await attachFactoringLifecycleSourceLinksStrict(client, opts);
}

/** In-client strict repair — caller owns the transaction. */
export async function repairFactoringLifecycleSourceLinksOnClient(
  client: DbClient,
  opts: {
    operating_company_id: string;
    memo?: string | null;
    factoring_advance_id: string;
    source_transaction_type: FactoringLifecycleSourceType;
  }
): Promise<{ journal_entry_id: string | null; repaired: boolean; reason?: string }> {
  const candidate = await findStrictLifecycleRepairCandidate(client, {
    operating_company_id: opts.operating_company_id,
    factoring_advance_id: opts.factoring_advance_id,
    source_transaction_type: opts.source_transaction_type,
    memo: opts.memo,
  });
  if (candidate.kind === "ambiguous") {
    return { journal_entry_id: null, repaired: false, reason: "repair_ambiguous" };
  }
  if (candidate.kind === "invalid") {
    return {
      journal_entry_id: null,
      repaired: false,
      reason: candidate.reason ?? "repair_candidate_invalid",
    };
  }
  if (candidate.kind !== "unique" || !candidate.journal_entry_id) {
    return { journal_entry_id: null, repaired: false };
  }
  await attachFactoringLifecycleSourceLinksStrict(client, {
    operating_company_id: opts.operating_company_id,
    journal_entry_id: candidate.journal_entry_id,
    factoring_advance_id: opts.factoring_advance_id,
    source_transaction_type: opts.source_transaction_type,
  });
  return { journal_entry_id: candidate.journal_entry_id, repaired: true };
}

/** Validate + idempotently repair missing lifecycle source links for an already-posted factoring JE. */
export async function repairFactoringLifecycleSourceLinks(opts: {
  operating_company_id: string;
  memo?: string | null;
  factoring_advance_id: string;
  source_transaction_type: FactoringLifecycleSourceType;
  /** Optional same-txn side effects after repair (subledger sync, etc.). */
  afterRepair?: (client: DbClient, journalEntryId: string | null) => Promise<void>;
}): Promise<{ journal_entry_id: string | null; repaired: boolean; reason?: string }> {
  return withLuciaBypass(async (client: DbClient) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [
      opts.operating_company_id,
    ]);
    const result = await repairFactoringLifecycleSourceLinksOnClient(client, opts);
    if (result.reason === "repair_ambiguous" || result.reason === "repair_candidate_invalid" || result.reason?.startsWith("memo_collision")) {
      // Fail closed — do not run sibling side effects on invalid provenance.
      return result;
    }
    if (opts.afterRepair) {
      await opts.afterRepair(client, result.journal_entry_id);
    }
    return result;
  });
}

/**
 * Prefer deterministic posting-key JE id; otherwise strict candidate repair.
 * Posting-key path uses the SAME exact-shape validator — no bypass.
 * Never memo-only overwrite of foreign provenance.
 */
async function repairAlreadyPostedLifecycle(opts: {
  operating_company_id: string;
  factoring_advance_id: string;
  source_transaction_type: FactoringLifecycleSourceType;
  memo?: string | null;
  journal_entry_id?: string | null;
  expected_legs?: ExpectedLifecycleLeg[];
  expected_entry_date?: string | null;
  afterRepair?: (client: DbClient, journalEntryId: string | null) => Promise<void>;
}): Promise<{ journal_entry_id: string | null; repaired: boolean; reason?: string }> {
  if (opts.journal_entry_id) {
    return withLuciaBypass(async (client: DbClient) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [
        opts.operating_company_id,
      ]);
      if (!opts.expected_legs?.length) {
        return {
          journal_entry_id: null,
          repaired: false,
          reason: "repair_candidate_invalid",
        };
      }
      const shape = await validateLifecycleJeExactShape(client, {
        operating_company_id: opts.operating_company_id,
        journal_entry_id: opts.journal_entry_id!,
        factoring_advance_id: opts.factoring_advance_id,
        source_transaction_type: opts.source_transaction_type,
        expected_legs: opts.expected_legs,
        expected_entry_date: opts.expected_entry_date,
      });
      if (!shape.ok) {
        return {
          journal_entry_id: null,
          repaired: false,
          reason: shape.reason,
        };
      }
      try {
        await attachFactoringLifecycleSourceLinksStrict(client, {
          operating_company_id: opts.operating_company_id,
          journal_entry_id: opts.journal_entry_id!,
          factoring_advance_id: opts.factoring_advance_id,
          source_transaction_type: opts.source_transaction_type,
        });
      } catch {
        return {
          journal_entry_id: null,
          repaired: false,
          reason: "repair_candidate_invalid",
        };
      }
      if (opts.afterRepair) {
        await opts.afterRepair(client, opts.journal_entry_id!);
      }
      return { journal_entry_id: opts.journal_entry_id!, repaired: true };
    });
  }
  return withLuciaBypass(async (client: DbClient) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [
      opts.operating_company_id,
    ]);
    const candidate = await findStrictLifecycleRepairCandidate(client, {
      operating_company_id: opts.operating_company_id,
      factoring_advance_id: opts.factoring_advance_id,
      source_transaction_type: opts.source_transaction_type,
      memo: opts.memo,
      expected_legs: opts.expected_legs,
      expected_entry_date: opts.expected_entry_date,
    });
    if (candidate.kind === "ambiguous") {
      return { journal_entry_id: null, repaired: false, reason: "repair_ambiguous" };
    }
    if (candidate.kind === "invalid") {
      return {
        journal_entry_id: null,
        repaired: false,
        reason: candidate.reason ?? "repair_candidate_invalid",
      };
    }
    if (candidate.kind !== "unique" || !candidate.journal_entry_id) {
      return { journal_entry_id: null, repaired: false };
    }
    if (opts.expected_legs?.length) {
      const shape = await validateLifecycleJeExactShape(client, {
        operating_company_id: opts.operating_company_id,
        journal_entry_id: candidate.journal_entry_id,
        factoring_advance_id: opts.factoring_advance_id,
        source_transaction_type: opts.source_transaction_type,
        expected_legs: opts.expected_legs,
        expected_entry_date: opts.expected_entry_date,
      });
      if (!shape.ok) {
        return {
          journal_entry_id: null,
          repaired: false,
          reason: shape.reason,
        };
      }
    }
    try {
      await attachFactoringLifecycleSourceLinksStrict(client, {
        operating_company_id: opts.operating_company_id,
        journal_entry_id: candidate.journal_entry_id,
        factoring_advance_id: opts.factoring_advance_id,
        source_transaction_type: opts.source_transaction_type,
      });
    } catch {
      return { journal_entry_id: null, repaired: false, reason: "repair_candidate_invalid" };
    }
    if (opts.afterRepair) {
      await opts.afterRepair(client, candidate.journal_entry_id);
    }
    return { journal_entry_id: candidate.journal_entry_id, repaired: true };
  });
}

/**
 * Create JE + lifecycle source links (+ optional same-txn side effects) in ONE withCurrentUser txn.
 * Injected failure between JE and links rolls back — no orphan JE / duplicate financial artifacts.
 */
async function createFactoringJournalEntryAtomically(opts: {
  actor_user_id: string;
  je: CreateJournalEntryInput;
  factoring_advance_id: string;
  source_transaction_type: FactoringLifecycleSourceType;
  /** Deterministic unique event key — unique DB constraint prevents concurrent double-post. */
  event_key: string;
  expected_legs?: ExpectedLifecycleLeg[];
  afterLifecycleBeforeCommit?: (client: DbClient, journalEntryId: string) => Promise<void>;
  /** When provided, JE is created on this client (caller owns the outer txn — no nested withCurrentUser). */
  client?: DbClient;
}): Promise<{ id: string; already_claimed?: boolean }> {
  const resolveExisting = async (client: DbClient, journalEntryId: string) => {
    if (opts.expected_legs?.length) {
      const shape = await validateLifecycleJeExactShape(client, {
        operating_company_id: opts.je.operating_company_id,
        journal_entry_id: journalEntryId,
        factoring_advance_id: opts.factoring_advance_id,
        source_transaction_type: opts.source_transaction_type,
        expected_legs: opts.expected_legs,
      });
      if (!shape.ok) {
        throw new Error(`factoring_lifecycle_posting_key_invalid_shape:${shape.reason}`);
      }
    }
    await attachFactoringLifecycleSourceLinksStrict(client, {
      operating_company_id: opts.je.operating_company_id,
      journal_entry_id: journalEntryId,
      factoring_advance_id: opts.factoring_advance_id,
      source_transaction_type: opts.source_transaction_type,
    });
    if (opts.afterLifecycleBeforeCommit) {
      await opts.afterLifecycleBeforeCommit(client, journalEntryId);
    }
    return { id: journalEntryId, already_claimed: true as const };
  };

  const run = async (client: DbClient) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [
      opts.je.operating_company_id,
    ]);
    await ensureOpenPeriod(client, opts.je.operating_company_id, opts.je.entry_date);

    const existingKey = await findLifecyclePostingKeyJe(client, {
      operating_company_id: opts.je.operating_company_id,
      factoring_advance_id: opts.factoring_advance_id,
      source_transaction_type: opts.source_transaction_type,
      event_key: opts.event_key,
    });
    if (existingKey) {
      return resolveExisting(client, existingKey);
    }

    // Savepoint so a concurrent posting-key loser can roll back the JE insert and
    // deterministically resolve to the winner's validated already_posted JE (no 25P02).
    await client.query(`SAVEPOINT factoring_lifecycle_je_create`);
    try {
      const header = await createJournalEntry(
        opts.je,
        { userId: opts.actor_user_id, role: "system" },
        {
          client,
          suppressSideEffects: true,
          afterInsertBeforeCommit: async (c, hdr) => {
            if (__posterAtomicityTestHooks.failAfterJeBeforeLifecycleLinks) {
              throw new Error("injected_failure_between_je_and_lifecycle_links");
            }
            const claim = await claimFactoringLifecyclePostingKey(c, {
              operating_company_id: opts.je.operating_company_id,
              factoring_advance_id: opts.factoring_advance_id,
              source_transaction_type: opts.source_transaction_type,
              event_key: opts.event_key,
              journal_entry_id: hdr.id,
            });
            if (claim === "already_claimed") {
              throw new FactoringLifecyclePostingKeyRaceError();
            }
            await attachFactoringLifecycleSourceLinksStrict(c, {
              operating_company_id: opts.je.operating_company_id,
              journal_entry_id: hdr.id,
              factoring_advance_id: opts.factoring_advance_id,
              source_transaction_type: opts.source_transaction_type,
            });
            if (opts.afterLifecycleBeforeCommit) {
              await opts.afterLifecycleBeforeCommit(c, hdr.id);
            }
          },
        }
      );
      await client.query(`RELEASE SAVEPOINT factoring_lifecycle_je_create`);
      return { id: header.id, already_claimed: false as const };
    } catch (e) {
      await client.query(`ROLLBACK TO SAVEPOINT factoring_lifecycle_je_create`);
      if (e instanceof FactoringLifecyclePostingKeyRaceError || (e as Error)?.message === "factoring_lifecycle_posting_key_race") {
        const winner = await findLifecyclePostingKeyJe(client, {
          operating_company_id: opts.je.operating_company_id,
          factoring_advance_id: opts.factoring_advance_id,
          source_transaction_type: opts.source_transaction_type,
          event_key: opts.event_key,
        });
        if (!winner) throw e;
        return resolveExisting(client, winner);
      }
      throw e;
    }
  };

  const created = opts.client
    ? await run(opts.client)
    : await withCurrentUser(opts.actor_user_id, (client) => run(client));

  if (!created.already_claimed && !opts.client) {
    await enqueueJournalEntrySideEffects(opts.je, created.id, opts.actor_user_id);
  }
  return created;
}

// ---------------------------------------------------------------------------------------------------
// STEP 2 — FUNDING (posts at funding, using FARO's actual funded figures; A/R is UNTOUCHED).
//   Dr Cash + Dr Factoring Reserves + Dr Factoring Fees (+ Dr Bank/ACH) / Cr Factoring Advance (liability).
//   The liability is the FULL net invoice (invoice_total_cents). Cash is derived so the entry balances by
//   construction: cash = invoice_total - reserve - fee - ach. `postFactoringAdvanceEvent` keeps the prior
//   name/shape so the route + tests keep compiling; `funding_figures` lets the funding-report import supply
//   FARO's actual reserve/fee/ACH breakdown (scope C).
// ---------------------------------------------------------------------------------------------------
export type PostFactoringAdvanceInput = {
  operating_company_id: string;
  factoring_advance_id: string;
  actor_user_id: string;
  advanced_at_iso?: string | null;
  // FARO's ACTUAL funded breakdown (from the funding report). When omitted, reserve/fee are read from the
  // advance row and ACH defaults to 0 (the advance row has no ACH column).
  funding_figures?: {
    invoice_total_cents?: number;
    reserve_cents?: number;
    fee_cents?: number;
    ach_cents?: number;
  } | null;
};

function fundingExpectedLegs(opts: {
  cash: number;
  reserve: number;
  fee: number;
  ach: number;
  liability: number;
}): ExpectedLifecycleLeg[] {
  const legs: ExpectedLifecycleLeg[] = [];
  if (opts.cash > 0) legs.push({ role: "cash_clearing", debit_or_credit: "debit", amount_cents: opts.cash });
  if (opts.reserve > 0) legs.push({ role: "factor_reserve_held", debit_or_credit: "debit", amount_cents: opts.reserve });
  if (opts.fee > 0) legs.push({ role: "factor_fee_expense", debit_or_credit: "debit", amount_cents: opts.fee });
  // FACT-05 — ACH/wire is a transaction cost, not the Faro financing fee.
  if (opts.ach > 0) legs.push({ role: "factor_wire_fee", debit_or_credit: "debit", amount_cents: opts.ach });
  legs.push({ role: "factoring_advance_liability", debit_or_credit: "credit", amount_cents: opts.liability });
  return legs;
}

/**
 * Bounded retry for transient Postgres deadlocks (SQLSTATE 40P01) and serialization failures (40001).
 *
 * A 40P01/40001 aborts the whole transaction — Postgres guarantees a full rollback with NO partial
 * writes — so re-running the poster from the top is safe: the posting-key claim (ON CONFLICT) plus the
 * deterministic findLifecyclePostingKeyJe lookup resolve any concurrently-committed work to
 * `already_posted` rather than double-posting. Funding opens two short-lived transactions (a lucia-bypass
 * read to prepare, then a caller-owned JE write); under heavy concurrency either can lose a rare lock
 * cycle against sibling lifecycle/read transactions. Surfacing that transient conflict as a hard posting
 * failure is wrong; retrying with jittered backoff (so the winner commits and releases) is the
 * production-correct behavior — the same transient-conflict handling NetSuite/QBO-grade posters use.
 * This is a resiliency wrapper only: it never suppresses a real error (any non-40P01/40001 rethrows
 * immediately) and never weakens a validation result.
 */
async function retryOnFactoringDeadlock<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const code = (e as { code?: string } | null)?.code;
      if (code !== "40P01" && code !== "40001") throw e;
      lastErr = e;
      const backoffMs = 25 * (attempt + 1) + Math.floor(Math.random() * 25);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }
  throw lastErr;
}

export async function postFactoringAdvanceEvent(input: PostFactoringAdvanceInput): Promise<PostResult> {
  return retryOnFactoringDeadlock(() => postFactoringAdvanceEventImpl(input));
}

async function postFactoringAdvanceEventImpl(input: PostFactoringAdvanceInput): Promise<PostResult> {
  const prepared = await withLuciaBypass(async (client: DbClient) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);
    if (!(await factoringPostingEnabled(client, input.operating_company_id))) return { gate: "flag_off" as const };

    const advance = await loadAdvance(client, input.operating_company_id, input.factoring_advance_id);
    if (!advance) return { gate: "advance_not_found" as const };

    let entryDate: string;
    try {
      entryDate = resolveCanonicalEntryDate(
        input.advanced_at_iso,
        advance.advanced_at,
        advance.submitted_at,
        companyBusinessDate()
      );
    } catch (e) {
      if (e instanceof FactoringEntryDateError) return { gate: e.reason };
      throw e;
    }

    const faro = await requireFaroBoundAdvance(
      client,
      input.operating_company_id,
      input.factoring_advance_id,
      entryDate
    );
    if (!faro.ok) return { gate: faro.reason! };

    const liability = Number(input.funding_figures?.invoice_total_cents ?? advance.invoice_total_cents ?? 0);
    const reserve = Number(input.funding_figures?.reserve_cents ?? advance.reserve_amount_cents ?? 0);
    const fee = Number(input.funding_figures?.fee_cents ?? advance.factor_fee_cents ?? 0);
    const ach = Number(input.funding_figures?.ach_cents ?? 0);
    if (liability <= 0) return { gate: "zero_amount" as const };
    const cash = liability - reserve - fee - ach;
    if (cash < 0 || reserve < 0 || fee < 0 || ach < 0) {
      // FAIL CLOSED — never post a funding entry whose fees exceed the pledged invoice (would imply a
      // negative cash leg / unbalanced economics). Surface for reconciliation instead of silently posting.
      throw new Error(
        `factoring_funding_figures_invalid: liability=${liability} reserve=${reserve} fee=${fee} ach=${ach} => cash=${cash}`
      );
    }

    const memo = `Factoring funding ${advance.display_id}`;
    const expectedLegs = fundingExpectedLegs({ cash, reserve, fee, ach, liability });
    const eventKey = "funding";
    const keyJe = await findLifecyclePostingKeyJe(client, {
      operating_company_id: input.operating_company_id,
      factoring_advance_id: input.factoring_advance_id,
      source_transaction_type: "factoring_advance",
      event_key: eventKey,
    });
    const candidate = await findStrictLifecycleRepairCandidate(client, {
      operating_company_id: input.operating_company_id,
      factoring_advance_id: input.factoring_advance_id,
      source_transaction_type: "factoring_advance",
      memo,
      expected_legs: expectedLegs,
    });
    if (candidate.kind === "ambiguous") return { gate: "repair_ambiguous" as const };
    if (candidate.kind === "invalid") return { gate: "repair_candidate_invalid" as const, reason: candidate.reason };
    if (keyJe || candidate.kind === "unique") {
      return {
        gate: "already_posted" as const,
        memo,
        reserve,
        entryDate,
        eventKey,
        expected_legs: expectedLegs,
        journal_entry_id: keyJe ?? candidate.journal_entry_id ?? null,
      };
    }

    // Resolve every account per-entity, fail-closed. NO ar_control at funding (borrowing keeps A/R).
    const cashAccountId = await resolveRoleAccount(client, input.operating_company_id, "cash_clearing");
    const reserveAccountId = await resolveRoleAccount(client, input.operating_company_id, "factor_reserve_held");
    const feeAccountId = await resolveRoleAccount(client, input.operating_company_id, "factor_fee_expense");
    const wireFeeAccountId =
      ach > 0 ? await resolveRoleAccount(client, input.operating_company_id, "factor_wire_fee") : null;
    const liabilityAccountId = await resolveRoleAccount(client, input.operating_company_id, "factoring_advance_liability");

    const postings: Array<{ account_id: string; debit_or_credit: "debit" | "credit"; amount_cents: number; description: string }> = [];
    if (cash > 0) postings.push({ account_id: cashAccountId, debit_or_credit: "debit", amount_cents: cash, description: `${memo} — cash advanced` });
    if (reserve > 0) postings.push({ account_id: reserveAccountId, debit_or_credit: "debit", amount_cents: reserve, description: `${memo} — reserve held (due-from-factor)` });
    if (fee > 0) postings.push({ account_id: feeAccountId, debit_or_credit: "debit", amount_cents: fee, description: `${memo} — factoring fee (interest & financing)` });
    // FACT-05 — ACH/wire fee on factor_wire_fee (BC-Ach & Wire Fees), distinct from factor_fee_expense.
    if (ach > 0) {
      if (!wireFeeAccountId) {
        throw new Error("factor_wire_fee CoA role unbound — cannot post ACH/wire fee (FACT-05)");
      }
      postings.push({
        account_id: wireFeeAccountId,
        debit_or_credit: "debit",
        amount_cents: ach,
        description: `${memo} — bank/ACH wire fee`,
      });
    }
    postings.push({ account_id: liabilityAccountId, debit_or_credit: "credit", amount_cents: liability, description: `${memo} — factoring advance (liability)` });

    return { gate: "post" as const, memo, entryDate, postings, reserve, expected_legs: expectedLegs, eventKey };
  });

  if (prepared.gate === "flag_off") return FLAG_OFF;
  if (prepared.gate === "advance_not_found") return { posted: false, reason: "advance_not_found" };
  if (prepared.gate === "zero_amount") return { posted: false, reason: "zero_amount" };
  if (prepared.gate === "policy_invalid_entry_date") return { posted: false, reason: "policy_invalid_entry_date" };
  if (prepared.gate === "policy_missing_entry_date") return { posted: false, reason: "policy_missing_entry_date" };
  if (prepared.gate === "policy_faro_agreement") return { posted: false, reason: "policy_faro_agreement" };
  if (prepared.gate === "policy_advance_not_bound_to_faro") {
    return { posted: false, reason: "policy_advance_not_bound_to_faro" };
  }
  if (prepared.gate === "repair_ambiguous") return { posted: false, reason: "repair_ambiguous" };
  if (prepared.gate === "repair_candidate_invalid") {
    return { posted: false, reason: "repair_candidate_invalid" };
  }
  if (prepared.gate === "already_posted") {
    const reserveHeldCents = Number(prepared.reserve ?? 0);
    const repairEntryDate = prepared.entryDate;
    if (!repairEntryDate) {
      return { posted: false, reason: "repair_candidate_invalid" };
    }
    const repaired = await repairAlreadyPostedLifecycle({
      operating_company_id: input.operating_company_id,
      factoring_advance_id: input.factoring_advance_id,
      source_transaction_type: "factoring_advance",
      memo: prepared.memo,
      journal_entry_id: prepared.journal_entry_id ?? null,
      expected_legs: prepared.expected_legs,
      afterRepair: async (client, journalEntryId) => {
        if (!journalEntryId || reserveHeldCents <= 0) return;
        await recordReserveMovement(
          client,
          input.operating_company_id,
          input.factoring_advance_id,
          "held",
          reserveHeldCents,
          repairEntryDate,
          journalEntryId
        );
      },
    });
    if (repaired.reason === "repair_ambiguous") return { posted: false, reason: "repair_ambiguous" };
    if (repaired.reason === "repair_candidate_invalid" || repaired.reason?.startsWith("repair_candidate_")) {
      return { posted: false, reason: "repair_candidate_invalid" };
    }
    return { posted: false, reason: "already_posted", journal_entry_id: repaired.journal_entry_id ?? undefined };
  }

  if (prepared.gate !== "post") {
    return { posted: false, reason: "advance_not_found" };
  }

  const jeInput: CreateJournalEntryInput = {
    operating_company_id: input.operating_company_id,
    entry_date: prepared.entryDate,
    memo: prepared.memo,
    source: "auto",
    postings: prepared.postings,
  };
  // Funding must post via createJournalEntry( (chain-06 / secured-borrowing guards). Lifecycle source
  // links + reserve_held share the same caller-owned txn via afterInsertBeforeCommit.
  const created = await withCurrentUser(input.actor_user_id, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [
      input.operating_company_id,
    ]);
    // Uniform lock order: take FOR UPDATE on the advance BEFORE the JE write claims its posting-key
    // (which takes an FK KEY-SHARE on this same advance row). Every other lifecycle path
    // (payment/chargeback/default-interest) already locks the advance first; funding was the lone
    // exception, and that KEY-SHARE-vs-FOR-UPDATE inversion on accounting.factoring_advances was the
    // cross-transaction deadlock cycle. Locking here also correctly serializes a funding post against
    // any concurrent lifecycle mutation on the same advance.
    await lockFactoringAdvanceForSettlement(
      client,
      input.operating_company_id,
      input.factoring_advance_id
    );
    await ensureOpenPeriod(client, input.operating_company_id, prepared.entryDate);
    await client.query(`SAVEPOINT factoring_lifecycle_je_create`);
    try {
      const header = await createJournalEntry(
        jeInput,
        { userId: input.actor_user_id, role: "system" },
        {
          client,
          suppressSideEffects: true,
          afterInsertBeforeCommit: async (c, hdr) => {
            if (__posterAtomicityTestHooks.failAfterJeBeforeLifecycleLinks) {
              throw new Error("injected_failure_between_je_and_lifecycle_links");
            }
            const claim = await claimFactoringLifecyclePostingKey(c, {
              operating_company_id: input.operating_company_id,
              factoring_advance_id: input.factoring_advance_id,
              source_transaction_type: "factoring_advance",
              event_key: "funding",
              journal_entry_id: hdr.id,
            });
            if (claim === "already_claimed") {
              throw new FactoringLifecyclePostingKeyRaceError();
            }
            await attachFactoringLifecycleSourceLinksStrict(c, {
              operating_company_id: input.operating_company_id,
              journal_entry_id: hdr.id,
              factoring_advance_id: input.factoring_advance_id,
              source_transaction_type: "factoring_advance",
            });
            if (prepared.reserve > 0) {
              await recordReserveMovement(
                c,
                input.operating_company_id,
                input.factoring_advance_id,
                "held",
                prepared.reserve,
                prepared.entryDate,
                hdr.id
              );
            }
          },
        }
      );
      await client.query(`RELEASE SAVEPOINT factoring_lifecycle_je_create`);
      return { id: header.id, already_claimed: false as const };
    } catch (e) {
      await client.query(`ROLLBACK TO SAVEPOINT factoring_lifecycle_je_create`);
      if (
        e instanceof FactoringLifecyclePostingKeyRaceError ||
        (e as Error)?.message === "factoring_lifecycle_posting_key_race"
      ) {
        const winner = await findLifecyclePostingKeyJe(client, {
          operating_company_id: input.operating_company_id,
          factoring_advance_id: input.factoring_advance_id,
          source_transaction_type: "factoring_advance",
          event_key: "funding",
        });
        if (!winner) throw e;
        if (prepared.expected_legs?.length) {
          const shape = await validateLifecycleJeExactShape(client, {
            operating_company_id: input.operating_company_id,
            journal_entry_id: winner,
            factoring_advance_id: input.factoring_advance_id,
            source_transaction_type: "factoring_advance",
            expected_legs: prepared.expected_legs,
          });
          if (!shape.ok) throw new Error(`factoring_lifecycle_posting_key_invalid_shape:${shape.reason}`);
        }
        await attachFactoringLifecycleSourceLinksStrict(client, {
          operating_company_id: input.operating_company_id,
          journal_entry_id: winner,
          factoring_advance_id: input.factoring_advance_id,
          source_transaction_type: "factoring_advance",
        });
        if (prepared.reserve > 0) {
          await recordReserveMovement(
            client,
            input.operating_company_id,
            input.factoring_advance_id,
            "held",
            prepared.reserve,
            prepared.entryDate,
            winner
          );
        }
        return { id: winner, already_claimed: true as const };
      }
      throw e;
    }
  });
  if (!created.already_claimed) {
    await enqueueJournalEntrySideEffects(jeInput, created.id, input.actor_user_id);
  }

  return {
    posted: !created.already_claimed,
    reason: created.already_claimed ? "already_posted" : undefined,
    journal_entry_id: created.id,
    memo: prepared.memo,
  };
}

// ---------------------------------------------------------------------------------------------------
// VOID REVERSAL — ACCT-F5980. Voiding an advance BEFORE reserve-release/customer-payment/recourse
// (route only allows void from status IN ('submitted','advanced')) is the only lifecycle point where a
// funding JE can exist without any downstream JE depending on it. The factoring-advances void route
// used to flip factoring_advances.status='voided' and never touch the posted funding liability JE —
// the source record read "voided" while the GL still carried a live, un-reversed liability forever.
// Fixed by reusing the SAME reverse-not-flip machinery journal-entries.service.ts already exposes for
// the standalone JE-void action (Option 1 / NetSuite-QBO model: post an equal/opposite reversing JE,
// bidirectional header linkage, original NEVER flipped/deleted) — no new GL math invented here.
// ---------------------------------------------------------------------------------------------------
export type ReverseFactoringAdvanceInput = {
  operating_company_id: string;
  factoring_advance_id: string;
  actor_user_id: string;
  reason: string;
};

export type ReverseFactoringAdvanceResult =
  | { reversed: false; reason: "flag_off" | "no_posting_found" }
  | {
      reversed: true;
      reversal_journal_entry_id: string;
      original_journal_entry_id: string;
      /**
       * FAC-VOID-ENUM-2150: every linked posting key this advance still had a live (posted, not yet
       * reversed) JE for — funding plus any customer-payment/interest/recourse legs that had already
       * posted before the void. Each was individually reversed via reverseJournalEntryNoFlip. Length
       * is always >= 1 (the funding leg is always present when reversed=true) but callers that only
       * care about the funding reversal can keep reading the two top-level fields above unchanged.
       */
      all_reversed: Array<{
        source_transaction_type: string;
        event_key: string;
        original_journal_entry_id: string;
        reversal_journal_entry_id: string;
      }>;
    };

export async function reverseFactoringAdvanceEvent(
  input: ReverseFactoringAdvanceInput
): Promise<ReverseFactoringAdvanceResult> {
  return retryOnFactoringDeadlock(() => reverseFactoringAdvanceEventImpl(input));
}

async function reverseFactoringAdvanceEventImpl(
  input: ReverseFactoringAdvanceInput
): Promise<ReverseFactoringAdvanceResult> {
  return withCurrentUser(input.actor_user_id, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [
      input.operating_company_id,
    ]);
    // Same gate the original funding post used — if GL posting is OFF for this entity there is no
    // liability JE to reverse (the advance was never posted, so a status-only void is already correct).
    if (!(await factoringPostingEnabled(client, input.operating_company_id))) {
      return { reversed: false, reason: "flag_off" as const };
    }
    // FAC-VOID-ENUM-2150: reverse EVERY still-live linked posting, not just the hardcoded "funding"
    // leg. The original assumption here ("void only ever happens before any downstream JE exists,
    // because the route only allows void from submitted/advanced status") is false in practice — proven
    // live: a factoring_customer_payment JE posted while the advance was still 'advanced', then the
    // advance was voided anyway, leaving that payment's Dr 2150 leg permanently un-reversed while the
    // source record read 'voided'. Order matters for auditability (oldest first, funding is always
    // earliest) but every leg is reversed regardless of order — reverseJournalEntryNoFlip is per-JE and
    // idempotent, so processing more than the historical single funding leg is safe.
    const liveLegs = await findAllLifecyclePostingKeyJes(client, {
      operating_company_id: input.operating_company_id,
      factoring_advance_id: input.factoring_advance_id,
    });
    if (liveLegs.length === 0) {
      return { reversed: false, reason: "no_posting_found" as const };
    }
    const allReversed: Array<{
      source_transaction_type: string;
      event_key: string;
      original_journal_entry_id: string;
      reversal_journal_entry_id: string;
    }> = [];
    for (const leg of liveLegs) {
      const { reversal } = await reverseJournalEntryNoFlip(client, {
        operatingCompanyId: input.operating_company_id,
        journalEntryId: leg.journal_entry_id,
        reason: input.reason,
        actorUserId: input.actor_user_id,
      });
      if (!reversal.reversal_journal_entry_id) {
        // Unreachable in practice — reverseJournalEntryNoFlip itself throws "journal_entry_nothing_to_reverse"
        // before returning a null id — but stay type-honest rather than asserting past the compiler.
        throw new Error("factoring_advance_reversal_journal_entry_id_missing");
      }
      allReversed.push({
        source_transaction_type: leg.source_transaction_type,
        event_key: leg.event_key,
        original_journal_entry_id: leg.journal_entry_id,
        reversal_journal_entry_id: reversal.reversal_journal_entry_id,
      });
    }
    // Funding is the canonical "primary" reversal for the two backward-compatible top-level fields —
    // it is always present (findAllLifecyclePostingKeyJes only returns keys that exist, and funding is
    // written by the same posting call that creates the advance's liability in the first place) unless
    // GL posting was off at funding time, in which case liveLegs would be empty and we'd have already
    // returned no_posting_found above.
    const funding = allReversed.find((r) => r.source_transaction_type === "factoring_advance" && r.event_key === "funding") ?? allReversed[0]!;
    return {
      reversed: true as const,
      reversal_journal_entry_id: funding.reversal_journal_entry_id,
      original_journal_entry_id: funding.original_journal_entry_id,
      all_reversed: allReversed,
    };
  });
}

// ---------------------------------------------------------------------------------------------------
// STEP 3 — CUSTOMER PAYMENT (customer pays FARO). Dr Factoring Advance / Cr A/R. The ONLY place A/R goes
//   down under the borrowing model.
// ---------------------------------------------------------------------------------------------------
export type PostFactoringCustomerPaymentInput = {
  operating_company_id: string;
  factoring_advance_id: string;
  actor_user_id: string;
  amount_cents: number;
  paid_at_iso?: string | null;
};

export async function postFactoringCustomerPaymentEvent(input: PostFactoringCustomerPaymentInput): Promise<PostResult> {
  return retryOnFactoringDeadlock(() => postFactoringCustomerPaymentEventImpl(input));
}

async function postFactoringCustomerPaymentEventImpl(input: PostFactoringCustomerPaymentInput): Promise<PostResult> {
  const amount = Number(input.amount_cents ?? 0);
  if (amount <= 0) return { posted: false, reason: "zero_amount" };

  const expectedLegs: ExpectedLifecycleLeg[] = [
    { role: "factoring_advance_liability", debit_or_credit: "debit", amount_cents: amount },
    { role: "ar_control", debit_or_credit: "credit", amount_cents: amount },
  ];

  const prepared = await withLuciaBypass(async (client: DbClient) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);
    if (!(await factoringPostingEnabled(client, input.operating_company_id))) return { gate: "flag_off" as const };

    const advance = await loadAdvance(client, input.operating_company_id, input.factoring_advance_id);
    if (!advance) return { gate: "advance_not_found" as const };

    let entryDate: string;
    try {
      entryDate = resolveCanonicalEntryDate(
        input.paid_at_iso,
        advance.collected_at,
        companyBusinessDate()
      );
    } catch (e) {
      if (e instanceof FactoringEntryDateError) return { gate: e.reason };
      throw e;
    }

    const faro = await requireFaroBoundAdvance(
      client,
      input.operating_company_id,
      input.factoring_advance_id,
      entryDate
    );
    if (!faro.ok) return { gate: faro.reason! };

    // Lock + exact outstanding BEFORE any payment JE / subledger write. Reject overpayment — no Math.min.
    await lockFactoringAdvanceForSettlement(client, input.operating_company_id, input.factoring_advance_id);
    const outstanding = await linkedOutstandingLiabilityCents(
      client,
      input.operating_company_id,
      input.factoring_advance_id
    );
    if (amount > outstanding) {
      return { gate: "policy_overpayment" as const, outstanding };
    }

    const memo = `Factoring customer payment ${advance.display_id} (${amount}@${entryDate})`;
    const eventKey = `customer_payment:${amount}@${entryDate}`;
    const keyJe = await findLifecyclePostingKeyJe(client, {
      operating_company_id: input.operating_company_id,
      factoring_advance_id: input.factoring_advance_id,
      source_transaction_type: "factoring_customer_payment",
      event_key: eventKey,
    });
    const candidate = await findStrictLifecycleRepairCandidate(client, {
      operating_company_id: input.operating_company_id,
      factoring_advance_id: input.factoring_advance_id,
      source_transaction_type: "factoring_customer_payment",
      memo,
      expected_legs: expectedLegs,
      // Event-scope: a prior partial payment's JE (different amount@date) is a SIBLING event, never this
      // payment's repair candidate — so a second distinct partial posts instead of failing exact-shape.
      event_key: eventKey,
    });
    if (candidate.kind === "ambiguous") return { gate: "repair_ambiguous" as const };
    if (candidate.kind === "invalid") return { gate: "repair_candidate_invalid" as const };
    if (keyJe || candidate.kind === "unique") {
      return {
        gate: "already_posted" as const,
        memo,
        entryDate,
        eventKey,
        journal_entry_id: keyJe ?? candidate.journal_entry_id ?? null,
      };
    }

    const liabilityAccountId = await resolveRoleAccount(client, input.operating_company_id, "factoring_advance_liability");
    const arAccountId = await resolveRoleAccount(client, input.operating_company_id, "ar_control");

    return {
      gate: "post" as const,
      memo,
      entryDate,
      eventKey,
      postings: [
        { account_id: liabilityAccountId, debit_or_credit: "debit" as const, amount_cents: amount, description: `${memo} — settle factoring advance` },
        { account_id: arAccountId, debit_or_credit: "credit" as const, amount_cents: amount, description: `${memo} — clear A/R (customer paid FARO)` },
      ],
    };
  });

  if (prepared.gate === "flag_off") return FLAG_OFF;
  if (prepared.gate === "advance_not_found") return { posted: false, reason: "advance_not_found" };
  if (prepared.gate === "policy_invalid_entry_date") return { posted: false, reason: "policy_invalid_entry_date" };
  if (prepared.gate === "policy_missing_entry_date") return { posted: false, reason: "policy_missing_entry_date" };
  if (prepared.gate === "policy_faro_agreement") return { posted: false, reason: "policy_faro_agreement" };
  if (prepared.gate === "policy_advance_not_bound_to_faro") {
    return { posted: false, reason: "policy_advance_not_bound_to_faro" };
  }
  if (prepared.gate === "policy_overpayment") return { posted: false, reason: "policy_overpayment" };
  if (prepared.gate === "repair_ambiguous") return { posted: false, reason: "repair_ambiguous" };
  if (prepared.gate === "repair_candidate_invalid") {
    return { posted: false, reason: "repair_candidate_invalid" };
  }
  if (prepared.gate === "already_posted") {
    const repaired = await repairAlreadyPostedLifecycle({
      operating_company_id: input.operating_company_id,
      factoring_advance_id: input.factoring_advance_id,
      source_transaction_type: "factoring_customer_payment",
      memo: prepared.memo,
      journal_entry_id: prepared.journal_entry_id ?? null,
      expected_legs: expectedLegs,
      afterRepair: async (client) => {
        await applyCustomerPaymentSubledgerRelief(
          client,
          input.operating_company_id,
          input.factoring_advance_id
        );
      },
    });
    if (repaired.reason === "repair_ambiguous") return { posted: false, reason: "repair_ambiguous" };
    if (repaired.reason === "repair_candidate_invalid" || repaired.reason?.startsWith("repair_candidate_")) {
      return { posted: false, reason: "repair_candidate_invalid" };
    }
    return { posted: false, reason: "already_posted", journal_entry_id: repaired.journal_entry_id ?? undefined };
  }

  if (prepared.gate !== "post") {
    return { posted: false, reason: "advance_not_found" };
  }
  const paymentEntryDate = prepared.entryDate;
  const paymentMemo = prepared.memo;
  const paymentPostings = prepared.postings;
  const paymentEventKey = prepared.eventKey ?? `customer_payment:${amount}@${paymentEntryDate}`;

  const jeInput: CreateJournalEntryInput = {
    operating_company_id: input.operating_company_id,
    entry_date: paymentEntryDate,
    memo: paymentMemo,
    source: "auto",
    postings: paymentPostings,
  };
  const created = await createFactoringJournalEntryAtomically({
    actor_user_id: input.actor_user_id,
    je: jeInput,
    factoring_advance_id: input.factoring_advance_id,
    source_transaction_type: "factoring_customer_payment",
    event_key: paymentEventKey,
    expected_legs: expectedLegs,
    afterLifecycleBeforeCommit: async (client, journalEntryId) => {
      // Re-lock + re-validate outstanding inside the posting txn (concurrent settlement safety).
      // Exclude this JE — its debit legs are already inserted and must not zero outstanding.
      await lockFactoringAdvanceForSettlement(client, input.operating_company_id, input.factoring_advance_id);
      const outstanding = await linkedOutstandingLiabilityCents(
        client,
        input.operating_company_id,
        input.factoring_advance_id,
        journalEntryId
      );
      if (amount > outstanding) {
        throw new Error(`factoring_customer_payment_overpayment: amount=${amount} outstanding=${outstanding}`);
      }
      // amount_paid_cents = cumulative ledger-backed paid (includes this JE), not latest allocation.
      await applyCustomerPaymentSubledgerRelief(
        client,
        input.operating_company_id,
        input.factoring_advance_id
      );
    },
  });

  return {
    posted: !created.already_claimed,
    reason: created.already_claimed ? "already_posted" : undefined,
    journal_entry_id: created.id,
    memo: paymentMemo,
  };
}

// ---------------------------------------------------------------------------------------------------
// STEP 4 — RESERVE RELEASE (FARO releases the withheld reserve). Dr Cash / Cr Factoring Reserves. NOT a
//   customer_payment; NOT against A/R. `postFactoringReleaseEvent` keeps the prior name/shape; factor_fee_cents
//   is accepted for signature compatibility but is NOT re-booked here (the fee is booked at funding).
// ---------------------------------------------------------------------------------------------------
export type PostFactoringReleaseInput = {
  operating_company_id: string;
  factoring_advance_id: string;
  actor_user_id: string;
  released_at_iso?: string | null;
  release_amount_cents: number;
  factor_fee_cents?: number;
};

export async function postFactoringReleaseEvent(input: PostFactoringReleaseInput): Promise<PostResult> {
  return retryOnFactoringDeadlock(() => postFactoringReleaseEventImpl(input));
}

async function postFactoringReleaseEventImpl(input: PostFactoringReleaseInput): Promise<PostResult> {
  const releaseAmount = Number(input.release_amount_cents ?? 0);
  if (releaseAmount <= 0) return { posted: false, reason: "zero_amount" };

  const expectedLegs: ExpectedLifecycleLeg[] = [
    { role: "cash_clearing", debit_or_credit: "debit", amount_cents: releaseAmount },
    { role: "factor_reserve_held", debit_or_credit: "credit", amount_cents: releaseAmount },
  ];

  const prepared = await withLuciaBypass(async (client: DbClient) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);
    if (!(await factoringPostingEnabled(client, input.operating_company_id))) return { gate: "flag_off" as const };

    const advance = await loadAdvance(client, input.operating_company_id, input.factoring_advance_id);
    if (!advance) return { gate: "advance_not_found" as const };

    let entryDate: string;
    try {
      entryDate = resolveCanonicalEntryDate(
        input.released_at_iso,
        advance.released_at,
        companyBusinessDate()
      );
    } catch (e) {
      if (e instanceof FactoringEntryDateError) return { gate: e.reason };
      throw e;
    }

    const faro = await requireFaroBoundAdvance(
      client,
      input.operating_company_id,
      input.factoring_advance_id,
      entryDate
    );
    if (!faro.ok) return { gate: faro.reason! };

    await lockFactoringAdvanceForSettlement(client, input.operating_company_id, input.factoring_advance_id);
    const outstandingReserve = await linkedOutstandingReserveCents(
      client,
      input.operating_company_id,
      input.factoring_advance_id
    );
    if (releaseAmount > outstandingReserve) {
      return { gate: "policy_over_release" as const, outstanding: outstandingReserve };
    }

    const memo = `Factoring reserve release ${advance.display_id} (${releaseAmount}@${entryDate})`;
    const eventKey = `reserve_release:${releaseAmount}@${entryDate}`;
    const keyJe = await findLifecyclePostingKeyJe(client, {
      operating_company_id: input.operating_company_id,
      factoring_advance_id: input.factoring_advance_id,
      source_transaction_type: "factoring_reserve_release",
      event_key: eventKey,
    });
    const candidate = await findStrictLifecycleRepairCandidate(client, {
      operating_company_id: input.operating_company_id,
      factoring_advance_id: input.factoring_advance_id,
      source_transaction_type: "factoring_reserve_release",
      memo,
      expected_legs: expectedLegs,
    });
    if (candidate.kind === "ambiguous") return { gate: "repair_ambiguous" as const };
    if (candidate.kind === "invalid") return { gate: "repair_candidate_invalid" as const };
    if (keyJe || candidate.kind === "unique") {
      return {
        gate: "already_posted" as const,
        memo,
        entryDate,
        eventKey,
        journal_entry_id: keyJe ?? candidate.journal_entry_id ?? null,
      };
    }

    const cashAccountId = await resolveRoleAccount(client, input.operating_company_id, "cash_clearing");
    const reserveAccountId = await resolveRoleAccount(client, input.operating_company_id, "factor_reserve_held");

    return {
      gate: "post" as const,
      memo,
      entryDate,
      eventKey,
      postings: [
        { account_id: cashAccountId, debit_or_credit: "debit" as const, amount_cents: releaseAmount, description: `${memo} — reserve returned to cash` },
        { account_id: reserveAccountId, debit_or_credit: "credit" as const, amount_cents: releaseAmount, description: `${memo} — release factoring reserve (asset)` },
      ],
    };
  });

  if (prepared.gate === "flag_off") return FLAG_OFF;
  if (prepared.gate === "advance_not_found") return { posted: false, reason: "advance_not_found" };
  if (prepared.gate === "policy_invalid_entry_date") return { posted: false, reason: "policy_invalid_entry_date" };
  if (prepared.gate === "policy_missing_entry_date") return { posted: false, reason: "policy_missing_entry_date" };
  if (prepared.gate === "policy_faro_agreement") return { posted: false, reason: "policy_faro_agreement" };
  if (prepared.gate === "policy_advance_not_bound_to_faro") {
    return { posted: false, reason: "policy_advance_not_bound_to_faro" };
  }
  if (prepared.gate === "policy_over_release") return { posted: false, reason: "policy_over_release" };
  if (prepared.gate === "repair_ambiguous") return { posted: false, reason: "repair_ambiguous" };
  if (prepared.gate === "repair_candidate_invalid") {
    return { posted: false, reason: "repair_candidate_invalid" };
  }
  if (prepared.gate === "already_posted") {
    const repairEntryDate = prepared.entryDate;
    if (!repairEntryDate) {
      return { posted: false, reason: "repair_candidate_invalid" };
    }
    const repaired = await repairAlreadyPostedLifecycle({
      operating_company_id: input.operating_company_id,
      factoring_advance_id: input.factoring_advance_id,
      source_transaction_type: "factoring_reserve_release",
      memo: prepared.memo,
      journal_entry_id: prepared.journal_entry_id ?? null,
      expected_legs: expectedLegs,
      afterRepair: async (client, journalEntryId) => {
        if (!journalEntryId) return;
        await recordReserveMovement(
          client,
          input.operating_company_id,
          input.factoring_advance_id,
          "released",
          releaseAmount,
          repairEntryDate,
          journalEntryId
        );
      },
    });
    if (repaired.reason === "repair_ambiguous") return { posted: false, reason: "repair_ambiguous" };
    if (repaired.reason === "repair_candidate_invalid" || repaired.reason?.startsWith("repair_candidate_")) {
      return { posted: false, reason: "repair_candidate_invalid" };
    }
    return { posted: false, reason: "already_posted", journal_entry_id: repaired.journal_entry_id ?? undefined };
  }

  if (prepared.gate !== "post") {
    return { posted: false, reason: "advance_not_found" };
  }
  const releaseEntryDate = prepared.entryDate;
  const releaseMemo = prepared.memo;
  const releasePostings = prepared.postings;
  const releaseEventKey = prepared.eventKey ?? `reserve_release:${releaseAmount}@${releaseEntryDate}`;

  const jeInput: CreateJournalEntryInput = {
    operating_company_id: input.operating_company_id,
    entry_date: releaseEntryDate,
    memo: releaseMemo,
    source: "auto",
    postings: releasePostings,
  };
  const created = await createFactoringJournalEntryAtomically({
    actor_user_id: input.actor_user_id,
    je: jeInput,
    factoring_advance_id: input.factoring_advance_id,
    source_transaction_type: "factoring_reserve_release",
    event_key: releaseEventKey,
    expected_legs: expectedLegs,
    afterLifecycleBeforeCommit: async (client, journalEntryId) => {
      await lockFactoringAdvanceForSettlement(client, input.operating_company_id, input.factoring_advance_id);
      // Exclude this JE — its credit legs are already inserted and must not zero reserve outstanding.
      const outstandingReserve = await linkedOutstandingReserveCents(
        client,
        input.operating_company_id,
        input.factoring_advance_id,
        journalEntryId
      );
      if (releaseAmount > outstandingReserve) {
        throw new Error(
          `factoring_reserve_over_release: amount=${releaseAmount} outstanding=${outstandingReserve}`
        );
      }
      await recordReserveMovement(
        client,
        input.operating_company_id,
        input.factoring_advance_id,
        "released",
        releaseAmount,
        releaseEntryDate,
        journalEntryId
      );
    },
  });

  return {
    posted: !created.already_claimed,
    reason: created.already_claimed ? "already_posted" : undefined,
    journal_entry_id: created.id,
    memo: releaseMemo,
  };
}


/**
 * Exact linked outstanding Faro liability (role legs) — never guessed from mutable status.
 * @param excludeJournalEntryId — when re-validating inside afterInsertBeforeCommit, exclude the
 *   in-flight settlement JE so its own debit legs do not zero out outstanding before the check.
 * @param beforeDateExclusive — when computing a HISTORICAL balance (e.g. the default-interest opening
 *   for a given accrual day), bound to postings whose entry_date is strictly BEFORE this date. This makes
 *   the opening the balance at the START of the accrual day: same-day and later customer payments do NOT
 *   reduce that day's interest base (contract), and a historical accrual's opening is reproducible under
 *   repair even after later payments land — so validateLifecycleJeExactShape no longer spuriously fails
 *   with an opening mismatch. Omit (NULL) for the live, as-of-now outstanding balance.
 */
async function linkedOutstandingLiabilityCents(
  client: DbClient,
  operatingCompanyId: string,
  factoringAdvanceId: string,
  excludeJournalEntryId?: string | null,
  beforeDateExclusive?: string | null
): Promise<number> {
  const notReversed = await liveJournalEntryNotReversedSql(client);
  const res = await client.query<{ outstanding: string }>(
    `
      SELECT COALESCE(
               SUM(CASE
                     WHEN jep.debit_or_credit = 'credit'
                      AND jep.source_transaction_type IN ('factoring_advance', 'factoring_default_interest')
                     THEN jep.amount_cents
                     WHEN jep.debit_or_credit = 'debit'
                      AND jep.source_transaction_type IN ('factoring_customer_payment', 'factoring_chargeback')
                     THEN -jep.amount_cents
                     ELSE 0
                   END),
               0
             )::text AS outstanding
        FROM accounting.journal_entry_postings jep
        JOIN accounting.journal_entries je
          ON je.id = jep.journal_entry_uuid
         AND je.operating_company_id = jep.operating_company_id
        JOIN accounting.chart_of_accounts_roles r
          ON r.account_id = jep.account_id
         AND r.operating_company_id = jep.operating_company_id
         AND r.is_active = true
         AND r.role = 'factoring_advance_liability'
       WHERE jep.operating_company_id = $1::uuid
         AND jep.source_transaction_id = $2::text
         AND je.status = 'posted'
         AND je.voided_at IS NULL
         AND ($3::uuid IS NULL OR je.id IS DISTINCT FROM $3::uuid)
         AND ($4::date IS NULL OR je.entry_date < $4::date)
         ${notReversed}
         AND NOT EXISTS (
               SELECT 1
                 FROM accounting.transaction_source_links tsl
                WHERE tsl.journal_entry_posting_id = jep.id
                  AND tsl.operating_company_id = jep.operating_company_id
                  AND tsl.linked_object_type = 'factoring_advance'
                  AND (
                    tsl.linked_object_id <> $2::text
                    OR (
                      jep.source_transaction_type IS NOT NULL
                      AND jep.source_transaction_type <> ''
                      AND tsl.relationship_role IS DISTINCT FROM (jep.source_transaction_type)
                    )
                  )
             )
    `,
    [operatingCompanyId, factoringAdvanceId, excludeJournalEntryId ?? null, beforeDateExclusive ?? null]
  );
  return Number(res.rows[0]?.outstanding ?? 0);
}

/**
 * Exact linked outstanding Faro reserve asset (held − released); excludes reversed JEs.
 * @param excludeJournalEntryId — exclude in-flight release JE when re-validating before commit.
 */
async function linkedOutstandingReserveCents(
  client: DbClient,
  operatingCompanyId: string,
  factoringAdvanceId: string,
  excludeJournalEntryId?: string | null
): Promise<number> {
  const notReversed = await liveJournalEntryNotReversedSql(client);
  const res = await client.query<{ outstanding: string }>(
    `
      SELECT COALESCE(
               SUM(CASE
                     WHEN jep.debit_or_credit = 'debit'
                      AND jep.source_transaction_type = 'factoring_advance'
                     THEN jep.amount_cents
                     WHEN jep.debit_or_credit = 'credit'
                      AND jep.source_transaction_type = 'factoring_reserve_release'
                     THEN -jep.amount_cents
                     ELSE 0
                   END),
               0
             )::text AS outstanding
        FROM accounting.journal_entry_postings jep
        JOIN accounting.journal_entries je
          ON je.id = jep.journal_entry_uuid
         AND je.operating_company_id = jep.operating_company_id
        JOIN accounting.chart_of_accounts_roles r
          ON r.account_id = jep.account_id
         AND r.operating_company_id = jep.operating_company_id
         AND r.is_active = true
         AND r.role = 'factor_reserve_held'
       WHERE jep.operating_company_id = $1::uuid
         AND jep.source_transaction_id = $2::text
         AND je.status = 'posted'
         AND je.voided_at IS NULL
         AND ($3::uuid IS NULL OR je.id IS DISTINCT FROM $3::uuid)
         ${notReversed}
    `,
    [operatingCompanyId, factoringAdvanceId, excludeJournalEntryId ?? null]
  );
  return Number(res.rows[0]?.outstanding ?? 0);
}

/** Lock advance row before outstanding calc / settlement writes (concurrent settlement safety). */
async function lockFactoringAdvanceForSettlement(
  client: DbClient,
  operatingCompanyId: string,
  factoringAdvanceId: string
): Promise<void> {
  await client.query(
    `
      SELECT id
        FROM accounting.factoring_advances
       WHERE id = $1::uuid
         AND operating_company_id = $2::uuid
       FOR UPDATE
    `,
    [factoringAdvanceId, operatingCompanyId]
  );
}

/** Exact linked outstanding trade A/R on advance invoices (non-void, unpaid remainder). */
async function linkedOutstandingRecoursedArCents(
  client: DbClient,
  operatingCompanyId: string,
  factoringAdvanceId: string
): Promise<number> {
  const res = await client.query<{ outstanding: string }>(
    `
      SELECT COALESCE(
               SUM(
                 GREATEST(
                   COALESCE(i.total_cents, 0) - COALESCE(i.amount_paid_cents, 0),
                   0
                 )
               ),
               0
             )::text AS outstanding
        FROM accounting.invoices i
       WHERE i.operating_company_id = $1::uuid
         AND i.factoring_advance_id = $2::uuid
         AND i.voided_at IS NULL
         AND i.status <> 'void'
    `,
    [operatingCompanyId, factoringAdvanceId]
  );
  return Number(res.rows[0]?.outstanding ?? 0);
}

/** Exported for day-95 orchestration — same exact-linked amounts the chargeback poster validates. */
export async function loadExactLinkedChargebackAmounts(
  operatingCompanyId: string,
  factoringAdvanceId: string
): Promise<{ liability_cents: number; recoursed_ar_cents: number }> {
  return withLuciaBypass(async (client: DbClient) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [
      operatingCompanyId,
    ]);
    return {
      liability_cents: await linkedOutstandingLiabilityCents(client, operatingCompanyId, factoringAdvanceId),
      recoursed_ar_cents: await linkedOutstandingRecoursedArCents(client, operatingCompanyId, factoringAdvanceId),
    };
  });
}

// ---------------------------------------------------------------------------------------------------
// STEP 5 — CHARGEBACK (customer fails to pay by the deadline). Two balanced entries:
//   (A) repay FARO:  Dr Factoring Advance + Dr Default Interest / Cr Cash.
//   (B) return the receivable:  Dr Factoring Recoursed Invoices / Cr A/R.
//   (The default funding path never reclassed A/R to Assigned-to-Faro, so the receivable is still in
//   ar_control; (B) moves it to the recoursed-invoices asset. Collect directly / write to bad debt later.)
// ---------------------------------------------------------------------------------------------------
export type PostFactoringChargebackInput = {
  operating_company_id: string;
  factoring_advance_id: string;
  actor_user_id: string;
  charged_back_at_iso?: string | null;
  /** Must equal exact linked outstanding liability — no partial / guessed amounts. */
  chargeback_amount_cents: number;
  /** Explicit interest on the repay leg (usually 0 when already accrued into liability). */
  default_interest_cents: number;
  /** Must equal exact linked outstanding invoice A/R — required; no default. */
  recoursed_ar_cents: number;
};

/**
 * Full-recourse chargeback/recourse — ONE caller-owned transaction:
 * repay JE + A/R reclass JE + advance/invoice status + subledger + source links + audit.
 * Partial / ambiguous amounts fail closed with policy_partial_or_ambiguous_recourse.
 */
export async function postFactoringChargebackEvent(input: PostFactoringChargebackInput): Promise<PostResult> {
  return retryOnFactoringDeadlock(() => postFactoringChargebackEventImpl(input));
}

async function postFactoringChargebackEventImpl(input: PostFactoringChargebackInput): Promise<PostResult> {
  if (
    input.recoursed_ar_cents == null ||
    input.default_interest_cents == null ||
    input.chargeback_amount_cents == null
  ) {
    return { posted: false, reason: "policy_partial_or_ambiguous_recourse" };
  }
  const chargeback = Number(input.chargeback_amount_cents);
  const interest = Number(input.default_interest_cents);
  const recoursed = Number(input.recoursed_ar_cents);
  if (!Number.isInteger(chargeback) || !Number.isInteger(interest) || !Number.isInteger(recoursed)) {
    return { posted: false, reason: "policy_partial_or_ambiguous_recourse" };
  }
  if (chargeback <= 0 || interest < 0 || recoursed <= 0) {
    return { posted: false, reason: "policy_partial_or_ambiguous_recourse" };
  }

  const sideEffectJes: Array<{ je: CreateJournalEntryInput; id: string }> = [];

  const outcome = await withCurrentUser(input.actor_user_id, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [
      input.operating_company_id,
    ]);
    if (!(await factoringPostingEnabled(client, input.operating_company_id))) {
      return { kind: "flag_off" as const };
    }

    const advance = await loadAdvance(client, input.operating_company_id, input.factoring_advance_id);
    if (!advance) return { kind: "advance_not_found" as const };

    let entryDate: string;
    try {
      entryDate = resolveCanonicalEntryDate(input.charged_back_at_iso, companyBusinessDate());
    } catch (e) {
      if (e instanceof FactoringEntryDateError) {
        return { kind: e.reason };
      }
      throw e;
    }

    const faro = await requireFaroBoundAdvance(
      client,
      input.operating_company_id,
      input.factoring_advance_id,
      entryDate
    );
    if (!faro.ok) return { kind: faro.reason! };

    await ensureOpenPeriod(client, input.operating_company_id, entryDate);

    // Deterministic idempotency under row lock: concurrent duplicate retries serialize here and
    // resolve to validated already_posted — never race into zero-outstanding policy failure.
    await lockFactoringAdvanceForSettlement(client, input.operating_company_id, input.factoring_advance_id);
    const lockedAdvance = await loadAdvance(client, input.operating_company_id, input.factoring_advance_id);
    if (!lockedAdvance) return { kind: "advance_not_found" as const };

    const repayEventKey = `chargeback_repay:${chargeback}+${interest}@${entryDate}`;
    const returnEventKey = `chargeback_return:${recoursed}@${entryDate}`;
    const repayMemo = `Factoring chargeback repay ${lockedAdvance.display_id} (${chargeback}+${interest}@${entryDate})`;
    const returnMemo = `Factoring chargeback receivable ${lockedAdvance.display_id} (${recoursed}@${entryDate})`;

    const repayExpectedLegs: ExpectedLifecycleLeg[] = [
      { role: "factoring_advance_liability", debit_or_credit: "debit", amount_cents: chargeback },
      ...(interest > 0
        ? [{ role: "default_interest_expense" as const, debit_or_credit: "debit" as const, amount_cents: interest }]
        : []),
      { role: "cash_clearing", debit_or_credit: "credit", amount_cents: chargeback + interest },
    ];
    const returnExpectedLegs: ExpectedLifecycleLeg[] = [
      { role: "factoring_recoursed_ar", debit_or_credit: "debit", amount_cents: recoursed },
      { role: "ar_control", debit_or_credit: "credit", amount_cents: recoursed },
    ];

    const repairChargebackAlreadyPosted = async (
      existingRepay: string,
      existingReturn: string
    ): Promise<
      | { kind: "already_posted"; journal_entry_id: string }
      | { kind: "repair_candidate_invalid" }
    > => {
      const repayShape = await validateLifecycleJeExactShape(client, {
        operating_company_id: input.operating_company_id,
        journal_entry_id: existingRepay,
        factoring_advance_id: input.factoring_advance_id,
        source_transaction_type: "factoring_chargeback",
        expected_legs: repayExpectedLegs,
        expected_entry_date: entryDate,
      });
      const returnShape = await validateLifecycleJeExactShape(client, {
        operating_company_id: input.operating_company_id,
        journal_entry_id: existingReturn,
        factoring_advance_id: input.factoring_advance_id,
        source_transaction_type: "factoring_chargeback",
        expected_legs: returnExpectedLegs,
        expected_entry_date: entryDate,
      });
      if (!repayShape.ok || !returnShape.ok) {
        return { kind: "repair_candidate_invalid" as const };
      }
      await attachFactoringLifecycleSourceLinksStrict(client, {
        operating_company_id: input.operating_company_id,
        journal_entry_id: existingRepay,
        factoring_advance_id: input.factoring_advance_id,
        source_transaction_type: "factoring_chargeback",
      });
      await attachFactoringLifecycleSourceLinksStrict(client, {
        operating_company_id: input.operating_company_id,
        journal_entry_id: existingReturn,
        factoring_advance_id: input.factoring_advance_id,
        source_transaction_type: "factoring_chargeback",
      });
      await applyChargebackSubledgerRelief(client, input.operating_company_id, input.factoring_advance_id);
      await client.query(
        `
          UPDATE accounting.factoring_advances
             SET status = 'recourse_returned',
                 recourse_returned_at = COALESCE(recourse_returned_at, $2::timestamptz)
           WHERE id = $1::uuid
             AND operating_company_id = $3::uuid
             AND status IN ('advanced', 'recourse_returned')
        `,
        [input.factoring_advance_id, `${entryDate}T12:00:00.000Z`, input.operating_company_id]
      );
      await client.query(
        `
          UPDATE accounting.invoices
             SET factoring_status = 'recourse_returned',
                 updated_at = now()
           WHERE factoring_advance_id = $1::uuid
             AND operating_company_id = $2::uuid
        `,
        [input.factoring_advance_id, input.operating_company_id]
      );
      await appendCrudAudit(
        client,
        input.actor_user_id,
        "accounting.factoring_chargeback_posted",
        {
          resource_type: "accounting.factoring_advances",
          resource_id: input.factoring_advance_id,
          operating_company_id: input.operating_company_id,
          display_id: lockedAdvance.display_id,
          chargeback_amount_cents: chargeback,
          default_interest_cents: interest,
          recoursed_ar_cents: recoursed,
          repay_journal_entry_id: existingRepay,
          return_journal_entry_id: existingReturn,
          repair: true,
        },
        "info",
        "0280-05-FACTORING-CHARGEBACK"
      );
      return { kind: "already_posted" as const, journal_entry_id: existingReturn };
    };

    // Posting-key check UNDER lock — before status/outstanding rejection.
    const existingRepay = await findLifecyclePostingKeyJe(client, {
      operating_company_id: input.operating_company_id,
      factoring_advance_id: input.factoring_advance_id,
      source_transaction_type: "factoring_chargeback",
      event_key: repayEventKey,
    });
    const existingReturn = await findLifecyclePostingKeyJe(client, {
      operating_company_id: input.operating_company_id,
      factoring_advance_id: input.factoring_advance_id,
      source_transaction_type: "factoring_chargeback",
      event_key: returnEventKey,
    });
    if ((existingRepay && !existingReturn) || (!existingRepay && existingReturn)) {
      return { kind: "repair_ambiguous" as const };
    }
    if (existingRepay && existingReturn) {
      return repairChargebackAlreadyPosted(existingRepay, existingReturn);
    }

    if (lockedAdvance.status !== "advanced") {
      return { kind: "policy" as const };
    }

    const exactLiability = await linkedOutstandingLiabilityCents(
      client,
      input.operating_company_id,
      input.factoring_advance_id
    );
    const exactAr = await linkedOutstandingRecoursedArCents(
      client,
      input.operating_company_id,
      input.factoring_advance_id
    );
    // Full recourse only — amounts must match exact linked outstanding (no guess / partial).
    // Reversed funding JEs are excluded from liability — reversed-funding cannot chargeback.
    if (exactLiability <= 0 || exactAr <= 0 || chargeback !== exactLiability || recoursed !== exactAr) {
      return { kind: "policy" as const };
    }

    const liabilityAccountId = await resolveRoleAccount(client, input.operating_company_id, "factoring_advance_liability");
    const defaultInterestAccountId = await resolveRoleAccount(
      client,
      input.operating_company_id,
      "default_interest_expense"
    );
    const cashAccountId = await resolveRoleAccount(client, input.operating_company_id, "cash_clearing");
    const recoursedAccountId = await resolveRoleAccount(client, input.operating_company_id, "factoring_recoursed_ar");
    const arAccountId = await resolveRoleAccount(client, input.operating_company_id, "ar_control");

    const repayJe: CreateJournalEntryInput = {
      operating_company_id: input.operating_company_id,
      entry_date: entryDate,
      memo: repayMemo,
      source: "auto",
      postings: [
        {
          account_id: liabilityAccountId,
          debit_or_credit: "debit",
          amount_cents: chargeback,
          description: `${repayMemo} — repay factoring advance`,
        },
        ...(interest > 0
          ? [
              {
                account_id: defaultInterestAccountId,
                debit_or_credit: "debit" as const,
                amount_cents: interest,
                description: `${repayMemo} — default interest`,
              },
            ]
          : []),
        {
          account_id: cashAccountId,
          debit_or_credit: "credit",
          amount_cents: chargeback + interest,
          description: `${repayMemo} — cash to FARO`,
        },
      ],
    };
    const returnJe: CreateJournalEntryInput = {
      operating_company_id: input.operating_company_id,
      entry_date: entryDate,
      memo: returnMemo,
      source: "auto",
      postings: [
        {
          account_id: recoursedAccountId,
          debit_or_credit: "debit",
          amount_cents: recoursed,
          description: `${returnMemo} — receivable returned to us`,
        },
        {
          account_id: arAccountId,
          debit_or_credit: "credit",
          amount_cents: recoursed,
          description: `${returnMemo} — remove from trade A/R`,
        },
      ],
    };

    await client.query(`SAVEPOINT factoring_chargeback_je_create`);
    let repayCreated: { id: string };
    let returnCreated: { id: string };
    try {
      repayCreated = await createJournalEntryOnClient(
        client,
        repayJe,
        { userId: input.actor_user_id, role: "system" },
        {
          afterInsertBeforeCommit: async (c, header) => {
            if (__posterAtomicityTestHooks.failAfterJeBeforeLifecycleLinks) {
              throw new Error("injected_failure_between_je_and_lifecycle_links");
            }
            const claim = await claimFactoringLifecyclePostingKey(c, {
              operating_company_id: input.operating_company_id,
              factoring_advance_id: input.factoring_advance_id,
              source_transaction_type: "factoring_chargeback",
              event_key: repayEventKey,
              journal_entry_id: header.id,
            });
            if (claim === "already_claimed") throw new FactoringLifecyclePostingKeyRaceError();
            await attachFactoringLifecycleSourceLinksStrict(c, {
              operating_company_id: input.operating_company_id,
              journal_entry_id: header.id,
              factoring_advance_id: input.factoring_advance_id,
              source_transaction_type: "factoring_chargeback",
            });
          },
        }
      );

      if (__posterAtomicityTestHooks.failAfterChargebackRepayBeforeReturn) {
        throw new Error("injected_failure_after_chargeback_repay_before_return");
      }

      returnCreated = await createJournalEntryOnClient(
        client,
        returnJe,
        { userId: input.actor_user_id, role: "system" },
        {
          afterInsertBeforeCommit: async (c, header) => {
            const claim = await claimFactoringLifecyclePostingKey(c, {
              operating_company_id: input.operating_company_id,
              factoring_advance_id: input.factoring_advance_id,
              source_transaction_type: "factoring_chargeback",
              event_key: returnEventKey,
              journal_entry_id: header.id,
            });
            if (claim === "already_claimed") throw new FactoringLifecyclePostingKeyRaceError();
            await attachFactoringLifecycleSourceLinksStrict(c, {
              operating_company_id: input.operating_company_id,
              journal_entry_id: header.id,
              factoring_advance_id: input.factoring_advance_id,
              source_transaction_type: "factoring_chargeback",
            });
            await applyChargebackSubledgerRelief(c, input.operating_company_id, input.factoring_advance_id);
          },
        }
      );
      await client.query(`RELEASE SAVEPOINT factoring_chargeback_je_create`);
    } catch (e) {
      await client.query(`ROLLBACK TO SAVEPOINT factoring_chargeback_je_create`);
      if (
        e instanceof FactoringLifecyclePostingKeyRaceError ||
        (e as Error)?.message === "factoring_lifecycle_posting_key_race"
      ) {
        const winRepay = await findLifecyclePostingKeyJe(client, {
          operating_company_id: input.operating_company_id,
          factoring_advance_id: input.factoring_advance_id,
          source_transaction_type: "factoring_chargeback",
          event_key: repayEventKey,
        });
        const winReturn = await findLifecyclePostingKeyJe(client, {
          operating_company_id: input.operating_company_id,
          factoring_advance_id: input.factoring_advance_id,
          source_transaction_type: "factoring_chargeback",
          event_key: returnEventKey,
        });
        if (winRepay && winReturn) {
          return repairChargebackAlreadyPosted(winRepay, winReturn);
        }
        return { kind: "repair_ambiguous" as const };
      }
      throw e;
    }
    sideEffectJes.push({ je: repayJe, id: repayCreated.id });
    sideEffectJes.push({ je: returnJe, id: returnCreated.id });

    if (__posterAtomicityTestHooks.failAfterChargebackReturnBeforeStatus) {
      throw new Error("injected_failure_after_chargeback_return_before_status");
    }

    await client.query(
      `
        UPDATE accounting.factoring_advances
           SET status = 'recourse_returned',
               recourse_returned_at = $2::timestamptz,
               recourse_reason = COALESCE(
                 recourse_reason,
                 'Full recourse chargeback — linked outstanding liability extinguished'
               )
         WHERE id = $1::uuid
           AND operating_company_id = $3::uuid
           AND status = 'advanced'
      `,
      [input.factoring_advance_id, `${entryDate}T12:00:00.000Z`, input.operating_company_id]
    );
    await client.query(
      `
        UPDATE accounting.invoices
           SET factoring_status = 'recourse_returned',
               updated_at = now()
         WHERE factoring_advance_id = $1::uuid
           AND operating_company_id = $2::uuid
      `,
      [input.factoring_advance_id, input.operating_company_id]
    );
    await appendCrudAudit(
      client,
      input.actor_user_id,
      "accounting.factoring_chargeback_posted",
      {
        resource_type: "accounting.factoring_advances",
        resource_id: input.factoring_advance_id,
        operating_company_id: input.operating_company_id,
        display_id: lockedAdvance.display_id,
        chargeback_amount_cents: chargeback,
        default_interest_cents: interest,
        recoursed_ar_cents: recoursed,
        repay_journal_entry_id: repayCreated.id,
        return_journal_entry_id: returnCreated.id,
      },
      "info",
      "0280-05-FACTORING-CHARGEBACK"
    );

    return { kind: "posted" as const, journal_entry_id: returnCreated.id };
  });

  if (outcome.kind === "flag_off") return FLAG_OFF;
  if (outcome.kind === "advance_not_found") return { posted: false, reason: "advance_not_found" };
  if (outcome.kind === "policy") return { posted: false, reason: "policy_partial_or_ambiguous_recourse" };
  if (outcome.kind === "policy_invalid_entry_date") return { posted: false, reason: "policy_invalid_entry_date" };
  if (outcome.kind === "policy_missing_entry_date") return { posted: false, reason: "policy_missing_entry_date" };
  if (outcome.kind === "policy_faro_agreement") return { posted: false, reason: "policy_faro_agreement" };
  if (outcome.kind === "policy_advance_not_bound_to_faro") {
    return { posted: false, reason: "policy_advance_not_bound_to_faro" };
  }
  if (outcome.kind === "repair_ambiguous") return { posted: false, reason: "repair_ambiguous" };
  if (outcome.kind === "repair_candidate_invalid") {
    return { posted: false, reason: "repair_candidate_invalid" };
  }
  if (outcome.kind === "already_posted") {
    return { posted: false, reason: "already_posted", journal_entry_id: outcome.journal_entry_id };
  }

  for (const item of sideEffectJes) {
    await enqueueJournalEntrySideEffects(item.je, item.id, input.actor_user_id);
  }
  return { posted: true, journal_entry_id: outcome.journal_entry_id };
}

// ---------------------------------------------------------------------------------------------------
// DAILY DEFAULT-INTEREST ACCRUAL (contract: 0.067%/day, COMPOUNDED DAILY, on the unpaid balance, ONLY
//   after day 35 = 30-day Repurchase Term + 5-day Grace). Posts ONE day's charge:
//     Dr Default-Interest-Expense / Cr Factoring-Advance-Liability   (interest compounds INTO the liability
//     per the contract "Repurchase Price = Net + fees + interest" — see contract-config OPEN #2).
//
//   Compounding is deterministic + idempotent via accounting.factoring_default_interest_accruals: exactly
//   ONE row per (advance, accrual_date), carrying opening → interest → closing. The opening balance for a
//   given day = exact linked outstanding factoring_advance_liability BEFORE that day's interest credit
//   (funding + prior interest − customer payments − chargebacks). NEVER prior-accrual closing / invoice
//   face alone — intervening customer-payment liability debits must reduce the interest base. A re-run
//   for a day already accrued no-ops (already_posted). Interest only accrues while status is 'advanced'.
// ---------------------------------------------------------------------------------------------------
export type PostFactoringDefaultInterestAccrualInput = {
  operating_company_id: string;
  factoring_advance_id: string;
  actor_user_id: string;
  accrual_date_iso: string; // the calendar day interest is charged for (America/Chicago)
};

/**
 * Contractual default-interest opening = unpaid Faro liability at the START of the accrual day, i.e. the
 * balance from postings dated strictly BEFORE the accrual date (funding + prior-day interest − prior
 * payments/chargebacks). Same-day and later customer payments do NOT reduce that day's interest base
 * (they reduce the next day), so the opening is stable and reproducible under repair even after later
 * payments land. Optionally also exclude an in-flight / already-posted interest JE so its own credit is
 * not in the base (belt-and-suspenders with the date bound, which already excludes the same-dated JE).
 */
async function defaultInterestOpeningFromOutstandingLiability(
  client: DbClient,
  operatingCompanyId: string,
  factoringAdvanceId: string,
  excludeJournalEntryId?: string | null,
  beforeDateExclusive?: string | null
): Promise<number> {
  return linkedOutstandingLiabilityCents(
    client,
    operatingCompanyId,
    factoringAdvanceId,
    excludeJournalEntryId,
    beforeDateExclusive
  );
}

async function loadDefaultInterestAccrualRow(
  client: DbClient,
  operatingCompanyId: string,
  factoringAdvanceId: string,
  accrualDate: string
): Promise<{
  interest_cents: number;
  opening_balance_cents: number;
  closing_balance_cents: number;
  journal_entry_id: string | null;
} | null> {
  const res = await client.query<{
    interest_cents: string;
    opening_balance_cents: string;
    closing_balance_cents: string;
    journal_entry_id: string | null;
  }>(
    `
      SELECT
        interest_cents::text AS interest_cents,
        opening_balance_cents::text AS opening_balance_cents,
        closing_balance_cents::text AS closing_balance_cents,
        journal_entry_id::text AS journal_entry_id
      FROM accounting.factoring_default_interest_accruals
      WHERE operating_company_id = $1::uuid
        AND factoring_advance_id = $2::uuid
        AND accrual_date = $3::date
      LIMIT 1
    `,
    [operatingCompanyId, factoringAdvanceId, accrualDate]
  );
  const row = res.rows[0];
  if (!row) return null;
  return {
    interest_cents: Number(row.interest_cents ?? 0),
    opening_balance_cents: Number(row.opening_balance_cents ?? 0),
    closing_balance_cents: Number(row.closing_balance_cents ?? 0),
    journal_entry_id: row.journal_entry_id,
  };
}

async function accrualExistsForDay(
  client: DbClient,
  operatingCompanyId: string,
  factoringAdvanceId: string,
  accrualDate: string
): Promise<boolean> {
  const res = await client.query<{ id: string }>(
    `
      SELECT id::text
      FROM accounting.factoring_default_interest_accruals
      WHERE operating_company_id = $1::uuid
        AND factoring_advance_id = $2::uuid
        AND accrual_date = $3::date
      LIMIT 1
    `,
    [operatingCompanyId, factoringAdvanceId, accrualDate]
  );
  return Boolean(res.rows[0]?.id);
}

// Sum of all accrued interest to date for an advance (closing − Net, or the running total) — used by the
// day-95 recourse trigger to know how much of the outstanding liability is compounded interest.
export async function sumAccruedDefaultInterest(
  operatingCompanyId: string,
  factoringAdvanceId: string
): Promise<{ total_interest_cents: number; last_closing_cents: number | null }> {
  return withLuciaBypass(async (client: DbClient) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    const res = await client.query<{ total_interest_cents: string; last_closing_cents: string | null }>(
      `
        SELECT
          COALESCE(SUM(interest_cents), 0)::text AS total_interest_cents,
          (
            SELECT closing_balance_cents::text
            FROM accounting.factoring_default_interest_accruals
            WHERE operating_company_id = $1::uuid AND factoring_advance_id = $2::uuid AND is_active = true
            ORDER BY accrual_date DESC LIMIT 1
          ) AS last_closing_cents
        FROM accounting.factoring_default_interest_accruals
        WHERE operating_company_id = $1::uuid AND factoring_advance_id = $2::uuid AND is_active = true
      `,
      [operatingCompanyId, factoringAdvanceId]
    );
    const row = res.rows[0];
    return {
      total_interest_cents: Number(row?.total_interest_cents ?? 0),
      last_closing_cents: row?.last_closing_cents == null ? null : Number(row.last_closing_cents),
    };
  });
}

export async function postFactoringDefaultInterestAccrualEvent(
  input: PostFactoringDefaultInterestAccrualInput
): Promise<PostResult> {
  return retryOnFactoringDeadlock(() => postFactoringDefaultInterestAccrualEventImpl(input));
}

async function postFactoringDefaultInterestAccrualEventImpl(
  input: PostFactoringDefaultInterestAccrualInput
): Promise<PostResult> {
  const prepared = await withLuciaBypass(async (client: DbClient) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);
    if (!(await factoringPostingEnabled(client, input.operating_company_id))) return { gate: "flag_off" as const };

    const advance = await loadAdvance(client, input.operating_company_id, input.factoring_advance_id);
    if (!advance) return { gate: "advance_not_found" as const };

    // Interest accrues ONLY while the advance is funded AND the customer has not yet paid the factor. Once
    // status leaves 'advanced' (reserve_held = customer paid, released, recourse_returned, voided) the
    // liability is being settled — no further interest. Defense-in-depth beyond the cron's own selection.
    if (advance.status !== "advanced" || !advance.advanced_at) return { gate: "not_outstanding" as const };

    let accrualDate: string;
    try {
      accrualDate = resolveCanonicalEntryDate(input.accrual_date_iso);
    } catch (e) {
      if (e instanceof FactoringEntryDateError) return { gate: e.reason };
      throw e;
    }

    const faro = await requireFaroBoundAdvance(
      client,
      input.operating_company_id,
      input.factoring_advance_id,
      accrualDate
    );
    if (!faro.ok) return { gate: faro.reason! };

    const dayIndex = dayIndexBetween(advance.advanced_at, accrualDate);
    // Contract: no interest through the 30-day term + 5-day grace (day 35). First charged day is day 36.
    if (dayIndex <= FACTORING_INTEREST_ACCRUAL_AFTER_DAY) return { gate: "before_grace" as const };

    if (await accrualExistsForDay(client, input.operating_company_id, input.factoring_advance_id, accrualDate)) {
      return { gate: "already_posted" as const };
    }

    // Prepare-phase lock (this short txn only) — the authoritative lock is re-taken and held THROUGH the
    // JE write in afterLifecycleBeforeCommit below, so a concurrent payment cannot leave a stale credit.
    await lockFactoringAdvanceForSettlement(client, input.operating_company_id, input.factoring_advance_id);
    // Opening = liability at the START of the accrual day (postings dated strictly before accrualDate):
    // funding + prior-day interest − prior payments/chargebacks. Same-day/later payments do not reduce it.
    const opening = await defaultInterestOpeningFromOutstandingLiability(
      client,
      input.operating_company_id,
      input.factoring_advance_id,
      null,
      accrualDate
    );
    if (opening <= 0) return { gate: "zero_amount" as const };

    const interest = Math.round(opening * FACTORING_DEFAULT_INTEREST_DAILY_RATE);
    if (interest <= 0) return { gate: "zero_amount" as const };
    const closing = opening + interest;

    const memo = `Factoring default interest ${advance.display_id} day ${dayIndex} (${accrualDate})`;

    const interestAccountId = await resolveRoleAccount(client, input.operating_company_id, "default_interest_expense");
    const liabilityAccountId = await resolveRoleAccount(client, input.operating_company_id, "factoring_advance_liability");

    return {
      gate: "post" as const,
      memo,
      accrualDate,
      dayIndex,
      opening,
      interest,
      closing,
      displayId: advance.display_id,
      postings: [
        { account_id: interestAccountId, debit_or_credit: "debit" as const, amount_cents: interest, description: `${memo} — default interest (0.067%/day compounded)` },
        { account_id: liabilityAccountId, debit_or_credit: "credit" as const, amount_cents: interest, description: `${memo} — compound into factoring advance (liability)` },
      ],
    };
  });

  if (prepared.gate === "flag_off") return FLAG_OFF;
  if (prepared.gate === "advance_not_found") return { posted: false, reason: "advance_not_found" };
  if (prepared.gate === "not_outstanding") return { posted: false, reason: "not_outstanding" };
  if (prepared.gate === "before_grace") return { posted: false, reason: "before_grace" };
  if (prepared.gate === "policy_invalid_entry_date") return { posted: false, reason: "policy_invalid_entry_date" };
  if (prepared.gate === "policy_missing_entry_date") return { posted: false, reason: "policy_missing_entry_date" };
  if (prepared.gate === "policy_faro_agreement") return { posted: false, reason: "policy_faro_agreement" };
  if (prepared.gate === "policy_advance_not_bound_to_faro") {
    return { posted: false, reason: "policy_advance_not_bound_to_faro" };
  }
  if (prepared.gate === "already_posted") {
    // Exact-shape repair: recompute contractual interest, validate JE legs/amount/source/entity/date.
    let accrualDate: string;
    try {
      accrualDate = resolveCanonicalEntryDate(input.accrual_date_iso);
    } catch (e) {
      if (e instanceof FactoringEntryDateError) return { posted: false, reason: e.reason };
      throw e;
    }
    const repairOutcome = await withLuciaBypass(async (client: DbClient) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [
        input.operating_company_id,
      ]);
      const advance = await loadAdvance(client, input.operating_company_id, input.factoring_advance_id);
      if (!advance?.advanced_at) {
        return { kind: "advance_not_found" as const };
      }
      const dayIndex = dayIndexBetween(advance.advanced_at, accrualDate);
      await lockFactoringAdvanceForSettlement(client, input.operating_company_id, input.factoring_advance_id);

      const accrualRow = await loadDefaultInterestAccrualRow(
        client,
        input.operating_company_id,
        input.factoring_advance_id,
        accrualDate
      );
      if (!accrualRow) {
        return { kind: "repair_candidate_invalid" as const, reason: "missing_accrual_row" };
      }

      const keyJe = await findLifecyclePostingKeyJe(client, {
        operating_company_id: input.operating_company_id,
        factoring_advance_id: input.factoring_advance_id,
        source_transaction_type: "factoring_default_interest",
        event_key: `default_interest:${accrualDate}`,
      });
      let journalEntryId = keyJe ?? accrualRow.journal_entry_id;
      const memo = `Factoring default interest ${advance.display_id} day ${dayIndex} (${accrualDate})`;
      // Resolve JE first (posting key / accrual / strict candidate) so we can exclude it from liability.
      if (!journalEntryId) {
        const provisionalLegs: ExpectedLifecycleLeg[] = [
          {
            role: "default_interest_expense",
            debit_or_credit: "debit",
            amount_cents: accrualRow.interest_cents,
          },
          {
            role: "factoring_advance_liability",
            debit_or_credit: "credit",
            amount_cents: accrualRow.interest_cents,
          },
        ];
        const candidate = await findStrictLifecycleRepairCandidate(client, {
          operating_company_id: input.operating_company_id,
          factoring_advance_id: input.factoring_advance_id,
          source_transaction_type: "factoring_default_interest",
          memo,
          expected_legs: provisionalLegs,
          expected_entry_date: accrualDate,
        });
        if (candidate.kind === "ambiguous") return { kind: "repair_ambiguous" as const };
        if (candidate.kind !== "unique" || !candidate.journal_entry_id) {
          return {
            kind: "repair_candidate_invalid" as const,
            reason: candidate.reason ?? "missing_repair_candidate",
          };
        }
        journalEntryId = candidate.journal_entry_id;
      }

      // Opening = liability at the START of the accrual day (postings dated strictly before accrualDate),
      // excluding today's own interest credit. Date-bounding is what makes this REPAIR reproduce the
      // historical opening even after later customer payments landed — no spurious opening mismatch, and
      // same-day idempotent re-entry still validates (same-day payments never reduce that day's base).
      const opening = await defaultInterestOpeningFromOutstandingLiability(
        client,
        input.operating_company_id,
        input.factoring_advance_id,
        journalEntryId,
        accrualDate
      );
      const expectedInterest = Math.round(opening * FACTORING_DEFAULT_INTEREST_DAILY_RATE);
      const expectedClosing = opening + expectedInterest;
      if (expectedInterest <= 0) {
        return { kind: "repair_candidate_invalid" as const, reason: "zero_amount" };
      }
      if (
        accrualRow.interest_cents !== expectedInterest ||
        accrualRow.opening_balance_cents !== opening ||
        accrualRow.closing_balance_cents !== expectedClosing
      ) {
        return { kind: "repair_candidate_invalid" as const, reason: "repair_candidate_wrong_amount" };
      }

      const expectedLegs: ExpectedLifecycleLeg[] = [
        { role: "default_interest_expense", debit_or_credit: "debit", amount_cents: expectedInterest },
        {
          role: "factoring_advance_liability",
          debit_or_credit: "credit",
          amount_cents: expectedInterest,
        },
      ];

      const shape = await validateLifecycleJeExactShape(client, {
        operating_company_id: input.operating_company_id,
        journal_entry_id: journalEntryId,
        factoring_advance_id: input.factoring_advance_id,
        source_transaction_type: "factoring_default_interest",
        expected_legs: expectedLegs,
        expected_entry_date: accrualDate,
      });
      if (!shape.ok) {
        return { kind: "repair_candidate_invalid" as const, reason: shape.reason };
      }
      await attachFactoringLifecycleSourceLinksStrict(client, {
        operating_company_id: input.operating_company_id,
        journal_entry_id: journalEntryId,
        factoring_advance_id: input.factoring_advance_id,
        source_transaction_type: "factoring_default_interest",
      });
      return { kind: "already_posted" as const, journal_entry_id: journalEntryId };
    });

    if (repairOutcome.kind === "advance_not_found") {
      return { posted: false, reason: "advance_not_found" };
    }
    if (repairOutcome.kind === "repair_ambiguous") {
      return { posted: false, reason: "repair_ambiguous" };
    }
    if (repairOutcome.kind === "repair_candidate_invalid") {
      return { posted: false, reason: "repair_candidate_invalid" };
    }
    return {
      posted: false,
      reason: "already_posted",
      journal_entry_id: repairOutcome.journal_entry_id,
    };
  }
  if (prepared.gate === "zero_amount") return { posted: false, reason: "zero_amount" };
  if (prepared.gate !== "post") return { posted: false, reason: "advance_not_found" };

  const interestExpectedLegs: ExpectedLifecycleLeg[] = [
    { role: "default_interest_expense", debit_or_credit: "debit", amount_cents: prepared.interest },
    { role: "factoring_advance_liability", debit_or_credit: "credit", amount_cents: prepared.interest },
  ];

  const created = await createFactoringJournalEntryAtomically({
    actor_user_id: input.actor_user_id,
    je: {
      operating_company_id: input.operating_company_id,
      entry_date: prepared.accrualDate,
      memo: prepared.memo,
      source: "auto",
      postings: prepared.postings,
    },
    factoring_advance_id: input.factoring_advance_id,
    source_transaction_type: "factoring_default_interest",
    event_key: `default_interest:${prepared.accrualDate}`,
    expected_legs: interestExpectedLegs,
    afterLifecycleBeforeCommit: async (client, journalEntryId) => {
      // Lock THROUGH the JE write (the prepare-phase lock was released at that short txn's commit) and
      // re-validate the interest base inside THIS posting txn — same concurrent-settlement contract the
      // customer-payment path enforces. A back-dated payment/chargeback (entry_date < accrualDate) landing
      // between prepare and post would change the day's opening; if so we fail closed and roll back rather
      // than commit a stale interest credit. Same-day/later payments correctly do not affect this base.
      await lockFactoringAdvanceForSettlement(client, input.operating_company_id, input.factoring_advance_id);
      const revalidatedOpening = await defaultInterestOpeningFromOutstandingLiability(
        client,
        input.operating_company_id,
        input.factoring_advance_id,
        journalEntryId,
        prepared.accrualDate
      );
      const revalidatedInterest = Math.round(revalidatedOpening * FACTORING_DEFAULT_INTEREST_DAILY_RATE);
      if (revalidatedOpening !== prepared.opening || revalidatedInterest !== prepared.interest) {
        throw new Error(
          `factoring_default_interest_base_changed_under_lock: opening ${prepared.opening}->${revalidatedOpening} interest ${prepared.interest}->${revalidatedInterest}`
        );
      }
      // Record the accrual (ledger + connectivity: accrual → JE → advance). ON CONFLICT no-ops so a retry
      // after the JE posted but before this insert committed will not double-insert.
      await client.query(
        `
          INSERT INTO accounting.factoring_default_interest_accruals (
            operating_company_id, factoring_advance_id, accrual_date, day_index, daily_rate,
            opening_balance_cents, interest_cents, closing_balance_cents, journal_entry_id
          )
          VALUES ($1::uuid, $2::uuid, $3::date, $4, $5, $6, $7, $8, $9::uuid)
          ON CONFLICT (operating_company_id, factoring_advance_id, accrual_date) DO NOTHING
        `,
        [
          input.operating_company_id,
          input.factoring_advance_id,
          prepared.accrualDate,
          prepared.dayIndex,
          FACTORING_DEFAULT_INTEREST_DAILY_RATE,
          prepared.opening,
          prepared.interest,
          prepared.closing,
          journalEntryId,
        ]
      );
      await appendCrudAudit(
        client,
        input.actor_user_id,
        "accounting.factoring_default_interest_accrued",
        {
          resource_type: "accounting.factoring_advances",
          resource_id: input.factoring_advance_id,
          operating_company_id: input.operating_company_id,
          display_id: prepared.displayId,
          accrual_date: prepared.accrualDate,
          day_index: prepared.dayIndex,
          interest_cents: prepared.interest,
          closing_balance_cents: prepared.closing,
          journal_entry_id: journalEntryId,
        },
        "info",
        "FACTORING-DEFAULT-INTEREST"
      );
    },
  });

  return { posted: true, journal_entry_id: created.id, memo: prepared.memo, closing_balance_cents: prepared.closing };
}
