/**
 * ROUND 153 item 9 follow-up — reclassifies the 2 unambiguous non-fuel expense lines item 9's own
 * audit found posted to 9000 "Ask My Accountant" (a suspense placeholder, not a real category).
 *
 * SCOPE, deliberately narrow: only the 2 of 5 non-fuel 9000 lines with a SINGLE, unambiguous active
 * accounting.expense_category_account_map entry for their own line_category, confirmed live before
 * writing this:
 *   EXP-2026-00053 "Warehouse-Lumper Fee Expense" (line_category='lumper') -> exactly one active
 *     mapping, category_kind='lumper' -> 5310 Lumper Expense. $560.00.
 *   EXP-2026-00050 "Road Service-Trailer Tire Expense" (line_category='tires') -> exactly one
 *     active mapping, category_kind='maintenance' -> 5400 Truck Repairs & Maintenance. $64.60.
 * NOT touched, reported instead (docs/bus/NOW-CC-1.md): EXP-2026-00021 + EXP-2026-00049 (both
 * "Scale Expense", line_category='misc') -- 'misc' resolves to TWO different active mappings
 * depending on category_kind (fuel->5000 vs maintenance->5400) and a truck-scale/weigh-station fee
 * is neither cleanly -- not guessed at. EXP-2026-00025 "Fuel-Reefer Diesel" (line_category='reefer')
 * -- its own mapping (fuel->5000) is unambiguous, but the content is fuel, CC-2's active lane
 * tonight; left for them.
 *
 * WHY A RECLASSIFYING JE, NOT A VOID+RECREATE: the original expense documents (vendor, amount,
 * date, A/P treatment) are all correct -- only the GL account the debit landed on is wrong. A/P
 * 2000 is unaffected either way. Voiding and recreating the whole document would touch fields that
 * were never wrong, for no benefit over a small, clearly-labelled correcting entry (Dr <correct
 * account> / Cr 9000) that names the original expense and JE by id -- same "never edit a posted
 * row, no seventh engine" standard as item 8's own correcting entry.
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
const SYSTEM_ACTOR_USER_ID = "00000000-0000-4000-8000-000000000001"; // role=Administrator, live-verified
const ACCOUNT_9000 = "c6f629ab-0c65-4aa1-a798-9c77e62a06d2";

type Reclass = { expenseNumber: string; expenseId: string; correctAccountId: string; correctAccountNumber: string; amountCents: number; description: string };
const RECLASSIFICATIONS: Reclass[] = [
  {
    expenseNumber: "EXP-2026-00053",
    expenseId: "61d87af3-37ca-41bd-98f2-51636d123208",
    correctAccountId: "b029d12d-f0b2-4f69-9e84-5df91a954c77", // 5310 Lumper Expense
    correctAccountNumber: "5310",
    amountCents: 56000,
    description: "Warehouse-Lumper Fee Expense",
  },
  {
    expenseNumber: "EXP-2026-00050",
    expenseId: "8f928234-103a-414c-b60a-618ad922d407",
    correctAccountId: "8fe4f37c-39ae-48df-a0f9-f43489f3df5d", // 5400 Truck Repairs & Maintenance
    correctAccountNumber: "5400",
    amountCents: 6460,
    description: "Road Service-Trailer Tire Expense",
  },
];

async function main() {
  const { createJournalEntryOnClient } = await import("../../apps/backend/src/accounting/journal-entries.service.js");

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  const results: Array<Record<string, unknown>> = [];
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [USMCA_ID]);

    for (const r of RECLASSIFICATIONS) {
      // Idempotency: skip if a reclassifying JE for this exact expense already exists.
      const already = await client.query<{ id: string }>(
        `SELECT id::text FROM accounting.journal_entries
          WHERE operating_company_id = $1::uuid AND status = 'posted' AND memo LIKE $2`,
        [USMCA_ID, `%reclassify ${r.expenseNumber}%`]
      );
      if (already.rows[0]) {
        console.log(`SKIP ${r.expenseNumber}: already reclassified (JE ${already.rows[0].id})`);
        results.push({ expense_number: r.expenseNumber, status: "already_done" });
        continue;
      }

      const je = await createJournalEntryOnClient(
        client,
        {
          operating_company_id: USMCA_ID,
          entry_date: new Date().toISOString().slice(0, 10),
          memo: `ACCT-F20260925J reclassify ${r.expenseNumber} (${r.description}) from suspense 9000 "Ask My Accountant" to its own real category-map account ${r.correctAccountNumber} -- ROUND 153 item 9 follow-up.`,
          source: "manual",
          postings: [
            { account_id: r.correctAccountId, debit_or_credit: "debit", amount_cents: r.amountCents, description: `${r.description} — corrected from 9000` },
            { account_id: ACCOUNT_9000, debit_or_credit: "credit", amount_cents: r.amountCents, description: `${r.description} — corrected from 9000` },
          ],
        },
        { userId: SYSTEM_ACTOR_USER_ID, role: "Administrator" }
      );
      console.log(`RECLASSIFIED ${r.expenseNumber}: JE ${je.id} (${r.correctAccountNumber}, $${(r.amountCents / 100).toFixed(2)})`);
      results.push({ expense_number: r.expenseNumber, status: "reclassified", journal_entry_id: je.id });
    }

    if (process.env.DRY_RUN === "1") {
      console.log("DRY_RUN=1 -- rolling back, nothing committed.");
      await client.query("ROLLBACK");
    } else {
      await client.query("COMMIT");
      console.log("COMMITTED.");
    }
    console.log(JSON.stringify(results, null, 2));
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
