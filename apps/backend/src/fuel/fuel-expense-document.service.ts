/**
 * FUEL GETS ITS DOCUMENT — closing the only posting in this system with nothing behind it.
 *
 * ROUND 290.1 CANONICAL RULE (2026-09-30) — WRITTEN DOWN SO NOBODY RE-LITIGATES IT:
 * A fuel purchase is ONE economic event. `fuel.fuel_transactions` is the CANONICAL,
 * operational source-of-truth record (gallons, card, IFTA, vendor) — it is what actually
 * happened at the pump. `accounting.expenses` is its ACCOUNTING PROJECTION — the document that
 * carries it into the GL. `source_fuel_transaction_id` is the join key and it is MANDATORY in
 * both directions: a live fuel_transaction with no live expense has no cost and is invisible to
 * the P&L; a live expense on account 5000 "Fuel & Diesel" with no source_fuel_transaction_id has
 * no gallons behind it and cannot be reconciled to a card statement. Every code path that
 * creates a fuel_transaction row MUST create its expense in the same operation (call
 * `createExpenseFromFuelTransaction` below, never skip it) — see
 * `scripts/verify-fuel-expense-bridge-is-whole.mjs` for the fail-closed guard on both
 * directions. The one documented exception is a settlement-corpus-derived 5000-account expense
 * (`source_settlement_ref` set) — a driver-settlement line item for DEF/reefer-diesel/etc. is a
 * real fuel-category cost with no corresponding fuel-card transaction to link to, because it was
 * never run through a fuel card; that is expected state, not a gap, and the guard excludes it by
 * name rather than treating it as unlinked.
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

import { relayFillUnitIdSql } from "./relay-fill-unit.sql.js";
import { appendCrudAudit } from "../audit/crud-audit.js";
import {
  CompanyDirectCredit,
  loadFuelTxnCreditSignals,
  RelayFillLinksNotPostsError,
  resolveCompanyDirectCreditPreference,
} from "../accounting/fuel-posting/fuel-credit-preference.js";
import { resolveCompanyDirectCreditAccount } from "../accounting/fuel-posting/company-direct-credit-account.js";
import { resolveLineItemAndAccount } from "../accounting/line-item-account.js";
import { resolveFuelItem, resolveItemByName } from "../accounting/fuel-posting/fuel-item-account.js";
import { EXPENSE_SQL_NOW, reserveExpenseNumber, writeExpenseDocumentInClientTx, type ExpenseRow } from "../accounting/expense-writer.service.js";
import { resolveLineLoadExemption } from "../accounting/expense-line-load-exemption.js";

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
  /** ROUND 363-CC2-D — the item / account picked on the wizard line; absent = the fuel-type item map. */
  item_id?: string | null;
  account_id?: string | null;
  /**
   * R13 — Settlement Creator passes the card rail it knows from the PDF (dreamline_card_payable |
   * relay_fuel_wallet). Forwarded to resolveCompanyDirectCreditPreference as an explicit override.
   */
  company_direct_credit?: CompanyDirectCredit | null;
  /**
   * R13 — when true, the relay_fuel_wallet throw in resolveCompanyDirectCreditPreference is
   * suppressed so Creator fuel posts immediately instead of deferring to a Banking match.
   */
  creator_manual_entry?: boolean;
  /**
   * RULING 443.66 D5 — the trailer the settlement document names (Settlement Creator). The header takes the fuel row's
   * trailer (reefer fuel) and else this one; every line carries the header's driver / unit / trailer.
   */
  trailer_id?: string | null;
};

// The fuel-type -> item -> account rule lives in accounting/fuel-posting/fuel-item-account.ts, shared with the fuel
// poster so a document and its ledger entry can never name different accounts (CC-2 2026-10-04).

// ROUND 192 (Lead, 2026-09-25) — Ruling R-30.1: fuel posts at NET, the card's own fee posts
// separately, Dr 5005 / Cr the card rail. The account is not hardcoded here — it lives on this
// catalog item, same as every fuel-type item above (the Lead points this item at 5005 in
// AUTH-042; this file only ever resolves by name and refuses if the item or its account is
// missing).
const FUEL_FEE_ITEM_NAME = "Fuel Card Fee";

/**
 * ROUND 363-CC2-D — the account a fuel line WILL post to, for a preview: the same rule createExpenseFromFuelTransaction
 * applies (the picked item / account, else the fuel-type item's account). One rule, so a preview cannot disagree with
 * the post (it used to show company_fuel_advance_expense / 5000 while the post used the item's account).
 */
