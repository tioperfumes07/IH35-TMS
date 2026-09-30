/**
 * AUTH-148 (same authorization, second small backfill found while closing out the first): 3 more
 * live USMCA expenses with expense_number=NULL, discovered by the live guard
 * (scripts/verify-expense-number-never-null.mjs) still failing after the 12-row AUTH-148 backfill
 * landed. These 3 are UNRELATED to the AUTH-141/DEFECT-ITEM-4 population (different created_at,
 * 2026-09-28T05:15:05.187Z, memo "R145 SETTL 5770 ... Fuel-DEF-Diesel Exhaust Fluid") and, critically,
 * all three have load_id = NULL -- genuinely load-less, so the load-scoped generateExpenseNumber
 * does not apply. Per apps/backend/src/accounting/display-id.ts's own header comment: "Load-scoped
 * numbers stay `L-<load>-<seq>` via generateExpenseNumber; this series is EXP-YYYY-##### [via
 * nextExpenseDisplayId] so driverless / WO / Record Expense always have a visible Ref no." -- the
 * correct generator for these 3 is nextExpenseDisplayId, not generateExpenseNumber.
 *
 * Never a hand-built string -- calls the real sanctioned nextExpenseDisplayId
 * (apps/backend/src/accounting/display-id.ts) for each row.
 *
 * DRY_RUN=1 (default) prints the plan with zero writes. Idempotent: skips any id already numbered.
 * AUTHORIZATION: OWNER_AUTH_ID=AUTH-148 (same scope note extended -- both backfills are the same
 * "close the expense_number gap the guard reports" action, docs/bus/OWNER-AUTHORIZATIONS.md).
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { assertNotProduction, assertIsIntendedProduction } from "../lib/assert-not-production.mjs";

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
    console.error(`ROUND 133 P0: ${REQUIRED_AUTH_ID} rejected.`);
    process.exit(1);
  }
}

const USMCA_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";

const TARGET_EXPENSE_IDS = [
  "3a619d36-18eb-45e4-96f2-d7131daef498",
  "a7758a5d-5f1a-4df8-b056-459990b0e76b",
  "eef97d48-37a3-4622-a45f-8fbf600837fa",
];

async function main() {
  const { nextExpenseDisplayId } = await import("../../apps/backend/src/accounting/display-id.js");

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const results: Array<Record<string, unknown>> = [];

  const readClient = await pool.connect();
  await (process.env.OWNER_AUTH_ID ? assertIsIntendedProduction : assertNotProduction)(readClient, { label: "scripts/ops/2026-09-30-cc1-auth148b-backfill-3-loadless-expense-numbers.ts" });
  let rows: Array<{ id: string; expense_number: string | null; load_id: string | null; total_amount_cents: string; memo: string | null; status: string; created_at: string }>;
  try {
    await readClient.query("BEGIN");
    await readClient.query("RESET ROLE");
    await readClient.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    const res = await readClient.query(
      `SELECT id::text, expense_number, load_id::text, total_amount_cents::text, memo, status::text, created_at::text
         FROM accounting.expenses
        WHERE operating_company_id = $1::uuid AND id = ANY($2::uuid[])
        ORDER BY id`,
      [USMCA_ID, TARGET_EXPENSE_IDS]
    );
    rows = res.rows;
    await readClient.query("COMMIT");
  } finally {
    readClient.release();
  }

  if (rows.length !== TARGET_EXPENSE_IDS.length) {
    throw new Error(`Expected ${TARGET_EXPENSE_IDS.length} expenses, found ${rows.length} -- STOP`);
  }

  for (const row of rows) {
    const plan: Record<string, unknown> = { id: row.id, memo: row.memo, total_amount_cents: row.total_amount_cents, load_id: row.load_id };

    if (row.expense_number) {
      plan.status = `SKIP -- already numbered ${row.expense_number}`;
      results.push(plan);
      console.log(JSON.stringify(plan));
      continue;
    }
    if (row.load_id) {
      plan.status = "SKIP -- has a load_id, out of this script's scope (use generateExpenseNumber instead)";
      results.push(plan);
      console.log(JSON.stringify(plan));
      continue;
    }

    plan.status = DRY_RUN ? "DRY_RUN -- would number via nextExpenseDisplayId" : "NUMBERING";
    console.log(JSON.stringify(plan));
    if (DRY_RUN) {
      results.push(plan);
      continue;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("RESET ROLE");
      await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);

      const number = await nextExpenseDisplayId(client, USMCA_ID, new Date(row.created_at));

      const upd = await client.query(
        `UPDATE accounting.expenses SET expense_number = $2, updated_at = now()
          WHERE id = $1::uuid AND operating_company_id = $3::uuid AND expense_number IS NULL
          RETURNING id::text`,
        [row.id, number, USMCA_ID]
      );
      if (upd.rows.length !== 1) {
        throw new Error(`update did not affect exactly 1 row for ${row.id}`);
      }

      await client.query("COMMIT");
      plan.status = "NUMBERED";
      plan.expense_number = number;
      console.log(`  -> numbered ${row.id} = ${number}`);
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      plan.status = `FAILED -- ${err instanceof Error ? err.message : String(err)}`;
      console.error(`  -> ${plan.status}`);
    } finally {
      client.release();
    }
    results.push(plan);
  }

  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify(results, null, 2));
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
