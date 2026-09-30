/**
 * AUTH-148: backfill expense_number for 12 expenses left NULL by the AUTH-141 void+recreate
 * (scripts/ops/2026-09-30-cc1-item4-loves-ap-to-bank-reclass.ts, DEFECT ITEM 4 -- LOVES vendor
 * AP-to-Bank reclass, all created in ONE transaction at 2026-09-30T03:02:02.569Z).
 *
 * ROOT CAUSE, confirmed by reading that script (already merged, a one-shot repair against a fixed
 * EXPENSE_IDS list -- not re-edited here per this repo's "never rewrite an executed one-shot" norm):
 * its recreate INSERT (line ~158) reads `o.expense_number` from the original row but never includes
 * `expense_number` in its own INSERT column list, so every recreated row defaults to NULL. The
 * 09-13 load-to-cash-chain law -- "all N historical expenses have an expense_number beginning with
 * that load's load_number; any refactor weakening this is a regression" -- is enforced live by the
 * EXISTING guard scripts/verify-expense-number-never-null.mjs (its live-DB check queries exactly
 * `expense_number IS NULL AND status <> 'void'`, USMCA-scoped) -- that guard already covers this
 * class of defect; no new guard is added here.
 *
 * THE FIX: use the SAME sanctioned generator every real expense-creation path uses --
 * generateExpenseNumber (apps/backend/src/expense-attribution/expense-number.ts) -- never a
 * hand-built string. It is load-scoped and collision-safe (R-178: skips any number already taken),
 * so calling it against these 12 live rows (all of which already have a real load_id) produces the
 * exact same series shape ("<load_number>", "<load_number>-1", "<load_number>-2", ...) a normal
 * mint would have produced, continuing from whatever sequence state exists per load today.
 *
 * Verified live before writing this: all 12 rows, exact ids/loads/amounts, sum to $1,551.14 across
 * loads 13609, 13610, 13612, 13614 (x3), 13617 (x2, one is $1,287.35), 13619 -- matches the Lead's
 * own figures exactly.
 *
 * Idempotent: skips any target id that already has a non-null expense_number.
 * DRY_RUN=1 (default) prints the plan with zero writes.
 *
 * AUTHORIZATION: OWNER_AUTH_ID=AUTH-148, docs/bus/OWNER-AUTHORIZATIONS.md.
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
    console.error("ROUND 133 P0: OWNER_AUTH_ID env var is required for a real write; refusing a production financial write without an OPEN authorization on main.");
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

const TARGET_EXPENSE_IDS = [
  "47fc543c-90aa-454d-a26d-6fc32576fa2d",
  "5d4d872d-4757-4d5d-bc48-d226016ea972",
  "a7f091ce-c75e-46fd-b4e7-5a351147227b",
  "ced40054-ab32-4bc3-8aa6-766bf4ccd951",
  "3492c10b-2101-4d9b-832b-73c032cf9dad",
  "9a2632c7-25aa-4c22-9fde-d933eb6e1508",
  "1dd54fc2-877e-4da2-8aff-e84319693377",
  "615ba771-3c59-42c9-a083-fd22eb8bd592",
  "f158a883-81b4-4b89-81b3-e048ec903d11",
  "8e88475e-404c-4c1b-9c0d-9bd42816e285",
  "4102568a-1693-453b-b490-ecb2a8861e57",
  "36274438-8cb2-4242-8300-a0b7ef3eb742",
];

async function main() {
  const { generateExpenseNumber } = await import("../../apps/backend/src/expense-attribution/expense-number.js");

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const results: Array<Record<string, unknown>> = [];

  const readClient = await pool.connect();
  await (process.env.OWNER_AUTH_ID ? assertIsIntendedProduction : assertNotProduction)(readClient, { label: "scripts/ops/2026-09-30-cc1-auth148-backfill-12-expense-numbers.ts" });
  let rows: Array<{ id: string; expense_number: string | null; load_id: string | null; total_amount_cents: string; memo: string | null; status: string }>;
  try {
    await readClient.query("BEGIN");
    await readClient.query("RESET ROLE");
    await readClient.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    const res = await readClient.query(
      `SELECT id::text, expense_number, load_id::text, total_amount_cents::text, memo, status::text
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

  const sumCents = rows.reduce((acc, r) => acc + Number(r.total_amount_cents), 0);
  if (sumCents !== 155114) {
    throw new Error(`Expected sum 155114 cents ($1,551.14), got ${sumCents} -- STOP, data has drifted since this script was written`);
  }

  for (const row of rows) {
    const plan: Record<string, unknown> = { id: row.id, memo: row.memo, total_amount_cents: row.total_amount_cents, load_id: row.load_id };

    if (row.expense_number) {
      plan.status = `SKIP -- already numbered ${row.expense_number}`;
      results.push(plan);
      console.log(JSON.stringify(plan));
      continue;
    }
    if (row.status === "void") {
      plan.status = "SKIP -- voided, guard does not require a number on a voided row";
      results.push(plan);
      console.log(JSON.stringify(plan));
      continue;
    }
    if (!row.load_id) {
      plan.status = "SKIP -- no load_id, out of this script's scope (would need nextExpenseDisplayId instead)";
      results.push(plan);
      console.log(JSON.stringify(plan));
      continue;
    }

    plan.status = DRY_RUN ? "DRY_RUN -- would number via generateExpenseNumber" : "NUMBERING";
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

      const { number } = await generateExpenseNumber(client, row.load_id, USMCA_ID);

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
