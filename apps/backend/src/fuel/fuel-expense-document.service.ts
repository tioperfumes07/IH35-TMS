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
 *   - It never sets `is_sample_data`. Every USMCA row it writes is REAL.
 *
 * R-168 CORRECTION (2026-09-25): this file's original numbering choice was wrong, not merely
 * incomplete. `nextExpenseDisplayId` (EXP-YYYY-#####) is documented in display-id.ts itself as
 * "for expenses that are not load-attributed" — a fuel transaction WITH a load_id is exactly the
 * load-attributed case, and the codebase already has the right series for it:
 * `generateExpenseNumber` (expense-attribution/expense-number.ts), the same one expenses.routes.ts
 * uses for every other load-attributed expense create path, producing `<load_number>` /
 * `<load_number>-1` / `<load_number>-2`. Owner law (verify-load-to-cash-chain.mjs LINK 3):
 * "all expenses that are related to that load have the same expense number as the load." Using
 * nextExpenseDisplayId here was NOT using "the same series every other expense create path uses"
 * as the original comment claimed — it was the one series load-attributed expenses do NOT use.
 * Measured live before this fix: 304 of LINK 3's 313 mismatches trace to this function (AUTH-005
 * fuel run, 2026-09-25). Still exactly ONE series per case — a fuel transaction with no load_id
 * still gets nextExpenseDisplayId, unchanged; this is not a second series, it is routing to the
 * correct existing one. A load-attributed document also now gets its
 * expense_attribution.expense_load_links row, matching every other load-attributed create path
 * (previously missing here entirely — the same LV-EXPENSE-NUMBER-NEVER-POPULATED gap
 * expenses.routes.ts already fixed for its own two create branches).
 *
 * IDEMPOTENT by `source_fuel_transaction_id`. Running it twice over the same 627 rows produces
 * 627 documents, not 1,254 — which is what makes the day-by-day re-feed re-runnable after a
 * void, and what stops a backfill from doubling half a million dollars of fuel expense.
 */

import { appendCrudAudit } from "../audit/crud-audit.js";
import { nextExpenseDisplayId } from "../accounting/display-id.js";
import { generateExpenseNumber } from "../expense-attribution/expense-number.js";
import {
  loadFuelTxnCreditSignals,
  resolveCompanyDirectCreditPreference,
} from "../accounting/fuel-posting/maybe-post-from-fuel-transaction.service.js";
import { resolveCompanyDirectCreditAccount } from "../accounting/fuel-posting/poster.service.js";

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

// R-169 fix 2 — fuel.fuel_transactions.fuel_type CHECK: 'diesel' | 'def' | 'gas' | 'reefer_diesel' |
// 'other' (verified live). Only the three the owner's fix names (diesel/DEF/reefer) have a real
// catalog item today; 'gas'/'other' refuse rather than post to a guessed account.
const FUEL_TYPE_ITEM_NAME: Record<string, string> = {
  diesel: "Fuel-Truck Diesel",
  def: "Fuel-DEF-Diesel Exhaust Fluid",
  reefer_diesel: "Fuel-Reefer-Diesel",
};

// ROUND 192 (Lead, 2026-09-25) — Ruling R-30.1: fuel posts at NET, the card's own fee posts
// separately, Dr 5005 / Cr the card rail. The account is not hardcoded here — it lives on this
// catalog item, same as every fuel-type item above (the Lead points this item at 5005 in
// AUTH-042; this file only ever resolves by name and refuses if the item or its account is
// missing).
const FUEL_FEE_ITEM_NAME = "Fuel Card Fee";

/** Shared by resolveFuelItem (fuel-type-keyed) and the fee-line resolver (fixed name) — the
 *  account always lives on the catalog item, this function never guesses one. */
async function resolveItemByName(
  client: QueryableClient,
  operatingCompanyId: string,
  itemName: string,
): Promise<{ itemId: string; expenseAccountId: string; itemName: string } | { refused: string }> {
  const res = await client.query<{ id: string; expense_account_id: string | null }>(
    `SELECT id::text, default_expense_account_id::text AS expense_account_id
       FROM catalogs.items
      WHERE item_name = $2 AND (operating_company_id = $1::uuid OR operating_company_id IS NULL)
      ORDER BY (operating_company_id = $1::uuid) DESC
      LIMIT 1`,
    [operatingCompanyId, itemName],
  );
  const row = res.rows[0];
  if (!row || !row.expense_account_id) {
    return { refused: `catalogs.items "${itemName}" not found or has no default_expense_account_id for company ${operatingCompanyId} — refusing rather than posting to a default` };
  }
  return { itemId: row.id, expenseAccountId: row.expense_account_id, itemName };
}

