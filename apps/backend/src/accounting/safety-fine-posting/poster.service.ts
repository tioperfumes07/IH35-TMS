// SAFETY FINE-GL HOP — the COMPANY-PAID civil-fine expense leg. §1.4 financial cluster,
// BUILD-AND-HOLD, INERT until SAFETY_FINE_GL_POSTING_ENABLED is flipped per entity.
//
// THE DEFECT THIS CLOSES
// safety.civil_fines has two owner-decided treatments:
//   (a) driver-recovery -> driver_finance.driver_liabilities -> settlement deduction. ALREADY BUILT in
//       apps/backend/src/safety/fines.routes.ts (POST /api/v1/safety/fines/:id/convert-to-liability).
//   (b) company-paid    -> expense JE to civil_fines_expense. **WAS NOT BUILT.** The company-paid path
//       ended at POST /api/v1/safety/fines/:id/link-payment, which only stamped the fine row
//       (paid_via_bank_transaction_id / paid_date / paid_amount_cents / status='paid'). A fine the
//       company ate reached NO ledger at all — cash left the bank and the P&L never saw the expense.
// This poster is that missing hop, and ONLY that hop.
//
// WRITES ZERO NEW GL MATH. Every entry goes through accounting.createJournalEntry — the same shared
// poster the property-tax / factoring / settlement posters use, which enforces debits === credits > 0,
// writes the transaction_source_links spine, audit, and QBO-sync bookkeeping. Every account resolves
// through the entity-pinned role resolver (resolveRoleAccount), never a hardcoded number or name
// lookup. There is no debit/credit derivation here beyond mirroring one amount as one Dr and one Cr.
//
// Mirrors accounting/property-tax-posting/poster.service.ts exactly:
//   * FLAG GATE FIRST — isEnabled(client, SAFETY_FINE_GL_POSTING_ENABLED, {operating_company_id});
//     OFF => zero writes. Never a global env read; default OFF for every entity until the owner seeds
//     a per-entity override at final cutover.
//   * Idempotency: the accounting.civil_fine_postings row (partial-unique per active fine) is the latch,
//     backed by a deterministic-memo check; a re-run finds the existing JE and no-ops.
//   * We do NOT edit the shared posting-engine (lane lock) — standalone poster + createJournalEntry.
//
// ACCOUNTING (owner-decided; not re-litigated here)
//   COMPANY-PAID FINE:  Dr Civil Fines & Penalties (role civil_fines_expense)
//                       Cr Cash                    (role cash_clearing — an EXISTING role)
// Cash-basis-primary is the LOCKED basis for TRANSP (internal books + Ch.11 MOR are consistent):
// debit expense, CREDIT bank/cash. civil_fines_expense has NO shape-fallback in the resolver, so until
// the OWNER designates the account it fails closed (COA_ROLE_MAPPING_NOT_FOUND) and nothing posts.
//
// OUT OF SCOPE — a fine carrying converted_to_liability_id is a DRIVER-RECOVERY fine. It is the
// driver's debt, not a company expense, and it already has its own rail. This poster refuses it.

import { withLuciaBypass } from "../../auth/db.js";
import { isEnabled } from "../../lib/feature-flags/service.js";
import { createJournalEntry } from "../journal-entries.service.js";
import { resolveRoleAccount } from "../coa-roles/resolver.service.js";
import { appendCrudAudit } from "../../audit/crud-audit.js";

export const SAFETY_FINE_GL_POSTING_FLAG = "SAFETY_FINE_GL_POSTING_ENABLED";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

type Posting = {
  account_id: string;
  debit_or_credit: "debit" | "credit";
  amount_cents: number;
  description?: string | null;
};

export type SafetyFinePostResult = {
  posted: boolean;
  reason?:
    | "flag_off"
    | "already_posted"
    | "zero_amount"
    | "fine_not_found"
    | "fine_voided"
    | "driver_recovery_fine"
    | "not_company_paid";
  journal_entry_id?: string;
  memo?: string;
};

