/**
 * ROUND 288.2 / OWNER LAW 2026-10-02 — bank-match fuel poster.
 *
 * CC-2 (#24027) retired import-time fuel GL posts. A fill books ONLY when its card bank line is
 * matched in Banking, through postFuelExpenseOnClient on the caller's client (same transaction as
 * the match). This module is the match engine's sole caller of that hook.
 *
 * Fail-closed: null unit_id is an ENGINE defect (owner), not a data soft-skip. A fill with no load covering its time
 * posts with the explicit deadhead/yard reason (LEAD 443.121 #2) and is re-pointed when its load is booked.
 */
import { relayFillUnitIdSql } from "../../fuel/relay-fill-unit.sql.js";
import { crossRailFuelRowsForRelayFill } from "../../fuel/relay-fill-link.service.js";
import { postedRelayTwinsOf } from "../../fuel/relay-duplicate-purchase.service.js";
import { adoptRelayFillExpenseDocument, createExpenseFromFuelTransaction } from "../../fuel/fuel-expense-document.service.js";
import { resolveFillDriverAtTime, resolveFuelLoadAtTime } from "../../fuel/fuel-load-at-time.js";
import { relayLineIsGallonsSql, relayLineKindSql } from "../../fuel/relay-product-kind.js";
import { buildFuelTxnJeMemo, mapFuelTypeToPostingKind } from "../fuel-posting/fuel-txn-memo.js";
import { loadFuelTxnCreditSignals, resolveCompanyDirectCreditPreference } from "../fuel-posting/fuel-credit-preference.js";
import { findPostedFuelEvent, postFuelExpenseOnClient, type FuelCategoryCode, type FuelPostingResult } from "../fuel-posting/poster.service.js";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { relayFuelPaidCents } from "../../integrations/relay-payments/relay-sender-fee-cents.js";
import { relayServiceKindOf, relayServiceProductCents } from "../../fuel/relay-service-code.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number }>;
};

