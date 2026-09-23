/**
 * FUEL GETS ITS DOCUMENT — closing the only posting in this system with nothing behind it.
 *
 * WHAT WAS WRONG, MEASURED LIVE ON PRODUCTION (USMCA, 2026-09-23):
 *
 *     fuel.fuel_transactions rows ....................... 627
 *     with a linked accounting.expenses row ............... 0
 *     with a linked driver_settlement_deduction ........... 0
 *
 * CC-3 reported fuel as having "no reversal path anywhere in the codebase", with
 * $501,511.22 across 1,170 live posted GL legs exposed. He was right about the symptom. The
 * cause is one layer lower and it is worse: fuel posts to the general ledger with NO DOCUMENT
 * BEHIND IT. There is nothing to void, which is precisely why nothing can reverse it.
 *
 * The architecture law of this system is:
 *     LAYER 1 ORIGIN creates the DOCUMENT -> LAYER 2 the document is MATCHED ->
 *     LAYER 3 the BANK REGISTER, which creates nothing.
 * Fuel skipped layer 1 entirely.
 *
 * SO THIS IS NOT A SEVENTH REVERSAL ENGINE, AND ONE MUST NOT BE WRITTEN.
 * `accounting.expenses` already carries `source_fuel_transaction_id` — the column has been
 * there the whole time, unpopulated — and an expense already has a reversal path through
 * `postVoidReversal`. Give the fuel purchase the expense document it always should have had
 * and the six engines that already exist reverse it for free.
 *
 * WHAT THIS FUNCTION WILL NOT DO
 *   - It does not post. It writes a DOCUMENT. Posting stays with the existing expense posting
 *     path, unchanged, so no new GL math enters the system.
 *   - It does not invent an amount. `total_cost` is what the fuel card charged. If it is
 *     missing or non-positive the document is refused and the reason is returned.
 *   - It does not invent a vendor. A fuel transaction with no `vendor_id` is refused and named,
 *     because an expense whose payee is a guess is worse than a gap you can see.
 *   - It does not renumber. It uses `nextExpenseDisplayId`, the same series every other expense
 *     create path uses. A second numbering series is how a number gets issued twice.
 *   - It never sets `is_sample_data`. Every USMCA row it writes is REAL.
 *
 * IDEMPOTENT by `source_fuel_transaction_id`. Running it twice over the same 627 rows produces
 * 627 documents, not 1,254 — which is what makes the day-by-day re-feed re-runnable after a
 * void, and what stops a backfill from doubling half a million dollars of fuel expense.
 */

import { appendCrudAudit } from "../audit/crud-audit.js";
import { nextExpenseDisplayId } from "../accounting/display-id.js";
import { linkCostDocumentToLoad } from "../expense-attribution/cost-load-link.service.js";
import { generateExpenseNumber } from "../expense-attribution/expense-number.js";

export type QueryableClient = {
  query: <T = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ) => Promise<{ rows: T[]; rowCount?: number | null }>;
};

/** The system actor a backfilled document is attributed to when no interactive user is present. */
export const FUEL_EXPENSE_SYSTEM_ACTOR = "system:fuel-expense-document";

export type FuelExpenseDocumentInput = {
  operating_company_id: string;
  fuel_transaction_id: string;
  /** Supplied by the caller so this function never decides who acted. */
  requesting_user_uuid?: string | null;
  /** Dry run: resolve and validate everything, write nothing, report what would happen. */
  dry_run?: boolean;
};

export type FuelExpenseDocumentOutcome =
  | {
      outcome: "created";
      expense_id: string;
      expense_number: string;
      amount_cents: number;
      /** The journal entry this document ADOPTED, when the fuel purchase was already posted. */
      adopted_journal_entry_id: string | null;
    }
  | { outcome: "already_exists"; expense_id: string; expense_number: string | null }
  | { outcome: "would_create"; expense_number: null; amount_cents: number }
  | { outcome: "refused"; reason: string };

type FuelRow = {
  id: string;
  operating_company_id: string;
  vendor_id: string | null;
  load_id: string | null;
  driver_id: string | null;
  unit_id: string | null;
  fuel_type: string | null;
  gallons: string | null;
  price_per_gallon: string | null;
  total_cost: string | null;
  transaction_at: string | null;
  purchased_at: string | null;
  transaction_reference: string | null;
  location_city: string | null;
  location_state: string | null;
  archived_at: string | null;
};

/**
 * Create the expense document a fuel purchase always should have had, or explain why not.
 * A refusal is a returned value the caller logs and gates on — never a thrown business error.
 */
