/**
 * SETTLEMENT-TOUR-NUMBER-SWEEP root-cause fix guard (verify-step 11225, CC-1 band): wraps
 * scripts/verify-presettlement-deferred-suggestions-visible.mjs into the CI verify-step convention.
 * Confirms both deferred-write call sites make a load visible in the review queue, and a real
 * frontend page lets a human see and act on it.
 */
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const SCRIPT = join(repoRoot, "scripts", "verify-presettlement-deferred-suggestions-visible.mjs");

function main() {
  if (process.argv.includes("--selftest")) {
    execFileSync(process.execPath, [SCRIPT, "--selftest"], { stdio: "inherit" });
    return;
  }
  execFileSync(process.execPath, [SCRIPT], { stdio: "inherit" });
}

main();
