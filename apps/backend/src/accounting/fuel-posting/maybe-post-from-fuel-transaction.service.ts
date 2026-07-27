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

/**
 * FUEL-08 — company_direct credit preference from the REAL payment method.
 * Fleet/fuel card (and Relay card-settled fuel) → AP / fuel-card clearing (`ap`).
 * True cash / undeposited → `cash`. Never hardcode cash for card rows.
 */
export function resolveCompanyDirectCreditPreference(
  candidate: FuelTxnGlPostCandidate,
  txnSignals?: { fuel_card_id?: string | null; notes?: string | null; source?: string | null } | null
): CompanyDirectCredit {
  if (candidate.company_direct_credit === "ap" || candidate.company_direct_credit === "cash") {
    return candidate.company_direct_credit;
  }
  if (candidate.fuel_card_id || candidate.has_fuel_card) return "ap";
  if (txnSignals?.fuel_card_id) return "ap";
  // Relay fleet-card settle (not cash_advance) — always card/AP, never undeposited cash.
  if (candidate.relay_fuel_transaction_id) return "ap";
  const notes = (txnSignals?.notes ?? "").toLowerCase();
  if (notes.includes("card=") || notes.includes("relay_bridge=1") || notes.includes("relay_txn=")) {
    return "ap";
  }
  const source = (txnSignals?.source ?? "").toLowerCase();
  // CSV/fleet imports without an explicit cash stamp are card-settled in this operation.
  if (source === "import") return "ap";
  return "cash";
}

async function loadFuelTxnCreditSignals(
  client: DbClient,
  operatingCompanyId: string,
  fuelTransactionId: string
): Promise<{ fuel_card_id: string | null; notes: string | null; source: string | null }> {
  const res = await client.query<{ fuel_card_id: string | null; notes: string | null; source: string | null }>(
    `
      SELECT fuel_card_id::text AS fuel_card_id,
             notes,
             source::text AS source
        FROM fuel.fuel_transactions
       WHERE id = $1::uuid
         AND operating_company_id = $2::uuid
       LIMIT 1
    `,
    [fuelTransactionId, operatingCompanyId]
  );
  const row = res.rows[0];
  return {
    fuel_card_id: row?.fuel_card_id ?? null,
    notes: row?.notes ?? null,
    source: row?.source ?? null,
  };
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
    let companyDirectCredit: CompanyDirectCredit | undefined;
    if (postingPath === "company_direct") {
      const txnSignals = await withLuciaBypass(async (client: DbClient) => {
        await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [
          candidate.operating_company_id,
        ]);
        return loadFuelTxnCreditSignals(client, candidate.operating_company_id, candidate.fuel_transaction_id);
      }).catch(() => null);
      companyDirectCredit = resolveCompanyDirectCreditPreference(candidate, txnSignals);
    }

    const posting = await postFuelExpenseFromEvent({
      operating_company_id: candidate.operating_company_id,
      actor_user_id: actorUserId,
      fuel_event_id: candidate.fuel_transaction_id,
      fuel_kind: mapFuelTypeToPostingKind(candidate.fuel_type),
      posted_at: candidate.transaction_at,
      amount_cents: amountCents,
      posting_path: postingPath,
      driver_id: candidate.driver_id ?? null,
      ifta_state: candidate.location_state ?? null,
      ifta_gallons: candidate.gallons ?? null,
      company_direct_credit: companyDirectCredit,
      memo: `Fuel txn ${candidate.fuel_transaction_id}`,
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
