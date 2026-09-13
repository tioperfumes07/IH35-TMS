/**
 * verify:guard-wired P0: verify-fuel-transactions-per-load.mjs existed but was never wired into a
 * claimed verify-step. Wraps it into the CI verify-step convention (verify-step 11473, CC-1 band,
 * CLAIM-RESERVE #22034).
 */
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const SCRIPT = join(repoRoot, "scripts", "verify-fuel-transactions-per-load.mjs");

function main() {
  execFileSync(process.execPath, [SCRIPT], { stdio: "inherit" });
}

main();
