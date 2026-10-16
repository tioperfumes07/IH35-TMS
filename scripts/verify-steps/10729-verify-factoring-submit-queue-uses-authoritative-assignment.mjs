#!/usr/bin/env node
// Verify-step wrapper — ROUND 16.20 factoring submit-queue linkage fix.
// See scripts/verify-factoring-submit-queue-uses-authoritative-assignment.mjs for the actual checks.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(__dirname, "..", "verify-factoring-submit-queue-uses-authoritative-assignment.mjs");
const result = spawnSync(process.execPath, [target], { stdio: "inherit" });
if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);
// LEAD 443.154 — the purchase Feed Gate releases reds only for the Owner WITH a reason, recording each release.
const override = path.join(__dirname, "..", "verify-purchase-feed-gate-owner-override.mjs");
for (const args of [["--selftest"], []]) {
  const r = spawnSync(process.execPath, [override, ...args], { stdio: "inherit" });
  if ((r.status ?? 1) !== 0) process.exit(r.status ?? 1);
}
process.exit(0);
