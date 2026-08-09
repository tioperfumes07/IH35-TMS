#!/usr/bin/env node
// verify-step 2945 (CC-1 band n%4===1) — ACCT-F275.
// Settlements load_count must count BOTH load paths, bill-first, LEFT JOIN.
// Root guard: scripts/verify-settlement-load-count-counts-both-paths.mjs
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const r = spawnSync(process.execPath, [path.join(root, "scripts", "verify-settlement-load-count-counts-both-paths.mjs")], { stdio: "inherit" });
process.exit(r.status ?? 1);
