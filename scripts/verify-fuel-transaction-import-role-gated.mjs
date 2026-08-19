#!/usr/bin/env node
/**
 * ACCT-F5587 regression guard — bulk fuel transaction import must require an accounting role.
 *
 * fuel/fuel-transaction-import.routes.ts's POST /transactions/import (bulk fleet-card spreadsheet
 * import) had no role gate at all -- currentAuthUser only requires a session. More severe than
 * ACCT-F5586's manual single-row create: a bulk import can inject many fabricated expenses at once,
 * triggers real GL posting (flushFuelGlPostsAfterCommit) AND, when
 * FUEL_CARD_OVERAGE_RECOVERY_ENABLED is on, can create real driver receivables that flow into
 * settlement deductions.
 *
 * Fix: requireFuelWriteRole() reuses the canonical void/cancel executor role predicate
 * (canVoidCancel: Owner/Administrator/Accountant), matching the sibling fuel-transactions.routes.ts
 * (ACCT-F5586) and accounting/expenses.routes.ts.
 *
 * This static check (no DB connection) asserts POST /transactions/import calls requireFuelWriteRole
 * before any business logic runs.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify:fuel-transaction-import-role-gated";
const SELFTEST = process.argv.includes("--selftest");
const FILE = "apps/backend/src/fuel/fuel-transaction-import.routes.ts";

const ROUTE_NEEDLE = 'app.post("/api/v1/fuel/transactions/import"';
const GATE_LINE = 'if (!requireFuelWriteRole(reply, String(authUser.role ?? ""))) return;';

function assertAll(src) {
  const problems = [];

  if (!/function requireFuelWriteRole\(reply: FastifyReply, role: string\) \{\s*\n\s*if \(!canVoidCancel\(role\)\)/.test(src)) {
    problems.push(`requireFuelWriteRole() not found or no longer calls canVoidCancel()`);
  }

  const idx = src.indexOf(ROUTE_NEEDLE);
  if (idx === -1) {
    problems.push(`POST /transactions/import route not found (guard target moved; update this guard)`);
  } else {
    const window = src.slice(idx, idx + 400);
    if (!window.includes(GATE_LINE)) {
      problems.push(`POST /transactions/import no longer calls requireFuelWriteRole before business logic`);
    }
  }

  return problems;
}

const read = () => fs.readFileSync(path.join(ROOT, FILE), "utf8");

if (SELFTEST) {
  const src = read();

  const idx = src.indexOf(ROUTE_NEEDLE);
  if (idx === -1) {
    console.error(`${LABEL} SELFTEST SETUP FAILED: route needle not found in real code`);
    process.exit(1);
  }
  const gateIdx = src.indexOf(GATE_LINE, idx);
  if (gateIdx === -1 || gateIdx - idx > 400) {
    console.error(`${LABEL} SELFTEST SETUP FAILED: gate line not found near the route (guard text drifted from real code)`);
    process.exit(1);
  }
  // Remove the gate line (plus its trailing newline+indentation) to simulate the regression.
  const lineStart = src.lastIndexOf("\n", gateIdx) + 1;
  const lineEnd = src.indexOf("\n", gateIdx) + 1;
  const planted = src.slice(0, lineStart) + src.slice(lineEnd);

  if (!assertAll(planted).length) {
    console.error(`${LABEL} SELFTEST FAILED: planted defect (role gate dropped) not caught`);
    process.exit(1);
  }

  const live = assertAll(src);
  if (live.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${live.join(" | ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assertAll(read());
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK`);
