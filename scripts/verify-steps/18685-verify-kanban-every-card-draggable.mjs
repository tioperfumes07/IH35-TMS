#!/usr/bin/env node
/** CC-3 claim 18685 — LEAD 443.251 P0. See scripts/verify-kanban-every-card-draggable.mjs (static, with selftest). */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const GUARD = resolve(ROOT, "scripts/verify-kanban-every-card-draggable.mjs");

export default {
  name: "verify-kanban-every-card-draggable",
  run() {
    for (const args of [["--selftest"], []]) {
      const r = spawnSync(process.execPath, [GUARD, ...args], { cwd: ROOT, stdio: "inherit" });
      if (r.status !== 0) throw new Error(`verify-kanban-every-card-draggable ${args.join(" ")} failed (exit ${r.status})`);
    }
    return 0;
  },
};
