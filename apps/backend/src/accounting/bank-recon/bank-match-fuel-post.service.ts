/**
 * ROUND 288.2 / OWNER LAW 2026-10-02 — bank-match fuel poster.
 *
 * CC-2 (#24027) retired import-time fuel GL posts. A fill books ONLY when its card bank line is
 * matched in Banking, through postFuelExpenseOnClient on the caller's client (same transaction as
 * the match). This module is the match engine's sole caller of that hook.
 *
 * Fail-closed: null unit_id or null load_id is an ENGINE defect (owner), not a data soft-skip.
 */
import { adoptRelayFillExpenseDocument, createExpenseFromFuelTransaction } from "../../fuel/fuel-expense-document.service.js";
import { resolveFuelLoadAtTime } from "../../fuel/fuel-load-at-time.js";
import { relayLineIsGallonsSql, relayLineKindSql } from "../../fuel/relay-product-kind.js";
import { buildFuelTxnJeMemo, mapFuelTypeToPostingKind } from "../fuel-posting/fuel-txn-memo.js";
import { loadFuelTxnCreditSignals, resolveCompanyDirectCreditPreference } from "../fuel-posting/fuel-credit-preference.js";
import { findPostedFuelEvent, postFuelExpenseOnClient, type FuelCategoryCode, type FuelPostingResult } from "../fuel-posting/poster.service.js";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { relayFillFeeCents, relayWalletDrawdownCents } from "../../integrations/relay-payments/relay-sender-fee-cents.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number }>;
};

export class FuelMatchPostError extends Error {
  constructor(
    public code:
      | "fuel_fill_not_found" | "fuel_fill_missing_unit" | "fuel_fill_missing_load" | "fuel_fill_zero_amount"
      | "relay_fill_unknown_product" | "relay_fill_has_no_fuel_lines" | "relay_fill_lines_do_not_foot" | "relay_fill_document_refused"
      | "fuel_fill_document_refused",
    message: string
  ) {
    super(message);
    this.name = "FuelMatchPostError";
  }
}

/**
 * Post the fuel fill JE inside the open match transaction. Returns the JE id to stamp on
 * banking.bank_transactions.matched_journal_entry_id in the SAME UPDATE as review_state='matched'.
 */
export async function postFuelFillOnBankMatch(
  client: DbClient,
  input: {
    operating_company_id: string;
    actor_user_uuid: string;
    kind: "fuel_transaction" | "relay_fuel";
    fill_id: string;
  }
): Promise<FuelPostingResult> {
  // LEAD 443.116 #1 — a fill that already posted (when it was RECEIVED, or by an earlier match) is only matched: the
  // bank line names that entry and nothing posts, nothing is re-validated, no document is re-adopted.
  const already = await findPostedFuelEvent(client, input.operating_company_id, input.fill_id);
  if (already) return already;
  return postFuelFill(client, input);
}

/** The ONE fill poster (canonical card fill or Relay fill). Called on receipt (import) and, for a fill not yet posted, at match. */
async function postFuelFill(
  client: DbClient,
  input: { operating_company_id: string; actor_user_uuid: string; kind: "fuel_transaction" | "relay_fuel"; fill_id: string }
): Promise<FuelPostingResult> {
  if (input.kind === "fuel_transaction") {
    return postCanonicalFuelTxn(client, input);
  }
  return postRelayFuelFill(client, input);
}

/** Audit event the receipt poster writes: the bank match that later names this JE did NOT create it (unmatch keeps it). */
export const FUEL_POSTED_ON_RECEIPT_EVENT = "fuel.posted_on_receipt";

/**
 * LEAD RULINGS 443.116 #1 (owner design 2026-10-12: "THE COSTS SHOULD POST DAILY, AS THEY ARE RECEIVED FROM RELAY,
 * ETC") — supersedes the posting MOMENT of OWNER RULING 2026-10-02 (fuel cards are bank accounts): a fill posts when it
 * is received, through the SAME poster the match uses (postFuelFill); the card / wallet bank line then only matches it.
 * Idempotent per fill (the poster's key). A canonical card fill gets its expense document adopting the same JE; a Relay
 * fill's document is adopted inside postRelayFuelFill. Writes fuel.posted_on_receipt so unmatch never reverses this JE.
 */
