/**
 * verify:guard-wired P0: verify-alwaystrack-parity.mjs (from PR #22020) existed but was never wired
 * into a claimed verify-step, so it never actually ran in CI. Wraps it into the CI verify-step
 * convention (verify-step 11461, CC-1 band, CLAIM-RESERVE #22026).
 */
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const SCRIPT = join(repoRoot, "scripts", "verify-alwaystrack-parity.mjs");

function main() {
  if (process.argv.includes("--selftest")) {
    execFileSync(process.execPath, [SCRIPT, "--selftest"], { stdio: "inherit" });
    return;
  }
  execFileSync(process.execPath, [SCRIPT], { stdio: "inherit" });
}

main();
