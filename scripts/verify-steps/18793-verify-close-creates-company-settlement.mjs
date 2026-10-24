/**
 * ENG-40 (443.328) — CC-1 verify-step 18793
 *
 * Claimed: 2026-10-24 via PR chore/claim-reserve-18793-v2, merged to main before this file was authored.
 *
 * Guard: scripts/verify-close-creates-company-settlement.mjs
 *
 * Invariant: every closed, load_bookended, non-voided USMCA driver settlement must have a linked
 * row in accounting.company_settlement_driver_settlements (the "one close, two settlements" law).
 *
 * Root cause: settlement-payrun-close.service.ts's close path was not always calling
 * closeCompanySettlementAlongsideDriverSettlement. Settlements closed before or bypassing that
 * code had no company settlement header.
 *
 * Fix: both close branches (idempotent-reentry + fresh-post) now call the function with the
 * same client (same transaction), gated on load_bookended + (freshly stamped OR already trip_closed).
 *
 * Backfill companion: scripts/backfill-company-settlement-orphans.mjs
 *   - Applied 2026-10-24 on prod br-fancy-credit-akjnd07a: P-0067 (cs "5816") + P-0119 linked & closed.
 *   - Prod orphan count after backfill: 0.
 *
 * Baseline: 0 failures (verified 2026-10-24 on prod br-fancy-credit-akjnd07a).
 */
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import { resolve, dirname } from "path";

const here = dirname(fileURLToPath(import.meta.url));
const guardPath = resolve(here, "..", "verify-close-creates-company-settlement.mjs");

execFileSync(process.execPath, [guardPath, ...process.argv.slice(2)], { stdio: "inherit" });
