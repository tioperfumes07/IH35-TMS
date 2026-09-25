/**
 * Production caller for postFuelExpenseFromEvent — invoked AFTER fuel.fuel_transactions lands
 * (Relay bridge / fleet-card CSV import) and AFTER the ingest transaction commits.
 *
 * FLAG: EXPENSE_GL_POSTING_ENABLED (no fuel-specific GL flag exists). Per-entity override only;
 * default OFF. When OFF this is a strict no-op.
 *
 * PARALLEL BOOKS: posts to the TMS GL only. Does NOT enable QBO_JE_PUSH_ENABLED / entity push.
 * Idempotent via postFuelExpenseFromEvent's posting_batches key (fuel_event_id = fuel.fuel_transactions.id).
 */
import { withLuciaBypass } from "../../auth/db.js";
import { isEnabled } from "../../lib/feature-flags/service.js";
import {
  postFuelExpenseFromEvent,
  type CompanyDirectCredit,
  type FuelCategoryCode,
  type FuelPostingPath,
  type FuelPostingResult,
} from "./poster.service.js";

/** Same key as expenses.routes — fuel expense is an expense-class GL post. */
export const FUEL_EXPENSE_GL_POSTING_FLAG_KEY = "EXPENSE_GL_POSTING_ENABLED";

const SYSTEM_ACTOR_USER_ID = process.env.SYSTEM_ACTOR_USER_ID ?? "00000000-0000-4000-8000-000000000001";

export type FuelTxnGlPostCandidate = {
  operating_company_id: string;
  /** Prefer the authenticated ingest actor; cron/backfill may omit → system actor. */
  actor_user_id?: string | null;
  fuel_transaction_id: string;
  /** Canonical fuel.fuel_transactions.fuel_type (diesel|def|gas|reefer_diesel|other). */
  fuel_type: string;
  transaction_at: string;
  /** Integer cents — never invent; caller must pass the real paid amount. */
  amount_cents: number;
  driver_id?: string | null;
  location_state?: string | null;
  gallons?: number | null;
  /** Relay cash_advance → driver_advance path when a driver is matched. */
  cash_advance?: boolean;
  /** When set, flip integrations.relay_fuel_transactions.posted_to_gl after a successful post. */
  relay_fuel_transaction_id?: string | null;
  /**
   * FUEL-08 — real payment method drives the company_direct credit side.
   * Prefer explicit fuel_card_id / has_fuel_card / company_direct_credit from the caller;
   * never hardcode "cash" for fleet-card / Relay rows.
   */
  fuel_card_id?: string | null;
  /** True when a fleet/fuel card number was present on the import/ingest row. */
  has_fuel_card?: boolean;
  /** Explicit override — when set, wins over inferred signals. */
  company_direct_credit?: CompanyDirectCredit;
};

export type MaybePostFuelTxnResult =
  | { status: "skipped_flag_off" }
  | { status: "skipped_zero_amount" }
  | { status: "posted"; posting: FuelPostingResult }
  | { status: "already_posted"; posting: FuelPostingResult }
  | { status: "error"; message: string };

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number }>;
};

/** Map fuel.fuel_transactions.fuel_type → Block-27 poster category codes. */
export function mapFuelTypeToPostingKind(fuelType: string): FuelCategoryCode {
  const t = fuelType.trim().toLowerCase();
  if (t === "diesel") return "diesel";
  if (t === "def") return "def";
  if (t === "reefer_diesel" || t === "reefer") return "reefer";
  if (t === "oil") return "oil";
  return "misc";
}

function resolvePostingPath(candidate: FuelTxnGlPostCandidate): FuelPostingPath {
  if (candidate.cash_advance && candidate.driver_id) return "driver_advance";
  return "company_direct";
}

/** USMCA operating_company_id — the only entity R-153.6/153.7's owner-stated rail rule applies to. */
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";

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
export function resolveCompanyDirectCreditPreference(
  candidate: FuelTxnGlPostCandidate,
  txnSignals?: { fuel_card_id?: string | null; fuel_card_code?: string | null; notes?: string | null; source?: string | null } | null
): CompanyDirectCredit {
  if (candidate.company_direct_credit) return candidate.company_direct_credit;

  const code = (txnSignals?.fuel_card_code ?? "").toUpperCase();
  if (code === "DREAMLINE") return "dreamline_card_payable";
  if (code === "RELAY") return "relay_fuel_wallet";
  // Legacy Relay-bridge rows created before fuel_card_id was stamped to the RELAY catalog row —
  // still Relay-settled by construction of the bridge itself.
  if (candidate.relay_fuel_transaction_id) return "relay_fuel_wallet";

  // R-153.7: for USMCA only, no-evidence rows are owner-stated Relay, not "cash" -- checked BEFORE
  // the cardSignaled throw below, since an owner FACT supersedes the "cannot identify" refusal.
  if (candidate.operating_company_id === USMCA_COMPANY_ID) return "relay_fuel_wallet";

  const notes = (txnSignals?.notes ?? "").toLowerCase();
  const cardSignaled =
    Boolean(candidate.fuel_card_id || candidate.has_fuel_card || txnSignals?.fuel_card_id) ||
    notes.includes("card=") ||
    notes.includes("relay_bridge=1") ||
    notes.includes("relay_txn=");
  if (cardSignaled) {
    throw new Error(
      `fuel_event ${candidate.fuel_transaction_id}: a card is signaled (fuel_card_id=${
        txnSignals?.fuel_card_id ?? candidate.fuel_card_id ?? "null"
      }) but its rail could not be identified from a known catalogs.fuel_card_types row. ` +
        `Refusing to credit ap_control per R-30.1-A. Stamp fuel_card_id to DREAMLINE or RELAY, or pass an explicit company_direct_credit.`
    );
  }
  // No card signal at all (e.g. an older import row with neither a stamped fuel_card_id nor a
  // card-shaped note) — no evidence of a card/payable rail, so this is true cash, never a guess
  // at "ap" the way the pre-fix `source === 'import'` branch used to. (USMCA never reaches here —
  // handled above.)
  return "cash";
}

