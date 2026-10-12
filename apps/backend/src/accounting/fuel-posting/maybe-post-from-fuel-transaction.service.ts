/**
 * Receipt-time fuel poster (LEAD 443.116 #1) — invoked AFTER fuel.fuel_transactions / the Relay fill lands
 * (Relay bridge / fleet-card CSV import) and AFTER the ingest transaction commits.
 *
 * FLAGS (both per-company): FUEL_POSTS_ON_RECEIPT_ENABLED (LEAD 443.116 #1 — the fill posts when it is received) AND
 * EXPENSE_GL_POSTING_ENABLED. Either OFF -> strict no-op (the fill posts when its card bank line is matched).
 *
 * PARALLEL BOOKS: posts to the TMS GL only. Does NOT enable QBO_JE_PUSH_ENABLED / entity push.
 * Idempotent via the fill poster's posting_batches key (fuel_event_id = the fill id: Relay fill or card fuel transaction).
 */
import { RelayFillLinksNotPostsError, resolveCompanyDirectCreditPreference, loadFuelTxnCreditSignals, type FuelTxnGlPostCandidate, type CompanyDirectCredit } from "./fuel-credit-preference.js";
export { RelayFillLinksNotPostsError, resolveCompanyDirectCreditPreference, loadFuelTxnCreditSignals, type FuelTxnGlPostCandidate, type CompanyDirectCredit } from "./fuel-credit-preference.js";
import { EXPENSE_GL_POSTING_FLAG_KEY } from "../expense-gl-posting-flag.js";
import { withLuciaBypass } from "../../auth/db.js";
import { isEnabled } from "../../lib/feature-flags/service.js";
import { type FuelPostingResult } from "./poster.service.js";
export { buildFuelTxnJeMemo, mapFuelTypeToPostingKind } from "./fuel-txn-memo.js";

/** Same key as expenses.routes — fuel expense is an expense-class GL post. */
export const FUEL_EXPENSE_GL_POSTING_FLAG_KEY = EXPENSE_GL_POSTING_FLAG_KEY;

const SYSTEM_ACTOR_USER_ID = process.env.SYSTEM_ACTOR_USER_ID ?? "00000000-0000-4000-8000-000000000001";


export type MaybePostFuelTxnResult =
  | { status: "skipped_posts_on_bank_match" }
  | { status: "skipped_flag_off" }
  | { status: "skipped_zero_amount" }
  | { status: "skipped_not_a_fill" }
  | { status: "unposted_at_receipt"; message: string }
  | { status: "posted"; posting: FuelPostingResult }
  | { status: "already_posted"; posting: FuelPostingResult }
  | { status: "error"; message: string };

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number }>;
};



/** USMCA operating_company_id — the only entity R-153.6/153.7's owner-stated rail rule applies to. */

/**
 * R-30.1-A (A/P control contamination fix, 2026-09-22) — SUPERSEDES the old FUEL-08 behavior of
 * this function, which collapsed EVERY card-settled fuel purchase into a blanket `ap` preference.
 * `resolveCompanyDirectCreditAccount("ap")` resolves the generic A/P control role/subtype (GL
 * 2000) — a control account backed by the accounting.bills subledger. Fuel-card purchases carry
 * no bill; crediting 2000 for them left 2000 at -108,938.77 against a $0.00 live bills subledger
 * (351 live fuel_event credits: 76 Relay + 275 Dreamline) while GL 2510 Dreamline Diesel Card
 * Payable sat at 0 postings. ap_control must NEVER credit a fuel_event. Ever.
 *
 * The card-settled credit now resolves PER RAIL, identified from the fuel transaction's own
 * fuel_card_id (stamped against catalogs.fuel_card_types by the Dreamline/Relay ingestion) —
 * never guessed:
 *   DREAMLINE (billed in arrears) -> "dreamline_card_payable" (GL 2510)
 *   RELAY (prefunded)             -> "relay_fuel_wallet"      (GL 1295)
 *
 * R-153.7 (owner-stated fact, 2026-09-25, NOT a guess): "USMCA buys fuel on two providers only:
 * Relay and Dreamline. USMCA runs its fuel on the IH 35 Transportation Relay account... So:
 * Dreamline-confirmed rows -> 2510; every other real USMCA fuel row -> Relay 1295. No card
 * statement is needed to pick the rail." This REPLACES the prior "no evidence -> cash" fallback,
 * but ONLY for USMCA -- no other entity has this owner statement on record, so every other
 * company keeps the pre-153.7 fail-closed/cash behavior unchanged (never widen an entity-specific
 * owner fact into a global default).
 */
