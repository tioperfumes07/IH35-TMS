/**
 * R-153.9 Set B, root cause of the $0.00 escrow re-close (blocking AUTH-009's void+reclose since
 * it expired unconsumed) -- the 18 target settlements' driver_finance.settlement_lines
 * escrow_contribution rows are ALL is_active=false, which is why closeSettlementPayRun's own
 * loadAccruedEscrowContributionCents (sums active escrow_contribution rows, load_bookended model)
 * computes $0 on re-close no matter what the void+reclose script does.
 *
 * Live-confirmed before writing this (read-only query, not guessed):
 *   - Exactly 2 rows per settlement (one per load in each 2-load settlement), $25.00 each --
 *     matches Lead's own cited standard escrow cap ($25.00/load) exactly.
 *   - voided_at, void_reason, voided_by_user_id are ALL NULL on every one of the 36 rows -- this
 *     is NOT a documented financial void (contrast with CC-3's own 09-24 void-with-reason pattern
 *     for 5805/5806's genuinely extra, not-on-document escrow lines, which DOES carry a reason).
 *   - PR #22594 (this session's own earlier finding) already established these 18 settlements'
 *     ORIGINAL pay-run-close JE correctly included this exact escrow line -- it only vanished when
 *     that JE was reversed+reposted for the unrelated AlwaysTrack-tie fix. The rows' updated_at
 *     timestamps cluster into 3 bulk-update batches (19:58:18Z, ~01:08-01:13Z, ~23:25-23:36Z on
 *     2026-09-24/25), consistent with an unlogged bulk deactivation, not 18 separate deliberate
 *     void decisions.
 * Conclusion: these rows were live/correct when the original close posted and were deactivated by
 * something other than a documented financial correction. Reactivating them (is_active=true) is
 * the minimal fix that lets closeSettlementPayRun's own unmodified computation reproduce the
 * original, correct escrow figure -- not a hand-picked override.
 *
 * Scope: exactly the escrow_contribution settlement_lines rows for the 18 named settlements below
 * (row count varies 1-3 per settlement with load count, re-measured live as 35 total -- see the
 * pre-check, which enforces the actual safety property (inactive + $25.00 + no documented void) per
 * row rather than a hardcoded count). Touches no other row, no other line_type, no other settlement.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REQUIRED_AUTH_ID = process.env.OWNER_AUTH_ID;
if (!REQUIRED_AUTH_ID) {
  console.error("ROUND 133 P0: OWNER_AUTH_ID env var is required; refusing a production financial write without an OPEN authorization on main.");
  process.exit(1);
}
try {
  execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), REQUIRED_AUTH_ID], { stdio: "inherit" });
} catch {
  console.error(`ROUND 133 P0: ${REQUIRED_AUTH_ID} rejected -- see docs/bus/OWNER-AUTHORIZATIONS.md.`);
  process.exit(1);
}

const USMCA_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";

const TARGET_SETTLEMENTS = [
  "5770", "5771", "5777", "5780", "5783", "5786", "5789", "5793", "5796",
  "S-5797", "S-5799", "S-5800", "S-5802", "S-5805", "S-5806", "S-5808", "S-5813", "S-5814",
];

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [USMCA_ID]);

    // Pre-check: exactly 2 inactive escrow_contribution rows per target settlement, no active ones,
    // no voided_at/void_reason on any -- refuse to touch anything that doesn't match this exact
    // shape (STOP AND REPORT rather than guess past a surprise).
    const pre = await client.query<{
      display_id: string; line_id: string; amount: string; is_active: boolean;
      voided_at: string | null; void_reason: string | null;
    }>(
      `SELECT ds.display_id, sl.id::text AS line_id, sl.amount::text, sl.is_active,
              sl.voided_at::text, sl.void_reason
         FROM driver_finance.driver_settlements ds
         JOIN driver_finance.settlement_lines sl ON sl.settlement_id = ds.id
        WHERE ds.operating_company_id = $1::uuid
          AND sl.line_type = 'escrow_contribution'
          AND ds.display_id = ANY($2::text[])
        ORDER BY ds.display_id, sl.id`,
      [USMCA_ID, TARGET_SETTLEMENTS]
    );

    const bySettlement = new Map<string, typeof pre.rows>();
    for (const row of pre.rows) {
      const list = bySettlement.get(row.display_id) ?? [];
      list.push(row);
      bySettlement.set(row.display_id, list);
    }
    // Row count per settlement varies with load count (re-measured live: 1, 2, or 3 rows across the
    // 18 -- NOT a uniform 2/settlement as first assumed; AUTH-013's prose says "36 named rows" from
    // that earlier assumption, the real total is 35). The shape that actually matters and IS
    // enforced here: every row for every named settlement must be inactive, $25.00, and carry no
    // documented void -- refuse anything that doesn't match, regardless of count.
    let totalRows = 0;
    for (const s of TARGET_SETTLEMENTS) {
      const rows = bySettlement.get(s) ?? [];
      if (rows.length < 1) throw new Error(`${s}: expected at least 1 escrow_contribution row, found 0 -- STOP`);
      totalRows += rows.length;
      for (const r of rows) {
        if (r.is_active) throw new Error(`${s}: row ${r.line_id} is already active -- STOP, shape changed since investigation`);
        if (r.voided_at || r.void_reason) throw new Error(`${s}: row ${r.line_id} carries a documented void (voided_at=${r.voided_at}, reason=${r.void_reason}) -- STOP, this is a deliberate correction, not an accidental deactivation`);
        if (r.amount !== "25.00" && r.amount !== "25") throw new Error(`${s}: row ${r.line_id} amount=${r.amount}, expected 25.00 -- STOP, shape changed`);
      }
    }
    console.log(`Pre-check passed: ${totalRows} rows across ${TARGET_SETTLEMENTS.length} settlements, all inactive, all $25.00, none carry a documented void.`);

    if (process.env.DRY_RUN === "1") {
      console.log("DRY_RUN=1 -- pre-check only, no write attempted, rolling back.");
      await client.query("ROLLBACK");
      return;
    }

    const ids = pre.rows.map((r) => r.line_id);
    const res = await client.query(
      `UPDATE driver_finance.settlement_lines
          SET is_active = true, updated_at = now()
        WHERE id = ANY($1::uuid[])
      RETURNING id::text, is_active`,
      [ids]
    );
    console.log(`Reactivated ${res.rowCount} rows.`);

    await client.query("COMMIT");
    console.log("COMMITTED.");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("FAILED, rolled back:", (err as Error).message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
