#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const TARGET = path.join(process.cwd(), "apps/backend/src/qbo/sync-state-machine.ts");

function fail(message) {
  console.error(`verify:qbo-sync-state-machine-transitions — FAILED\n- ${message}`);
  process.exit(1);
}

if (!fs.existsSync(TARGET)) {
  fail("apps/backend/src/qbo/sync-state-machine.ts not found");
}

const text = fs.readFileSync(TARGET, "utf8");

if (!text.includes("export const STATE_TRANSITIONS")) {
  fail("STATE_TRANSITIONS map missing");
}

const requiredStates = ["pending", "in_progress", "succeeded", "failed_retryable", "failed_terminal"];
for (const state of requiredStates) {
  if (!text.includes(`${state}:`)) {
    fail(`STATE_TRANSITIONS must include state '${state}'`);
  }
}

if (!text.includes("export const MAX_SYNC_ATTEMPTS = 5")) {
  fail("MAX_SYNC_ATTEMPTS constant must be explicit and set to 5");
}

const mutationFns = [
  "transitionToInProgress",
  "transitionToSucceeded",
  "transitionToFailed",
  "transitionTerminalToPending",
  "dismissTerminalRun",
];

function extractFunctionBlock(source, fnName) {
  const start = source.indexOf(`export async function ${fnName}`);
  if (start < 0) return null;
  const rest = source.slice(start);
  const nextMatch = rest.slice(1).match(/\nexport async function\s+/);
  if (!nextMatch) return rest;
  return rest.slice(0, nextMatch.index + 1);
}

for (const fnName of mutationFns) {
  const fnBlock = extractFunctionBlock(text, fnName);
  if (!fnBlock) {
    fail(`missing mutation function ${fnName}`);
  }
  if (!/operating_company_id\s*=\s*\$2::uuid/.test(fnBlock)) {
    fail(`${fnName} must enforce operating_company_id in state mutation WHERE clause`);
  }
}

console.log("verify:qbo-sync-state-machine-transitions — OK");
