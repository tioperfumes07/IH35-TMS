#!/usr/bin/env node
/** CC-2 claim 18775 — LEAD 443.341 RC2. See scripts/verify-banking-rules-follow-owner-rulings.mjs. */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const GUARD = resolve(ROOT, "scripts/verify-banking-rules-follow-owner-rulings.mjs");

export default {
  name: "verify-banking-rules-follow-owner-rulings",
  run() {
    const r = spawnSync(process.execPath, [GUARD], { cwd: ROOT, stdio: "inherit" });
    if (r.status !== 0) throw new Error(`verify-banking-rules-follow-owner-rulings failed (exit ${r.status})`);
    return 0;
  },
};