export async function postFuelFillOnReceipt(
  client: DbClient,
  input: { operating_company_id: string; actor_user_uuid: string; kind: "fuel_transaction" | "relay_fuel"; fill_id: string }
): Promise<FuelPostingResult> {
  const already = await findPostedFuelEvent(client, input.operating_company_id, input.fill_id);
  if (already) return already;
  const posted = await postFuelFill(client, input);
  if (input.kind === "fuel_transaction" && posted.journal_entry_id) {
    const { createExpenseFromFuelTransaction } = await import("../../fuel/fuel-expense-document.service.js");
    const doc = await createExpenseFromFuelTransaction(client as never, {
      operating_company_id: input.operating_company_id,
      fuel_transaction_id: input.fill_id,
      requesting_user_uuid: input.actor_user_uuid,
    });
    if (doc.outcome === "refused") throw new FuelMatchPostError("fuel_fill_document_refused", `fuel_transaction ${input.fill_id}: ${doc.reason}`);
  }
  if (posted.result === "posted") {
    await appendCrudAudit(client as never, input.actor_user_uuid, FUEL_POSTED_ON_RECEIPT_EVENT, {
      operating_company_id: input.operating_company_id,
      fill_kind: input.kind,
      fill_id: input.fill_id,
      journal_entry_id: posted.journal_entry_id,
      posting_batch_id: posted.posting_batch_id,
    }, "info", "LEAD-443.116");
  }
  return posted;
}

async function postCanonicalFuelTxn(
  client: DbClient,
  input: {
    operating_company_id: string;
    actor_user_uuid: string;
    fill_id: string;
  }
): Promise<FuelPostingResult> {
  const rowRes = await client.query<{
    fuel_type: string;
    transaction_at: string;
    amount_cents: string;
    driver_id: string | null;
    unit_id: string | null;
    load_id: string | null;
    trailer_id: string | null;
    location_state: string | null;
    gallons: string | null;
    fuel_card_id: string | null;
  }>(
    `
      SELECT ft.fuel_type::text AS fuel_type,
             COALESCE(ft.transaction_at, ft.created_at)::text AS transaction_at,
             ROUND(COALESCE(ft.total_cost, 0) * 100)::bigint::text AS amount_cents,
             ft.driver_id::text AS driver_id,
             ft.unit_id::text AS unit_id,
             ft.load_id::text AS load_id,
             ft.trailer_id::text AS trailer_id,
             ft.location_state::text AS location_state,
             ft.gallons::text AS gallons,
             ft.fuel_card_id::text AS fuel_card_id
        FROM fuel.fuel_transactions ft
       WHERE ft.id = $1::uuid
         AND ft.operating_company_id = $2::uuid
         AND ft.voided_at IS NULL
       LIMIT 1
    `,
    [input.fill_id, input.operating_company_id]
  );
  const row = rowRes.rows[0];
  if (!row) throw new FuelMatchPostError("fuel_fill_not_found", `fuel_transaction ${input.fill_id} not found`);
  if (!row.unit_id) {
    throw new FuelMatchPostError(
      "fuel_fill_missing_unit",
      `fuel_transaction ${input.fill_id}: unit_id is null — engine defect (owner: fuel posting requires unit)`
    );
  }
  if (!row.load_id) {
    throw new FuelMatchPostError(
      "fuel_fill_missing_load",
      `fuel_transaction ${input.fill_id}: load_id is null — engine defect (owner: fuel posting requires load)`
    );
  }
  const amountCents = Math.round(Number(row.amount_cents ?? 0));
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    throw new FuelMatchPostError("fuel_fill_zero_amount", `fuel_transaction ${input.fill_id}: amount_cents must be > 0`);
  }

  const signals = await loadFuelTxnCreditSignals(client, input.operating_company_id, input.fill_id);
  const companyDirectCredit = resolveCompanyDirectCreditPreference(
    {
      operating_company_id: input.operating_company_id,
      fuel_transaction_id: input.fill_id,
      fuel_type: row.fuel_type,
      transaction_at: row.transaction_at,
      amount_cents: amountCents,
      fuel_card_id: row.fuel_card_id,
      has_fuel_card: Boolean(row.fuel_card_id),
    },
    signals
  );

  const posted = await postFuelExpenseOnClient(client, {
    operating_company_id: input.operating_company_id,
    actor_user_id: input.actor_user_uuid,
    fuel_event_id: input.fill_id,
    fuel_kind: mapFuelTypeToPostingKind(row.fuel_type),
    posted_at: row.transaction_at,
    amount_cents: amountCents,
    posting_path: "company_direct",
    driver_id: row.driver_id,
    unit_id: row.unit_id,
    load_id: row.load_id,
    trailer_id: row.trailer_id ?? signals.trailer_id,
    ifta_state: row.location_state,
    ifta_gallons: row.gallons != null ? Number(row.gallons) : null,
    company_direct_credit: companyDirectCredit,
    memo: buildFuelTxnJeMemo({
      fuel_type: row.fuel_type,
      load_number: signals.load_number,
      unit_number: signals.unit_number,
      vendor_name: signals.vendor_name,
      driver_name: signals.driver_name,
      fuel_card_code: signals.fuel_card_code,
    }),
  });
  // DEGH-07 / 443.113-C — canonical fuel accept adopts the expense DOCUMENT for the same JE
  // (Relay already does this via adoptRelayFillExpenseDocument). One JE, never two; refuse by name.
  if (posted.journal_entry_id) {
    const doc = await createExpenseFromFuelTransaction(client as never, {
      operating_company_id: input.operating_company_id,
      fuel_transaction_id: input.fill_id,
      requesting_user_uuid: input.actor_user_uuid,
    });
    if (doc.outcome === "refused") {
      throw new FuelMatchPostError("fuel_fill_document_refused", doc.reason);
    }
  }
  return posted;
}

