/**
 * ROUND 290.1 — close the fuel-to-expense bridge gap for the 34 fuel_transactions rows
 * (USMCA, operating_company_id 5c854333-6ea5-4faa-af31-67cb272fef80) that have NO live linked
 * accounting.expenses row. This is a pure backfill through the EXISTING sanctioned bridge
 * function `createExpenseFromFuelTransaction` (apps/backend/src/fuel/fuel-expense-document.service.ts)
 * -- no new GL math, no raw INSERT into accounting.expenses/journal_entries.
 *
 * WHO THESE 34 ARE (measured live 2026-09-30): all `source='import'`, all `created_at` in the
 * 2026-09-24/25 window, all carry a real `load_id`, most are small line-haul-adjacent fuel-card
 * amounts ($3-$60), one is $0.00. These were inserted directly into fuel.fuel_transactions by an
 * import/backfill path that never called the bridge function -- this script is that missing call,
 * applied after the fact. It does not invent any fuel purchase; every row already exists.
 *
 * IDEMPOTENT: createExpenseFromFuelTransaction checks `source_fuel_transaction_id` before writing,
 * so running this twice produces the same 34 documents, not 68.
 *
 * DRY_RUN=1 (default) prints the plan and zero writes. A real run needs OWNER_AUTH_ID per ROUND 133
 * P0 law, verified via scripts/verify-owner-authorization.mjs from the repo root.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REQUIRED_AUTH_ID = process.env.OWNER_AUTH_ID;
const DRY_RUN = process.env.DRY_RUN === "1";

if (!DRY_RUN) {
  if (!REQUIRED_AUTH_ID) {
    console.error("ROUND 133 P0: OWNER_AUTH_ID env var is required for a real write.");
    process.exit(1);
  }
  try {
    execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), REQUIRED_AUTH_ID], { stdio: "inherit" });
  } catch {
    console.error(`ROUND 133 P0: ${REQUIRED_AUTH_ID} rejected -- see docs/bus/OWNER-AUTHORIZATIONS.md.`);
    process.exit(1);
  }
}

const USMCA_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";

async function main() {
  const { createExpenseFromFuelTransaction } = await import(
    "../../apps/backend/src/fuel/fuel-expense-document.service.js"
  );

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

  const readClient = await pool.connect();
  let rows: Array<{ id: string }>;
  try {
    await readClient.query("BEGIN");
    await readClient.query("RESET ROLE");
    await readClient.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    const res = await readClient.query<{ id: string }>(
      `SELECT ft.id::text
         FROM fuel.fuel_transactions ft
        WHERE ft.operating_company_id = $1::uuid
          AND ft.voided_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM accounting.expenses e
             WHERE e.source_fuel_transaction_id = ft.id AND e.voided_at IS NULL
          )
        ORDER BY ft.created_at`,
      [USMCA_ID]
    );
    rows = res.rows;
    await readClient.query("COMMIT");
  } finally {
    readClient.release();
  }

  console.log(`Found ${rows.length} fuel_transactions with no live linked expense.`);

  const results: Array<Record<string, unknown>> = [];
  for (const row of rows) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("RESET ROLE");
      await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [USMCA_ID]);

      const r = await createExpenseFromFuelTransaction(client, {
        operating_company_id: USMCA_ID,
        fuel_transaction_id: row.id,
        requesting_user_uuid: null,
        dry_run: DRY_RUN,
      });

      if (DRY_RUN) {
        await client.query("ROLLBACK");
      } else {
        await client.query("COMMIT");
      }
      results.push({ fuel_transaction_id: row.id, outcome: r.outcome, detail: r });
      console.log(JSON.stringify({ fuel_transaction_id: row.id, outcome: r.outcome, detail: r }));
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      const detail = err instanceof Error ? err.message : String(err);
      results.push({ fuel_transaction_id: row.id, outcome: "error", detail });
      console.error(JSON.stringify({ fuel_transaction_id: row.id, outcome: "error", detail }));
    } finally {
      client.release();
    }
  }

  console.log("\n=== SUMMARY ===");
  const byOutcome = new Map<string, number>();
  for (const r of results) {
    const key = String(r.outcome);
    byOutcome.set(key, (byOutcome.get(key) ?? 0) + 1);
  }
  console.log(JSON.stringify(Object.fromEntries(byOutcome), null, 2));
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
