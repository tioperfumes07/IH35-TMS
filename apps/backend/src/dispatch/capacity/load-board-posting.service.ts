/**
 * LOAD-BOARD POSTING — output (B) of the capacity engine (owner 10-26: "a daily posting engine that will post the available
 * trucks on the dates it will be available"). One adapter interface; DAT and Truckstop implementations.
 *
 * A board is CONNECTED only when its API credentials are set in the environment. Without them the screen shows
 * "Not connected — needs <board> API credentials" (no silent no-op). The HTTP call layer of each board is written against
 * that board's partner API contract, which comes with the API account (DAT Capacity/"Truck Posting" API, Truckstop Truck
 * Posting API) — until the account exists the adapter refuses to post and says why, it never pretends.
 *
 * syncLoadBoardPostings computes what each connected board SHOULD show from the capacity engine (offerable units only) and
 * posts / updates / WITHDRAWS: a unit that got booked further out, turned its offer off, or lost its position is withdrawn.
 */
import { computeCapacity, type CapacityRow, type Queryable } from "./capacity.service.js";

export type LoadBoard = "dat" | "truckstop";
export const LOAD_BOARDS: readonly LoadBoard[] = ["dat", "truckstop"];

export type BoardPosting = { unit_id: string; origin_city: string; origin_state: string; available_at: string; equipment: string };

export interface LoadBoardPostingProvider {
  readonly board: LoadBoard;
  /** Create or replace the unit's posting; returns the board's posting id. */
  upsert(posting: BoardPosting, existingExternalId: string | null): Promise<{ externalId: string }>;
  withdraw(externalId: string): Promise<void>;
}

export type BoardStatus = { board: LoadBoard; connected: boolean; reason: string | null };

const REQUIRED_ENV: Readonly<Record<LoadBoard, readonly string[]>> = {
  dat: ["DAT_API_CLIENT_ID", "DAT_API_CLIENT_SECRET", "DAT_API_SERVICE_ACCOUNT"],
  truckstop: ["TRUCKSTOP_API_USERNAME", "TRUCKSTOP_API_PASSWORD", "TRUCKSTOP_API_INTEGRATION_ID"],
};
const LABEL: Readonly<Record<LoadBoard, string>> = { dat: "DAT", truckstop: "Truckstop" };

export function boardStatus(board: LoadBoard, env: NodeJS.ProcessEnv = process.env): BoardStatus {
  const missing = REQUIRED_ENV[board].filter((k) => !String(env[k] ?? "").trim());
  if (missing.length) return { board, connected: false, reason: `Not connected — needs ${LABEL[board]} API credentials (${missing.join(", ")})` };
  if (!providerFactories[board]) {
    return { board, connected: false, reason: `Not connected — ${LABEL[board]} credentials are set but the ${LABEL[board]} API client is not installed in this build` };
  }
  return { board, connected: true, reason: null };
}

/**
 * Board API clients, registered when written against the board's partner API contract. Empty today: neither DAT nor
 * Truckstop API access exists for USMCA, so both boards report "Not connected" with the exact reason.
 */
const providerFactories: Partial<Record<LoadBoard, () => LoadBoardPostingProvider>> = {};

export function registerLoadBoardProvider(board: LoadBoard, factory: () => LoadBoardPostingProvider): void {
  providerFactories[board] = factory;
}

/** Pure: the postings a board should hold now — one per offerable unit with a full position. */
export function desiredPostings(rows: CapacityRow[]): BoardPosting[] {
  return rows
    .filter((r) => r.offerable && r.available_city && r.available_state && r.available_at && r.equipment)
    .map((r) => ({
      unit_id: r.unit_id,
      origin_city: String(r.available_city),
      origin_state: String(r.available_state),
      available_at: String(r.available_at),
      equipment: String(r.equipment),
    }));
}

type ExistingPosting = { id: string; unit_id: string; external_posting_id: string | null; status: string;
  origin_city: string | null; origin_state: string | null; available_at: string | null; equipment: string | null };