const FLAG_OFF: SafetyFinePostResult = { posted: false, reason: "flag_off" };

// ── Pure balanced-posting builder (no DB, no GL math beyond mirroring the amount as Dr/Cr). Unit-tested. ──

/** COMPANY-PAID FINE — Dr Civil Fines & Penalties (expense) / Cr Cash. Balanced by construction. */
export function buildCompanyPaidFinePostings(
  expenseAccountId: string,
  cashAccountId: string,
  amountCents: number,
  memo: string
): Posting[] {
  return [
    {
      account_id: expenseAccountId,
      debit_or_credit: "debit",
      amount_cents: amountCents,
      description: `${memo} — civil fine expense`,
    },
    {
      account_id: cashAccountId,
      debit_or_credit: "credit",
      amount_cents: amountCents,
      description: `${memo} — cash paid to authority`,
    },
  ];
}

async function postingEnabled(client: DbClient, operatingCompanyId: string): Promise<boolean> {
  return isEnabled(client as never, SAFETY_FINE_GL_POSTING_FLAG, { operating_company_id: operatingCompanyId });
}

// Idempotency (belt-and-suspenders alongside the expense_je_id latch): an auto fine JE is uniquely
// identified by its deterministic memo. If one already exists we do not post again.
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

type FineRow = {
  id: string;
  violation_description: string;
  issued_by_authority: string;
  jurisdiction: string | null;
  amount_cents: number | null;
  paid_amount_cents: number | null;
  status: string;
  voided_at: string | null;
  converted_to_liability_id: string | null;
};

async function loadFine(client: DbClient, operatingCompanyId: string, fineId: string): Promise<FineRow | null> {
  const res = await client.query<FineRow>(
    `
      SELECT id::text,
             violation_description,
             issued_by_authority,
             jurisdiction,
             amount_cents,
             paid_amount_cents,
             status,
             voided_at,
             converted_to_liability_id::text
      FROM safety.civil_fines
      WHERE operating_company_id = $1::uuid
        AND id = $2::uuid
      LIMIT 1
    `,
    [operatingCompanyId, fineId]
  );
  const row = res.rows[0];
  if (!row) return null;
  return {
    ...row,
    amount_cents: row.amount_cents == null ? null : Number(row.amount_cents),
    paid_amount_cents: row.paid_amount_cents == null ? null : Number(row.paid_amount_cents),
  };
}

export type PostCompanyPaidFineInput = {
  operating_company_id: string;
  fine_id: string;
  entry_date_iso: string; // 'YYYY-MM-DD' — the payment date
  actor_user_id: string;
};

/**
 * Post the COMPANY-PAID civil fine: Dr civil_fines_expense / Cr cash_clearing.
 * INERT while SAFETY_FINE_GL_POSTING_ENABLED is OFF (returns {posted:false, reason:'flag_off'} — zero
 * writes). Amount = the fine's paid_amount_cents when present, else amount_cents.
 */
