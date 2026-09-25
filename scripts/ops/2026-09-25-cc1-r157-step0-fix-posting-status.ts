/**
 * R-157 STEP 0 CORRECTIVE FIX — the production run (2026-09-25-cc1-r157-step0-reclass-via-writer.ts,
 * AUTH-012) created 4 new expenses and called postSourceTransactionInClientTx for each, which wrote a
 * real, balanced JE for every one (confirmed live: 4 journal_entries rows, status='posted'). But the
 * script never ran the SAME writer's own "Step C" (expenses.routes.ts POST /:expenseId/post, lines
 * 1631-1640) that flips the expense header itself:
 *   UPDATE accounting.expenses SET posting_status='posted', posted_at=now(), journal_entry_id=$2::uuid,
 *          updated_at=now() WHERE id=$1::uuid AND operating_company_id=$3::uuid
 *   appendCrudAudit(client, user, "expense.posted", {...}, "info")
 * Confirmed live: the 4 new expenses still read posting_status='unposted', journal_entry_id=NULL even
 * though a real posted JE exists for each. This script applies exactly that missing header-flip, byte
 * for byte the same SQL the writer's own route runs, to the same 4 expenses AUTH-012 already covers
 * (their recreated successors) — no new GL math, no new JE, purely completing the already-authorized
 * write.
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
const SYSTEM_ACTOR_USER_ID = "00000000-0000-4000-8000-000000000001";

const FIXES = [
  { expenseId: "66c8445e-da6b-4012-a2c2-f5ef0238b1c4", journalEntryId: "934df099-7b97-4adb-ae82-15216e200ba8" },
  { expenseId: "526652a5-b3a5-482e-b27e-bd506817f380", journalEntryId: "55754134-02fb-46f4-af55-ca99bffcce43" },
  { expenseId: "ba304fcd-f755-418c-9cac-f6911943442d", journalEntryId: "1a156562-7766-4101-9b18-d420a1bc58fb" },
  { expenseId: "38046aeb-47f9-4592-91ce-4a4199f007a0", journalEntryId: "6c69f3be-a8c7-4ee2-ae94-8a9fea06c58c" },
];

async function main() {
  const { appendCrudAudit } = await import("../../apps/backend/src/audit/crud-audit.js");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [USMCA_ID]);

    for (const f of FIXES) {
      const pre = await client.query(
        `SELECT posting_status, journal_entry_id::text FROM accounting.expenses WHERE id=$1::uuid AND operating_company_id=$2::uuid`,
        [f.expenseId, USMCA_ID]
      );
      const row = pre.rows[0];
      if (!row) throw new Error(`${f.expenseId}: not found -- STOP`);
      if (row.posting_status === "posted") {
        console.log(`${f.expenseId}: already posting_status='posted' (journal_entry_id=${row.journal_entry_id}) -- skipping`);
        continue;
      }
      const res = await client.query(
        `UPDATE accounting.expenses
            SET posting_status='posted', posted_at=now(), journal_entry_id=$2::uuid, updated_at=now()
          WHERE id=$1::uuid AND operating_company_id=$3::uuid
        RETURNING id::text, posting_status, journal_entry_id::text, posted_at::text`,
        [f.expenseId, f.journalEntryId, USMCA_ID]
      );
      console.log(`${f.expenseId}: fixed -> ${JSON.stringify(res.rows[0])}`);
      await appendCrudAudit(
        client,
        SYSTEM_ACTOR_USER_ID,
        "expense.posted",
        { expense_id: f.expenseId, journal_entry_id: f.journalEntryId, reason: "R-157 STEP 0 corrective fix -- header flip the original run missed" },
        "info"
      );
    }

    if (process.env.DRY_RUN === "1") {
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
