/**
 * ENG-01b (443.322) — CC-1 verify-step 18781
 *
 * Claimed: 2026-10-24 via PR #27522 (chore/claim-reserve-18781, merged to main as aee821a0fe).
 *
 * Guard: scripts/verify-settlement-posted-withholdings-equal-deductions-total.mjs
 *
 * Invariant: for every non-reversed USMCA settlement with a deduction_journal_entry_id
 * the sum of CREDIT lines in that JE must equal glr.deductions_cents.
 *
 * Baseline: 0 failures (verified 2026-10-24 on prod br-fancy-credit-akjnd07a).
 *
 * Code fix companion: settlement-payrun-close.service.ts throws DEDUCTIONS_LINES_MISMATCH
 * when driver_settlement_deductions total ≠ settlement_lines deduction total at close time.
 */
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import { resolve, dirname } from "path";

const here = dirname(fileURLToPath(import.meta.url));
const guardPath = resolve(here, "..", "verify-settlement-posted-withholdings-equal-deductions-total.mjs");

execFileSync(process.execPath, [guardPath, ...process.argv.slice(2)], { stdio: "inherit" });
