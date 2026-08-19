#!/usr/bin/env node
/**
 * ACCT-F5597 regression guard — every route in accounting/factor-reconciliation/routes.ts must
 * assert company membership before touching factoring reconciliation data.
 *
 * All 4 routes (import-candidates, runs, runs/:id/items, import) had a role check
 * (canAccessAccounting) but ZERO membership check -- not in the route, and not in recon.service.ts
 * either (only a direct set_config from caller input). A company member of one entity could read
 * another entity's factoring reconciliation runs/items, or -- the one WRITE route -- commit a real
 * factoring statement import affecting that entity's reserve balances.
 *
 * This static check (no DB connection) asserts every one of the 4 routes calls
 * assertCompanyMembership before its business logic.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify:factor-reconciliation-membership-assert";
const SELFTEST = process.argv.includes("--selftest");
const FILE = "apps/backend/src/accounting/factor-reconciliation/routes.ts";
const GATE_LINE_QUERY = "await assertCompanyMembership(user.uuid, query.data.operating_company_id);";
const GATE_LINE_BODY = "await assertCompanyMembership(user.uuid, body.data.operating_company_id);";

const ROUTES = [
  ['app.get("/api/v1/accounting/factor-reconciliation/import-candidates"', "GET /import-candidates", GATE_LINE_QUERY],
  ['app.get("/api/v1/accounting/factor-reconciliation/runs"', "GET /runs", GATE_LINE_QUERY],
  ['app.get("/api/v1/accounting/factor-reconciliation/runs/:run_id/items"', "GET /runs/:id/items", GATE_LINE_QUERY],
  ['app.post("/api/v1/accounting/factor-reconciliation/import"', "POST /import", GATE_LINE_BODY],
];
const WINDOW = 900;

function assertAll(src) {
  const problems = [];
  for (const [needle, label, gateLine] of ROUTES) {
    const idx = src.indexOf(needle);
    if (idx === -1) {
      problems.push(`${label}: route not found (guard target moved; update this guard)`);
      continue;
    }
    const window = src.slice(idx, idx + WINDOW);
    if (!window.includes(gateLine)) {
      problems.push(`${label}: does not call assertCompanyMembership before business logic`);
    }
  }
  return problems;
}

const read = () => fs.readFileSync(path.join(ROOT, FILE), "utf8");

if (SELFTEST) {
  const src = read();
  // Plant the defect on POST /import -- the only WRITE route.
  const [needle, label, gateLine] = ROUTES[3];
  const idx = src.indexOf(needle);
  if (idx === -1) {
    console.error(`${LABEL} SELFTEST SETUP FAILED: ${label} route not found in real code`);
    process.exit(1);
  }
  const gateIdx = src.indexOf(gateLine, idx);
  if (gateIdx === -1 || gateIdx - idx > WINDOW) {
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
