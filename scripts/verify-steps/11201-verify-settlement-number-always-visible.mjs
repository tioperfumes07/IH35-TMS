/**
 * SETTLEMENT/TOUR NUMBER SWEEP owner order (2026-09-11), PART 1 guard (verify-step 11201, CC-1 band).
 * Wraps scripts/verify-settlement-number-always-visible.mjs into the CI verify-step convention.
 */
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const SCRIPT = join(repoRoot, "scripts", "verify-settlement-number-always-visible.mjs");

function main() {
  if (process.argv.includes("--selftest")) {
    execFileSync(process.execPath, [SCRIPT, "--selftest"], { stdio: "inherit" });
    return;
  }
  execFileSync(process.execPath, [SCRIPT], { stdio: "inherit" });
}

main();
