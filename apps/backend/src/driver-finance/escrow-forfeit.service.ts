// SAF-F01 — Driver escrow FORFEIT service (build-and-HOLD, financial cluster).
//
// A forfeit keeps a driver's held escrow instead of returning it, because the driver owes for a loss
// (damage / abandonment). It is the OPPOSITE of a release: release pays cash out to the driver
// (Dr escrow-liability / Cr cash_clearing); forfeit recognizes a RECOVERY against the recorded loss and
// NO cash moves.
//
// OWNER RULING 2026-07-23 (no CPA; owner is the decision maker):
//   Forfeited escrow is a recovery against a recorded loss, NEVER income. Both branches post the SAME GL
//   leg — DR the driver's escrow LIABILITY (down) / CR damage_recovery — and when a specific liability is
//   linked, the driver_liabilities subledger row is ALSO decremented to record that that debt was
//   satisfied. There is no posted A/R to credit (driver_liabilities carries no GL entry today — see the
//   HONEST-GAP note below), so crediting a fabricated driver-A/R account would be a guessed mapping; we
//   do not do that.
//
// HONEST GAP (flagged, not fixed here — accounting-lane defect): convertFineToLiability inserts a
// driver_finance.driver_liabilities row but posts NO journal entry, so the driver's debt is a subledger
// balance with no GL loss/receivable behind it. Until that upstream gap is closed, the forfeit's
// damage_recovery credit has no matching GL loss to net against — honest but incomplete. The route's
// evidence surfaces this; it does not paper over it.
//
// REUSE, NO NEW GL MATH:
//   - resolveDriverEscrowLiabilityAccount → the DR account (per-driver escrow liability sub-account),
//     read exactly like the settlement poster (Liability-or-fail, not-Faro-or-fail).
//   - readDriverEscrowBalanceCents → the over-draw guard's authoritative balance.
//   - resolveRoleAccount(..., "damage_recovery") → the CR account via the PRIMARY CoA resolver; throws
//     (fail loud) when undesignated.
//   - createJournalEntryOnClient → balanced-or-abort JE inside the caller-owned tx.
//   - accounting.escrow_postings via recordEscrowPostingOnly: posting_type='forfeiture'
//     (trigger 202608070000 decrements balance), source_type='forfeit'.

import { withCurrentUser } from "../auth/db.js";
import { isEnabled } from "../lib/feature-flags/service.js";
import { createJournalEntryOnClient } from "../accounting/journal-entries.service.js";
import { resolveRoleAccount } from "../accounting/coa-roles/resolver.service.js";
import { recordEscrowPostingOnly } from "../accounting/escrow/service.js";
import { companyBusinessDate } from "../lib/company-business-date.js";
import { appendCrudAudit } from "../audit/crud-audit.js";
import {
  resolveDriverEscrowLiabilityAccount,
  readDriverEscrowBalanceCents,
} from "./escrow-resolver.service.js";

/** OFF by default (pattern fallback recognizes *_GL_POSTING_ENABLED and returns false when unseeded). */
export const DRIVER_ESCROW_FORFEIT_GL_POSTING_FLAG_KEY = "DRIVER_ESCROW_FORFEIT_GL_POSTING_ENABLED";

export type ForfeitEscrowInput = {
  operating_company_id: string;
  driver_uuid: string;
  /** DOLLARS as entered by the operator. Converted to cents (×100) exactly once, here. */
  amount: number;
  reason: string;
  /** OPTIONAL. When set, the driver_finance.driver_liabilities row it names is ALSO decremented. */
  linked_liability_id?: string | null;
};

export type ForfeitEscrowResult =
  | { result: "posted"; journal_entry_id: string; escrow_posting_id: string; amount_cents: number; linked_liability_decremented: boolean }
  | { result: "flag_off" }
  | { result: "over_draw"; balance_cents: number; requested_cents: number }
  | { result: "linked_liability_not_found" };

export class EscrowForfeitError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "EscrowForfeitError";
  }
}

/** DOLLARS → integer CENTS, exactly once. Rejects non-finite / negative. */
export function dollarsToCents(dollars: number): number {
  if (!Number.isFinite(dollars) || dollars <= 0) {
    throw new EscrowForfeitError("E_INVALID_AMOUNT", `forfeit amount must be a positive number of dollars, got ${dollars}`);
  }
  return Math.round(dollars * 100);
}

