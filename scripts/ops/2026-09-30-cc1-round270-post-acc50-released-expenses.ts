#!/usr/bin/env npx tsx
/**
 * ROUND 270 / claude/00-SEAT-CONTRACT.md §3 follow-up — re-run retryHeldExpensePostings now that
 * PR #23153 removed the ACC-50 open-tour check from it, to post the 9 expenses AUTH-131 correctly
 * left held under the OLD law (posting_hold_reason='tour_open'). See AUTH-133 in
 * docs/bus/OWNER-AUTHORIZATIONS.md for full scope.
 *
 * Usage: OWNER_AUTH_ID=AUTH-133 DATABASE_URL=<prod> npx tsx scripts/ops/2026-09-30-cc1-round270-post-acc50-released-expenses.ts
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
  if (process.env.OWNER_AUTH_ID !== "AUTH-133") {
    console.error("Refusing: set OWNER_AUTH_ID=AUTH-133");
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
