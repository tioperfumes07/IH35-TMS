#!/usr/bin/env tsx
// ACCT-F30214 follow-on (CC-3, 2026-09-22) -- "26 unposted expenses / who closes the 7 open
// settlements" investigation. Root cause (see LEAD-RULING-2026-09-22-CC3-TOUR-OPEN-LOCKED-
// CROSS-LANE.md for the full citation): tour-open-gate.service.ts's CLOSED_TOUR_STATUSES never
// included 'locked', and the finalize route (settlements.routes.ts) never called
// postHeldDocumentsForClosedTour at all -- only the MVP approve route did. Both are fixed in this
// same commit. This script is the ONE-TIME catch-up for the 4 rows that were already stuck before
// the fix landed: 2 on S-2026-5786 (13533-4, 13533-5) and 2 on S-2026-5788 (13539-6, 13539-7),
// both settlements already 'locked' and will never be finalized again, so nothing will ever
// re-trigger the (now-fixed) post-commit call for them without this script.
//
// Reuses the REAL posting path verbatim -- loadIdsForSettlement + postHeldDocumentsForClosedTour
// (which itself calls postSourceTransaction, the same engine every other posting call site uses).
// No new GL math. Idempotent: postHeldDocumentsForClosedTour only touches rows still
// posting_status='unposted' with posting_hold_reason='tour_open', so a re-run after success is a
// no-op (expenses_posted comes back empty because there is nothing left to post).
//
// Requires DATABASE_URL (this environment had no live DB pool reachable this session -- see the
// commit's REMAINING section). Run from a context where the backend's own DB pool
// (apps/backend/src/auth/db.js) can connect, e.g. `DATABASE_URL=<Neon prod> npx tsx
// scripts/ops/settlements-01-catchup-post-held-tour-close-expenses.ts --execute`.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadIdsForSettlement } from "../../apps/backend/src/accounting/tour-open-gate.service.js";
import { postHeldDocumentsForClosedTour } from "../../apps/backend/src/accounting/tour-close-posting.service.js";
import { withCurrentUser } from "../../apps/backend/src/auth/db.js";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const SETTLEMENT_IDS = [
  "248b52e7-24fa-4454-9ba8-885ffcad7eea", // S-2026-5786
  "9007277f-3168-440d-a981-4b8b415413c8", // S-2026-5788
];

async function main() {
  const executeFlag = process.argv.includes("--execute");
  if (!process.env.DATABASE_URL) throw new Error("ABORT: DATABASE_URL required.");

  for (const settlementId of SETTLEMENT_IDS) {
    const loadIds = await withCurrentUser(OWNER_USER_ID, (client) =>
      loadIdsForSettlement(client, USMCA_COMPANY_ID, settlementId)
    );
    console.log(`Settlement ${settlementId}: ${loadIds.length} bookended load(s): ${loadIds.join(", ")}`);

    if (!executeFlag) {
      console.log("  DRY RUN -- no writes made. Re-run with --execute to apply.");
      continue;
    }

    const result = await postHeldDocumentsForClosedTour(USMCA_COMPANY_ID, loadIds, { userId: OWNER_USER_ID });
    console.log(
      `  EXECUTE done: expenses_posted=${result.expenses_posted.length} (${result.expenses_posted.join(",")}), ` +
        `expenses_still_held=${result.expenses_still_held.length}, bills_posted=${result.bills_posted.length}, ` +
        `bills_still_held=${result.bills_still_held.length}`
    );
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main();
