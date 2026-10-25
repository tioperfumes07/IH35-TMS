#!/usr/bin/env node
/**
 * ROUND 443.326 / ACCT-F443326 — Cursor EVEN verify-step 18800.
 *
 * Claimed: 2026-10-24 via PR #27570 (cursor/claim-reserve-18800-c89b), merged to main
 * before this file was authored (Rule 37).
 *
 * Guard: scripts/verify-v3-board-grammar-every-surface.mjs
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const GUARD = resolve(ROOT, "scripts/verify-v3-board-grammar-every-surface.mjs");

export default {
  name: "verify-v3-board-grammar-every-surface",
  run() {
    for (const args of [[], ["--selftest"]]) {
      const r = spawnSync(process.execPath, [GUARD, ...args], { cwd: ROOT, stdio: "inherit" });
      if (r.status !== 0) {
        throw new Error(`verify-v3-board-grammar-every-surface ${args.join(" ") || "(main)"} failed (exit ${r.status})`);
      }
    }
    return 0;
  },
};