/** Pure: what to do on one board — upsert changed/new, withdraw units no longer offerable. */
export function diffPostings(desired: BoardPosting[], existing: ExistingPosting[]) {
  const live = existing.filter((e) => e.status === "posted");
  const byUnit = new Map(live.map((e) => [e.unit_id, e]));
  const upserts = desired.filter((d) => {
    const e = byUnit.get(d.unit_id);
    return !e || e.origin_city !== d.origin_city || e.origin_state !== d.origin_state
      || (e.available_at ? new Date(e.available_at).getTime() : 0) !== new Date(d.available_at).getTime() || e.equipment !== d.equipment;
  });
  const want = new Set(desired.map((d) => d.unit_id));
  const withdraws = live.filter((e) => !want.has(e.unit_id));
  return { upserts, withdraws };
}

export async function syncLoadBoardPostings(client: Queryable, operatingCompanyId: string) {
  const statuses = LOAD_BOARDS.map((b) => boardStatus(b));
  const connected = statuses.filter((s) => s.connected);
  if (connected.length === 0) return { statuses, synced: [] as Array<{ board: LoadBoard; upserted: number; withdrawn: number; failed: number }> };
  const desired = desiredPostings(await computeCapacity(client, operatingCompanyId));
  const synced: Array<{ board: LoadBoard; upserted: number; withdrawn: number; failed: number }> = [];
  for (const s of connected) {
    const provider = providerFactories[s.board]!();
    const existing = (await client.query<ExistingPosting>(
      `SELECT id::text, unit_id::text, external_posting_id, status, origin_city, origin_state, available_at::text, equipment
         FROM dispatch.load_board_postings WHERE operating_company_id = $1::uuid AND board = $2`,
      [operatingCompanyId, s.board]
    )).rows;
    const { upserts, withdraws } = diffPostings(desired, existing);
    let upserted = 0, withdrawn = 0, failed = 0;
    for (const d of upserts) {
      const prior = existing.find((e) => e.unit_id === d.unit_id) ?? null;
      // One unit's failure must not poison the sync transaction: each write gets its own SAVEPOINT, and the catch
      // rolls back to it before recording the failure (a bare catch leaves the transaction aborted → 25P02).
      await client.query("SAVEPOINT lbp_item");
      try {
        const { externalId } = await provider.upsert(d, prior?.external_posting_id ?? null);
        await client.query(
          `INSERT INTO dispatch.load_board_postings
             (operating_company_id, unit_id, board, external_posting_id, origin_city, origin_state, available_at, equipment, status, last_error)
           VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7::timestamptz, $8, 'posted', NULL)
           ON CONFLICT (operating_company_id, unit_id, board) DO UPDATE SET external_posting_id = EXCLUDED.external_posting_id,
             origin_city = EXCLUDED.origin_city, origin_state = EXCLUDED.origin_state, available_at = EXCLUDED.available_at,
             equipment = EXCLUDED.equipment, status = 'posted', last_error = NULL, updated_at = now()`,
          [operatingCompanyId, d.unit_id, s.board, externalId, d.origin_city, d.origin_state, d.available_at, d.equipment]
        );
        upserted += 1;
        await client.query("RELEASE SAVEPOINT lbp_item");
      } catch (err) {
        await client.query("ROLLBACK TO SAVEPOINT lbp_item");
        failed += 1;
        await client.query(
          `INSERT INTO dispatch.load_board_postings (operating_company_id, unit_id, board, status, last_error)
           VALUES ($1::uuid, $2::uuid, $3, 'failed', $4)
           ON CONFLICT (operating_company_id, unit_id, board) DO UPDATE SET status = 'failed', last_error = EXCLUDED.last_error, updated_at = now()`,
          [operatingCompanyId, d.unit_id, s.board, String((err as Error).message ?? err).slice(0, 500)]
        );
      }
    }
    for (const e of withdraws) {
      await client.query("SAVEPOINT lbp_item");
      try {
        if (e.external_posting_id) await provider.withdraw(e.external_posting_id);
        await client.query(`UPDATE dispatch.load_board_postings SET status = 'withdrawn', updated_at = now() WHERE id = $1::uuid`, [e.id]);
        withdrawn += 1;
        await client.query("RELEASE SAVEPOINT lbp_item");
      } catch (err) {
        await client.query("ROLLBACK TO SAVEPOINT lbp_item");
        failed += 1;
        await client.query(`UPDATE dispatch.load_board_postings SET last_error = $2, updated_at = now() WHERE id = $1::uuid`,
          [e.id, String((err as Error).message ?? err).slice(0, 500)]);
      }
    }
    synced.push({ board: s.board, upserted, withdrawn, failed });
  }
  return { statuses, synced };
}
