#!/usr/bin/env node
/**
 * ACCT-F5594 regression guard — 3 read routes in accounting/factoring-advances.routes.ts must
 * assert company membership before reading factoring reserve/advance data.
 *
 * GET /factoring-reserve-balances, GET /factoring-advances/reserve-tracker, and
 * GET /factoring-advances/:id/packet had no role check AND no membership check -- their backing
 * functions (listFactorReserveBalances, listFactoringReserveBalancesByAdvance,
 * getFactoringReserveRollup, getFactoringAdvancePacket) all set app.operating_company_id directly
 * from the caller-supplied query param with no independent check of their own, and the underlying
 * RLS policies only compare against that same GUC (live-verified on prod, same non-backstop class
 * as ACCT-F5592/ACCT-F5593). A company member of one entity could read another entity's Faro
 * factoring reserve balances or a full advance packet (invoices, reserve ledger, interest ledger).
 * The file's other 9 routes were already safe via the shared withCompanyScope() helper.
 *
 * This static check (no DB connection) asserts each of the 3 routes calls assertCompanyMembership
 * before its business logic.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify:factoring-reserve-balances-membership-assert";
const SELFTEST = process.argv.includes("--selftest");
const FILE = "apps/backend/src/accounting/factoring-advances.routes.ts";

const GATE_LINE = "await assertCompanyMembership(user.uuid, query.data.operating_company_id);";
const ROUTES = [
  ['app.get("/api/v1/accounting/factoring-reserve-balances"', "GET /factoring-reserve-balances"],
  ['app.get("/api/v1/accounting/factoring-advances/reserve-tracker"', "GET /factoring-advances/reserve-tracker"],
  ['app.get("/api/v1/accounting/factoring-advances/:id/packet"', "GET /factoring-advances/:id/packet"],
];

function assertAll(src) {
  const problems = [];
  for (const [needle, label] of ROUTES) {
    const idx = src.indexOf(needle);
    if (idx === -1) {
      problems.push(`${label}: route not found (guard target moved; update this guard)`);
      continue;
    }
    const window = src.slice(idx, idx + 900);
    if (!window.includes(GATE_LINE)) {
      problems.push(`${label}: does not call assertCompanyMembership before business logic`);
    }
  }
  return problems;
}

const read = () => fs.readFileSync(path.join(ROOT, FILE), "utf8");

if (SELFTEST) {
  const src = read();
  // Plant the defect on the third route (:id/packet) to prove the fix generalizes across the array.
  const [needle, label] = ROUTES[2];
  const idx = src.indexOf(needle);
  if (idx === -1) {
    console.error(`${LABEL} SELFTEST SETUP FAILED: ${label} route not found in real code`);
    process.exit(1);
  }
  const gateIdx = src.indexOf(GATE_LINE, idx);
  if (gateIdx === -1 || gateIdx - idx > 900) {
    console.error(`${LABEL} SELFTEST SETUP FAILED: gate line not found near ${label} (guard text drifted from real code)`);
    process.exit(1);
  }
  const lineStart = src.lastIndexOf("\n", gateIdx) + 1;
  const lineEnd = src.indexOf("\n", gateIdx) + 1;
  const planted = src.slice(0, lineStart) + src.slice(lineEnd);

  const plantedProblems = assertAll(planted);
  if (!plantedProblems.some((p) => p.startsWith(label))) {
    console.error(`${LABEL} SELFTEST FAILED: planted defect (${label} gate dropped) not caught`);
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