type ForfeitOnClientInput = {
  operating_company_id: string;
  driver_uuid: string;
  /** Already CENTS — the one-time dollars→cents conversion happens in the caller. */
  amount_cents: number;
  reason: string;
  linked_liability_id?: string | null;
};

/**
 * Client-scoped core — no BEGIN/COMMIT/ROLLBACK of its own. The caller owns the transaction
 * boundary: `forfeitDriverEscrow` below wraps this in `withCurrentUser` for the manual/operator
 * route; `applyApprovedAbandonmentChargebacksToSettlement` (abandonment.service.ts) calls this
 * directly on its OWN already-open settlement-close transaction, so an escrow-forfeit failure
 * aborts the whole settlement close atomically instead of partially committing. Errors propagate
 * to whichever caller owns the transaction — never swallowed, never rolled back in isolation here.
 */
export async function forfeitDriverEscrowOnClient(
  client: unknown,
  input: ForfeitOnClientInput,
  actor: { userId: string; role: string }
): Promise<ForfeitEscrowResult> {
  const amountCents = input.amount_cents;
  await (client as { query: (sql: string, values?: unknown[]) => Promise<unknown> }).query(
    `SELECT set_config('app.operating_company_id', $1::text, true)`,
    [input.operating_company_id]
  );

  // Invariant: forfeit ≤ current escrow balance; balance never negative. Read BEFORE any write.
  const balanceCents = await readDriverEscrowBalanceCents(client as never, input.operating_company_id, input.driver_uuid);
  if (amountCents > balanceCents) {
    return { result: "over_draw" as const, balance_cents: balanceCents, requested_cents: amountCents };
  }

  // FAIL LOUD when the escrow GL posting flag is OFF — no ledger write without the balanced JE.
  const flagOn = await isEnabled(client as never, DRIVER_ESCROW_FORFEIT_GL_POSTING_FLAG_KEY, {
    operating_company_id: input.operating_company_id,
  });
  if (!flagOn) return { result: "flag_off" as const };

  // If a specific liability is named, it must be a REAL row for this driver+entity (canonical FK, not memo).
  if (input.linked_liability_id) {
    const liab = await (client as { query: <T>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> }).query<{ id: string }>(
      `SELECT id::text FROM driver_finance.driver_liabilities
       WHERE id = $1::uuid AND operating_company_id = $2::uuid AND driver_id = $3::uuid LIMIT 1`,
      [input.linked_liability_id, input.operating_company_id, input.driver_uuid]
    );
    if (!liab.rows[0]) return { result: "linked_liability_not_found" as const };
  }

  // DR account: the driver's own escrow LIABILITY sub-account (Liability-or-fail, not-Faro-or-fail).
  const escrowLiability = await resolveDriverEscrowLiabilityAccount(client as never, input.operating_company_id, input.driver_uuid);

  // CR account: damage_recovery via the PRIMARY CoA resolver — THROWS (fail loud) when undesignated.
  const damageRecoveryAccountId = await resolveRoleAccount(client as never, input.operating_company_id, "damage_recovery");

  const je = await createJournalEntryOnClient(
    client as never,
    {
      operating_company_id: input.operating_company_id,
      entry_date: companyBusinessDate(),
      memo: `Driver escrow forfeiture — ${input.reason}`,
      source: "auto",
      postings: [
        {
          account_id: escrowLiability.accountId,
          debit_or_credit: "debit",
          amount_cents: amountCents,
          description: "Escrow liability forfeited (driver-owed loss)",
        },
        {
          account_id: damageRecoveryAccountId,
          debit_or_credit: "credit",
          amount_cents: amountCents,
          description: "Damage recovery from forfeited escrow",
        },
      ],
    },
    actor
  );

  // Record on accounting.escrow_postings via the #3533 helper so apply_escrow_posting_delta
  // (202608070000) decrements the canonical balance (forfeiture −). Never raw INSERT with
  // posting_type='adjustment' — that hit the 0234 ELSE→+ branch and inflated the liability.
  const posting = await recordEscrowPostingOnly(client as never, {
    operating_company_id: input.operating_company_id,
    driver_id: input.driver_uuid,
    posting_type: "forfeiture",
    amount_cents: amountCents,
    source_type: "forfeit",
    source_id: input.linked_liability_id ?? null,
    note: `Forfeit: ${input.reason}`,
    posted_by_user_id: actor.userId,
    linked_journal_entry_id: je.id,
  });
  if (!posting.posted || !posting.posting_id) {
    throw new EscrowForfeitError("E_ESCROW_ACCOUNT_MISSING", "no accounting.escrow_accounts bridge row for this driver");
  }

  // ESC-FORFEIT-SPLIT — SAME TRANSACTION as accounting.escrow_postings above.
  // Root cause: forfeit wrote accounting.escrow_postings (+ optional driver_liabilities) but never
  // touched driver_finance.escrow_balances / escrow_ledger, so the driver-facing balance froze and
  // overstated what the driver is owed. escrow_ledger CHECK already permits transaction_type='forfeit'.
  // Decrement current_balance_cents and append the ledger row so both stores reconcile after forfeit.
  // (Sign math for accounting.escrow_accounts lives in apply_escrow_posting_delta / #3542 — not here.)
  const dfBal = await (client as { query: <T>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> }).query<{
    id: string;
    current_balance_cents: string;
  }>(
    `UPDATE driver_finance.escrow_balances
     SET current_balance_cents = current_balance_cents - $3::bigint,
         last_updated_at = now()
     WHERE operating_company_id = $1::uuid
       AND driver_id = $2::uuid
       AND current_balance_cents >= $3::bigint
     RETURNING id::text, current_balance_cents::bigint`,
    [input.operating_company_id, input.driver_uuid, amountCents]
  );
  const dfRow = dfBal.rows[0];
  if (!dfRow) {
    throw new EscrowForfeitError(
      "E_ESCROW_BALANCES_MISSING",
      "driver_finance.escrow_balances missing or insufficient — refusing split-brain forfeit (accounting posted without driver-facing decrement)"
    );
  }
  await (client as { query: (sql: string, values?: unknown[]) => Promise<unknown> }).query(
    `INSERT INTO driver_finance.escrow_ledger
       (operating_company_id, driver_id, escrow_balance_id, transaction_type, amount_cents, running_balance_cents, description)
     VALUES ($1::uuid, $2::uuid, $3::uuid, 'forfeit', $4::bigint, $5::bigint, $6)`,
    [
      input.operating_company_id,
      input.driver_uuid,
      dfRow.id,
      amountCents,
      Number(dfRow.current_balance_cents),
      `Forfeit: ${input.reason}`,
    ]
  );

  // Linked branch: decrement the specific debt in the subledger (never below zero).
  let linkedDecremented = false;
  if (input.linked_liability_id) {
    const dec = await (client as { query: <T>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> }).query(
      `UPDATE driver_finance.driver_liabilities
       SET current_balance = GREATEST(0, current_balance - ($4::bigint / 100.0)),
           updated_at = now()
       WHERE id = $1::uuid AND operating_company_id = $2::uuid AND driver_id = $3::uuid
       RETURNING id`,
      [input.linked_liability_id, input.operating_company_id, input.driver_uuid, amountCents]
    );
    linkedDecremented = ((dec as { rows: unknown[] }).rows?.length ?? 0) > 0;
  }

  await appendCrudAudit(
    client as never,
    actor.userId,
    "driver_finance.escrow.forfeited",
    {
      driver_id: input.driver_uuid,
      amount_cents: amountCents,
      reason: input.reason,
      journal_entry_id: je.id,
      escrow_posting_id: posting.posting_id,
      linked_liability_id: input.linked_liability_id ?? null,
    },
    "warning",
    "SAF-F01-ESCROW-FORFEIT"
  );

  return {
    result: "posted" as const,
    journal_entry_id: je.id,
    escrow_posting_id: posting.posting_id ?? "",
    amount_cents: amountCents,
    linked_liability_decremented: linkedDecremented,
  };
}

export async function forfeitDriverEscrow(
  input: ForfeitEscrowInput,
  actor: { userId: string; role: string }
): Promise<ForfeitEscrowResult> {
  const amountCents = dollarsToCents(input.amount);
  return withCurrentUser(actor.userId, (client) =>
    forfeitDriverEscrowOnClient(
      client,
      {
        operating_company_id: input.operating_company_id,
        driver_uuid: input.driver_uuid,
        amount_cents: amountCents,
        reason: input.reason,
        linked_liability_id: input.linked_liability_id ?? null,
      },
      actor
    )
  );
}