async function postRelayFuelFill(
  client: DbClient,
  input: {
    operating_company_id: string;
    actor_user_uuid: string;
    fill_id: string;
  }
): Promise<FuelPostingResult> {
  const rowRes = await client.query<{
    transaction_at: string;
    amount_cents: string;
    transaction_id: string;
    fees_json: unknown;
    driver_id: string | null;
    unit_id: string | null;
    unit_number: string | null;
    location_state: string | null;
    gallons: string | null;
    merchant_name: string | null;
  }>(
    `
      SELECT COALESCE(r.relay_created_at, r.created_at)::text AS transaction_at,
             ABS(COALESCE(r.total_amount_paid_cents, 0))::bigint::text AS amount_cents,
             r.transaction_id::text AS transaction_id,
             r.fees AS fees_json,
             r.matched_driver_id::text AS driver_id,
             -- BANK-F2026100403: Relay printed the unit number but ingest never resolved its id (fc461eb6, T169). The
             -- number proves the unit only when exactly ONE active unit in the fleet carries it (one number, one truck); else refused.
             COALESCE(r.matched_unit_id,
                      (SELECT min(u2.id::text)::uuid FROM mdata.units u2
                        WHERE u2.deactivated_at IS NULL
                          AND btrim(u2.unit_number) = btrim(r.matched_unit_number)
                       HAVING count(*) = 1))::text AS unit_id,
             COALESCE(u.unit_number, r.matched_unit_number)::text AS unit_number,
             r.location_state::text AS location_state,
             -- IFTA taxable gallons are ROAD diesel only: reefer (off-road) and DEF are not motor fuel (CC-2 2026-10-04;
             -- this used to sum diesel + reefer + DEF, overstating IFTA gallons on every mixed fill).
             (SELECT sum(l.volume)::text FROM integrations.relay_fuel_transaction_lines l
               WHERE l.relay_fuel_transaction_id = r.id AND l.voided_at IS NULL AND ${relayLineIsGallonsSql("l")}
                 AND ${relayLineKindSql("l")} = 'diesel') AS gallons,
             r.merchant_name::text AS merchant_name
        FROM integrations.relay_fuel_transactions r
        LEFT JOIN mdata.units u ON u.id = r.matched_unit_id
       WHERE r.id = $1::uuid
         AND r.operating_company_id = $2::uuid
         AND r.voided_at IS NULL
       LIMIT 1
    `,
    [input.fill_id, input.operating_company_id]
  );
  const row = rowRes.rows[0];
  if (!row) throw new FuelMatchPostError("fuel_fill_not_found", `relay_fuel ${input.fill_id} not found`);
  if (!row.unit_id) {
    throw new FuelMatchPostError(
      "fuel_fill_missing_unit",
      `relay_fuel ${input.fill_id}: matched_unit_id is null — engine defect (owner: fuel posting requires unit)`
    );
  }
  // 443.110 G7 — the one fuel-to-load rule (fuel/fuel-load-at-time.ts), same as the fuel-card import: unit first,
  // driver fallback, date-only stamps count to the end of their day.
  const load = await resolveFuelLoadAtTime(client, {
    operatingCompanyId: input.operating_company_id,
    unitId: row.unit_id,
    driverId: row.driver_id,
    at: row.transaction_at,
  });
  if (!load?.load_id) {
    throw new FuelMatchPostError(
      "fuel_fill_missing_load",
      `relay_fuel ${input.fill_id}: no active load on unit ${row.unit_id} at fill time — engine defect (owner: fuel posting requires load)`
    );
  }
  // RELAY-F442 — total_amount_paid is fuel only; wallet / GL credit = paid + sender_fee.
  const paidCents = Math.round(Number(row.amount_cents ?? 0));
  if (!Number.isFinite(paidCents) || paidCents <= 0) {
    throw new FuelMatchPostError("fuel_fill_zero_amount", `relay_fuel ${input.fill_id}: amount_cents must be > 0`);
  }

  // One Relay ticket, several products (CC-2 2026-10-04). This used to post the WHOLE fill as diesel, so a fill's DEF
  // landed in 5000 Fuel & Diesel and its reefer diesel too, while their items say 5010 / 5015. Each product line is now
  // its own leg on its own item's account. Measured on USMCA: 117 of 117 itemised fills pay exactly the sum of their
  // lines' discounted prices, so the legs foot to the wallet credit with no plug; a fill whose lines do not foot, or that
  // carries no fuel line at all (a scale ticket is not fuel), is refused by name.
  const linesRes = await client.query<{ fuel_type: string; cents: string; fee_cents: string }>(
    // ROUND 391.2 — the product is the ONE classifier's (relay-product-kind.ts: type, product code 033, description), so a
    // 'reefer_2' or code-033 line posts as reefer instead of being refused or read as diesel.
    `SELECT ${relayLineKindSql("l")} AS fuel_type,
            sum(l.total_discounted_price_cents)::bigint::text AS cents,
            coalesce(sum(l.fee_amount_cents), 0)::bigint::text AS fee_cents
       FROM integrations.relay_fuel_transaction_lines l
      WHERE l.relay_fuel_transaction_id = $1::uuid AND l.voided_at IS NULL
      GROUP BY 1`,
    [input.fill_id]
  );
  const RELAY_KIND: Record<string, FuelCategoryCode> = { diesel: "diesel", def: "def", reefer: "reefer" };
  const unknown = linesRes.rows.filter((l) => !RELAY_KIND[l.fuel_type]);
  if (unknown.length) {
    throw new FuelMatchPostError("relay_fill_unknown_product", `relay_fuel ${input.fill_id}: product line(s) ${unknown.map((l) => l.fuel_type).join(", ")} have no fuel item — refusing rather than posting them as diesel`);
  }
  const costLines = linesRes.rows
    .map((l) => ({ fuel_kind: RELAY_KIND[l.fuel_type]!, amount_cents: Math.round(Number(l.cents ?? 0)) }))
    .filter((l) => l.amount_cents > 0);
  if (!costLines.length) {
    throw new FuelMatchPostError("relay_fill_has_no_fuel_lines", `relay_fuel ${input.fill_id}: no fuel product line (e.g. a scale ticket) — this is not a fuel posting; categorize the bank line instead`);
  }
  const linesCents = costLines.reduce((t, l) => t + l.amount_cents, 0);
  if (linesCents !== paidCents) {
    throw new FuelMatchPostError("relay_fill_lines_do_not_foot", `relay_fuel ${input.fill_id}: product lines ${linesCents} != paid ${paidCents} — refusing rather than plugging the difference`);
  }
  const lineFeeCents = linesRes.rows.map((l) => Math.round(Number(l.fee_cents ?? 0)));
  const feesArr = Array.isArray(row.fees_json) ? row.fees_json : [];
  const feeCents = relayFillFeeCents({
    transaction_id: row.transaction_id,
    fees: feesArr,
    line_fee_amount_cents: lineFeeCents,
  });
  const amountCents = relayWalletDrawdownCents(paidCents, feeCents);
  const primary = [...costLines].sort((a, b) => b.amount_cents - a.amount_cents)[0]!.fuel_kind;

  const posted = await postFuelExpenseOnClient(client, {
    operating_company_id: input.operating_company_id,
    actor_user_id: input.actor_user_uuid,
    fuel_event_id: input.fill_id,
    fuel_kind: primary,
    cost_lines: costLines,
    fee_amount_cents: feeCents > 0 ? feeCents : null,
    posted_at: row.transaction_at,
    amount_cents: amountCents,
    posting_path: "company_direct",
    driver_id: row.driver_id,
    unit_id: row.unit_id,
    // 443.116 #1 — the load the one rule resolved above, and its trailer: a fill posted on receipt has no settlement row
    // to carry them, so the poster stamps them (the document then takes the load-spine number).
    load_id: load.load_id,
    trailer_id: load.trailer_id,
    ifta_state: row.location_state,
    ifta_gallons: row.gallons != null ? Number(row.gallons) : null,
    company_direct_credit: "relay_fuel_wallet",
    memo: buildFuelTxnJeMemo({
      fuel_type: costLines.map((l) => l.fuel_kind).join("+"),
      load_number: load.load_number,
      unit_number: row.unit_number,
      vendor_name: row.merchant_name,
      fuel_card_code: "RELAY",
    }),
  });
  // Lead 443.41 A: the Relay fill gets its expense DOCUMENT, adopting the SAME journal entry (one JE, never two).
  if (posted.journal_entry_id) {
    const doc = await adoptRelayFillExpenseDocument(client as never, {
      operating_company_id: input.operating_company_id,
      relay_fill_id: input.fill_id,
      journal_entry_id: posted.journal_entry_id,
      requesting_user_uuid: input.actor_user_uuid,
      trailer_id: load.trailer_id,
    });
    if (doc.outcome === "refused") throw new FuelMatchPostError("relay_fill_document_refused", doc.reason);
  }
  return posted;
}

