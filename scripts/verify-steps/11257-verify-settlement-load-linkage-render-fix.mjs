/**
 * SETTLEMENT LOAD LINKAGE: FIX THE RENDER, NOT THE SCHEMA guard (verify-step 11257, CC-1 band):
 * wraps scripts/verify-settlement-load-linkage-render-fix.mjs into the CI verify-step convention.
 */
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const SCRIPT = join(repoRoot, "scripts", "verify-settlement-load-linkage-render-fix.mjs");

function main() {
  if (process.argv.includes("--selftest")) {
    execFileSync(process.execPath, [SCRIPT, "--selftest"], { stdio: "inherit" });
    return;
  }
  execFileSync(process.execPath, [SCRIPT], { stdio: "inherit" });
}

main();
