/**
 * ROUND 23.2 B4/B5 — verify-settlement-net-matches-signed-doc.mjs wired into the CI verify-step
 * convention (verify-step 11457, CC-1 band, CLAIM-RESERVE #22023). Live-data assertion (skips
 * cleanly with no DATABASE_URL, matching verify-fixed-monthly-costs-never-attach-to-load.mjs's own
 * convention) — runs for real only when a caller sets DATABASE_URL against prod or a rehearse branch.
 */
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const SCRIPT = join(repoRoot, "scripts", "verify-settlement-net-matches-signed-doc.mjs");

function main() {
  execFileSync(process.execPath, [SCRIPT], { stdio: "inherit" });
}

main();