async function resolveFuelItem(
  client: QueryableClient,
  operatingCompanyId: string,
  fuelType: string | null,
): Promise<{ itemId: string; expenseAccountId: string; itemName: string } | { refused: string }> {
  const itemName = fuelType ? FUEL_TYPE_ITEM_NAME[fuelType] : undefined;
  if (!itemName) {
    return { refused: `fuel_type "${fuelType}" has no mapped catalogs.items entry — refusing rather than posting to a default (only diesel/def/reefer_diesel are mapped)` };
  }
  return resolveItemByName(client, operatingCompanyId, itemName);
}

/** resolveFeeItem — the "Fuel Card Fee" item, resolved by name exactly like resolveFuelItem.
 *  Never called unless fee_amount > 0. */
async function resolveFeeItem(
  client: QueryableClient,
  operatingCompanyId: string,
): Promise<{ itemId: string; expenseAccountId: string; itemName: string } | { refused: string }> {
  return resolveItemByName(client, operatingCompanyId, FUEL_FEE_ITEM_NAME);
}

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
  gross_cost: string | null;
  discount_amount: string | null;
  fee_amount: string | null;
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
            location_city, location_state, archived_at::text,
            gross_cost::text, discount_amount::text, fee_amount::text
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
  // R-153.6 STEP 3: a VOIDED prior document must not block a fresh one -- that is the entire
  // point of void-then-recreate during remediation. Without this filter a voided row (dead,
  // reversed, superseded) permanently "already_exists"-blocks every future call for that fuel
  // transaction, which is the opposite of what void means.
  const existing = await client.query<{ id: string; expense_number: string | null }>(
    `SELECT id::text, expense_number
       FROM accounting.expenses
      WHERE operating_company_id = $1 AND source_fuel_transaction_id = $2 AND voided_at IS NULL
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

  // R-169 fix 2 — resolved here, before dry_run returns, so a dry-run report also catches a
  // missing catalog item instead of writing a document that would later fail the ledger rule
  // "a GL-posted expense's lines must sum to its total" (measured live: R-167 had to hand-add 6
  // lines this class of gap left behind).
  const fuelItem = await resolveFuelItem(client, input.operating_company_id, fuel.fuel_type);
  if ("refused" in fuelItem) {
    return { outcome: "refused", reason: `fuel transaction ${fuel.id}: ${fuelItem.refused}` };
  }

  // Cents is the authoritative spine everywhere in this codebase; the legacy numeric column
  // mirrors it in dollars. Rounding happens once, here, not at three call sites.
  // ROUND 192 / Ruling R-30.1: total_cost is what the card charged for the FUEL — NET. It is
  // never touched by gross_cost/discount_amount; those are memo-only context, never GL math.
  const amountCents = Math.round(totalCost * 100);

  // ROUND 192 (Lead, 2026-09-25) — the card's own fee posts as its OWN line, on its OWN item
  // ("Fuel Card Fee"), never folded into the fuel line. Refuse rather than silently dropping a
  // real fee if the item isn't there yet (the Lead creates it in AUTH-042, after this PR merges).
  const feeAmount = Number(fuel.fee_amount ?? "0");
  const feeCents = Number.isFinite(feeAmount) && feeAmount > 0 ? Math.round(feeAmount * 100) : 0;
  let feeItem: { itemId: string; expenseAccountId: string; itemName: string } | null = null;
  if (feeCents > 0) {
    const resolved = await resolveFeeItem(client, input.operating_company_id);
    if ("refused" in resolved) {
      return { outcome: "refused", reason: `fuel transaction ${fuel.id}: ${resolved.refused}` };
    }
    feeItem = resolved;
  }
  const totalAmountCents = amountCents + feeCents;

  const where =
    [fuel.location_city, fuel.location_state].filter(Boolean).join(", ") || "location not recorded";
  const gallons = fuel.gallons ? `${fuel.gallons} gal` : "gallons not recorded";
  const ppg = fuel.price_per_gallon ? ` @ $${fuel.price_per_gallon}/gal` : "";
  // ROUND 192 — gross/discount are MEMO ONLY, never GL math: total_cost (net) is what actually
  // posts, always. The memo states the reconciliation so a reader can tie the net back to the
  // statement's own gross/discount without the ledger ever deriving from gross.
  const grossCost = fuel.gross_cost != null ? Number(fuel.gross_cost) : null;
  const discountAmount = fuel.discount_amount != null ? Number(fuel.discount_amount) : 0;
  const grossDiscountNote =
    grossCost != null && Number.isFinite(grossCost)
      ? ` — gross $${grossCost.toFixed(2)} − discount $${discountAmount.toFixed(2)} = net $${totalCost.toFixed(2)}` +
        (feeCents > 0 ? ` (+ fee $${(feeCents / 100).toFixed(2)})` : "")
      : "";
  const memo =
    `${fuel.fuel_type ?? "Fuel"} purchase — ${gallons}${ppg}, ${where}` +
    (fuel.transaction_reference ? `, ref ${fuel.transaction_reference}` : "") +
    grossDiscountNote +
    ` (document created from fuel transaction ${fuel.id}; amount as charged, not derived)`;

  if (input.dry_run) {
    return { outcome: "would_create", expense_number: null, amount_cents: totalAmountCents };
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

  // ROUND 192 — an ADOPTED journal entry was posted before the fee line existed as a concept: it
  // has no fee leg, so this document cannot both adopt that entry AND carry a real fee_amount
  // without silently understating what the entry actually posted. Refuse rather than adopt a JE
  // that does not match the document's own total.
  if (adoptedJeId && feeCents > 0) {
    return {
      outcome: "refused",
      reason:
        `fuel transaction ${fuel.id} would adopt journal entry ${adoptedJeId}, but fee_amount is ` +
        `$${(feeCents / 100).toFixed(2)} — an already-posted entry has no fee leg, so adopting it ` +
        `here would silently understate the document. Not written.`,
    };
  }

  // ---- 4. THE CORRECT EXISTING SERIES FOR THIS DOCUMENT'S SHAPE --------------------------
  // R-168: load-attributed -> generateExpenseNumber (load-scoped, owner law); no load ->
  // nextExpenseDisplayId (QBO-style, unattributed) — see the header comment for the full
  // derivation. loadAttribution is null when fuel.load_id is absent.
  let expenseNumber: string;
  let loadAttribution: { number: string; seq: number; loadNumber: string } | null = null;
  if (fuel.load_id) {
    loadAttribution = await generateExpenseNumber(client as never, fuel.load_id, input.operating_company_id);
    expenseNumber = loadAttribution.number;
  } else {
    expenseNumber = await nextExpenseDisplayId(
      client as never,
      input.operating_company_id,
      new Date(`${txnDate}T00:00:00.000Z`),
    );
  }

  // ---- 4b. R-153.6/153.7: RESOLVE THE CARD-RAIL PAYMENT ACCOUNT. -------------------------
  // Only needed for a fresh (non-adopted) draft -- an adopted document points at a JE that
  // already has its own credit leg, so its payment_account_uuid is descriptive metadata here,
  // not a posting input; still worth setting so the document is honest about the rail either way.
  const creditSignals = await loadFuelTxnCreditSignals(client as never, input.operating_company_id, fuel.id);
  const creditPreference = resolveCompanyDirectCreditPreference(
    {
      operating_company_id: input.operating_company_id,
      fuel_transaction_id: fuel.id,
      fuel_type: fuel.fuel_type ?? "diesel",
      transaction_at: fuel.transaction_at ?? fuel.purchased_at ?? txnDate,
      amount_cents: amountCents,
    },
    creditSignals,
  );
  const { account_id: paymentAccountId } = await resolveCompanyDirectCreditAccount(
    client as never,
    input.operating_company_id,
    creditPreference,
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
        journal_entry_id, posted_at, payment_account_uuid
      )
      VALUES ($1::uuid, $2::uuid, $9, $3::date, $4::bigint, $5, $6, $7::uuid, $8::uuid, false,
              $10::uuid, $11, $12::uuid)
      RETURNING id::text
    `,
    [
      input.operating_company_id,
      fuel.vendor_id,
      txnDate,
      // total_amount_cents is the REAL column and it is bigint NOT NULL. There is no
      // `total_amount` numeric column on accounting.expenses -- verified live. Cents is the
      // spine; nothing here divides by 100 and hands a float to the ledger.
      // ROUND 192: the document's total is net + fee (both lines), never just the fuel line --
      // "lines must sum to total" applies here exactly like every other multi-line expense.
      totalAmountCents,
      memo,
      expenseNumber,
      fuel.id,
      fuel.load_id,
      // A document that adopts a posting is posted. One that does not is a draft.
      adoptedJeId ? "posted" : "draft",
      adoptedJeId,
      adoptedJeId ? (fuel.purchased_at ?? fuel.transaction_at) : null,
      // R-153.6/153.7: the card-rail account (Dreamline 2510 / Relay 1295 for USMCA), resolved
      // above through the SAME function the live poster uses -- never 1090, never a guess.
      paymentAccountId,
    ],
  );
  const expenseId = inserted.rows[0]!.id;

  // R-169 fix 2 — ALWAYS write line 1, adopted or fresh draft alike. Its absence is exactly what
  // broke the ledger rule "a GL-posted expense's lines must sum to its total" for every adopted
  // document (measured live: R-167 had to hand-add 6 lines this gap left behind). Dr the fuel
  // item's own account (resolved above, refuses rather than guessing); load_required mirrors
  // whether this purchase actually carries a load, same as every other expense_lines writer.
  await client.query(
    `
      INSERT INTO accounting.expense_lines (
        operating_company_id, expense_id, line_sequence, amount, amount_cents, description,
        load_id, load_required, expense_account_uuid, item_id, quantity, rate_cents, unit_of_measure
      )
      -- R-178: an item line must carry quantity/rate/uom with round(quantity*rate_cents)=amount_cents
      -- (expense_lines_item_qty_rate_amount_check). Without them every fuel expense create refused.
      VALUES ($1::uuid, $2::uuid, 1, $3, $4::bigint, $5, $6::uuid, $7, $8::uuid, $9::uuid, 1, $4::bigint, 'each')
    `,
    [
      input.operating_company_id,
      expenseId,
      amountCents / 100,
      amountCents,
      memo,
      fuel.load_id,
      Boolean(fuel.load_id),
      fuelItem.expenseAccountId,
      fuelItem.itemId,
    ],
  );

  // ROUND 192 — LINE 2, the card's own fee, on its own item/account. Same shape as line 1
  // (qty 1, rate_cents = amount_cents, 'each' -- the same expense_lines_item_qty_rate_amount_check
  // constraint applies to every item line, not just line 1). Only written when fee_amount > 0;
  // feeItem is resolved (or the whole document already refused) above.
  if (feeCents > 0 && feeItem) {
    const feeMemo = `Card fee — ${fuel.fuel_type ?? "Fuel"} purchase ${fuel.id}` + (fuel.transaction_reference ? `, ref ${fuel.transaction_reference}` : "");
    await client.query(
      `
        INSERT INTO accounting.expense_lines (
          operating_company_id, expense_id, line_sequence, amount, amount_cents, description,
          load_id, load_required, expense_account_uuid, item_id, quantity, rate_cents, unit_of_measure
        )
        VALUES ($1::uuid, $2::uuid, 2, $3, $4::bigint, $5, $6::uuid, $7, $8::uuid, $9::uuid, 1, $4::bigint, 'each')
      `,
      [
        input.operating_company_id,
        expenseId,
        feeCents / 100,
        feeCents,
        feeMemo,
        fuel.load_id,
        Boolean(fuel.load_id),
        feeItem.expenseAccountId,
        feeItem.itemId,
      ],
    );
  }

  // R-168 — a load-attributed expense also gets its expense_attribution.expense_load_links row —
  // the same thing expenses.routes.ts's own two load-attribution branches write, previously
  // missing entirely from this path (the LV-EXPENSE-NUMBER-NEVER-POPULATED class of gap).
  if (loadAttribution && fuel.load_id) {
    await client.query(
      `
        INSERT INTO expense_attribution.expense_load_links (
          operating_company_id, expense_id, expense_source, load_id, load_number, expense_seq,
          expense_number, attribution_method, attribution_confidence, attribution_reason,
          attributed_by_user_id
        )
        VALUES ($1::uuid, $2::uuid, 'accounting', $3::uuid, $4, $5, $6, 'auto_timestamp', 'high', $7, $8::uuid)
      `,
      [
        input.operating_company_id,
        expenseId,
        fuel.load_id,
        loadAttribution.loadNumber,
        loadAttribution.seq,
        expenseNumber,
        "card fuel purchase — load_id carried on fuel.fuel_transactions at ingestion",
        input.requesting_user_uuid ?? null,
      ],
    );
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
      amount_cents: totalAmountCents,
      fuel_amount_cents: amountCents,
      fee_amount_cents: feeCents,
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
    amount_cents: totalAmountCents,
    adopted_journal_entry_id: adoptedJeId,
  };
}