/**
 * ACCT-F403 (Lead ruling Option 1, 2026-10-04) — a settlement-derived fuel row on the RELAY rail posts no fuel. Relay is a
 * prepaid wallet (1295): the cost is the Relay fill, at what Relay charged, posted when its wallet line is matched in Banking
 * (postFuelFillOnBankMatch kind 'relay_fuel'). The AlwaysTrack settlement line is driver-facing; it LINKS to that fill
 * (fuel.fuel_transactions.relay_fuel_transaction_id). Every fuel-row posting path resolves its rail here, so this is the door.
 */



/**
 * LEAD RULINGS 443.116 #1 (owner design 2026-10-12, his words: "THE COSTS SHOULD POST DAILY, AS THEY ARE RECEIVED FROM
 * RELAY, ETC") — SUPERSEDES the posting MOMENT of OWNER RULING 2026-10-02 ("they are imported and work as a banking or
 * credit card bank... must be matched to a transaction or categorized in banking") and the import-time retirement that
 * followed it (CC-2 #24027, FUEL_POSTS_ON_BANK_MATCH_ONLY): per company, a fill posts WHEN IT IS RECEIVED, through the
 * ONE fill poster the bank match uses (bank-match-fuel-post.service.ts postFuelFillOnReceipt -> postFuelFill): a Relay
 * fill Dr fuel per product + Dr Fuel Card Fees / Cr Relay Fuel Wallet, a Dreamline / card fill Dr fuel / Cr Dreamline Diesel
 * Card Payable, each with its expense document on its load. The card / wallet bank line then only MATCHES it (the match
 * finds the posted fill first and posts nothing). The competing import-only poster (postFuelExpenseFromEvent) is no
 * longer called here — there is one poster. Company flag FUEL_POSTS_ON_RECEIPT_ENABLED (seeded OFF, 202615830910):
 * OFF keeps the fill posting at bank match exactly as before.
 */
export const FUEL_POSTS_ON_RECEIPT_FLAG_KEY = "FUEL_POSTS_ON_RECEIPT_ENABLED";

/**
 * Flag-gated post of one received fill. Safe to call repeatedly (the poster's key makes it idempotent per fill).
 * Must run AFTER the ingest transaction that wrote the fill has committed.
 */
