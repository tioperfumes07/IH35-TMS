#!/usr/bin/env node
// CHAIN-07 regression guard.
//
// Root cause (fixed in PR #2182): driver_finance.driver_settlements carries FORCE ROW LEVEL
// SECURITY. Every settlement-payment action used to call loadSettlement(client, settlementId)
// BEFORE the app.operating_company_id GUC was set (the GUC was only learned by reading the very
// row RLS was blocking) -- a chicken-and-egg that made every settlement-payment action throw
// settlement_not_found for every settlement, every time, regardless of validity.
//
// This guard statically enforces, for every exported function in settlement-payment.service.ts
// that calls loadSettlement(...), that a `set_config('app.operating_company_id'` call appears
// textually BEFORE that loadSettlement(...) call within the same function body. If a future edit
// reorders these two calls (or adds a new caller that skips the set_config), this guard fails.
import fs from "node:fs";
import path from "node:path";

const servicePath = path.join(process.cwd(), "apps/backend/src/driver-finance/settlement-payment.service.ts");

function fail(message) {
  console.error(`verify:settlement-payment-guc-order — FAILED\n- ${message}`);
  process.exit(1);
}

if (!fs.existsSync(servicePath)) fail(`missing required file: ${servicePath}`);
const text = fs.readFileSync(servicePath, "utf8");

if (!text.includes("FORCE ROW LEVEL SECURITY")) {
  fail("expected the CHAIN-07 root-cause comment (FORCE ROW LEVEL SECURITY) to remain documented above loadSettlement()");
}

// Split into top-level function bodies by matching `export async function NAME(...) {` through
// its balanced closing brace. Simple brace-depth scan (no nested string literals contain braces
// in this file in a way that would confuse the scan at time of writing).
const fnStartRe = /export async function (\w+)\s*\([^)]*\)\s*\{/g;
const functions = [];
let match;
while ((match = fnStartRe.exec(text)) !== null) {
  const name = match[1];
  const bodyStart = match.index + match[0].length;
  let depth = 1;
  let i = bodyStart;
  for (; i < text.length && depth > 0; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") depth--;
  }
  functions.push({ name, body: text.slice(bodyStart, i) });
}

if (functions.length === 0) fail("no exported functions found — file structure changed unexpectedly");

let checked = 0;
for (const fn of functions) {
  const loadIdx = fn.body.indexOf("loadSettlement(");
  if (loadIdx === -1) continue; // this function doesn't call loadSettlement — not in scope
  checked++;
  const setConfigIdx = fn.body.indexOf("set_config('app.operating_company_id'");
  if (setConfigIdx === -1) {
    fail(
      `${fn.name}: calls loadSettlement(...) but never calls set_config('app.operating_company_id' ...) — ` +
        `driver_finance.driver_settlements is FORCE RLS, so this will 0-row / settlement_not_found every time (CHAIN-07 regression)`
    );
  }
  if (setConfigIdx > loadIdx) {
    fail(
      `${fn.name}: calls set_config('app.operating_company_id' ...) AFTER loadSettlement(...) — ` +
        `must set the GUC BEFORE reading a FORCE-RLS row, never after (CHAIN-07 regression)`
    );
  }
}

if (checked === 0) fail("expected at least one function calling loadSettlement(...) — file structure changed unexpectedly");

console.log(`verify:settlement-payment-guc-order — OK (${checked} call sites checked)`);