export async function resolveFuelLineAccount(
  client: QueryableClient,
  operatingCompanyId: string,
  line: { fuel_type?: string | null; item_id?: string | null; account_id?: string | null },
): Promise<{ account_id: string; account_number: string | null; account_name: string | null } | { refused: string }> {
  const picked = await resolveLineItemAndAccount(client, operatingCompanyId, line);
  if (picked && "refused" in picked) return picked;
  if (picked) return { account_id: picked.account_id, account_number: picked.account_number, account_name: picked.account_name };
  const mapped = await resolveFuelItem(client, operatingCompanyId, line.fuel_type ?? "diesel");
  if ("refused" in mapped) return mapped;
  const a = await client.query<{ account_number: string | null; account_name: string | null }>(
    `SELECT account_number, account_name FROM catalogs.accounts WHERE id = $1::uuid`,
    [mapped.expenseAccountId],
  );
  return { account_id: mapped.expenseAccountId, account_number: a.rows[0]?.account_number ?? null, account_name: a.rows[0]?.account_name ?? mapped.itemName };
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
  | { outcome: "refused"; reason: string }
  /** ACCT-F403: a Relay-rail settlement fuel row gets no document — it links to its Relay fill, which carries the cost. */
  | { outcome: "relay_link"; reason: string };

type FuelRow = {
  id: string;
  operating_company_id: string;
  vendor_id: string | null;
  load_id: string | null;
  load_exemption_reason: string | null;
  driver_id: string | null;
  unit_id: string | null;
  trailer_id: string | null;
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
    `SELECT id::text, operating_company_id::text, vendor_id::text, load_id::text, load_exemption_reason,
            driver_id::text, unit_id::text, trailer_id::text, fuel_type, gallons::text, price_per_gallon::text,
            total_cost::text, transaction_at::text, purchased_at::text, transaction_reference,
            location_city, location_state, archived_at::text,
            gross_cost::text, discount_amount::text, fee_amount::text
       FROM fuel.fuel_transactions
      WHERE id = $1 AND operating_company_id = $2::uuid`,
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
      WHERE operating_company_id = $1::uuid AND source_fuel_transaction_id = $2 AND voided_at IS NULL
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
  // ROUND 363-CC2-D — an item / account the user picked on the line wins (resolveLineItemAndAccount, the one resolver
  // every wizard line and its preview use); with no pick, the fuel-type item map below stays the default.
  const picked = await resolveLineItemAndAccount(client, input.operating_company_id, { item_id: input.item_id, account_id: input.account_id });
  if (picked && "refused" in picked) {
    return { outcome: "refused", reason: `fuel transaction ${fuel.id}: ${picked.refused}` };
  }
  const mapped = picked?.item_id ? null : await resolveFuelItem(client, input.operating_company_id, fuel.fuel_type);
  if (mapped && "refused" in mapped) {
    return { outcome: "refused", reason: `fuel transaction ${fuel.id}: ${mapped.refused}` };
  }
  const fuelItem = {
    itemId: picked?.item_id ?? mapped!.itemId,
    expenseAccountId: picked?.account_id ?? mapped!.expenseAccountId,
  };

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
      WHERE l.operating_company_id = $1::uuid
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
  // 443.182 C — reserved through the one expense engine at the point this document always took its number.
  const number = await reserveExpenseNumber(client, input.operating_company_id, {
    loadId: fuel.load_id,
    referenceDate: new Date(`${txnDate}T00:00:00.000Z`),
  });
  const expenseNumber = number.number;

  // ---- 4b. R-153.6/153.7: RESOLVE THE CARD-RAIL PAYMENT ACCOUNT. -------------------------
  // Only needed for a fresh (non-adopted) draft -- an adopted document points at a JE that
  // already has its own credit leg, so its payment_account_uuid is descriptive metadata here,
  // not a posting input; still worth setting so the document is honest about the rail either way.
  const creditSignals = await loadFuelTxnCreditSignals(client as never, input.operating_company_id, fuel.id);
  let creditPreference: ReturnType<typeof resolveCompanyDirectCreditPreference>;
  try {
    creditPreference = resolveCompanyDirectCreditPreference(
    {
      operating_company_id: input.operating_company_id,
      fuel_transaction_id: fuel.id,
      fuel_type: fuel.fuel_type ?? "diesel",
      transaction_at: fuel.transaction_at ?? fuel.purchased_at ?? txnDate,
      amount_cents: amountCents,
      company_direct_credit: input.company_direct_credit ?? undefined,
      creator_manual_entry: input.creator_manual_entry ?? false,
    },
      creditSignals,
    );
  } catch (err) {
    if (err instanceof RelayFillLinksNotPostsError) return { outcome: "relay_link", reason: err.message };
    throw err;
  }
  const { account_id: paymentAccountId } = await resolveCompanyDirectCreditAccount(
    client as never,
    input.operating_company_id,
    creditPreference,
  );

  // RULING 443.66 D5 — the trailer on the document: the fuel row's (reefer fuel), else the one the settlement names.
  const headerTrailerId: string | null = fuel.trailer_id ?? input.trailer_id ?? null;

  // ---- 5. WRITE THE DOCUMENT. STATUS 'draft' ON PURPOSE. ---------------------------------
  // A backfilled document is not posted by the act of existing. The existing expense posting
  // path posts it, applies the category account, and writes the GL — unchanged, so no new
  // posting math enters the system and the reversal path it already has stays the only one.
  // 443.182 C — persisted through the one expense writer (accounting/expense-writer.service.ts insertExpenseHeader).
  // 443.182 C — written, linked and audited by the one expense engine (accounting/expense-writer.service.ts).

  const fuelLineLoadExemption = (accountLabel: string) =>
    resolveLineLoadExemption({
      loadId: fuel.load_id,
      reason: fuel.load_exemption_reason,
      accountLabel,
      context: `fuel purchase ${fuel.id} — no load matched`,
    });

  // R-169 fix 2 — ALWAYS write line 1, adopted or fresh draft alike. Its absence is exactly what
  // broke the ledger rule "a GL-posted expense's lines must sum to its total" for every adopted
  // document (measured live: R-167 had to hand-add 6 lines this gap left behind). Dr the fuel
  // item's own account (resolved above, refuses rather than guessing); load_required mirrors
  // whether this purchase actually carries a load, same as every other expense_lines writer.
  // R-178: an item line must carry quantity/rate/uom with round(quantity*rate_cents)=amount_cents
  // (expense_lines_item_qty_rate_amount_check). Without them every fuel expense create refused.
  // RULING 443.66 D5: the line carries the header's driver / unit / trailer (806 fuel lines had none).
  // 443.105 #2: a line with no load carries the fuel transaction's own exemption reason, or says no load matched.
  const fuelLines: ExpenseRow[] = [];
  fuelLines.push({
    operating_company_id: input.operating_company_id,
    line_sequence: 1,
    amount: amountCents / 100,
    amount_cents: amountCents,
    description: memo,
    load_id: fuel.load_id,
    load_required: Boolean(fuel.load_id),
    expense_account_uuid: fuelItem.expenseAccountId,
    item_id: fuelItem.itemId,
    quantity: 1,
    rate_cents: amountCents,
    unit_of_measure: "each",
    driver_id: fuel.driver_id,
    unit_id: fuel.unit_id,
    trailer_id: headerTrailerId,
    load_exemption_reason: fuelLineLoadExemption("Fuel"),
  });

  // ROUND 192 — LINE 2, the card's own fee, on its own item/account. Same shape as line 1
  // (qty 1, rate_cents = amount_cents, 'each' -- the same expense_lines_item_qty_rate_amount_check
  // constraint applies to every item line, not just line 1). Only written when fee_amount > 0;
  // feeItem is resolved (or the whole document already refused) above.
  if (feeCents > 0 && feeItem) {
    const feeMemo = `Card fee — ${fuel.fuel_type ?? "Fuel"} purchase ${fuel.id}` + (fuel.transaction_reference ? `, ref ${fuel.transaction_reference}` : "");
    fuelLines.push({
      operating_company_id: input.operating_company_id,
      line_sequence: 2,
      amount: feeCents / 100,
      amount_cents: feeCents,
      description: feeMemo,
      load_id: fuel.load_id,
      load_required: Boolean(fuel.load_id),
      expense_account_uuid: feeItem.expenseAccountId,
      item_id: feeItem.itemId,
      quantity: 1,
      rate_cents: feeCents,
      unit_of_measure: "each",
      driver_id: fuel.driver_id,
      unit_id: fuel.unit_id,
      trailer_id: headerTrailerId,
      load_exemption_reason: fuelLineLoadExemption("Fuel card fee"),
    });
  }

  // R-168 — a load-attributed expense also gets its expense_attribution.expense_load_links row —
  // the same thing expenses.routes.ts's own two load-attribution branches write, previously
  // missing entirely from this path (the LV-EXPENSE-NUMBER-NEVER-POPULATED class of gap).
  const written = await writeExpenseDocumentInClientTx(client, {
    header: {
      operating_company_id: input.operating_company_id,
      vendor_uuid: fuel.vendor_id,
      // A document that adopts a posting is posted. One that does not is a draft.
      status: adoptedJeId ? "posted" : "draft",
      transaction_date: txnDate,
      // total_amount_cents is the REAL column and it is bigint NOT NULL. There is no
      // `total_amount` numeric column on accounting.expenses -- verified live. Cents is the
      // spine; nothing here divides by 100 and hands a float to the ledger.
      // ROUND 192: the document's total is net + fee (both lines), never just the fuel line --
      // "lines must sum to total" applies here exactly like every other multi-line expense.
      total_amount_cents: totalAmountCents,
      memo,
      source_fuel_transaction_id: fuel.id,
      load_id: fuel.load_id,
      is_sample_data: false,
      journal_entry_id: adoptedJeId,
      posted_at: adoptedJeId ? (fuel.purchased_at ?? fuel.transaction_at) : null,
      // R-153.6/153.7: the card-rail account (Dreamline 2510 / Relay 1295 for USMCA), resolved
      // above through the SAME function the live poster uses -- never 1090, never a guess.
      payment_account_uuid: paymentAccountId,
      // ROUND 291 fix: the fuel transaction already carries this attribution (set at ingestion,
      // same source verify-fuel-cost-posts-exactly-once.mjs's FULL_LOAD_LINKAGE check reads) --
      // it was being fetched into `fuel` above and used only in the audit-log payload below,
      // never written onto the document it actually attributes. That silently produced 35 new
      // linkage-incomplete expenses (ratchet baseline 7) from every backfill call this session.
      driver_uuid: fuel.driver_id,
      unit_id: fuel.unit_id,
      trailer_id: headerTrailerId,
      // A document that carries a journal entry is posted in the GL, so it says so: the void
      // route reverses only posting_status='posted' rows, and 'unposted' with a live JE left 5
      // fuel documents (94 expenses in all) voidable with their entry still on the books.
      // accounting.expenses CHECK expenses_journal_entry_implies_not_unposted (202615140700).
      posting_status: adoptedJeId ? "posted" : "unposted",
    },
    number,
    lines: fuelLines,
    loadLink: fuel.load_id
      ? {
          method: "auto_timestamp",
          confidence: "high",
          reason: "card fuel purchase — load_id carried on fuel.fuel_transactions at ingestion",
          userId: input.requesting_user_uuid ?? null,
        }
      : undefined,
    audits: (expenseId) => [
      {
        actorUserId: input.requesting_user_uuid ?? FUEL_EXPENSE_SYSTEM_ACTOR,
        action: "accounting.expense.created_from_fuel_transaction",
        payload: {
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
        severity: "info",
        tag: "FUEL-EXPENSE-DOC-01",
      },
    ],
  });
  if (!written) throw new Error("fuel_expense_insert_failed");
  const expenseId = written.expenseId;

  return {
    outcome: "created",
    expense_id: expenseId,
    expense_number: expenseNumber,
    amount_cents: totalAmountCents,
    adopted_journal_entry_id: adoptedJeId,
  };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Lead ruling 443.41 A (2026-10-11): a RELAY FILL gets its accounting.expenses DOCUMENT — fuel line(s) + the "Fuel Card
// Fee" line, vendor Relay, paid from the Relay Fuel Wallet — linked to the SAME journal entry the fill already posted.
// One JE, never two: nothing posts here. The owner's change-vendor / Dreamline<->Relay route
// (POST /expenses/:id/change-payment-source) and the audit read expenses; a fill with no document can be neither.
// The document's lines are the entry's own debit legs (account + amount), so the document and its posting can never
// disagree; the payment account is the entry's own credit leg (1295).
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export type RelayFillDocumentOutcome =
  | { outcome: "created"; expense_id: string; expense_number: string; journal_entry_id: string; amount_cents: number }
  | { outcome: "already_exists"; expense_id: string; journal_entry_id: string }
  | { outcome: "refused"; reason: string };

/** Fuel types whose catalog item may name a Relay fill's product account (the poster's kinds). */
const RELAY_FILL_FUEL_TYPES = ["diesel", "def", "reefer_diesel"] as const;

/**
 * Lead 443.51 #5: a Relay-fill expense document names the settlement that posted the fill — settlement_no (the Creator's
 * convention, stampCreatorExpenseSettlementNo) and source_settlement_ref (the parsed settlement number,
 * expense-parse-backfill.service.ts). Fill-once: a column already carrying a reference is never overwritten. Audited.
 * LEAD 443.203 (19:52Z, 5845): restamp_stale — ONLY the settlement that carries this document (the Creator, for a fill it
 * prints) may pass it: a reference naming no live settlement that holds the document's load (the fill's earlier settlement,
 * or a cancelled one: 7 Relay documents on 5845's loads still said cancelled P-0072) is restamped, the old one audited.
 * Never inferred from who holds the load — an unprinted fill on a held load is not that settlement's (Lead ruling 443.203 #3).
 */
export async function fillRelayFillExpenseSettlementRef(
  client: QueryableClient,
  input: { operating_company_id: string; expense_id: string; settlement_no: string; actor_user_uuid?: string | null; restamp_stale?: boolean },
): Promise<boolean> {
  const no = String(input.settlement_no ?? "").trim();
  if (!no) return false;
  const cur = (await client.query<{ settlement_no: string | null; source_settlement_ref: string | null; load_id: string | null }>(
    `SELECT settlement_no, source_settlement_ref, load_id::text FROM accounting.expenses
      WHERE operating_company_id = $1::uuid AND id = $2::uuid AND voided_at IS NULL FOR UPDATE`,
    [input.operating_company_id, input.expense_id],
  )).rows[0];
  if (!cur?.load_id) return false;
  const stale = async (ref: string | null) =>
    input.restamp_stale === true && ref !== null && ref.trim() !== no && !(await settlementRefHoldsLoad(client, input.operating_company_id, ref.trim(), cur.load_id!));
  const restampNo = await stale(cur.settlement_no);
  const restampRef = await stale(cur.source_settlement_ref);
  const r = await client.query<{ id: string }>(
    `UPDATE accounting.expenses
        SET settlement_no = CASE WHEN $4::boolean THEN $3 ELSE coalesce(settlement_no, $3) END,
            source_settlement_ref = CASE WHEN $5::boolean THEN $3 ELSE coalesce(source_settlement_ref, $3) END, updated_at = now()
      WHERE operating_company_id = $1::uuid AND id = $2::uuid AND voided_at IS NULL
        AND (settlement_no IS NULL OR source_settlement_ref IS NULL OR $4::boolean OR $5::boolean)
        -- owner law 443.52 B: an expense that carries a settlement number must carry its load.
        AND load_id IS NOT NULL
      RETURNING id::text`,
    [input.operating_company_id, input.expense_id, no, restampNo, restampRef],
  );
  if (r.rows[0] && input.actor_user_uuid) {
    const restamped = restampNo || restampRef;
    await appendCrudAudit(
      client as never,
      input.actor_user_uuid,
      restamped ? "accounting.expense.relay_fill_settlement_ref_restamped" : "accounting.expense.relay_fill_settlement_ref_filled",
      {
        resource_type: "accounting.expenses",
        resource_id: input.expense_id,
        operating_company_id: input.operating_company_id,
        settlement_no: no,
        ...(restamped ? { old_settlement_no: cur.settlement_no, old_source_settlement_ref: cur.source_settlement_ref, reason: "stale_reference_no_live_holder" } : {}),
      },
      "info",
      restamped ? "443.203" : "443.51",
    );
  }
  return Boolean(r.rows[0]);
}

/** A live settlement by this reference (source_document_ref ?? display_id) holds the load — same predicate as stampReceiptDocumentSettlementRef. */
async function settlementRefHoldsLoad(client: QueryableClient, operatingCompanyId: string, ref: string, loadId: string): Promise<boolean> {
  const r = await client.query<{ held: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM driver_finance.driver_settlements s
        WHERE s.operating_company_id = $1::uuid AND s.voided_at IS NULL AND s.status <> 'cancelled'
          AND (COALESCE(NULLIF(btrim(s.source_document_ref), ''), s.display_id) = $2)
          AND (s.id IN (SELECT g.settlement_id FROM driver_finance.driver_settlement_gl_bills g
                          JOIN mdata.loads l ON l.load_number = g.load_number AND l.operating_company_id = g.operating_company_id
                         WHERE l.id = $3::uuid)
               OR s.id IN (SELECT sl.settlement_id FROM driver_finance.settlement_lines sl WHERE sl.load_id = $3::uuid))
     ) AS held`,
    [operatingCompanyId, ref, loadId],
  );
  return Boolean(r.rows[0]?.held);
}

/**
 * LEAD 443.121 #3 — a fuel receipt document that lands on a load already held by ONE live settlement names that settlement,
 * written by the engine (never a second document, never a manual fix). Same settlement predicate as
 * verify-relay-fill-expense-settlement-ref (driver_settlement_gl_bills by load number, or settlement_lines by load); same
 * reference the Creator passes (source_document_ref ?? display_id); fill-once through fillRelayFillExpenseSettlementRef.
 * Zero or several holding settlements -> nothing is stamped (the Creator adopt names it when the settlement posts).
 * LEAD 443.203 (20:22Z, ruling #3): holding the load is not enough — the settlement must have PRINTED this fill: its own
 * posted audit (driver_finance.settlement_creator.posted) names the document (expense_ids) or one of the fill's fuel rows
 * (fuel_transaction_ids: the document's source row, or a row of the fill its posting is sourced on). An unprinted fill on a
 * held load (5846's T170 fills) stays unnamed.
 */
export async function stampReceiptDocumentSettlementRef(
  client: QueryableClient,
  input: { operating_company_id: string; expense_id: string; actor_user_uuid?: string | null },
): Promise<string | null> {
  const r = await client.query<{ ref: string | null; n: number }>(
    `WITH doc AS (
       SELECT e.id, e.load_id, e.operating_company_id, e.journal_entry_id, e.source_fuel_transaction_id FROM accounting.expenses e
        WHERE e.id = $1::uuid AND e.operating_company_id = $2::uuid AND e.voided_at IS NULL AND e.load_id IS NOT NULL
          AND (e.settlement_no IS NULL OR e.source_settlement_ref IS NULL)
     ), fill_src AS (
       SELECT p.source_transaction_id::text AS src FROM accounting.journal_entry_postings p, doc
        WHERE p.journal_entry_uuid = doc.journal_entry_id AND p.source_transaction_type = 'fuel_event'
     ), fill_rows AS (
       SELECT ft.id::text AS id FROM fuel.fuel_transactions ft, doc
        WHERE ft.operating_company_id = doc.operating_company_id AND ft.voided_at IS NULL
          AND (ft.id = doc.source_fuel_transaction_id OR ft.id::text IN (SELECT src FROM fill_src)
               OR ft.relay_fuel_transaction_id::text IN (SELECT src FROM fill_src))
     ), holders AS (
       SELECT DISTINCT s.id, COALESCE(NULLIF(btrim(s.source_document_ref), ''), s.display_id) AS ref
         FROM doc
         JOIN driver_finance.driver_settlements s ON s.operating_company_id = doc.operating_company_id
        WHERE s.voided_at IS NULL AND s.status <> 'cancelled'
          AND (s.id IN (SELECT g.settlement_id FROM driver_finance.driver_settlement_gl_bills g
                          JOIN mdata.loads l ON l.load_number = g.load_number AND l.operating_company_id = g.operating_company_id
                         WHERE l.id = doc.load_id)
               OR s.id IN (SELECT sl.settlement_id FROM driver_finance.settlement_lines sl WHERE sl.load_id = doc.load_id))
          -- 443.203 ruling #3: the holder printed this fill (its own posted audit names the document or a fuel row of the fill).
          AND EXISTS (SELECT 1 FROM audit.audit_events a
                       WHERE a.event_class = 'driver_finance.settlement_creator.posted' AND a.payload->>'resource_id' = s.id::text
                         AND (a.payload->'expense_ids' ? doc.id::text
                              OR a.payload->'fuel_transaction_ids' ?| ARRAY(SELECT id FROM fill_rows)))
     )
     SELECT min(ref) AS ref, count(*)::int AS n FROM holders`,
    [input.expense_id, input.operating_company_id],
  );
  const row = r.rows[0];
  if (!row || row.n !== 1 || !row.ref) return null;
  await fillRelayFillExpenseSettlementRef(client, { operating_company_id: input.operating_company_id, expense_id: input.expense_id, settlement_no: row.ref, actor_user_uuid: input.actor_user_uuid ?? null });
  return row.ref;
}

/**
 * LEAD 22:25Z #1 (owner: "why are they stamped by the wrong settlement ... fix that engine and rule ... never happen again")
 * — THE backfill for Relay-fill documents that name no settlement. Root cause of the 23 wrong receipts: the 443.51 backfill
 * (2026-10-11 AUTH-425) named "the settlement holding the load", printed or not. Every backfill now goes through
 * stampReceiptDocumentSettlementRef — a settlement is named only when its own posted audit printed the fill — so a re-run
 * stamps zero unprinted documents. Returns what it stamped and what it left unnamed (never guessed).
 */
export async function backfillRelayFillSettlementRefs(
  client: QueryableClient,
  input: { operating_company_id: string; actor_user_uuid: string },
): Promise<{ stamped: Array<{ expense_id: string; settlement_no: string }>; unnamed: string[] }> {
  const docs = (await client.query<{ id: string }>(
    `SELECT e.id::text FROM accounting.expenses e JOIN mdata.vendors v ON v.id = e.vendor_uuid
      WHERE e.operating_company_id = $1::uuid AND e.voided_at IS NULL AND v.vendor_name ~* '^relay( |$)'
        AND (e.settlement_no IS NULL OR e.source_settlement_ref IS NULL)
        AND EXISTS (SELECT 1 FROM accounting.journal_entry_postings p WHERE p.journal_entry_uuid = e.journal_entry_id AND p.source_transaction_type = 'fuel_event')
      ORDER BY e.id`,
    [input.operating_company_id],
  )).rows;
  const stamped: Array<{ expense_id: string; settlement_no: string }> = [];
  const unnamed: string[] = [];
  for (const d of docs) {
    const ref = await stampReceiptDocumentSettlementRef(client, { operating_company_id: input.operating_company_id, expense_id: d.id, actor_user_uuid: input.actor_user_uuid });
    if (ref) stamped.push({ expense_id: d.id, settlement_no: ref });
    else unnamed.push(d.id);
  }
  return { stamped, unnamed };
}

export async function adoptRelayFillExpenseDocument(
  client: QueryableClient,
  input: { operating_company_id: string; relay_fill_id: string; journal_entry_id: string; requesting_user_uuid?: string | null; settlement_no?: string | null; trailer_id?: string | null; load_exemption_reason?: string | null; driver_id?: string | null },
): Promise<RelayFillDocumentOutcome> {
  const company = input.operating_company_id;
  const existing = await client.query<{ id: string }>(
    `SELECT id::text FROM accounting.expenses
      WHERE operating_company_id = $1::uuid AND journal_entry_id = $2::uuid AND voided_at IS NULL LIMIT 1`,
    [company, input.journal_entry_id],
  );
  if (existing.rows[0]) {
    if (input.settlement_no) {
      await fillRelayFillExpenseSettlementRef(client, { operating_company_id: company, expense_id: existing.rows[0].id, settlement_no: input.settlement_no, actor_user_uuid: input.requesting_user_uuid ?? null });
    } else {
      await stampReceiptDocumentSettlementRef(client, { operating_company_id: company, expense_id: existing.rows[0].id, actor_user_uuid: input.requesting_user_uuid ?? null });
    }
    return { outcome: "already_exists", expense_id: existing.rows[0].id, journal_entry_id: input.journal_entry_id };
  }

  // The entry must be this fill's live posting.
  const legs = await client.query<{ account_id: string; debit_or_credit: string; amount_cents: string; load_id: string | null; entry_date: string }>(
    `SELECT p.account_id::text, p.debit_or_credit, p.amount_cents::text, p.load_id::text, je.entry_date::text
       FROM accounting.journal_entry_postings p
       JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid
      WHERE p.journal_entry_uuid = $1::uuid AND p.operating_company_id = $2::uuid
        AND p.source_transaction_type = 'fuel_event' AND p.source_transaction_id::text = $3
        AND je.status = 'posted' AND je.voided_at IS NULL AND je.reversed_by_je_id IS NULL AND je.reverses_je_id IS NULL
      ORDER BY p.line_sequence`,
    [input.journal_entry_id, company, input.relay_fill_id],
  );
  const debits = legs.rows.filter((l) => l.debit_or_credit === "debit");
  const credits = legs.rows.filter((l) => l.debit_or_credit === "credit");
  if (!debits.length || credits.length !== 1) {
    return { outcome: "refused", reason: `journal entry ${input.journal_entry_id} is not one live Relay-fill posting of fill ${input.relay_fill_id} (debits ${debits.length}, credits ${credits.length})` };
  }
  const totalCents = debits.reduce((t, l) => t + Math.round(Number(l.amount_cents)), 0);
  if (totalCents !== Math.round(Number(credits[0]!.amount_cents))) {
    return { outcome: "refused", reason: `journal entry ${input.journal_entry_id} does not foot (debits ${totalCents} != credit ${credits[0]!.amount_cents})` };
  }

  const relay = await client.query<{ id: string }>(
    `SELECT id::text FROM mdata.vendors
      WHERE operating_company_id = $1::uuid AND deactivated_at IS NULL AND vendor_name ~* '^relay( |$)' LIMIT 2`,
    [company],
  );
  if (relay.rows.length !== 1) return { outcome: "refused", reason: `expected exactly one active Relay vendor, found ${relay.rows.length}` };

  // The fill's own purchase record(s): the attribution (load / driver / unit) and the fuel-transaction pointer.
  const fills = await client.query<{ id: string; load_id: string | null; load_exemption_reason: string | null; driver_id: string | null; unit_id: string | null; trailer_id: string | null; total_cost: string | null; txn_date: string | null; taken: boolean }>(
    `SELECT ft.id::text, ft.load_id::text, ft.load_exemption_reason, ft.driver_id::text, ft.unit_id::text, ft.trailer_id::text, ft.total_cost::text,
            coalesce(ft.purchased_at, ft.transaction_at)::date::text AS txn_date,
            EXISTS (SELECT 1 FROM accounting.expenses e WHERE e.source_fuel_transaction_id = ft.id AND e.voided_at IS NULL) AS taken
       FROM fuel.fuel_transactions ft
      WHERE ft.operating_company_id = $1::uuid AND ft.relay_fuel_transaction_id::text = $2 AND ft.archived_at IS NULL
      ORDER BY ft.total_cost DESC NULLS LAST, ft.id`,
    [company, input.relay_fill_id],
  );
  // 443.192 — the unit by the poster's one rule (fuel/relay-fill-unit.sql.ts): matched_unit_id, else the printed number
  // when exactly one active unit carries it. Reading matched_unit_id alone left the document unit-less where the JE had one.
  const relayRow = await client.query<{ matched_driver_id: string | null; matched_unit_id: string | null }>(
    `SELECT r.matched_driver_id::text, ${relayFillUnitIdSql("r")}::text AS matched_unit_id FROM integrations.relay_fuel_transactions r
      WHERE r.id::text = $1 AND r.operating_company_id = $2::uuid`,
    [input.relay_fill_id, company],
  );
  const primary = fills.rows.find((f) => !f.taken) ?? null;
  const loadId = primary?.load_id ?? fills.rows[0]?.load_id ?? debits.find((d) => d.load_id)?.load_id ?? null;
  // 443.116 #1 — a fill received before any settlement row names its driver takes the driver of the load it was bought for.
  const loadDriver = !primary?.driver_id && !fills.rows[0]?.driver_id && !relayRow.rows[0]?.matched_driver_id && loadId
    ? (await client.query<{ d: string | null }>(
        `SELECT assigned_primary_driver_id::text AS d FROM mdata.loads WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
        [loadId, company],
      )).rows[0]?.d ?? null
    : null;
  // LEAD 443.126 2a — the poster's one fill-driver rule (card / truck assignment at fill time) when the purchase record and
  // Relay named nobody: a no-load fill still carries who fueled.
  const driverId = primary?.driver_id ?? fills.rows[0]?.driver_id ?? relayRow.rows[0]?.matched_driver_id ?? input.driver_id ?? loadDriver;
  const unitId = primary?.unit_id ?? fills.rows[0]?.unit_id ?? relayRow.rows[0]?.matched_unit_id ?? null;
  const txnDate = primary?.txn_date ?? fills.rows[0]?.txn_date ?? legs.rows[0]!.entry_date;

  // Line items: the fee leg is the "Fuel Card Fee" item; a fuel leg is the fuel-type item whose account it is.
  const fee = await resolveFeeItem(client, company);
  const itemByAccount = new Map<string, string>();
  if (!("refused" in fee)) itemByAccount.set(fee.expenseAccountId, fee.itemId);
  for (const t of RELAY_FILL_FUEL_TYPES) {
    const r = await resolveFuelItem(client as never, company, t);
    if (r && !("refused" in r) && !itemByAccount.has(r.expenseAccountId)) itemByAccount.set(r.expenseAccountId, r.itemId);
  }

  // 443.182 C — numbered, written, linked and audited by the one expense engine (accounting/expense-writer.service.ts).
  const number = await reserveExpenseNumber(client, company, { loadId, referenceDate: new Date(`${txnDate}T00:00:00.000Z`) });
  const expenseNumber = number.number;
  const memo = `Relay fuel fill ${input.relay_fill_id} — document for journal entry ${input.journal_entry_id} (Lead 443.41 A: one JE, the document adopts it)`;
  const written = await writeExpenseDocumentInClientTx(client, {
    // The adopting document is born posted on the Relay fill's JE — nothing posts here.
    header: {
      operating_company_id: company,
      vendor_uuid: relay.rows[0]!.id,
      status: "posted",
      transaction_date: txnDate,
      total_amount_cents: totalCents,
      memo,
      source_fuel_transaction_id: primary?.id ?? null,
      load_id: loadId,
      is_sample_data: false,
      journal_entry_id: input.journal_entry_id,
      posted_at: EXPENSE_SQL_NOW,
      payment_account_uuid: credits[0]!.account_id,
      driver_uuid: driverId,
      unit_id: unitId,
      trailer_id: primary?.trailer_id ?? input.trailer_id ?? null,
      posting_status: "posted",
    },
    number,
    afterHeader: async (expenseId) => {
      if (input.settlement_no) {
        await fillRelayFillExpenseSettlementRef(client, { operating_company_id: company, expense_id: expenseId, settlement_no: input.settlement_no, actor_user_uuid: input.requesting_user_uuid ?? null });
      }
    },
    // RULING 443.66 D5 — each line carries the header's driver / unit / trailer.
    // 443.105 #2 — a line with no load carries the fill's own exemption reason, or says no load matched.
    // An item line carries qty 1 x amount 'each'; a line with no item carries none of the three.
    lines: debits.map((d, i) => {
      const seq = i + 1;
      const cents = Math.round(Number(d.amount_cents));
      const itemId = itemByAccount.get(d.account_id) ?? null;
      return {
        operating_company_id: company,
        line_sequence: seq,
        amount: cents / 100,
        amount_cents: cents,
        description: `Relay fuel fill — line ${seq}`,
        load_id: d.load_id ?? loadId,
        load_required: Boolean(d.load_id ?? loadId),
        expense_account_uuid: d.account_id,
        item_id: itemId,
        quantity: itemId == null ? null : 1,
        rate_cents: itemId == null ? null : cents,
        unit_of_measure: itemId == null ? null : "each",
        driver_id: driverId,
        unit_id: unitId,
        trailer_id: primary?.trailer_id ?? input.trailer_id ?? null,
        load_exemption_reason: resolveLineLoadExemption({
          loadId: d.load_id ?? loadId,
          reason: primary?.load_exemption_reason ?? fills.rows[0]?.load_exemption_reason ?? input.load_exemption_reason ?? null,
          accountLabel: "Relay fuel",
          context: `Relay fill ${input.relay_fill_id} — no load matched`,
        }),
      };
    }),
    loadLink: loadId
      ? { method: "auto_timestamp", confidence: "high", reason: "Relay fill — load carried on its posting", userId: input.requesting_user_uuid ?? null }
      : undefined,
    afterLines: async (expenseId) => {
      if (!input.settlement_no) {
        await stampReceiptDocumentSettlementRef(client, { operating_company_id: company, expense_id: expenseId, actor_user_uuid: input.requesting_user_uuid ?? null });
      }
    },
    audits: (expenseId) => [
      {
        actorUserId: input.requesting_user_uuid ?? FUEL_EXPENSE_SYSTEM_ACTOR,
        action: "accounting.expense.created_for_relay_fill",
        payload: {
          expense_id: expenseId, expense_number: expenseNumber, operating_company_id: company, relay_fill_id: input.relay_fill_id,
          journal_entry_id: input.journal_entry_id, fuel_transaction_id: primary?.id ?? null, vendor_id: relay.rows[0]!.id,
          amount_cents: totalCents, lines: debits.length,
        },
        severity: "info",
        tag: "LEAD-443.41-A",
      },
    ],
  });
  if (!written) throw new Error("relay_fill_expense_insert_failed");
  const expenseId = written.expenseId;
  return { outcome: "created", expense_id: expenseId, expense_number: expenseNumber, journal_entry_id: input.journal_entry_id, amount_cents: totalCents };
}