export async function maybePostFuelExpenseFromCanonicalTxn(
  candidate: FuelTxnGlPostCandidate
): Promise<MaybePostFuelTxnResult> {
  const amountCents = Math.round(Number(candidate.amount_cents ?? 0));
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return { status: "skipped_zero_amount" };
  }
  // A Relay cash advance drawn by a driver is not a fuel fill; it is never posted as fuel.
  if (candidate.cash_advance) return { status: "skipped_not_a_fill" };

  const actorUserId = (candidate.actor_user_id?.trim() || SYSTEM_ACTOR_USER_ID).toLowerCase();

  let receiptOn = false;
  let expenseOn = false;
  try {
    [receiptOn, expenseOn] = await withLuciaBypass(async (client: DbClient) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [
        candidate.operating_company_id,
      ]);
      const ctx = { operating_company_id: candidate.operating_company_id, user_uuid: actorUserId };
      return [
        await isEnabled(client, FUEL_POSTS_ON_RECEIPT_FLAG_KEY, ctx),
        await isEnabled(client, FUEL_EXPENSE_GL_POSTING_FLAG_KEY, ctx),
      ] as [boolean, boolean];
    });
  } catch (err) {
    return { status: "error", message: `flag_check_failed:${String((err as Error)?.message ?? err)}` };
  }
  if (!receiptOn) return { status: "skipped_posts_on_bank_match" };
  if (!expenseOn) return { status: "skipped_flag_off" };

  // The Relay fill itself (integrations.relay_fuel_transactions) is the receipt on the Relay rail; a card fill is its
  // fuel.fuel_transactions row. One fill id per receipt — the same id the bank match posts / finds.
  const kind = candidate.relay_fuel_transaction_id ? ("relay_fuel" as const) : ("fuel_transaction" as const);
  const fillId = candidate.relay_fuel_transaction_id ?? candidate.fuel_transaction_id;
  try {
    const posting: FuelPostingResult = await withLuciaBypass(async (client: DbClient) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [
        candidate.operating_company_id,
      ]);
      const { postFuelFillOnReceipt } = await import("../bank-recon/bank-match-fuel-post.service.js");
      return postFuelFillOnReceipt(client as never, {
        operating_company_id: candidate.operating_company_id,
        actor_user_uuid: actorUserId,
        kind,
        fill_id: fillId,
      });
    });
    return { status: posting.result === "already_posted" ? "already_posted" : "posted", posting };
  } catch (err) {
    const name = (err as Error)?.name;
    // A fill the poster refuses by name (no unit / no load at fill time, a Relay-rail settlement row that only links)
    // stays unposted and posts when its bank line is matched, through the same poster — never a silent half-post.
    if (name === "FuelMatchPostError" || err instanceof RelayFillLinksNotPostsError) {
      return { status: "unposted_at_receipt", message: String((err as Error)?.message ?? err) };
    }
    return { status: "error", message: String((err as Error)?.message ?? err) };
  }
}

/** Best-effort flush after ingest commit — never throws; never blocks ingest success. */
export async function flushFuelGlPostsAfterCommit(
  candidates: FuelTxnGlPostCandidate[],
  log?: { warn?: (obj: unknown, msg?: string) => void; info?: (obj: unknown, msg?: string) => void }
): Promise<{ attempted: number; posted: number; skipped_flag_off: number; skipped_posts_on_bank_match: number; unposted_at_receipt: number; errors: number }> {
  const stats = { attempted: 0, posted: 0, skipped_flag_off: 0, skipped_posts_on_bank_match: 0, unposted_at_receipt: 0, errors: 0 };
  for (const candidate of candidates) {
    if (!candidate.fuel_transaction_id) continue;
    stats.attempted += 1;
    const result = await maybePostFuelExpenseFromCanonicalTxn(candidate);
    if (result.status === "posted" || result.status === "already_posted") {
      stats.posted += 1;
    } else if (result.status === "skipped_flag_off") {
      stats.skipped_flag_off += 1;
    } else if (result.status === "skipped_posts_on_bank_match") {
      stats.skipped_posts_on_bank_match += 1;
    } else if (result.status === "unposted_at_receipt") {
      stats.unposted_at_receipt += 1;
      log?.info?.(
        { operating_company_id: candidate.operating_company_id, fuel_transaction_id: candidate.fuel_transaction_id, reason: result.message },
        "[FUEL_GL_POST] fill not postable at receipt — it posts when its bank line is matched"
      );
    } else if (result.status === "error") {
      stats.errors += 1;
      log?.warn?.(
        {
          operating_company_id: candidate.operating_company_id,
          fuel_transaction_id: candidate.fuel_transaction_id,
          error: result.message,
        },
        "[FUEL_GL_POST] post failed (ingest already committed)"
      );
    }
  }
  if (stats.attempted > 0) {
    log?.info?.(stats, "[FUEL_GL_POST] flush complete");
  }
  return stats;
}