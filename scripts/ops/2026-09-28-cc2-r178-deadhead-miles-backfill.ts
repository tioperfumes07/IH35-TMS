#!/usr/bin/env -S npx tsx
/**
 * ROUND 178/182 — mdata.loads carries TWO parallel deadhead-mile columns that nothing syncs:
 * miles_deadhead (the column resolveDriverBasePayCents() actually reads to price the empty leg)
 * and deadhead_miles_to_pickup (Round 174's Google-Routes deadhead-to-pickup optimizer output).
 * On the 15 current unbilled USMCA loads, miles_deadhead is NULL on every single one, while
 * deadhead_miles_to_pickup is populated on exactly 3 (13629=114, 13635=104, 13637=113) — a real,
 * measured, non-fabricated deadhead distance the driver-pay engine can never see through this
 * entry point. The other 12 loads have BOTH columns NULL — genuinely unknown deadhead (first-leg,
 * from wherever the truck last was), NEVER coerced to 0 here or anywhere downstream.
 *
 * This is a narrow, targeted sync: only rows where miles_deadhead IS NULL AND
 * deadhead_miles_to_pickup IS NOT NULL, scoped to USMCA, scoped to load_number IN the named set.
 * Not a blanket COALESCE, not a schema merge — miles_deadhead stays the one column the engine
 * reads; this just carries forward the one real number that already exists for these 3 loads.
 *
 * Run: DATABASE_URL=<prod> npx tsx scripts/ops/2026-09-28-cc2-r178-deadhead-miles-backfill.ts [--apply]
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const TARGET_LOAD_NUMBERS = ["13629", "13635", "13637"];
const APPLY = process.argv.includes("--apply");
// AUTH-114 (docs/bus/OWNER-AUTHORIZATIONS.md) authorized this script's one-time run, already
// executed and closed 2026-09-28. Added retroactively (ROUND 133 P0) so a bare --apply re-run
// correctly refuses now that AUTH-114 is closed, rather than silently re-running unauthorized.
const AUTH_ID = "AUTH-114";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");
  if (APPLY) {
    try {
      execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), AUTH_ID], { stdio: "inherit" });
    } catch {
      console.error(`ROUND 133 P0: ${AUTH_ID} rejected by verify-owner-authorization.mjs -- see docs/bus/OWNER-AUTHORIZATIONS.md.`);
      process.exit(1);
    }
  }
  const pool = new pg.Pool({ connectionString: url, max: 2 });
  const client = await pool.connect();
  try {
    await client.query(`SELECT set_config('app.bypass_rls','lucia',true)`);

    const before = await client.query<{
      load_number: string;
      miles_deadhead: string | null;
      deadhead_miles_to_pickup: string | null;
    }>(
      `SELECT load_number, miles_deadhead::text, deadhead_miles_to_pickup::text
         FROM mdata.loads
        WHERE operating_company_id = $1::uuid
          AND load_number = ANY($2::text[])
        ORDER BY load_number`,
      [USMCA, TARGET_LOAD_NUMBERS]
    );
    console.log("BEFORE:", JSON.stringify(before.rows, null, 2));

    const eligible = before.rows.filter(
      (r) => r.miles_deadhead === null && r.deadhead_miles_to_pickup !== null
    );
    console.log(`Eligible for backfill: ${eligible.length} of ${before.rows.length}`);

    if (!APPLY) {
      console.log("DRY RUN — pass --apply to write.");
      return;
    }

    const res = await client.query(
      `UPDATE mdata.loads
          SET miles_deadhead = deadhead_miles_to_pickup,
              updated_at = now()
        WHERE operating_company_id = $1::uuid
          AND load_number = ANY($2::text[])
          AND miles_deadhead IS NULL
          AND deadhead_miles_to_pickup IS NOT NULL
        RETURNING load_number`,
      [USMCA, TARGET_LOAD_NUMBERS]
    );
    console.log(`Updated ${res.rowCount} row(s):`, res.rows.map((r) => r.load_number));

    const after = await client.query<{
      load_number: string;
      miles_deadhead: string | null;
      deadhead_miles_to_pickup: string | null;
    }>(
      `SELECT load_number, miles_deadhead::text, deadhead_miles_to_pickup::text
         FROM mdata.loads
        WHERE operating_company_id = $1::uuid
          AND load_number = ANY($2::text[])
        ORDER BY load_number`,
      [USMCA, TARGET_LOAD_NUMBERS]
    );
    console.log("AFTER:", JSON.stringify(after.rows, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
