#!/usr/bin/env node
/**
 * verify-relay-fill-driver-equals-load-driver (step 18791 — CC-2 443.341 RC6)
 *
 * Invariant: every Relay fill that is linked to a load via fuel.fuel_transactions.load_id
 * must have a resolved driver (matched_driver_id IS NOT NULL on the relay row, driver_id IS
 * NOT NULL on the canonical fuel row). A fill tied to a load with no driver attribution means
 * settlement costs are mis-attributed. Ceiling = 0 after AUTH-458 backfill.
 *
 * ADVISORY until AUTH-458 backfill runs (Row 105 RC6 code wires the forward path).
 */
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

export const REQUIRES_LIVE_DB = "counts Relay fill/driver pairs; always advisory until AUTH-458 backfill";
const LABEL = "verify-relay-fill-driver-equals-load-driver";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

// --selftest (lib/guard-selftest.mjs live-guard contract, Devin build order 2026-10-05): this guard's inputs are rows on
// Neon, so it cannot be fixture-tested. One case MUST pass (live check green, or the canonical no-credential refusal) and
// one MUST fail (dead credential — a live guard that cannot look must refuse, never report green).
if (process.argv.includes("--selftest")) {
  const { runGuard, reportSelftest, statusOf, outputOf, DEAD_DB_ENV } = await import("./lib/guard-selftest.mjs");
  const { fileURLToPath: toPath } = await import("node:url");
  const me = toPath(import.meta.url);
  const real = runGuard(me);
  const noDb = runGuard(me, { env: DEAD_DB_ENV });
  const refused = /DATABASE_URL (?:is )?(?:not set|unset|required)|credential/.test(outputOf(real));
  reportSelftest("verify-relay-fill-driver-equals-load-driver", [
    { name: "live check green, or canonically refuses with no credential", pass: statusOf(real) === 0 || refused, detail: statusOf(real) === 0 ? undefined : outputOf(real).slice(-300) },
    { name: "refuses on dead credential", pass: statusOf(noDb) !== 0, detail: statusOf(noDb) !== 0 ? undefined : outputOf(noDb).slice(-200) },
  ]);
}

const { client, pool } = await requireLiveDbOrExit({ label: LABEL });

try {
  await client.query(`SELECT set_config('app.bypass_rls','lucia',true)`);
  await client.query(`SELECT set_config('app.operating_company_id','${USMCA}',true)`);

  // Relay fills linked to a load but with no driver on either the relay row or the canonical fuel row.
  const res = await client.query(
    `SELECT r.id::text AS relay_id,
            r.transaction_id,
            r.matched_unit_id::text AS unit_id,
            ft.load_id::text AS load_id,
            ft.driver_id::text AS fuel_driver_id,
            r.matched_driver_id::text AS relay_driver_id
       FROM integrations.relay_fuel_transactions r
       JOIN fuel.fuel_transactions ft
         ON ft.relay_fuel_transaction_id = r.id
        AND ft.operating_company_id = r.operating_company_id
        AND ft.voided_at IS NULL
        AND ft.archived_at IS NULL
      WHERE r.operating_company_id = $1::uuid
        AND r.voided_at IS NULL
        AND ft.load_id IS NOT NULL
        AND (r.matched_driver_id IS NULL OR ft.driver_id IS NULL)
      ORDER BY r.relay_created_at DESC NULLS LAST
      LIMIT 200`,
    [USMCA]
  );

  if (res.rows.length === 0) {
    console.log(`${LABEL}: PASS — 0 Relay fills tied to a load without driver attribution`);
    client.release();
    await pool.end();
    process.exit(0);
  }

  // ADVISORY (exit 0): pre-existing violations cleared by ops backfill AUTH-458.
  // Row 105 RC6 code wires the forward path; backfill clears the historical gap.
  console.warn(`${LABEL}: ADVISORY — ${res.rows.length} Relay fill(s) linked to a load but missing driver attribution (pre-existing; cleared by AUTH-458 backfill):`);
  for (const row of res.rows) {
    console.warn(
      `  relay ${row.transaction_id} (${row.relay_id}) unit=${row.unit_id} load=${row.load_id} relay_driver=${row.relay_driver_id ?? 'NULL'} fuel_driver=${row.fuel_driver_id ?? 'NULL'}`
    );
  }
  client.release();
  await pool.end();
  process.exit(0);
} catch (err) {
  console.error(`${LABEL}: FAIL — unexpected error: ${err}`);
  try { client.release(); } catch (_) {}
  try { await pool.end(); } catch (_) {}
  process.exit(1);
}
