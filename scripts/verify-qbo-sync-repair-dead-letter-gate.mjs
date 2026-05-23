#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const stateMachinePath = path.join(process.cwd(), "apps/backend/src/qbo/sync-state-machine.ts");
const actionsRoutePath = path.join(process.cwd(), "apps/backend/src/qbo/sync-actions.routes.ts");
const dashboardPath = path.join(process.cwd(), "apps/frontend/src/pages/qbo/QBOSyncStatusDashboardPage.tsx");

function fail(message) {
  console.error(`verify:qbo-sync-repair-dead-letter-gate — FAILED\n- ${message}`);
  process.exit(1);
}

for (const p of [stateMachinePath, actionsRoutePath, dashboardPath]) {
  if (!fs.existsSync(p)) fail(`missing required file: ${p}`);
}

const stateText = fs.readFileSync(stateMachinePath, "utf8");
const routeText = fs.readFileSync(actionsRoutePath, "utf8");
const dashboardText = fs.readFileSync(dashboardPath, "utf8");

const retryFnStart = stateText.indexOf("export async function transitionTerminalToPending");
if (retryFnStart < 0) fail("transitionTerminalToPending function missing");
const retryFnSlice = stateText.slice(retryFnStart, retryFnStart + 1200);
if (!/status\s*=\s*'dead_letter'/.test(retryFnSlice)) {
  fail("transitionTerminalToPending must only reopen dead_letter runs");
}

if (!/retry_not_dead_letter/.test(routeText)) {
  fail("retry route must return retry_not_dead_letter when run is not terminal");
}
if (!/sync_run_not_found/.test(routeText)) {
  fail("retry route must preserve sync_run_not_found for missing runs");
}

if (/\(r\.status === "failed" \|\| r\.status === "dead_letter"\)/.test(dashboardText)) {
  fail("dashboard retry action must not render for failed_retryable rows");
}
if (!/r\.status === "dead_letter"/.test(dashboardText)) {
  fail("dashboard retry action must be gated to dead_letter status");
}

console.log("verify:qbo-sync-repair-dead-letter-gate — OK");