export class FuelMatchPostError extends Error {
  constructor(
    public code:
      | "fuel_fill_not_found" | "fuel_fill_missing_unit" | "fuel_fill_missing_load" | "fuel_fill_zero_amount"
      | "relay_fill_unknown_product" | "relay_fill_has_no_fuel_lines" | "relay_fill_lines_do_not_foot" | "relay_fill_document_refused"
      | "fuel_fill_document_refused" | "relay_fill_matches_other_rail_fill" | "relay_fill_duplicate_purchase" | "relay_service_code_has_fuel_line",
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

/**
 * LEAD 443.121 #2 — the explicit reason a fuel receipt carries while no load covers its fill time (the truck was deadheading
 * or in the yard). Prefix is stable (repointFuelReceiptsToLoad clears it when a covering load is booked).
 */
export const FUEL_NO_LOAD_REASON_PREFIX = "deadhead_or_yard";
export function fuelNoLoadReason(at: string | null, unitNumber?: string | null): string {
  return `${FUEL_NO_LOAD_REASON_PREFIX}: no load covered ${unitNumber ? `unit ${unitNumber}` : "the unit"} at the fill time ${at ?? "unknown"} (LEAD 443.121 #2)`;
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
  // ENG-48 (ON-RECEIPT): Relay fills also get an expense document on receipt — same as bank-match path.
  if (input.kind === "relay_fuel" && posted.journal_entry_id) {
    const doc = await adoptRelayFillExpenseDocument(client as never, {
      operating_company_id: input.operating_company_id,
      relay_fill_id: input.fill_id,
      journal_entry_id: posted.journal_entry_id,
      requesting_user_uuid: input.actor_user_uuid,
    });
    if (doc.outcome === "refused") throw new FuelMatchPostError("relay_fill_document_refused", `on_receipt ${input.fill_id}: ${doc.reason}`);
  }
  if (posted.result === "posted") {
    await appendCrudAudit(client as never, input.actor_user_uuid, FUEL_POSTED_ON_RECEIPT_EVENT, {
      operating_company_id: input.operating_company_id,
      fill_kind: input.kind,
      fill_id: input.fill_id,
      journal_entry_id: posted.journal_entry_id,
      posting_batch_id: posted.posting_batch_id,
    }, "info", "LEAD-443.116");
    // ENG-25b: Transportation diesel on USMCA loads = intercompany loan (owner ruling 10-24 2:36 PM CT).
    // If the fill's load belongs to a different company, reclassify the expense account to 8000 intercompany.
    if (posted.journal_entry_id) {
      await maybeReclassifyFuelFillForIntercompanyDiesel(client, input.operating_company_id, input.fill_id, posted.journal_entry_id, input.actor_user_uuid);
    }
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
  // LEAD 443.121 #2 — a fill the truck bought while running no load (deadhead / yard) posts ON RECEIPT with that reason on
  // its fuel row; when a load covering the fill time is booked later, repointFuelReceiptsToLoad attaches the SAME posting
  // and document to it (load_id is fill-once on postings). Never a refusal that leaves the receipt out of the books.
  if (!row.load_id) {
    await client.query(
      `UPDATE fuel.fuel_transactions SET load_exemption_reason = $3
        WHERE id = $1::uuid AND operating_company_id = $2::uuid AND load_id IS NULL AND load_exemption_reason IS NULL`,
      [input.fill_id, input.operating_company_id, fuelNoLoadReason(row.transaction_at)]
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
    ingest_source: string | null;
    driver_id: string | null;
    unit_id: string | null;
    unit_number: string | null;
    location_state: string | null;
    gallons: string | null;
    merchant_name: string | null;
    fuel_code_type: string | null;
    products: unknown;
  }>(
    `
      SELECT COALESCE(r.relay_created_at, r.created_at)::text AS transaction_at,
             r.fuel_code_type::text AS fuel_code_type,
             r.products AS products,
             ABS(COALESCE(r.total_amount_paid_cents, 0))::bigint::text AS amount_cents,
             r.transaction_id::text AS transaction_id,
             r.fees AS fees_json,
             r.ingest_source::text AS ingest_source,
             r.matched_driver_id::text AS driver_id,
             -- BANK-F2026100403: Relay printed the unit number but ingest never resolved its id (fc461eb6, T169). The
             -- number proves the unit only when exactly ONE active unit in the fleet carries it (one number, one truck); else refused.
             -- 443.192: the one rule lives in fuel/relay-fill-unit.sql.ts, shared with the fill's expense document.
             ${relayFillUnitIdSql("r")}::text AS unit_id,
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
  // LEAD 443.133 A — a Relay fill that pairs with a fuel row ON ANOTHER RAIL (e.g. a DREAMLINE settlement row, already posted
  // Cr 2510) may be the same purchase recorded twice. Posting the fill too would book the fuel twice; the owner decides which
  // rail paid. Refused by name, listing the rows — never posted, never guessed.
  const crossRail = await crossRailFuelRowsForRelayFill(client, input.operating_company_id, input.fill_id);
  if (crossRail.length) {
    throw new FuelMatchPostError(
      "relay_fill_matches_other_rail_fill",
      `relay_fuel ${input.fill_id}: pairs with ${crossRail.length} fuel row(s) paid on another rail (${crossRail.map((r) => `${r.fuel_transaction_id} ${r.card ?? "no card"}`).join(", ")}) — the owner decides which rail paid before it posts`
    );
  }
  // 443.136 — Relay can list ONE pump purchase under two transaction ids (same truck, place, products, volume, amount).
  // The receipt identity keys on the transaction id, so it cannot see this; the purchase rule can. Refused by name.
  const twins = await postedRelayTwinsOf(client, input.operating_company_id, input.fill_id);
  if (twins.length) {
    throw new FuelMatchPostError(
      "relay_fill_duplicate_purchase",
      `relay_fuel ${input.fill_id}: same purchase as already-posted Relay fill(s) ${twins.map((t) => `${t.fill_id} ${t.transaction_id ?? ""}`.trim()).join(", ")} — one purchase posts once`
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
  // LEAD 443.121 #2 — no load covered the unit at fill time (deadhead / yard): the fill still posts on receipt, with the
  // explicit no-load reason on its document lines; repointFuelReceiptsToLoad attaches it when a covering load is booked.
  const noLoadReason = load?.load_id ? null : fuelNoLoadReason(row.transaction_at, row.unit_number);
  // LEAD 443.126 2a — the one fill-driver rule: Relay's matched driver, else the card's / truck's driver at fill time,
  // else the load's driver. A no-load (deadhead / yard) fill still names who fueled.
  const fillDriver = await resolveFillDriverAtTime(client, {
    operatingCompanyId: input.operating_company_id,
    matchedDriverId: row.driver_id,
    unitId: row.unit_id,
    at: row.transaction_at,
    loadId: load?.load_id ?? null,
  });
  const fillDriverId = fillDriver?.driver_id ?? null;
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
  // ACCT-F11127 (Lead ruling 11-09) — a Relay SERVICE code (lumper / CAT scale ticket) is an expense on its load on the
  // service's own item, through this same poster, crediting the wallet. Its one amount is its 'other' line (CSV shape) or
  // Relay's product price (API shape, no line). A service code that also carries a fuel line is refused by name.
  const serviceKind = relayServiceKindOf({ fuel_code_type: row.fuel_code_type, products: row.products });
  let costLines: Array<{ fuel_kind: FuelCategoryCode; amount_cents: number }>;
  if (serviceKind) {
    const fuelOnService = linesRes.rows.filter((l) => l.fuel_type !== "other" && Math.round(Number(l.cents ?? 0)) > 0);
    if (fuelOnService.length) {
      throw new FuelMatchPostError("relay_service_code_has_fuel_line", `relay_fuel ${input.fill_id}: a ${serviceKind} code carries fuel line(s) ${fuelOnService.map((l) => l.fuel_type).join(", ")} — refusing rather than splitting it by guess`);
    }
    const otherCents = linesRes.rows.filter((l) => l.fuel_type === "other").reduce((t, l) => t + Math.round(Number(l.cents ?? 0)), 0);
    const cents = otherCents > 0 ? otherCents : (relayServiceProductCents(row.products) ?? 0);
    costLines = cents > 0 ? [{ fuel_kind: serviceKind, amount_cents: cents }] : [];
  } else {
    const unknown = linesRes.rows.filter((l) => !RELAY_KIND[l.fuel_type]);
    if (unknown.length) {
      throw new FuelMatchPostError("relay_fill_unknown_product", `relay_fuel ${input.fill_id}: product line(s) ${unknown.map((l) => l.fuel_type).join(", ")} have no fuel item — refusing rather than posting them as diesel`);
    }
    costLines = linesRes.rows
      .map((l) => ({ fuel_kind: RELAY_KIND[l.fuel_type]!, amount_cents: Math.round(Number(l.cents ?? 0)) }))
      .filter((l) => l.amount_cents > 0);
  }
  if (!costLines.length) {
    throw new FuelMatchPostError("relay_fill_has_no_fuel_lines", `relay_fuel ${input.fill_id}: no fuel product line (e.g. a scale ticket) — this is not a fuel posting; categorize the bank line instead`);
  }
  const linesCents = costLines.reduce((t, l) => t + l.amount_cents, 0);
  // LEAD 443.123 — the ONE paid rule (relayFuelPaidCents): a legacy CSV row whose stored paid carries its recorded fee
  // (paid = lines + fees[] exactly) is fuel = lines; ANY other difference is still refused by name, never plugged.
  const paid = relayFuelPaidCents({
    transaction_id: row.transaction_id,
    stored_paid_cents: paidCents,
    product_lines_cents: linesCents,
    fees: Array.isArray(row.fees_json) ? row.fees_json : [],
    line_fee_amount_cents: linesRes.rows.map((l) => Math.round(Number(l.fee_cents ?? 0))),
    ingest_source: row.ingest_source,
  });
  if (linesCents !== paid.fuel_paid_cents) {
    throw new FuelMatchPostError("relay_fill_lines_do_not_foot", `relay_fuel ${input.fill_id}: product lines ${linesCents} != paid ${paidCents} — refusing rather than plugging the difference`);
  }
  const feeCents = paid.fee_cents;
  const amountCents = paid.wallet_cents;
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
    driver_id: fillDriverId,
    unit_id: row.unit_id,
    // 443.116 #1 — the load the one rule resolved above, and its trailer: a fill posted on receipt has no settlement row
    // to carry them, so the poster stamps them (the document then takes the load-spine number).
    load_id: load?.load_id ?? null,
    trailer_id: load?.trailer_id ?? null,
    // A service code is not motor fuel: no IFTA state, no gallons.
    ifta_state: serviceKind ? null : row.location_state,
    ifta_gallons: serviceKind ? null : row.gallons != null ? Number(row.gallons) : null,
    company_direct_credit: "relay_fuel_wallet",
    memo: buildFuelTxnJeMemo({
      fuel_type: costLines.map((l) => l.fuel_kind).join("+"),
      load_number: load?.load_number ?? null,
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
      trailer_id: load?.trailer_id ?? null,
      load_exemption_reason: noLoadReason,
      driver_id: fillDriverId,
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

/**
 * ENG-25b — owner ruling 10-24 2:36 PM CT: fuel paid by Transportation for a USMCA load is an
 * intercompany loan, not a USMCA expense. Automatically reclassifies 5000/5005/5010 → 8000
 * (intercompany_ih35, "Inter-company - IH35 Transportation") when the fill's load belongs to a
 * different operating company than the fill itself. No-op when load is USMCA or fill has no load.
 */
export async function maybeReclassifyFuelFillForIntercompanyDiesel(
  client: DbClient,
  operatingCompanyId: string,
  fillId: string,
  journalEntryId: string,
  actorUserId: string,
): Promise<{ reclassified: boolean; reason?: string }> {
  // Check if the fill's load (from the NEW posting) belongs to a different company
  const loadCheck = await client.query<{ load_id: string; load_company_id: string; posting_ids: string[] }>(
    `SELECT p.load_id::text,
            ml.operating_company_id::text AS load_company_id,
            array_agg(p.id::text) AS posting_ids
       FROM accounting.journal_entry_postings p
       JOIN accounting.journal_entries je ON je.id = p.journal_entry_id
                                          AND je.operating_company_id = $1::uuid
       JOIN mdata.loads ml ON ml.id = p.load_id
      WHERE p.operating_company_id = $1::uuid
        AND p.journal_entry_id = $2::uuid
        AND p.source_transaction_type = 'fuel_event'
        AND p.debit_or_credit = 'debit'
        AND p.load_id IS NOT NULL
        AND ml.operating_company_id IS DISTINCT FROM $1::uuid
        AND je.voided_at IS NULL AND p.voided_at IS NULL
      GROUP BY p.load_id, ml.operating_company_id`,
    [operatingCompanyId, journalEntryId],
  );
  if (!loadCheck.rows.length) return { reclassified: false };

  // Find 8000 intercompany_ih35 account for this company
  const acctRes = await client.query<{ id: string }>(
    `SELECT id::text FROM catalogs.accounts
      WHERE operating_company_id = $1::uuid
        AND system_purpose = 'intercompany_ih35'
        AND deactivated_at IS NULL AND is_postable = true
      LIMIT 1`,
    [operatingCompanyId],
  );
  if (!acctRes.rows.length) return { reclassified: false, reason: "8000 intercompany_ih35 account not found" };
  const toAccountId = acctRes.rows[0]!.id;

  const postingIds = loadCheck.rows.flatMap((r) => r.posting_ids);
  const { applyReclassifyOnClient } = await import("../../accounting/reclassify/reclassify.service.js");
  await applyReclassifyOnClient(
    client as Parameters<typeof applyReclassifyOnClient>[0],
    {
      operating_company_id: operatingCompanyId,
      posting_ids: postingIds,
      reason: "ENG-25b: Transportation diesel on non-USMCA load = intercompany loan (owner ruling 10-24)",
      to_account_id: toAccountId,
    },
    { userId: actorUserId, role: "Owner" },
  );
  return { reclassified: true };
}
