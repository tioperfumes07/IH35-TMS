/**
 * HISTORICAL DRIVER BILL BACKFILL — the writer the settlement re-feed has been missing.
 *
 * WHY THIS EXISTS, AND WHY IT IS NOT THE LIVE PATH.
 *
 * `loads` and `invoices` already have a `historical_backfill` create path. Driver finance has
 * none — CC-3 found that honestly while building `createHistoricalEscrowHold()`, and named it
 * rather than stretching a live-flow function to cover it. His escrow writer declares
 * `STEPS["escrow"].needs = ["driver_bill"]`, so without this function the escrow half cannot
 * run either, and the whole day-by-day re-feed stops at step one.
 *
 * The live writer — `book-load.service.ts::createDriverBillArtifacts` — COMPUTES pay from
 * `driver_finance.driver_pay_rates` at booking time. That is correct for a load being booked
 * today and WRONG for a settlement that was signed weeks ago: the rate may have changed, the
 * document may carry a negotiated one-off, and the driver was paid what the paper says he was
 * paid. Re-deriving it would silently disagree with a signed document, which is the one thing a
 * re-feed must never do.
 *
 * So this function does the opposite of the live one: **it never computes pay. It records what
 * the settlement document already states.** If the caller cannot supply the amount from the
 * document, the bill is not written and the reason is returned — it is never defaulted to zero
 * and never priced from a rate table.
 *
 * WHAT IT GUARANTEES
 *   1. Idempotent by natural key (operating_company_id, load_id, driver_id). Re-running a feed
 *      day does not create a second bill. This is what makes "one day, one proof, one gate"
 *      re-runnable after a void.
 *   2. It writes no GL. A driver bill is a document; posting is the settlement engine's job and
 *      is not duplicated here. If no posting path exists for a case, that is reported upstream,
 *      not invented here.
 *   3. It refuses to touch a load that already carries a settled or voided bill. A historical
 *      backfill may fill a gap; it may not overwrite history.
 *   4. `is_sample_data` is never set. Every USMCA row this writes is REAL.
 *
 * SCOPE, stated plainly: this writes the driver bill HEADER — the document and its loaded /
 * deadhead split as printed. The per-item settlement lines are the settlement engine's, written
 * against `driver_finance.settlement_lines` with the item columns migration 202614271200 added.
 * This function deliberately does not write them, because two writers for one line is the
 * split-brain defect this codebase has already paid for more than once.
 */

import { appendCrudAudit } from "../audit/crud-audit.js";
import { driverBillNumberFromLoadNumber } from "./driver-bill-number.js";

/**
 * The system actor every historical-backfill audit row is attributed to when no interactive user
 * is present. It is a real, seeded identity.users row — not a placeholder and not a null — so the
 * audit trail always names who wrote the document. Callers running under a real user pass theirs.
 */
export const HISTORICAL_BACKFILL_SYSTEM_ACTOR = "system:settlement-refeed";

export type QueryableClient = {
  query: <T = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ) => Promise<{ rows: T[]; rowCount?: number | null }>;
};

export type HistoricalDriverBillInput = {
  operating_company_id: string;
  load_id: string;
  load_number: string;
  driver_id: string;
  team_driver_id?: string | null;

  /**
   * The gross the SIGNED SETTLEMENT DOCUMENT states, in cents, positive. Not derived, not
   * defaulted. A caller that does not have it must not call this function.
   */
  gross_amount_cents: number;

  /**
   * The loaded / deadhead split as printed, when the document prints it. Both or neither —
   * a half-known split is worse than none, because it renders as two lines that do not add up.
   */
  loaded_pay_cents?: number | null;
  deadhead_pay_cents?: number | null;

  /** Miles as printed. `rate_per_mile_cents` is DERIVED for display only (amount / miles) and is
   *  never used to reconstruct the amount — see the line-haul law: a contracted total does not
   *  decompose into qty x rate. */
  miles_basis?: number | null;
  miles_basis_type?: "short" | "practical" | null;
  rate_per_mile_cents?: number | null;
  miles_deadhead?: number | null;
  rate_empty_per_mile_cents?: number | null;

  /** The source document this row is being rebuilt from — an AlwaysTrack settlement number. */
  source_document_ref: string;

  requesting_user_uuid?: string | null;
};

export type HistoricalDriverBillOutcome =
  | { outcome: "created"; driver_bill_id: string; bill_number: string }
  | { outcome: "already_exists"; driver_bill_id: string; bill_number: string }
  | { outcome: "refused"; reason: string };

/**
 * Create the driver bill a historical settlement states, or explain why it was not created.
 * Never throws for a business reason — a refusal is a returned value the feeder can log and
 * gate on. It throws only for a genuine database fault, which is not something to swallow.
 */
