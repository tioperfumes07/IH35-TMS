/**
 * verify:guard-wired P0 (locked-guards-heavy, 2026-09-13, PR #21979 fallout): verify-customer-relationship-score-partial-honesty.mjs existed
 * but was never wired into a claimed verify-step, so it never actually ran in CI (orphan). Wraps it
 * into the CI verify-step convention (verify-step 11421, CC-1 band).
 */
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const SCRIPT = join(repoRoot, "scripts", "verify-customer-relationship-score-partial-honesty.mjs");

function main() {
  if (process.argv.includes("--selftest")) {
    execFileSync(process.execPath, [SCRIPT, "--selftest"], { stdio: "inherit" });
    return;
  }
  execFileSync(process.execPath, [SCRIPT], { stdio: "inherit" });
}

main();
