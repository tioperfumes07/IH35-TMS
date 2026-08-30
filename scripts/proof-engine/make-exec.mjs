import path from "node:path";
import { spawnSync } from "node:child_process";

/**
 * Real guard runner for proof replay. Never hardcode exit 1.
 * Scripts must live under repo `scripts/` (no `..`).
 */
export function makeExec(repoRoot) {
  return async (script, args = []) => {
    const rel = String(script || "");
    if (!rel.startsWith("scripts/") || rel.includes("..")) return 1;
    const r = spawnSync(process.execPath, [path.join(repoRoot, rel), ...args], {
      encoding: "utf8",
      timeout: 90_000,
    });
    return r.status === null ? 1 : r.status;
  };
}
