#!/usr/bin/env node
/**
 * ACCT-F5596 regression guard — every route in accounting/escrow/routes.ts must assert company
 * membership before touching an escrow account (driver bond / repair reserve / factor reserve
 * liability).
 *
 * ALL 6 routes (open, accounts list, holder lookup, postings list, deposit, release) had a role
 * check (canAccessEscrow) but ZERO membership check anywhere -- not in the route, and not in
 * accounting/escrow/service.ts either (only a direct set_config from caller input). Live-verified
 * on prod (tiny-field-89581227) that accounting.escrow_accounts / accounting.escrow_postings' RLS
 * policy only compares operating_company_id against that SAME app.operating_company_id GUC these
 * routes themselves set -- no independent backstop, same non-backstop class as ACCT-F5592-F5595.
 * A company member of one entity could open, read, deposit into, or -- most severely -- RELEASE
 * REAL MONEY from another entity's escrow liability account.
 *
 * This static check (no DB connection) asserts every one of the 6 routes calls
 * assertCompanyMembership before its business logic.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify:escrow-routes-membership-assert";
const SELFTEST = process.argv.includes("--selftest");
const FILE = "apps/backend/src/accounting/escrow/routes.ts";
const GATE_LINE_BODY = "await assertCompanyMembership(user.uuid, body.data.operating_company_id);";
const GATE_LINE_QUERY = "await assertCompanyMembership(user.uuid, query.data.operating_company_id);";

const ROUTES = [
  ['app.post("/api/v1/accounting/escrow/open"', "POST /escrow/open", GATE_LINE_BODY],
  ['app.get("/api/v1/accounting/escrow/accounts"', "GET /escrow/accounts", GATE_LINE_QUERY],
  ['app.get("/api/v1/accounting/escrow/holder/:holder_type/:holder_id/:purpose"', "GET /escrow/holder/...", GATE_LINE_QUERY],
  ['app.get("/api/v1/accounting/escrow/accounts/:escrow_account_id/postings"', "GET /escrow/accounts/:id/postings", GATE_LINE_QUERY],
  ['app.post("/api/v1/accounting/escrow/deposit"', "POST /escrow/deposit", GATE_LINE_BODY],
  ['app.post("/api/v1/accounting/escrow/release"', "POST /escrow/release", GATE_LINE_BODY],
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
  // Plant the defect on release -- the most severe route (moves real money out of the account).
  const [needle, label, gateLine] = ROUTES[5];
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
