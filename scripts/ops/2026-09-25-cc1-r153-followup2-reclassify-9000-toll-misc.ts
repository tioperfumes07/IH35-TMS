/**
 * ROUND 153 item 9 follow-up #2 — reclassifies the 2 "Scale Expense" lines item 9's own audit had
 * left un-touched as "ambiguous misc" (docs/bus/NOW-CC-1.md, 2026-09-25 6:52 AM CT status line).
 *
 * WHY THE EARLIER "ambiguous" CALL WAS WRONG: item 9's audit checked line_category='misc' against
 * accounting.expense_category_account_map and found it resolves to TWO different active accounts
 * depending on category_kind (fuel->5000, maintenance->5400) — correctly refused to guess between
 * those two for a weigh-station fee that is neither. But it never checked for a THIRD, more specific
 * mapping outside 'misc' entirely. There is one, live and active:
 *   category_kind='toll', category_code='toll' -> account 5300 "Tolls & Scales" (CostOfGoodsSold,
 *   USMCA). A DOT/weigh-station scale fee is definitionally a toll/scale cost, and 5300 exists in
 *   the live chart of accounts for exactly this (confirmed: no other mapping targets 5300).
 * Both expenses' own memo/description text says "Scale Expense" / "OTR-Scale Expense" in plain
 * English — this is not a judgment call about intent, it is the same category under a different,
 * more specific name than the one originally keyed at data-entry ('misc' instead of 'toll'):
 *   EXP-2026-00021 "Scale Expense:OTR-Scale Expense" -- $15.25.
 *   EXP-2026-00049 "Driver Reimbursement-TPE-Scale Expense" -- $15.25.
 * Confirmed live before writing this: neither expense already has a correcting/reclassify JE.
 *
 * NOT touched, still correctly out of scope: EXP-2026-00025 "Fuel-Reefer Diesel" (line_category=
 * 'reefer') -- its own mapping (fuel->5000) is unambiguous, but the content is fuel, CC-2's lane.
 *
 * WHY A RECLASSIFYING JE, NOT A VOID+RECREATE: same reasoning as the first item-9 follow-up
 * (PR #22598) -- the original expense documents are correct in every other respect; only the GL
 * account the debit landed on is wrong. A/P is unaffected either way.
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
const ACCOUNT_5300 = "4a0a5b88-3f56-4dc7-853c-37071089315a"; // Tolls & Scales

type Reclass = { expenseNumber: string; expenseId: string; amountCents: number; description: string };
const RECLASSIFICATIONS: Reclass[] = [
  {
    expenseNumber: "EXP-2026-00021",
    expenseId: "64f936ec-220e-4ea1-9cbb-75cc92bdbbea",
    amountCents: 1525,
    description: "Scale Expense:OTR-Scale Expense",
  },
  {
    expenseNumber: "EXP-2026-00049",
    expenseId: "28da7af3-64a2-4deb-b2c4-e63c482d9625",
    amountCents: 1525,
    description: "Driver Reimbursement-TPE-Scale Expense",
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
          memo: `ACCT-F20260925K reclassify ${r.expenseNumber} (${r.description}) from suspense 9000 "Ask My Accountant" to 5300 Tolls & Scales (category_kind='toll' active mapping, missed by the original 'misc' keying) -- ROUND 153 item 9 follow-up #2.`,
          source: "manual",
          postings: [
            { account_id: ACCOUNT_5300, debit_or_credit: "debit", amount_cents: r.amountCents, description: `${r.description} — corrected from 9000` },
            { account_id: ACCOUNT_9000, debit_or_credit: "credit", amount_cents: r.amountCents, description: `${r.description} — corrected from 9000` },
          ],
        },
        { userId: SYSTEM_ACTOR_USER_ID, role: "Administrator" }
      );
      console.log(`RECLASSIFIED ${r.expenseNumber}: JE ${je.id} (5300, $${(r.amountCents / 100).toFixed(2)})`);
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