/**
 * BANK-F2026100403 (CC-3, 2026-10-04) — a fuel / Relay bank line MATCHED BEFORE the match-time poster existed has no
 * journal entry: 69 USMCA Relay wallet lines were accepted on 2026-09-28 (R186), and ACCT-F9335 (#24158, 10-02) only posts
 * inside a NEW accept. Nothing posted the lines already matched, so their fuel is in the bank but not in the books.
 *
 * This posts such a line through the SAME poster the accept uses (postFuelFillOnBankMatch) on the caller's transaction
 * and stamps matched_journal_entry_id in one statement — exactly the state a fresh accept leaves. It refuses by name
 * (never skips): a line that is not matched, already carries a JE, is voided, or whose fill cannot be posted (no unit /
 * no load at fill time -> FuelMatchPostError) is reported to the caller, never half-posted.
 */
export async function postAlreadyMatchedFuelLine(
  client: DbClient,
  input: { operating_company_id: string; actor_user_uuid: string; bank_transaction_id: string }
): Promise<{ bank_transaction_id: string; kind: "fuel_transaction" | "relay_fuel"; fill_id: string; journal_entry_id: string }> {
  const lineRes = await client.query<{
    review_state: string | null;
    voided_at: string | null;
    matched_journal_entry_id: string | null;
    matched_fuel_transaction_id: string | null;
    matched_relay_fuel_transaction_id: string | null;
  }>(
    `SELECT review_state::text, voided_at::text, matched_journal_entry_id::text,
            matched_fuel_transaction_id::text, matched_relay_fuel_transaction_id::text
       FROM banking.bank_transactions
      WHERE id = $1::uuid AND operating_company_id = $2::uuid
      FOR UPDATE`,
    [input.bank_transaction_id, input.operating_company_id]
  );
  const line = lineRes.rows[0];
  if (!line) throw new Error(`bank_line_not_found: ${input.bank_transaction_id}`);
  if (line.voided_at) throw new Error(`bank_line_voided: ${input.bank_transaction_id}`);
  if (line.review_state !== "matched") throw new Error(`bank_line_not_matched: ${input.bank_transaction_id} (${line.review_state})`);
  if (line.matched_journal_entry_id) throw new Error(`bank_line_already_posted: ${input.bank_transaction_id} -> ${line.matched_journal_entry_id}`);
  const kind = line.matched_relay_fuel_transaction_id ? "relay_fuel" : line.matched_fuel_transaction_id ? "fuel_transaction" : null;
  if (!kind) throw new Error(`bank_line_not_a_fuel_match: ${input.bank_transaction_id}`);
  const fillId = (kind === "relay_fuel" ? line.matched_relay_fuel_transaction_id : line.matched_fuel_transaction_id)!;

  const posted = await postFuelFillOnBankMatch(client, {
    operating_company_id: input.operating_company_id,
    actor_user_uuid: input.actor_user_uuid,
    kind,
    fill_id: fillId,
  });
  if (!posted.journal_entry_id) throw new Error(`fuel_post_returned_no_journal_entry: ${input.bank_transaction_id}`);
  const stamped = await client.query(
    `UPDATE banking.bank_transactions
        SET matched_journal_entry_id = $3::uuid
      WHERE id = $1::uuid AND operating_company_id = $2::uuid
        AND review_state = 'matched' AND matched_journal_entry_id IS NULL`,
    [input.bank_transaction_id, input.operating_company_id, posted.journal_entry_id]
  );
  if (stamped.rowCount !== 1) throw new Error(`bank_line_stamp_lost: ${input.bank_transaction_id}`);
  return { bank_transaction_id: input.bank_transaction_id, kind, fill_id: fillId, journal_entry_id: posted.journal_entry_id };
}
