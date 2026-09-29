#!/usr/bin/env npx tsx
/**
 * ROUND 260 Part H — one-batch live run of the new retryHeldExpensePostings sweep against USMCA's
 * current backlog of status='draft' accounting.expenses rows. See AUTH-131 in
 * docs/bus/OWNER-AUTHORIZATIONS.md for the full root-cause narrative and authorization scope.
 *
 * Usage: OWNER_AUTH_ID=AUTH-131 DATABASE_URL=<prod> npx tsx scripts/ops/2026-09-30-cc1-round260-retry-held-expense-postings.ts
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { retryHeldExpensePostings } from "../../apps/backend/src/accounting/tour-close-posting.service.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
{
  const authId = process.env.OWNER_AUTH_ID;
  if (!authId) {
    console.error("OWNER_AUTH_ID required");
    process.exit(1);
  }
  execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), authId], {
    stdio: "inherit",
  });
}

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ACTOR = "e4117991-d2c0-406d-8cda-74e98d95bccd";

async function main() {
  if (process.env.OWNER_AUTH_ID !== "AUTH-131") {
    console.error("Refusing: set OWNER_AUTH_ID=AUTH-131");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("Refusing: DATABASE_URL required");
    process.exit(1);
  }

  const result = await retryHeldExpensePostings(USMCA, { userId: ACTOR });

  const byOutcome: Record<string, number> = {};
  for (const o of result.outcomes) byOutcome[o.outcome] = (byOutcome[o.outcome] ?? 0) + 1;

  console.log(`posting_batch_id: ${result.posting_batch_id}`);
  console.log(`total candidates: ${result.outcomes.length}`);
  console.log("by outcome:", byOutcome);
  for (const o of result.outcomes) {
    console.log(`  ${o.expense_id} -> ${o.outcome}${o.journal_entry_id ? ` (je ${o.journal_entry_id})` : ""}${o.hold_reason ? ` [${o.hold_reason}]` : ""}`);
  }
}

main().catch((err) => {
  console.error("FAIL", err);
  process.exit(1);
});
