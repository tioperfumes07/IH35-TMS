/**
 * ENG-61 (443.336) — CC-1 verify-step 18797
 *
 * Claimed: 2026-10-24 via PR #27555 (chore/claim-reserve-18797-eng61), merged to main
 * before this file was authored (Rule 37 / claim-before-write law).
 *
 * Guard: scripts/verify-final-load-close-posts.mjs
 *
 * Invariant: a load_bookended driver settlement whose trip is closed (trip_closed_at IS NOT NULL)
 * must never remain stuck in status='open'. The trigger tg_settlement_close_requires_posting
 * blocked the old combined trip-close+status UPDATE; the fix moves status='closed' to the
 * payrun-close path (closeSettlementPayRun → postLoadBookendedSettlementGlAfterClose) which
 * sets posted_at + status atomically in one UPDATE, satisfying the trigger.
 *
 * Root cause: closeLoadBookendedSettlementForDriver (settlements-load-bookended.service.ts) did
 * UPDATE … SET status='closed', trip_closed_at=$2 … in one statement. The trigger fires BEFORE
 * UPDATE and raises check_violation when NEW.status='closed' AND NEW.posted_at IS NULL, rolling
 * back the entire UPDATE including trip_closed_at, leaving the settlement unchanged.
 *
 * Fix: removed status='closed' from the trip-close UPDATE; settlement remains status='open'
 * with trip_closed_at IS NOT NULL (the "tripClosedOpen" state that closeSettlementPayRun
 * detects). Added postFinalLoadSettlementsGl (settlement-payrun-close.service.ts) which fires
 * after every load status update path and triggers the GL posting + status='closed' atomically.
 *
 * Baseline: 0 stuck settlements (verified 2026-10-24 on prod br-fancy-credit-akjnd07a).
 */
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import { resolve, dirname } from "path";

const here = dirname(fileURLToPath(import.meta.url));
const guardPath = resolve(here, "..", "verify-final-load-close-posts.mjs");

execFileSync(process.execPath, [guardPath, ...process.argv.slice(2)], { stdio: "inherit" });
