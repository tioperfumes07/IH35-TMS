/**
 * D1 (owner law, 2026-09-13): saved-query chips with live counts (verify-step 11433, CC-3 band).
 */
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const SCRIPT = join(repoRoot, "scripts", "verify-saved-query-chips.mjs");

function main() {
  if (process.argv.includes("--selftest")) {
    execFileSync(process.execPath, [SCRIPT, "--selftest"], { stdio: "inherit" });
    return;
  }
  execFileSync(process.execPath, [SCRIPT], { stdio: "inherit" });
}

main();
