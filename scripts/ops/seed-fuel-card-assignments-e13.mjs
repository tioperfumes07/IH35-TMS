#!/usr/bin/env node
// E13 (row 161) — seed fuel.fuel_card_assignments from Relay fill history.
// USMCA only. Derives card_last_digits from relay_driver_integration_id (last 4 digits).
// Each distinct (card, unit) pair becomes one assignment row with time range from
// first → last fill for that pair; overlaps resolved by setting effective_to of each
// prior period to (start of next period - 1 second); most-recent period: effective_to = NULL.
// Run with: node --env-file=/Users/jorgemunoz/.ih35-prod-verified.env scripts/ops/seed-fuel-card-assignments-e13.mjs
// Dry-run (default). Pass --apply to write.
import pg from "pg";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { execFileSync } from "node:child_process";

const APPLY = process.argv.includes("--apply");
const USMCA_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const RELAY_CARD_TYPE_ID = "7d165efc-d587-4462-af47-803d885637b2";

{
  const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const authId = process.env.OWNER_AUTH_ID;
  if (!authId) {
    console.error("OWNER_AUTH_ID required (E13 row 161 seed)");
    process.exit(1);
  }
  execFileSync("node", [resolve(ROOT, "scripts/verify-owner-authorization.mjs"), authId], { stdio: "inherit" });
}

const connStr = process.env.DATABASE_URL;
if (!connStr) { console.error("DATABASE_URL not set"); process.exit(1); }

const client = new pg.Client({ connectionString: connStr });
await client.connect();

// Bypass RLS for prod write (only needed on --apply; gate reader can't SET ROLE)
if (APPLY) {
  await client.query("SET LOCAL ROLE neondb_owner");
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");
  const bypassCheck = await client.query("SELECT identity.is_lucia_bypass() AS bypassed");
  console.log(`RLS bypass active: ${bypassCheck.rows[0].bypassed}`);
}

// Verify no existing assignments
const existing = await client.query(
  "SELECT COUNT(*) as cnt FROM fuel.fuel_card_assignments WHERE operating_company_id = $1",
  [USMCA_ID]
);
console.log(`Existing assignments: ${existing.rows[0].cnt}`);

// Build assignment rows from Relay fill history
const periodsResult = await client.query(`
  WITH card_unit_periods AS (
    SELECT
      relay_driver_integration_id AS integration_id,
      RIGHT(relay_driver_integration_id, 4) AS card_last4,
      matched_unit_id AS unit_id,
      MIN(relay_created_at) AS period_start,
      MAX(relay_created_at) AS period_end,
      COUNT(*) AS fills
    FROM integrations.relay_fuel_transactions
    WHERE operating_company_id = $1
      AND voided_at IS NULL
      AND matched_unit_id IS NOT NULL
      AND relay_driver_integration_id IS NOT NULL
      AND relay_driver_integration_id <> '0000000000000000'
    GROUP BY 1, 2, 3
  ),
  card_periods_ranked AS (
    SELECT *,
      ROW_NUMBER() OVER (PARTITION BY integration_id ORDER BY period_start) AS period_num,
      COUNT(*) OVER (PARTITION BY integration_id) AS total_periods,
      LEAD(period_start) OVER (PARTITION BY integration_id ORDER BY period_start) AS next_period_start
    FROM card_unit_periods
  )
  SELECT
    integration_id,
    card_last4,
    unit_id,
    period_start,
    period_end,
    fills,
    period_num,
    total_periods,
    -- effective_to: NULL if last period, else min(period_end+1day, next_period_start-1sec)
    CASE
      WHEN next_period_start IS NULL THEN NULL
      ELSE LEAST(period_end + INTERVAL '1 day', next_period_start - INTERVAL '1 second')
    END AS effective_to
  FROM card_periods_ranked
  ORDER BY integration_id, period_num
`, [USMCA_ID]);

console.log(`\nCard-unit assignment rows to insert: ${periodsResult.rows.length}`);

if (!APPLY) {
  console.log("\n--- DRY-RUN preview (first 10) ---");
  periodsResult.rows.slice(0, 10).forEach(r => {
    console.log(`  card ...${r.card_last4} | unit ${r.unit_id} | ${r.period_start.toISOString().slice(0,10)} → ${r.effective_to ? r.effective_to.toISOString().slice(0,10) : "open"} | ${r.fills} fills`);
  });
  console.log("\nRun with --apply to insert.");
  await client.end();
  process.exit(0);
}

// INSERT inside a transaction
await client.query("BEGIN");
let inserted = 0;
let skipped = 0;
for (const row of periodsResult.rows) {
  try {
    await client.query(`
      INSERT INTO fuel.fuel_card_assignments
        (operating_company_id, fuel_card_type_id, card_last_digits, unit_id,
         effective_from, effective_to, notes, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())
      ON CONFLICT DO NOTHING
    `, [
      USMCA_ID,
      RELAY_CARD_TYPE_ID,
      row.card_last4,
      row.unit_id,
      row.period_start,
      row.effective_to,
      `seeded E13 from Relay fill history (${row.fills} fills; period ${row.period_num} of ${row.total_periods})`
    ]);
    inserted++;
  } catch (err) {
    console.warn(`  SKIP card ...${row.card_last4} unit ${row.unit_id}: ${err.message}`);
    skipped++;
  }
}

// Verify
const afterCount = await client.query(
  "SELECT COUNT(*) as cnt FROM fuel.fuel_card_assignments WHERE operating_company_id = $1",
  [USMCA_ID]
);
console.log(`\nInserted: ${inserted} | Skipped: ${skipped}`);
console.log(`fuel.fuel_card_assignments after: ${afterCount.rows[0].cnt}`);

if (skipped > 0) {
  console.error("Some rows skipped — rolling back");
  await client.query("ROLLBACK");
  process.exit(1);
}

await client.query("COMMIT");
console.log("COMMITTED. E13 DONE.");
await client.end();