export async function createHistoricalDriverBill(
  client: QueryableClient,
  input: HistoricalDriverBillInput,
): Promise<HistoricalDriverBillOutcome> {
  // ---- 1. REFUSE RATHER THAN GUESS ------------------------------------------------------
  if (!Number.isInteger(input.gross_amount_cents) || input.gross_amount_cents <= 0) {
    return {
      outcome: "refused",
      reason:
        `gross_amount_cents must be a positive integer taken from the settlement document; ` +
        `got ${String(input.gross_amount_cents)}. A historical driver bill is never priced from ` +
        `a rate table and never defaults to zero.`,
    };
  }

  const hasLoaded = input.loaded_pay_cents !== null && input.loaded_pay_cents !== undefined;
  const hasDeadhead = input.deadhead_pay_cents !== null && input.deadhead_pay_cents !== undefined;
  if (hasLoaded !== hasDeadhead) {
    return {
      outcome: "refused",
      reason:
        "loaded_pay_cents and deadhead_pay_cents must be supplied together or not at all — a " +
        "half-known split renders as two settlement lines that do not add up to the gross.",
    };
  }
  if (hasLoaded && (input.loaded_pay_cents as number) + (input.deadhead_pay_cents as number) !== input.gross_amount_cents) {
    return {
      outcome: "refused",
      reason:
        `loaded ${input.loaded_pay_cents} + deadhead ${input.deadhead_pay_cents} does not equal ` +
        `gross ${input.gross_amount_cents}. The document's own arithmetic must hold before it is ` +
        `written, not after.`,
    };
  }

  // ---- 2. IDEMPOTENCY, AND NEVER OVERWRITE HISTORY ---------------------------------------
  const existing = await client.query<{
    id: string;
    bill_number: string;
    status: string;
    voided_at: string | null;
    settled_in_settlement_id: string | null;
    gross_amount_cents: number;
  }>(
    `SELECT id::text, bill_number, status, voided_at::text, settled_in_settlement_id::text,
            gross_amount_cents
       FROM driver_finance.driver_bills
      WHERE operating_company_id = $1 AND load_id = $2 AND driver_id = $3
      ORDER BY created_at
      LIMIT 1`,
    [input.operating_company_id, input.load_id, input.driver_id],
  );

  const prior = existing.rows[0];
  if (prior) {
    if (prior.voided_at) {
      return {
        outcome: "refused",
        reason:
          `load ${input.load_number} already carries a VOIDED driver bill (${prior.bill_number}). ` +
          `A backfill fills a gap; it does not resurrect a voided document. Re-mint it through ` +
          `the void/replace path so the reversal chain stays intact.`,
      };
    }
    if (prior.settled_in_settlement_id) {
      return {
        outcome: "refused",
        reason:
          `load ${input.load_number} already carries a driver bill (${prior.bill_number}) settled ` +
          `in settlement ${prior.settled_in_settlement_id}. A backfill never overwrites a settled ` +
          `document.`,
      };
    }
    // An open bill for the same load and driver IS this bill. Re-running the day is safe.
    return { outcome: "already_exists", driver_bill_id: prior.id, bill_number: prior.bill_number };
  }

  // ---- 3. WRITE THE DOCUMENT --------------------------------------------------------------
  const billNumber = driverBillNumberFromLoadNumber(input.load_number);
  const notes =
    `Historical backfill from settlement ${input.source_document_ref} — amount as printed on the ` +
    `signed document, not derived from a pay rate.`;

  const inserted = await client.query<{ id: string }>(
    `
      INSERT INTO driver_finance.driver_bills (
        operating_company_id, load_id, load_number, bill_number, driver_id, team_driver_id,
        gross_amount_cents, miles_basis, miles_basis_type, rate_per_mile_cents, status, notes,
        created_by_user_id, miles_deadhead, rate_empty_per_mile_cents,
        loaded_pay_cents, deadhead_pay_cents
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'open',$11,$12,$13,$14,$15,$16)
      RETURNING id::text
    `,
    [
      input.operating_company_id,
      input.load_id,
      input.load_number,
      billNumber,
      input.driver_id,
      input.team_driver_id ?? null,
      input.gross_amount_cents,
      input.miles_basis ?? null,
      input.miles_basis_type ?? null,
      input.rate_per_mile_cents ?? null,
      notes,
      input.requesting_user_uuid ?? null,
      input.miles_deadhead ?? null,
      input.rate_empty_per_mile_cents ?? null,
      hasLoaded ? input.loaded_pay_cents : null,
      hasLoaded ? input.deadhead_pay_cents : null,
    ],
  );

  const driverBillId = inserted.rows[0]!.id;

  // ---- 4. SAY SO, IN THE AUDIT TRAIL, NAMING THE SOURCE DOCUMENT -------------------------
  // appendCrudAudit requires a real actor id. A historical backfill has no interactive user, so
  // the caller supplies the system actor; refusing here would strand the feed, and inventing a
  // uuid would put a fake actor on a real financial document.
  await appendCrudAudit(
    client,
    input.requesting_user_uuid ?? HISTORICAL_BACKFILL_SYSTEM_ACTOR,
    "driver_finance.driver_bill.historical_backfill",
    {
      driver_bill_id: driverBillId,
      bill_number: billNumber,
      operating_company_id: input.operating_company_id,
      load_id: input.load_id,
      load_number: input.load_number,
      driver_id: input.driver_id,
      gross_amount_cents: input.gross_amount_cents,
      loaded_pay_cents: hasLoaded ? input.loaded_pay_cents : null,
      deadhead_pay_cents: hasLoaded ? input.deadhead_pay_cents : null,
      source: "historical_backfill",
      source_document_ref: input.source_document_ref,
    },
    "info",
    "FEED-DRIVER-BILL-01",
  );

  return { outcome: "created", driver_bill_id: driverBillId, bill_number: billNumber };
}