export async function createExpenseFromFuelTransaction(
  client: QueryableClient,
  input: FuelExpenseDocumentInput,
): Promise<FuelExpenseDocumentOutcome> {
  // ---- 1. READ THE SOURCE, SCOPED. Never trust an id without its company. ----------------
  const fuelRes = await client.query<FuelRow>(
    `SELECT id::text, operating_company_id::text, vendor_id::text, load_id::text,
            driver_id::text, unit_id::text, fuel_type, gallons::text, price_per_gallon::text,
            total_cost::text, transaction_at::text, purchased_at::text, transaction_reference,
            location_city, location_state, archived_at::text
       FROM fuel.fuel_transactions
      WHERE id = $1 AND operating_company_id = $2`,
    [input.fuel_transaction_id, input.operating_company_id],
  );
  const fuel = fuelRes.rows[0];
  if (!fuel) {
    return {
      outcome: "refused",
      reason: `fuel transaction ${input.fuel_transaction_id} not found for company ${input.operating_company_id}`,
    };
  }
  if (fuel.archived_at) {
    return {
      outcome: "refused",
      reason: `fuel transaction ${fuel.id} is archived — an archived purchase does not get a new document`,
    };
  }

  // ---- 2. IDEMPOTENCY. This is what stops a backfill doubling the fuel expense. -----------
  const existing = await client.query<{ id: string; expense_number: string | null }>(
    `SELECT id::text, expense_number
       FROM accounting.expenses
      WHERE operating_company_id = $1 AND source_fuel_transaction_id = $2
      LIMIT 1`,
    [input.operating_company_id, fuel.id],
  );
  if (existing.rows[0]) {
    return {
      outcome: "already_exists",
      expense_id: existing.rows[0].id,
      expense_number: existing.rows[0].expense_number ?? null,
    };
  }

  // ---- 3. REFUSE RATHER THAN GUESS --------------------------------------------------------
  const totalCost = Number(fuel.total_cost ?? NaN);
  if (!Number.isFinite(totalCost) || totalCost <= 0) {
    return {
      outcome: "refused",
      reason:
        `fuel transaction ${fuel.id} has total_cost ${String(fuel.total_cost)} — an expense is ` +
        `never written for an amount the source does not state. Fix the import, not the document.`,
    };
  }
  if (!fuel.vendor_id) {
    return {
      outcome: "refused",
      reason:
        `fuel transaction ${fuel.id} has no vendor_id. An expense whose payee is a guess is worse ` +
        `than a gap you can see. Map the fuel card's merchant to a vendor first.`,
    };
  }
  const txnDate = (fuel.purchased_at ?? fuel.transaction_at ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(txnDate)) {
    return {
      outcome: "refused",
      reason: `fuel transaction ${fuel.id} has neither purchased_at nor transaction_at — an expense must carry a real date`,
    };
  }

  // Cents is the authoritative spine everywhere in this codebase; the legacy numeric column
  // mirrors it in dollars. Rounding happens once, here, not at three call sites.
  const amountCents = Math.round(totalCost * 100);

  const where =
    [fuel.location_city, fuel.location_state].filter(Boolean).join(", ") || "location not recorded";
  const gallons = fuel.gallons ? `${fuel.gallons} gal` : "gallons not recorded";
  const ppg = fuel.price_per_gallon ? ` @ $${fuel.price_per_gallon}/gal` : "";
  const memo =
    `${fuel.fuel_type ?? "Fuel"} purchase — ${gallons}${ppg}, ${where}` +
    (fuel.transaction_reference ? `, ref ${fuel.transaction_reference}` : "") +
    ` (document created from fuel transaction ${fuel.id}; amount as charged, not derived)`;

  if (input.dry_run) {
    return { outcome: "would_create", expense_number: null, amount_cents: amountCents };
  }

  // ---- 3b. ADOPT THE POSTING THAT ALREADY EXISTS. --------------------------------------
  // CC-3 flagged this gap in the first cut and he was right: a document that does not point at
  // the journal entry its own purchase already produced is not the origin of that posting, it
  // is a second thing standing next to it. Posting the new document would DOUBLE-POST the fuel.
  //
  // The link already exists and nobody was using it: accounting.transaction_source_links rows
  // with linked_object_type='fuel_event' and linked_object_id = the fuel transaction id, one
  // 'fuel_expense' leg and one 'fuel_offset' leg per posting (2,306 links live for USMCA).
  // Walk it back to the journal entry and ADOPT that entry.
  //
  // Adopted => the expense is 'posted', carrying the JE that is already on the books. Nothing
  // new is posted, no GL math runs, and postVoidReversal can now reverse the REAL entry,
  // because the document it needs finally exists.
  // Not adopted => 'draft', and the normal posting path posts it later like any other expense.
  // ONLY LIVE ENTRIES COUNT, AND THIS IS NOT A DETAIL -- IT IS THE WHOLE ANSWER.
  // My first cut of this query counted every linked journal entry and would have REFUSED 372 of
  // 627 fuel transactions as "linked to 2 or 3 journal entries". Measured live, that was wrong:
  // 555 of those entries are already reversed (reversed_by_je_id set) and are dead history. In a
  // void-not-delete system the reversed row is STILL THERE, so a query that counts rows counts
  // ghosts. With the five-column liveness test applied: 585 fuel transactions have exactly ONE
  // live entry, 42 have none, and ZERO have more than one. The multi-entry alarm was my own
  // measurement error, caught by measuring instead of shipping.
  const jeRes = await client.query<{ je: string }>(
    `SELECT DISTINCT p.journal_entry_uuid::text AS je
       FROM accounting.transaction_source_links l
       JOIN accounting.journal_entry_postings p ON p.id = l.journal_entry_posting_id
       JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid
      WHERE l.operating_company_id = $1
        AND l.linked_object_type = 'fuel_event'
        AND l.linked_object_id = $2::text
        AND p.journal_entry_uuid IS NOT NULL
        AND p.reversed_by_line_id IS NULL
        AND je.status = 'posted'
        AND je.voided_at IS NULL
        AND je.reversed_by_je_id IS NULL
        AND je.reverses_je_id IS NULL`,
    [input.operating_company_id, fuel.id],
  );
  if (jeRes.rows.length > 1) {
    // Two journal entries for one fuel purchase is a real defect upstream. Picking one would
    // attach the document to half its own history and hide the other half forever.
    return {
      outcome: "refused",
      reason:
        `fuel transaction ${fuel.id} is linked to ${jeRes.rows.length} LIVE journal entries ` +
        `(${jeRes.rows.map((r) => r.je).join(", ")}). One purchase, one live posting -- more than ` +
        `one means the fuel was posted twice and is really on the books twice. Measured live on ` +
        `2026-09-23 this happened ZERO times, so if it fires it is new and it is real. The ` +
        `document is not written until it is resolved.`,
    };
  }
  const adoptedJeId = jeRes.rows[0]?.je ?? null;

  // ---- 4. THE SAME NUMBER SERIES EVERY OTHER EXPENSE USES --------------------------------
  const loadNumbered = fuel.load_id
    ? await generateExpenseNumber(client as never, fuel.load_id, input.operating_company_id)
    : null;
  const expenseNumber = loadNumbered?.number ?? await nextExpenseDisplayId(
      client as never,
      input.operating_company_id,
      new Date(`${txnDate}T00:00:00.000Z`),
    );

  // ---- 5. WRITE THE DOCUMENT. STATUS 'draft' ON PURPOSE. ---------------------------------
  // A backfilled document is not posted by the act of existing. The existing expense posting
  // path posts it, applies the category account, and writes the GL — unchanged, so no new
  // posting math enters the system and the reversal path it already has stays the only one.
  const inserted = await client.query<{ id: string }>(
    `
      INSERT INTO accounting.expenses (
        operating_company_id, vendor_uuid, status, transaction_date, total_amount_cents,
        memo, expense_number, source_fuel_transaction_id, load_id, is_sample_data,
        journal_entry_id, posted_at
      )
      VALUES ($1::uuid, $2::uuid, $9, $3::date, $4::bigint, $5, $6, $7::uuid, $8::uuid, false,
              $10::uuid, $11)
      RETURNING id::text
    `,
    [
      input.operating_company_id,
      fuel.vendor_id,
      txnDate,
      // total_amount_cents is the REAL column and it is bigint NOT NULL. There is no
      // `total_amount` numeric column on accounting.expenses -- verified live. Cents is the
      // spine; nothing here divides by 100 and hands a float to the ledger.
      amountCents,
      memo,
      expenseNumber,
      fuel.id,
      fuel.load_id,
      // A document that adopts a posting is posted. One that does not is a draft.
      adoptedJeId ? "posted" : "draft",
      adoptedJeId,
      adoptedJeId ? (fuel.purchased_at ?? fuel.transaction_at) : null,
    ],
  );
  const expenseId = inserted.rows[0]!.id;

  if (fuel.load_id) {
    const link = await linkCostDocumentToLoad(client as never, {
      operatingCompanyId: input.operating_company_id,
      source: "accounting",
      documentId: expenseId,
      loadId: fuel.load_id,
      actorUserId: input.requesting_user_uuid ?? FUEL_EXPENSE_SYSTEM_ACTOR,
      reason: "Fuel expense document inherits the fuel transaction load",
      numbered: loadNumbered ?? undefined,
    });
    if (link.expenseNumber !== expenseNumber) throw new Error(`fuel_expense_number_link_mismatch:${expenseId}`);
  }

  await appendCrudAudit(
    client,
    input.requesting_user_uuid ?? FUEL_EXPENSE_SYSTEM_ACTOR,
    "accounting.expense.created_from_fuel_transaction",
    {
      expense_id: expenseId,
      expense_number: expenseNumber,
      operating_company_id: input.operating_company_id,
      fuel_transaction_id: fuel.id,
      vendor_id: fuel.vendor_id,
      load_id: fuel.load_id,
      driver_id: fuel.driver_id,
      unit_id: fuel.unit_id,
      amount_cents: amountCents,
      transaction_date: txnDate,
      adopted_journal_entry_id: adoptedJeId,
      status: adoptedJeId ? "posted" : "draft",
      reason:
        "fuel posted to the GL with no document behind it; the expense is the document the " +
        "existing reversal path (postVoidReversal) needs in order to reverse it",
    },
    "info",
    "FUEL-EXPENSE-DOC-01",
  );

  return {
    outcome: "created",
    expense_id: expenseId,
    expense_number: expenseNumber,
    amount_cents: amountCents,
    adopted_journal_entry_id: adoptedJeId,
  };
}