export async function postCompanyPaidCivilFine(input: PostCompanyPaidFineInput): Promise<SafetyFinePostResult> {
  const prepared = await withLuciaBypass(async (client: DbClient) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);
    if (!(await postingEnabled(client, input.operating_company_id))) return { gate: "flag_off" as const };

    const fine = await loadFine(client, input.operating_company_id, input.fine_id);
    if (!fine) return { gate: "fine_not_found" as const };
    if (fine.voided_at) return { gate: "fine_voided" as const };

    // A converted fine is the DRIVER's debt (driver_liabilities + settlement deduction), never a
    // company expense. Posting it here would double-count: the company would expense a cost it is
    // simultaneously recovering from the driver.
    if (fine.converted_to_liability_id) return { gate: "driver_recovery_fine" as const };

    // Only a fine the company actually paid reaches the ledger on this leg.
    if (fine.status !== "paid") return { gate: "not_company_paid" as const };

    // Idempotency latch — an active posting row already exists for this fine.
    const posted = await client.query<{ id: string }>(
      `SELECT id::text FROM accounting.civil_fine_postings
       WHERE operating_company_id = $1::uuid AND fine_id = $2::uuid AND is_active
       LIMIT 1`,
      [input.operating_company_id, input.fine_id]
    );
    if (posted.rows[0]?.id) return { gate: "already_posted" as const };

    const amount = Number(fine.paid_amount_cents ?? fine.amount_cents ?? 0);
    if (amount <= 0) return { gate: "zero_amount" as const };

    const entryDate = input.entry_date_iso.slice(0, 10);
    const jurisdiction = fine.jurisdiction ? ` ${fine.jurisdiction}` : "";
    const memo = `Civil fine paid — ${fine.issued_by_authority}${jurisdiction} — ${fine.violation_description} [${fine.id}]`;
    if (await journalEntryExistsByMemo(client, input.operating_company_id, memo)) {
      return { gate: "already_posted" as const };
    }

    // ROLE resolution only — never a hardcoded account number, never a name lookup. civil_fines_expense
    // has NO shape-fallback entry, so this THROWS CoaRoleResolutionError until the owner designates.
    const expenseAccountId = await resolveRoleAccount(client, input.operating_company_id, "civil_fines_expense");
    const cashAccountId = await resolveRoleAccount(client, input.operating_company_id, "cash_clearing");

    return {
      gate: "post" as const,
      memo,
      entryDate,
      amount,
      postings: buildCompanyPaidFinePostings(expenseAccountId, cashAccountId, amount, memo),
    };
  });

  if (prepared.gate === "flag_off") return FLAG_OFF;
  if (prepared.gate === "fine_not_found") return { posted: false, reason: "fine_not_found" };
  if (prepared.gate === "fine_voided") return { posted: false, reason: "fine_voided" };
  if (prepared.gate === "driver_recovery_fine") return { posted: false, reason: "driver_recovery_fine" };
  if (prepared.gate === "not_company_paid") return { posted: false, reason: "not_company_paid" };
  if (prepared.gate === "already_posted") return { posted: false, reason: "already_posted" };
  if (prepared.gate === "zero_amount") return { posted: false, reason: "zero_amount" };

  // THE SHARED POSTER. No new GL math, no new balancing logic — createJournalEntry asserts
  // debits === credits > 0 and writes the ledger + source-links spine + audit.
  const created = await createJournalEntry(
    {
      operating_company_id: input.operating_company_id,
      entry_date: prepared.entryDate,
      memo: prepared.memo,
      source: "auto",
      postings: prepared.postings,
    },
    { userId: input.actor_user_id, role: "system" }
  );

  // Total-Connectivity: fine -> JE (and JE -> fine via ix_civil_fine_postings_je). ON CONFLICT DO
  // NOTHING against the partial-unique latch so a concurrent double-post can never create a second row.
  await withLuciaBypass(async (client: DbClient) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);
    await client.query(
      `
        INSERT INTO accounting.civil_fine_postings (
          operating_company_id, fine_id, expense_je_id, amount_cents, entry_date, memo,
          status, created_by_user_id
        )
        VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5::date, $6, 'posted', $7::uuid)
        ON CONFLICT (operating_company_id, fine_id) WHERE is_active DO NOTHING
      `,
      [
        input.operating_company_id,
        input.fine_id,
        created.id,
        prepared.amount,
        prepared.entryDate,
        prepared.memo,
        input.actor_user_id,
      ]
    );
    await appendCrudAudit(
      client as Parameters<typeof appendCrudAudit>[0],
      input.actor_user_id,
      "accounting.civil_fine_expense.posted",
      {
        resource_type: "safety.civil_fines",
        resource_id: input.fine_id,
        operatingCompanyId: input.operating_company_id,
        journalEntryId: created.id,
        amount_cents: prepared.amount,
        entry_date: prepared.entryDate,
        treatment: "company_paid",
      },
      "warning"
    );
  });

  return { posted: true, journal_entry_id: created.id, memo: prepared.memo };
}
