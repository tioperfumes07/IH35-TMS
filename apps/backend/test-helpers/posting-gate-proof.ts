/**
 * 443.101 — posting-gate PROOF tests (verify-no-posting-gate-on-empty-table).
 *
 * The owner laws of 2026-09-02 (no test / sample fixtures in USMCA) and 2026-10-04 (coders never feed data) forbid
 * "seed a labeled TEST row" in a live USMCA gated table. A gated table that is empty on prod is instead proven
 * alive by a real-Postgres test that drives its ENGINE WRITER on an isolated company. These helpers keep every such
 * proof honest:
 *   - fixtures are written on an isolated company (never TRANSP / TRK / USMCA), under the lucia bypass, as ih35_app;
 *   - the writer itself runs exactly as the app runs it — inside withCurrentUser (SET LOCAL ROLE ih35_app, RLS on) —
 *     and, where the writer takes the caller's client, the whole proof is ROLLED BACK by a sentinel throw, so the
 *     gated table never keeps a proof row.
 */
import pg from "pg";
import { buildPgClientConfig } from "../src/lib/pg-connection-options.js";
import { withCurrentUser } from "../src/auth/db.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "./refuse-production.js";

export async function connectFixtureClient(): Promise<pg.Client> {
  const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
  if (!cs) throw new Error("DATABASE_DIRECT_URL or DATABASE_URL is required for a posting-gate proof test");
  refuseProductionConnectionString(cs);
  const db = new pg.Client(buildPgClientConfig(cs));
  await db.connect();
  await db.query("SET ROLE ih35_app");
  await refuseProductionDatabase(db);
  return db;
}

/** Fixture writes for `companyId`, committed, under the lucia bypass + company GUC. */
export async function fixtureTxn<T>(db: pg.Client, companyId: string, fn: () => Promise<T>): Promise<T> {
  await db.query("BEGIN");
  await db.query("SET LOCAL app.bypass_rls = 'lucia'");
  await db.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
  try {
    const out = await fn();
    await db.query("COMMIT");
    return out;
  } catch (err) {
    await db.query("ROLLBACK").catch(() => {});
    throw err;
  }
}

class RolledBack extends Error {
  constructor(readonly value: unknown) {
    super("posting-gate proof rolled back");
  }
}

/**
 * Runs `fn` on the app's own scoped client (withCurrentUser — RLS enforced, company GUC set) and ROLLS IT BACK after
 * `fn` returns, handing back what `fn` returned. Nothing the writer wrote survives the proof.
 */
export async function inRolledBackAppTxn<T>(
  userId: string,
  companyId: string,
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  try {
    await withCurrentUser(userId, async (client) => {
      await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
      throw new RolledBack(await fn(client));
    });
  } catch (err) {
    if (err instanceof RolledBack) return err.value as T;
    throw err;
  }
  throw new Error("inRolledBackAppTxn: the proof transaction committed — it must always roll back");
}
