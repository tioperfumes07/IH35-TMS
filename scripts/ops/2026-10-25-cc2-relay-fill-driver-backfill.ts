/**
 * RC6 443.341 — Relay fill driver backfill (CC-2 2026-10-25)
 *
 * Backfills matched_driver_id on integrations.relay_fuel_transactions + driver_id on
 * fuel.fuel_transactions for all USMCA Relay fills that still have no driver attribution.
 *
 * Resolution order (relay-fuel-driver-rematch.service.ts):
 *   1. integration_id match
 *   2. RC6 load-based fallback: unit + fill time → assigned_primary_driver_id
 *
 * Run:
 *   node --loader ts-node/esm scripts/ops/2026-10-25-cc2-relay-fill-driver-backfill.ts          # dry-run
 *   node --loader ts-node/esm scripts/ops/2026-10-25-cc2-relay-fill-driver-backfill.ts --apply  # AUTH-458 required
 *
 * This script requires verify-owner-authorization.mjs (AUTH-458 line) before --apply runs.
 */
import pg from "pg";
import { rematchRelayFuelDrivers } from "../../apps/backend/src/integrations/relay-payments/relay-fuel-driver-rematch.service.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const DRY_RUN = !process.argv.includes("--apply");

// AUTH check
if (!DRY_RUN) {
  const { execFileSync } = await import("node:child_process");
  try {
    execFileSync("node", ["scripts/verify-owner-authorization.mjs", "--auth", "AUTH-458"], { stdio: "inherit" });
  } catch {
    console.error("AUTH-458 not authorized. Re-run without --apply for dry-run.");
    process.exit(1);
  }
}

if (DRY_RUN) {
  // Dry-run: use gate-reader credential (same path as guards — access to integrations schema).
  const { resolveGateReadonlyDbUrl } = await import("../lib/gate-db-credential.mjs");
  const gateUrl = resolveGateReadonlyDbUrl() ?? process.env.DATABASE_URL;
  if (!gateUrl) {
    console.error("DRY-RUN: no database credential found. Set DATABASE_URL or configure gate credential.");
    process.exit(1);
  }
  const roPool = new pg.Pool({ connectionString: gateUrl, max: 1 });
  const roClient = await roPool.connect();
  try {
    await roClient.query(`SELECT set_config('app.bypass_rls','lucia',true)`);
    await roClient.query(`SELECT set_config('app.operating_company_id','${USMCA}',true)`);

    const before = await roClient.query<{ cnt: string }>(
      `SELECT count(*)::text AS cnt FROM integrations.relay_fuel_transactions
        WHERE matched_driver_id IS NULL AND operating_company_id = $1::uuid AND voided_at IS NULL`,
      [USMCA]
    );
    console.log(`DRY-RUN: ${before.rows[0].cnt} Relay fills have no driver attribution (USMCA)`);

    const withLoad = await roClient.query<{ cnt: string }>(
      `SELECT count(DISTINCT r.id)::text AS cnt
         FROM integrations.relay_fuel_transactions r
         JOIN fuel.fuel_transactions ft ON ft.relay_fuel_transaction_id = r.id AND ft.load_id IS NOT NULL
        WHERE r.operating_company_id = $1::uuid AND r.voided_at IS NULL AND r.matched_driver_id IS NULL`,
      [USMCA]
    );
    console.log(`DRY-RUN: ${withLoad.rows[0].cnt} of those are tied to a load (guard violations)`);
    console.log("Re-run with --apply under AUTH-458 to perform the backfill.");
  } finally {
    roClient.release();
    await roPool.end();
  }
  process.exit(0);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const client = await pool.connect();

try {
  await client.query("BEGIN");
  await client.query(`SET LOCAL app.bypass_rls = 'lucia'`);
  await client.query(`SET LOCAL app.operating_company_id = '${USMCA}'`);

  const result = await rematchRelayFuelDrivers(client as never, { operating_company_id: USMCA, limit: 10000 });
  await client.query("COMMIT");

  console.log("Relay fill driver backfill complete:");
  console.log(`  scanned=${result.scanned} matched=${result.matched}`);
  console.log(`  relay_updated=${result.relay_updated} fuel_updated=${result.fuel_updated}`);
  console.log(`  skipped=${result.skipped_ambiguous_or_unmatched}`);
  console.log("  unresolved_reasons:", result.unresolved_reasons);
  if (result.load_rematch) {
    console.log("  load_rematch:", result.load_rematch);
  }
} catch (err) {
  await client.query("ROLLBACK");
  client.release();
  await pool.end();
  console.error("Backfill failed:", err);
  process.exit(1);
}

client.release();
await pool.end();
