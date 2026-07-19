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
  type FactoringLifecycleSourceType,
  attachFactoringLifecycleSourceLinksStrict,
  calendarDayIndexBetween,
  claimFactoringLifecyclePostingKey,
  findLifecyclePostingKeyJe,
  findStrictLifecycleRepairCandidate,
} from "./lifecycle-repair.js";

export { FACTORING_LIFECYCLE_SOURCE_TYPES, type FactoringLifecycleSourceType };
export { findStrictLifecycleRepairCandidate };

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
    | "repair_ambiguous"
    | "repair_candidate_invalid";
  journal_entry_id?: string;
  memo?: string;
  closing_balance_cents?: number;
};

/** Convert timestamptz / ISO / YYYY-MM-DD into company-local business date (never UTC slice). */
function toCompanyBusinessDate(isoOrDate: string | Date | null | undefined): string | null {
  if (isoOrDate == null) return null;
  if (typeof isoOrDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(isoOrDate)) return isoOrDate;
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(d.getTime())) return null;
  return companyBusinessDate(d);
}

function resolveCanonicalEntryDate(
  explicit: string | null | undefined,
  ...fallbacks: Array<string | null | undefined>
): string {
  for (const c of [explicit, ...fallbacks]) {
    const ymd = toCompanyBusinessDate(c ?? null);
    if (ymd) return ymd;
  }
  return companyBusinessDate();
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

// Deterministic SET (never an increment) — re-running with the same amountCents produces the identical
// final state, so this is safe to call both after a fresh JE post AND as a self-heal on an
// `already_posted` re-entry. Allocates proportionally across the advance's (non-voided) invoices with the
// SAME allocateByProportion used elsewhere in this file (no new math) so a multi-invoice advance splits
// correctly instead of double/under-crediting any one invoice.
async function applyCustomerPaymentSubledgerRelief(
  client: DbClient,
  operatingCompanyId: string,
  factoringAdvanceId: string,
  amountCents: number
): Promise<void> {
  if (amountCents <= 0) return;
  const invoices = (await loadAdvanceInvoices(client, operatingCompanyId, factoringAdvanceId)).filter((inv) => !inv.voided_at);
  if (invoices.length === 0) return;

  const allocations = allocateByProportion(
    amountCents,
    invoices.map((inv) => ({ invoice_id: inv.id, total_cents: inv.total_cents }))
  );

  for (const inv of invoices) {
    const allocated = Math.min(inv.total_cents, allocations.get(inv.id) ?? 0);
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
 * Never memo-only overwrite of foreign provenance.
 */
async function repairAlreadyPostedLifecycle(opts: {
  operating_company_id: string;
  factoring_advance_id: string;
  source_transaction_type: FactoringLifecycleSourceType;
  memo?: string | null;
  journal_entry_id?: string | null;
  afterRepair?: (client: DbClient, journalEntryId: string | null) => Promise<void>;
}): Promise<{ journal_entry_id: string | null; repaired: boolean; reason?: string }> {
  if (opts.journal_entry_id) {
    return withLuciaBypass(async (client: DbClient) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [
        opts.operating_company_id,
      ]);
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
  return repairFactoringLifecycleSourceLinks({
    operating_company_id: opts.operating_company_id,
    memo: opts.memo,
    factoring_advance_id: opts.factoring_advance_id,
    source_transaction_type: opts.source_transaction_type,
    afterRepair: opts.afterRepair,
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
  afterLifecycleBeforeCommit?: (client: DbClient, journalEntryId: string) => Promise<void>;
  /** When provided, JE is created on this client (caller owns the outer txn — no nested withCurrentUser). */
  client?: DbClient;
}): Promise<{ id: string; already_claimed?: boolean }> {
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
      await attachFactoringLifecycleSourceLinksStrict(client, {
        operating_company_id: opts.je.operating_company_id,
        journal_entry_id: existingKey,
        factoring_advance_id: opts.factoring_advance_id,
        source_transaction_type: opts.source_transaction_type,
      });
      if (opts.afterLifecycleBeforeCommit) {
        await opts.afterLifecycleBeforeCommit(client, existingKey);
      }
      return { id: existingKey, already_claimed: true as const };
    }

    return createJournalEntry(
      opts.je,
      { userId: opts.actor_user_id, role: "system" },
      {
        client,
        suppressSideEffects: true,
        afterInsertBeforeCommit: async (c, header) => {
          if (__posterAtomicityTestHooks.failAfterJeBeforeLifecycleLinks) {
            throw new Error("injected_failure_between_je_and_lifecycle_links");
          }
          const claim = await claimFactoringLifecyclePostingKey(c, {
            operating_company_id: opts.je.operating_company_id,
            factoring_advance_id: opts.factoring_advance_id,
            source_transaction_type: opts.source_transaction_type,
            event_key: opts.event_key,
            journal_entry_id: header.id,
          });
          if (claim === "already_claimed") {
            throw new Error("factoring_lifecycle_posting_key_race");
          }
          await attachFactoringLifecycleSourceLinksStrict(c, {
            operating_company_id: opts.je.operating_company_id,
            journal_entry_id: header.id,
            factoring_advance_id: opts.factoring_advance_id,
            source_transaction_type: opts.source_transaction_type,
          });
          if (opts.afterLifecycleBeforeCommit) {
            await opts.afterLifecycleBeforeCommit(c, header.id);
          }
        },
      }
    ).then((header) => ({ id: header.id, already_claimed: false as const }));
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

export async function postFactoringAdvanceEvent(input: PostFactoringAdvanceInput): Promise<PostResult> {
  const prepared = await withLuciaBypass(async (client: DbClient) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);
    if (!(await factoringPostingEnabled(client, input.operating_company_id))) return { gate: "flag_off" as const };

    const advance = await loadAdvance(client, input.operating_company_id, input.factoring_advance_id);
    if (!advance) return { gate: "advance_not_found" as const };

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
    const entryDate = resolveCanonicalEntryDate(
      input.advanced_at_iso,
      advance.advanced_at,
      advance.submitted_at
    );
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
        journal_entry_id: keyJe ?? candidate.journal_entry_id ?? null,
      };
    }

    // Resolve every account per-entity, fail-closed. NO ar_control at funding (borrowing keeps A/R).
    const cashAccountId = await resolveRoleAccount(client, input.operating_company_id, "cash_clearing");
    const reserveAccountId = await resolveRoleAccount(client, input.operating_company_id, "factor_reserve_held");
    const feeAccountId = await resolveRoleAccount(client, input.operating_company_id, "factor_fee_expense");
    const liabilityAccountId = await resolveRoleAccount(client, input.operating_company_id, "factoring_advance_liability");

    const postings: Array<{ account_id: string; debit_or_credit: "debit" | "credit"; amount_cents: number; description: string }> = [];
    if (cash > 0) postings.push({ account_id: cashAccountId, debit_or_credit: "debit", amount_cents: cash, description: `${memo} — cash advanced` });
    if (reserve > 0) postings.push({ account_id: reserveAccountId, debit_or_credit: "debit", amount_cents: reserve, description: `${memo} — reserve held (due-from-factor)` });
    if (fee > 0) postings.push({ account_id: feeAccountId, debit_or_credit: "debit", amount_cents: fee, description: `${memo} — factoring fee (interest & financing)` });
    // Bank/ACH transaction fee: a financing/transaction cost. Booked to the Factoring Fees (Interest &
    // Financing) account as a distinct line (no separate bank_charges role is in CODER-34 scope; splitting
    // ACH into its own account is a documented CPA/GUARD follow-up).
    if (ach > 0) postings.push({ account_id: feeAccountId, debit_or_credit: "debit", amount_cents: ach, description: `${memo} — bank/ACH fee` });
    postings.push({ account_id: liabilityAccountId, debit_or_credit: "credit", amount_cents: liability, description: `${memo} — factoring advance (liability)` });

    return { gate: "post" as const, memo, entryDate, postings, reserve };
  });

  if (prepared.gate === "flag_off") return FLAG_OFF;
  if (prepared.gate === "advance_not_found") return { posted: false, reason: "advance_not_found" };
  if (prepared.gate === "zero_amount") return { posted: false, reason: "zero_amount" };
  if (prepared.gate === "repair_ambiguous") return { posted: false, reason: "repair_ambiguous" };
  if (prepared.gate === "repair_candidate_invalid") {
    return { posted: false, reason: "repair_candidate_invalid" };
  }
  if (prepared.gate === "already_posted") {
    const repaired = await repairAlreadyPostedLifecycle({
      operating_company_id: input.operating_company_id,
      factoring_advance_id: input.factoring_advance_id,
      source_transaction_type: "factoring_advance",
      memo: prepared.memo,
      journal_entry_id: prepared.journal_entry_id ?? null,
      afterRepair: async (client, journalEntryId) => {
        if (!journalEntryId || prepared.reserve <= 0) return;
        await recordReserveMovement(
          client,
          input.operating_company_id,
          input.factoring_advance_id,
          "held",
          prepared.reserve,
          prepared.entryDate,
          journalEntryId
        );
      },
    });
    if (repaired.reason === "repair_ambiguous") return { posted: false, reason: "repair_ambiguous" };
    if (repaired.reason === "repair_candidate_invalid") {
      return { posted: false, reason: "repair_candidate_invalid" };
    }
    return { posted: false, reason: "already_posted", journal_entry_id: repaired.journal_entry_id ?? undefined };
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
    await ensureOpenPeriod(client, input.operating_company_id, prepared.entryDate);
    return createJournalEntry(
      jeInput,
      { userId: input.actor_user_id, role: "system" },
      {
        client,
        suppressSideEffects: true,
        afterInsertBeforeCommit: async (c, header) => {
          if (__posterAtomicityTestHooks.failAfterJeBeforeLifecycleLinks) {
            throw new Error("injected_failure_between_je_and_lifecycle_links");
          }
          const claim = await claimFactoringLifecyclePostingKey(c, {
            operating_company_id: input.operating_company_id,
            factoring_advance_id: input.factoring_advance_id,
            source_transaction_type: "factoring_advance",
            event_key: "funding",
            journal_entry_id: header.id,
          });
          if (claim === "already_claimed") {
            throw new Error("factoring_lifecycle_posting_key_race");
          }
          await attachFactoringLifecycleSourceLinksStrict(c, {
            operating_company_id: input.operating_company_id,
            journal_entry_id: header.id,
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
              header.id
            );
          }
        },
      }
    );
  });
  await enqueueJournalEntrySideEffects(jeInput, created.id, input.actor_user_id);

  return { posted: true, journal_entry_id: created.id, memo: prepared.memo };
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
  const amount = Number(input.amount_cents ?? 0);
  if (amount <= 0) return { posted: false, reason: "zero_amount" };

  const prepared = await withLuciaBypass(async (client: DbClient) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);
    if (!(await factoringPostingEnabled(client, input.operating_company_id))) return { gate: "flag_off" as const };

    const advance = await loadAdvance(client, input.operating_company_id, input.factoring_advance_id);
    if (!advance) return { gate: "advance_not_found" as const };

    const entryDate = resolveCanonicalEntryDate(input.paid_at_iso, advance.collected_at);
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
      afterRepair: async (client) => {
        await applyCustomerPaymentSubledgerRelief(
          client,
          input.operating_company_id,
          input.factoring_advance_id,
          amount
        );
      },
    });
    if (repaired.reason === "repair_ambiguous") return { posted: false, reason: "repair_ambiguous" };
    if (repaired.reason === "repair_candidate_invalid") {
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
    afterLifecycleBeforeCommit: async (client) => {
      await applyCustomerPaymentSubledgerRelief(
        client,
        input.operating_company_id,
        input.factoring_advance_id,
        amount
      );
    },
  });

  return { posted: true, journal_entry_id: created.id, memo: paymentMemo };
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
  const releaseAmount = Number(input.release_amount_cents ?? 0);
  if (releaseAmount <= 0) return { posted: false, reason: "zero_amount" };

  const prepared = await withLuciaBypass(async (client: DbClient) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);
    if (!(await factoringPostingEnabled(client, input.operating_company_id))) return { gate: "flag_off" as const };

    const advance = await loadAdvance(client, input.operating_company_id, input.factoring_advance_id);
    if (!advance) return { gate: "advance_not_found" as const };

    const entryDate = resolveCanonicalEntryDate(input.released_at_iso, advance.released_at);
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
  if (prepared.gate === "repair_ambiguous") return { posted: false, reason: "repair_ambiguous" };
  if (prepared.gate === "repair_candidate_invalid") {
    return { posted: false, reason: "repair_candidate_invalid" };
  }
  if (prepared.gate === "already_posted") {
    const repaired = await repairAlreadyPostedLifecycle({
      operating_company_id: input.operating_company_id,
      factoring_advance_id: input.factoring_advance_id,
      source_transaction_type: "factoring_reserve_release",
      memo: prepared.memo,
      journal_entry_id: prepared.journal_entry_id ?? null,
      afterRepair: async (client, journalEntryId) => {
        if (!journalEntryId) return;
        await recordReserveMovement(
          client,
          input.operating_company_id,
          input.factoring_advance_id,
          "released",
          releaseAmount,
          prepared.entryDate,
          journalEntryId
        );
      },
    });
    if (repaired.reason === "repair_ambiguous") return { posted: false, reason: "repair_ambiguous" };
    if (repaired.reason === "repair_candidate_invalid") {
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
    afterLifecycleBeforeCommit: async (client, journalEntryId) => {
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

  return { posted: true, journal_entry_id: created.id, memo: releaseMemo };
}


/** Exact linked outstanding Faro liability (role legs) — never guessed from mutable status. */
async function linkedOutstandingLiabilityCents(
  client: DbClient,
  operatingCompanyId: string,
  factoringAdvanceId: string
): Promise<number> {
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
    `,
    [operatingCompanyId, factoringAdvanceId]
  );
  return Number(res.rows[0]?.outstanding ?? 0);
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
    if (advance.status !== "advanced") {
      return { kind: "policy" as const };
    }

    const entryDate = resolveCanonicalEntryDate(input.charged_back_at_iso);
    await ensureOpenPeriod(client, input.operating_company_id, entryDate);

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
    if (exactLiability <= 0 || exactAr <= 0 || chargeback !== exactLiability || recoursed !== exactAr) {
      return { kind: "policy" as const };
    }

    const repayEventKey = `chargeback_repay:${chargeback}+${interest}@${entryDate}`;
    const returnEventKey = `chargeback_return:${recoursed}@${entryDate}`;
    const repayMemo = `Factoring chargeback repay ${advance.display_id} (${chargeback}+${interest}@${entryDate})`;
    const returnMemo = `Factoring chargeback receivable ${advance.display_id} (${recoursed}@${entryDate})`;

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
             AND status = 'advanced'
        `,
        [input.factoring_advance_id, `${entryDate}T12:00:00.000Z`, input.operating_company_id]
      );
      return { kind: "already_posted" as const, journal_entry_id: existingReturn };
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

    const repayCreated = await createJournalEntryOnClient(
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
          if (claim === "already_claimed") throw new Error("factoring_lifecycle_posting_key_race");
          await attachFactoringLifecycleSourceLinksStrict(c, {
            operating_company_id: input.operating_company_id,
            journal_entry_id: header.id,
            factoring_advance_id: input.factoring_advance_id,
            source_transaction_type: "factoring_chargeback",
          });
        },
      }
    );
    sideEffectJes.push({ je: repayJe, id: repayCreated.id });

    if (__posterAtomicityTestHooks.failAfterChargebackRepayBeforeReturn) {
      throw new Error("injected_failure_after_chargeback_repay_before_return");
    }

    const returnCreated = await createJournalEntryOnClient(
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
          if (claim === "already_claimed") throw new Error("factoring_lifecycle_posting_key_race");
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
        display_id: advance.display_id,
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
  if (outcome.kind === "repair_ambiguous") return { posted: false, reason: "repair_ambiguous" };
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
//   given day = the PRIOR accrual's closing balance (compounded), or the pledged Net (invoice_total_cents)
//   for the first charged day. A re-run for a day already accrued no-ops (already_posted). The accrual cron
//   drives one call per (outstanding advance, missing day) in ascending date order, so each day compounds
//   off the committed prior row. Interest only accrues while the advance is still funded-and-unpaid
//   (status 'advanced'); once the customer pays the factor (reserve_held) or it recourses, accrual stops.
// ---------------------------------------------------------------------------------------------------
export type PostFactoringDefaultInterestAccrualInput = {
  operating_company_id: string;
  factoring_advance_id: string;
  actor_user_id: string;
  accrual_date_iso: string; // the calendar day interest is charged for (America/Chicago)
};

async function lastAccrualClosingBalance(
  client: DbClient,
  operatingCompanyId: string,
  factoringAdvanceId: string
): Promise<number | null> {
  const res = await client.query<{ closing_balance_cents: string }>(
    `
      SELECT closing_balance_cents::text AS closing_balance_cents
      FROM accounting.factoring_default_interest_accruals
      WHERE operating_company_id = $1::uuid
        AND factoring_advance_id = $2::uuid
        AND is_active = true
      ORDER BY accrual_date DESC
      LIMIT 1
    `,
    [operatingCompanyId, factoringAdvanceId]
  );
  const raw = res.rows[0]?.closing_balance_cents;
  return raw == null ? null : Number(raw);
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
  const prepared = await withLuciaBypass(async (client: DbClient) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);
    if (!(await factoringPostingEnabled(client, input.operating_company_id))) return { gate: "flag_off" as const };

    const advance = await loadAdvance(client, input.operating_company_id, input.factoring_advance_id);
    if (!advance) return { gate: "advance_not_found" as const };

    // Interest accrues ONLY while the advance is funded AND the customer has not yet paid the factor. Once
    // status leaves 'advanced' (reserve_held = customer paid, released, recourse_returned, voided) the
    // liability is being settled — no further interest. Defense-in-depth beyond the cron's own selection.
    if (advance.status !== "advanced" || !advance.advanced_at) return { gate: "not_outstanding" as const };

    const accrualDate = toCompanyBusinessDate(input.accrual_date_iso) ?? input.accrual_date_iso.slice(0, 10);
    const dayIndex = dayIndexBetween(advance.advanced_at, accrualDate);
    // Contract: no interest through the 30-day term + 5-day grace (day 35). First charged day is day 36.
    if (dayIndex <= FACTORING_INTEREST_ACCRUAL_AFTER_DAY) return { gate: "before_grace" as const };

    if (await accrualExistsForDay(client, input.operating_company_id, input.factoring_advance_id, accrualDate)) {
      return { gate: "already_posted" as const };
    }

    // Compounding: opening = prior accrual's closing, else the pledged Net (the outstanding liability).
    const priorClosing = await lastAccrualClosingBalance(client, input.operating_company_id, input.factoring_advance_id);
    const opening = priorClosing ?? Number(advance.invoice_total_cents ?? 0);
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
  if (prepared.gate === "already_posted") {
    const advanceRepair = await withLuciaBypass(async (client: DbClient) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [
        input.operating_company_id,
      ]);
      const advance = await loadAdvance(client, input.operating_company_id, input.factoring_advance_id);
      if (!advance?.advanced_at) return { reason: "advance_not_found" as const };
      const accrualDate = toCompanyBusinessDate(input.accrual_date_iso) ?? input.accrual_date_iso.slice(0, 10);
      const dayIndex = dayIndexBetween(advance.advanced_at, accrualDate);
      const memo = `Factoring default interest ${advance.display_id} day ${dayIndex} (${accrualDate})`;
      return repairFactoringLifecycleSourceLinksOnClient(client, {
        operating_company_id: input.operating_company_id,
        memo,
        factoring_advance_id: input.factoring_advance_id,
        source_transaction_type: "factoring_default_interest",
      });
    });
    if (advanceRepair && "reason" in advanceRepair && advanceRepair.reason === "repair_ambiguous") {
      return { posted: false, reason: "repair_ambiguous" };
    }
    return { posted: false, reason: "already_posted" };
  }
  if (prepared.gate === "zero_amount") return { posted: false, reason: "zero_amount" };

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
    afterLifecycleBeforeCommit: async (client, journalEntryId) => {
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
