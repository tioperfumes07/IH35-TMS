/**
 * SETTLE-SWEEP guard (verify-step 11221, CC-1 band): wraps
 * scripts/verify-settlement-close-posts-payrun.mjs into the CI verify-step convention.
 * Confirms SettlementCloseArrivalPage.tsx actually posts the picked payment method through
 * closeSettlementPayRun instead of discarding it, and honestly surfaces (never guesses at) a
 * human-decision-required posting refusal.
 */
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const SCRIPT = join(repoRoot, "scripts", "verify-settlement-close-posts-payrun.mjs");

function main() {
  if (process.argv.includes("--selftest")) {
    execFileSync(process.execPath, [SCRIPT, "--selftest"], { stdio: "inherit" });
    return;
  }
  execFileSync(process.execPath, [SCRIPT], { stdio: "inherit" });
}

main();
