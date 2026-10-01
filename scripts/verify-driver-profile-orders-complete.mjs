#!/usr/bin/env node
/**
 * Thin verify-*.mjs entry for DoD / money-pr-local-gate — runs the Cursor ops guard.
 * Canonical assertions live in scripts/ops/verify-driver-profile-orders-complete.mjs.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ops = path.join(ROOT, "scripts/ops/verify-driver-profile-orders-complete.mjs");
const args = process.argv.includes("--selftest") ? ["--selftest"] : [];
const r = spawnSync(process.execPath, [ops, ...args], { stdio: "inherit" });
process.exit(r.status ?? 1);
