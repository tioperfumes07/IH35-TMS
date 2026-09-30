/**
 * AUTH-175: fix 3 expense_number values on load 13503 that violate the owner law "expense_number
 * must start with its load's load_number" -- flagged live by CC-3, blocking verify-load-to-cash-
 * chain (LINK 3 check) for every seat's push.
 *
 * ROOT CAUSE: EXP-2026-00544/00545/00546 (created 2026-09-30T06:23:04-16Z, during this session's
 * document-integrity sweep -- Item 3, backfilling load_id from a same-settlement sibling) were
 * numbered via the LOAD-LESS generator (nextExpenseDisplayId, display-id.ts) instead of the real
 * load-scoped generator (generateExpenseNumber, expense-attribution/expense-number.ts) after
 * load_id was set to load 13503's real id. Metadata-only fix: no GL, amount, or status change --
 * these are simply renumbered via the SAME real generator every other load-scoped expense uses,
 * continuing load 13503's own sequence (currently at seq 11 / "13503-10") to seq 12/13/14.
 *
 * USAGE
 *   DRY_RUN=1 DATABASE_URL=<prod> npx tsx scripts/ops/2026-09-30-cc1-auth175-fix-13503-expense-numbers.ts
 *   OWNER_AUTH_ID=AUTH-175 DATABASE_URL=<prod> npx tsx scripts/ops/2026-09-30-cc1-auth175-fix-13503-expense-numbers.ts
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { assertIsIntendedProduction } from "../lib/assert-not-production.mjs";

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
const LOAD_13503_ID = "2c2d9ae7-386d-4ede-9c8f-888bce2896d7";
const TARGET_IDS = [
  "1c08aa97-0bde-4a02-a01c-18f75d4d1a3d", // EXP-2026-00544
  "f267f1f1-12cc-48c5-8ef7-ce51f38b2b51", // EXP-2026-00545
  "ef97d3af-a636-4edf-b82d-f188c98dd43f", // EXP-2026-00546
];

async function main() {
  const { generateExpenseNumber } = await import("../../apps/backend/src/expense-attribution/expense-number.js");

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("RESET ROLE");
    if (!DRY_RUN) {
      await assertIsIntendedProduction(client);
    }
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [USMCA_ID]);

    const before = await client.query<{ id: string; expense_number: string }>(
      `SELECT id::text, expense_number FROM accounting.expenses WHERE id = ANY($1::uuid[]) ORDER BY created_at`,
      [TARGET_IDS]
    );
    console.log("BEFORE:", JSON.stringify(before.rows));

    const results: Array<{ id: string; old: string; new: string }> = [];
    for (const row of before.rows) {
      const gen = await generateExpenseNumber(client, LOAD_13503_ID, USMCA_ID);
      results.push({ id: row.id, old: row.expense_number, new: gen.number });
      if (!DRY_RUN) {
        await client.query(
          `UPDATE accounting.expenses SET expense_number = $2 WHERE id = $1::uuid AND operating_company_id = $3::uuid`,
          [row.id, gen.number, USMCA_ID]
        );
      }
    }
    console.log("PLAN:", JSON.stringify(results, null, 2));

    if (DRY_RUN) {
      console.log("DRY_RUN=1 -- rolling back, nothing committed.");
      await client.query("ROLLBACK");
    } else {
      await client.query("COMMIT");
      console.log("COMMITTED.");
    }
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