/** R-153.6: exported so fuel-expense-document.service.ts resolves the rail from the SAME query
 *  shape (fuel_card_id + catalogs.fuel_card_types.code) this poster already uses. */
export async function loadFuelTxnCreditSignals(
  client: DbClient,
  operatingCompanyId: string,
  fuelTransactionId: string
): Promise<{
  fuel_card_id: string | null;
  fuel_card_code: string | null;
  notes: string | null;
  source: string | null;
  unit_id: string | null;
  trailer_id: string | null;
  /** E14.2 — human JE memo parts (load # / unit / vendor / driver). Never invent. */
  load_number: string | null;
  unit_number: string | null;
  vendor_name: string | null;
  driver_name: string | null;
}> {
  const res = await client.query<{
    fuel_card_id: string | null;
    fuel_card_code: string | null;
    notes: string | null;
    source: string | null;
    unit_id: string | null;
    trailer_id: string | null;
    load_number: string | null;
    unit_number: string | null;
    vendor_name: string | null;
    driver_name: string | null;
  }>(
    `
      SELECT ft.fuel_card_id::text AS fuel_card_id,
             ct.code::text AS fuel_card_code,
             ft.notes,
             ft.source::text AS source,
             ft.unit_id::text AS unit_id,
             ft.trailer_id::text AS trailer_id,
             l.load_number::text AS load_number,
             u.unit_number::text AS unit_number,
             v.vendor_name::text AS vendor_name,
             NULLIF(TRIM(CONCAT_WS(' ', d.first_name, d.last_name)), '') AS driver_name
        FROM fuel.fuel_transactions ft
        LEFT JOIN catalogs.fuel_card_types ct ON ct.id = ft.fuel_card_id
        LEFT JOIN mdata.loads l ON l.id = ft.load_id AND l.operating_company_id = ft.operating_company_id
        LEFT JOIN mdata.units u ON u.id = ft.unit_id
        LEFT JOIN mdata.vendors v ON v.id = ft.vendor_id AND v.operating_company_id = ft.operating_company_id
        LEFT JOIN mdata.drivers d ON d.id = ft.driver_id AND d.operating_company_id = ft.operating_company_id
       WHERE ft.id = $1::uuid
         AND ft.operating_company_id = $2::uuid
       LIMIT 1
    `,
    [fuelTransactionId, operatingCompanyId]
  );
  const row = res.rows[0];
  return {
    fuel_card_id: row?.fuel_card_id ?? null,
    fuel_card_code: row?.fuel_card_code ?? null,
    notes: row?.notes ?? null,
    source: row?.source ?? null,
    unit_id: row?.unit_id ?? null,
    trailer_id: row?.trailer_id ?? null,
    load_number: row?.load_number ?? null,
    unit_number: row?.unit_number ?? null,
    vendor_name: row?.vendor_name ?? null,
    driver_name: row?.driver_name ?? null,
  };
}

/** E14.2 — JE memo with at least one human id (load / unit / vendor / driver). Never bare fuel UUID. */
export function buildFuelTxnJeMemo(args: {
  fuel_type: string;
  load_number?: string | null;
  unit_number?: string | null;
  vendor_name?: string | null;
  driver_name?: string | null;
  fuel_card_code?: string | null;
}): string {
  const kind = (args.fuel_type || "diesel").trim().toLowerCase() || "diesel";
  const parts: string[] = ["Fuel"];
  if (args.load_number?.trim()) parts.push(`load ${args.load_number.trim()}`);
  if (args.unit_number?.trim()) parts.push(`unit ${args.unit_number.trim()}`);
  if (args.vendor_name?.trim()) parts.push(args.vendor_name.trim());
  if (args.driver_name?.trim()) parts.push(args.driver_name.trim());
  if (args.fuel_card_code?.trim()) parts.push(args.fuel_card_code.trim());
  parts.push(`(${kind})`);
  // If we have nothing human beyond "Fuel (diesel)", still avoid UUID — card/rail word is enough.
  if (parts.length <= 2) parts.splice(1, 0, "purchase");
  return parts.join(" ").slice(0, 200);
}

