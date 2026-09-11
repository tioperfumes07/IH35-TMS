/**
 * SETTLE-SWEEP guard (verify-step 11213, CC-1 band): wraps
 * scripts/verify-settlement-reporting-classification-fixes.mjs into the CI verify-step convention.
 * Covers two fixes: the company-settlement-report escrow-as-liability P&L classification and the
 * Settlement Disputes tab's split Period Start/End + settlement-identity columns.
 */
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const SCRIPT = join(repoRoot, "scripts", "verify-settlement-reporting-classification-fixes.mjs");

function main() {
  if (process.argv.includes("--selftest")) {
    execFileSync(process.execPath, [SCRIPT, "--selftest"], { stdio: "inherit" });
    return;
  }
  execFileSync(process.execPath, [SCRIPT], { stdio: "inherit" });
}

main();
