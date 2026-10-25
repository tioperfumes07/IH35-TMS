/**
 * ENG-01c (443.322) — CC-1 verify-step 18789
 *
 * Claimed: 2026-10-24 via PR #27529 (chore/claim-reserve-18789, merged to main as d98f500bb2).
 *
 * Guard: scripts/verify-settlement-deduction-lines-have-deduction-rows.mjs
 *
 * Invariant: every active USMCA settlement_lines row with line_type='deduction' and
 * source_table='driver_finance.driver_settlement_deductions' must have a matching DSD row.
 *
 * Root fix: settlements.routes.ts and settlements-mvp.routes.ts legacy POST routes now
 * atomically create the DSD row and wire source_table/source_reference_id.
 *
 * Backfill companion: scripts/backfill-settlement-deduction-lines-orphan.mjs
 *
 * Baseline: 0 failures (verified 2026-10-24 on prod br-fancy-credit-akjnd07a).
 */
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import { resolve, dirname } from "path";

const here = dirname(fileURLToPath(import.meta.url));
const guardPath = resolve(here, "..", "verify-settlement-deduction-lines-have-deduction-rows.mjs");

execFileSync(process.execPath, [guardPath, ...process.argv.slice(2)], { stdio: "inherit" });

// LEAD 443.338 — same invariant family (a settlement deduction line must stand on a live deduction row): a VOIDED
// deduction is never applied at close (P-0119 charged the voided duplicate 68041143). Runs in this step so CI executes it.
const voidedGuard = resolve(here, "..", "verify-voided-deduction-never-applied.mjs");
execFileSync(process.execPath, [voidedGuard, ...process.argv.slice(2)], { stdio: "inherit" });