async function markRelayPostedToGl(relayFuelTransactionId: string, operatingCompanyId: string): Promise<void> {
  await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    await client.query(
      `
        UPDATE integrations.relay_fuel_transactions
           SET posted_to_gl = true,
               updated_at = now()
         WHERE id = $1::uuid
           AND operating_company_id = $2::uuid
           AND posted_to_gl = false
      `,
      [relayFuelTransactionId, operatingCompanyId]
    );
  });
}

/**
 * Flag-gated TMS GL post for one canonical fuel transaction. Safe to call repeatedly (idempotent).
 * Must run AFTER the ingest transaction that wrote fuel.fuel_transactions has committed.
 */
export async function maybePostFuelExpenseFromCanonicalTxn(
  candidate: FuelTxnGlPostCandidate
): Promise<MaybePostFuelTxnResult> {
  const amountCents = Math.round(Number(candidate.amount_cents ?? 0));
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return { status: "skipped_zero_amount" };
  }

  const actorUserId = (candidate.actor_user_id?.trim() || SYSTEM_ACTOR_USER_ID).toLowerCase();

  let flagOn = false;
  try {
    flagOn = await withLuciaBypass(async (client: DbClient) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [
        candidate.operating_company_id,
      ]);
      return isEnabled(client, FUEL_EXPENSE_GL_POSTING_FLAG_KEY, {
        operating_company_id: candidate.operating_company_id,
        user_uuid: actorUserId,
      });
    });
  } catch (err) {
    return { status: "error", message: `flag_check_failed:${String((err as Error)?.message ?? err)}` };
  }

  if (!flagOn) return { status: "skipped_flag_off" };

  try {
    const postingPath = resolvePostingPath(candidate);
    // RANK2-FUEL-JE-CLASS — loaded unconditionally (not just for the company_direct credit
    // preference below): the class dimension applies to a driver_advance-path JE too.
    const txnSignals = await withLuciaBypass(async (client: DbClient) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [
        candidate.operating_company_id,
      ]);
      return loadFuelTxnCreditSignals(client, candidate.operating_company_id, candidate.fuel_transaction_id);
    }).catch(() => null);
    const companyDirectCredit =
      postingPath === "company_direct" ? resolveCompanyDirectCreditPreference(candidate, txnSignals) : undefined;

    const posting = await postFuelExpenseFromEvent({
      operating_company_id: candidate.operating_company_id,
      actor_user_id: actorUserId,
      fuel_event_id: candidate.fuel_transaction_id,
      fuel_kind: mapFuelTypeToPostingKind(candidate.fuel_type),
      posted_at: candidate.transaction_at,
      amount_cents: amountCents,
      posting_path: postingPath,
      driver_id: candidate.driver_id ?? null,
      unit_id: txnSignals?.unit_id ?? null,
      trailer_id: txnSignals?.trailer_id ?? null,
      ifta_state: candidate.location_state ?? null,
      ifta_gallons: candidate.gallons ?? null,
      company_direct_credit: companyDirectCredit,
      // E14.2 — never embed the fuel_transaction UUID as the only identity in the JE memo.
      memo: buildFuelTxnJeMemo({
        fuel_type: candidate.fuel_type,
        load_number: txnSignals?.load_number,
        unit_number: txnSignals?.unit_number,
        vendor_name: txnSignals?.vendor_name,
        driver_name: txnSignals?.driver_name,
        fuel_card_code: txnSignals?.fuel_card_code,
      }),
    });

    if (candidate.relay_fuel_transaction_id && (posting.result === "posted" || posting.result === "already_posted")) {
      await markRelayPostedToGl(candidate.relay_fuel_transaction_id, candidate.operating_company_id).catch(() => {
        // Non-fatal — JE already exists; posted_to_gl is a staging convenience flag.
      });
    }

    return {
      status: posting.result === "already_posted" ? "already_posted" : "posted",
      posting,
    };
  } catch (err) {
    return { status: "error", message: String((err as Error)?.message ?? err) };
  }
}

/** Best-effort flush after ingest commit — never throws; never blocks ingest success. */
export async function flushFuelGlPostsAfterCommit(
  candidates: FuelTxnGlPostCandidate[],
  log?: { warn?: (obj: unknown, msg?: string) => void; info?: (obj: unknown, msg?: string) => void }
): Promise<{ attempted: number; posted: number; skipped_flag_off: number; errors: number }> {
  const stats = { attempted: 0, posted: 0, skipped_flag_off: 0, errors: 0 };
  for (const candidate of candidates) {
    if (!candidate.fuel_transaction_id) continue;
    stats.attempted += 1;
    const result = await maybePostFuelExpenseFromCanonicalTxn(candidate);
    if (result.status === "posted" || result.status === "already_posted") {
      stats.posted += 1;
    } else if (result.status === "skipped_flag_off") {
      stats.skipped_flag_off += 1;
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
