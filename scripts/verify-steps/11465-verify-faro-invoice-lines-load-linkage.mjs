/**
 * verify:guard-wired P0: verify-faro-invoice-lines-load-linkage.mjs (from PR #22021) existed but
 * was never wired into a claimed verify-step, so it never actually ran in CI. Wraps it into the CI
 * verify-step convention (verify-step 11465, CC-1 band, CLAIM-RESERVE #22026).
 */
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const SCRIPT = join(repoRoot, "scripts", "verify-faro-invoice-lines-load-linkage.mjs");

function main() {
  // This guard has no --selftest arm (verified: zero "selftest" references in the source) — always
  // runs its one live-data check.
  execFileSync(process.execPath, [SCRIPT], { stdio: "inherit" });
}

main();
