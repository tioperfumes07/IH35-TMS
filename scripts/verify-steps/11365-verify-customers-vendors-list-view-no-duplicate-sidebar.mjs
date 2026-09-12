/**
 * ROUND 18.1 Item D (LST-F26143, PR #21883) — Customers/Vendors List view duplicate-sidebar guard
 * (verify-step 11365, CC-1 band): wraps scripts/verify-customers-vendors-list-view-no-duplicate-
 * sidebar.mjs into the CI verify-step convention. This guard shipped with #21883 but was never wired
 * into CI (no package.json script, no verify-step) — verify-guard-wired.mjs later flagged it as an
 * orphan, failing locked-guards-heavy on every PR company-wide. This wrapper closes that gap.
 */
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const SCRIPT = join(repoRoot, "scripts", "verify-customers-vendors-list-view-no-duplicate-sidebar.mjs");

function main() {
  if (process.argv.includes("--selftest")) {
    execFileSync(process.execPath, [SCRIPT, "--selftest"], { stdio: "inherit" });
    return;
  }
  execFileSync(process.execPath, [SCRIPT], { stdio: "inherit" });
}

main();
