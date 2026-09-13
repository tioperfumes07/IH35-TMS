/**
 * A5 item 4 (ROUND 21.1, CC-1) — verify-ap-aging-bucket-filter-tiles.mjs wired into the CI
 * verify-step convention (verify-step 11445, CC-1 band, CLAIM-RESERVE #21999) so the new
 * aging-bucket click-to-filter guard actually runs in CI, not just locally.
 */
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const SCRIPT = join(repoRoot, "scripts", "verify-ap-aging-bucket-filter-tiles.mjs");

function main() {
  if (process.argv.includes("--selftest")) {
    execFileSync(process.execPath, [SCRIPT, "--selftest"], { stdio: "inherit" });
    return;
  }
  execFileSync(process.execPath, [SCRIPT], { stdio: "inherit" });
}

main();
