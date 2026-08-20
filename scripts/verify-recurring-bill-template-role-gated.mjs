#!/usr/bin/env node
/**
 * RECURRING-BILL-TEMPLATE-NO-ROLE-GATE regression guard — every route in
 * accounting/bills/recurring/routes.ts must require an accounting role, not just a session.
 *
 * All 7 routes (create, list, get-by-id, update, deactivate, generate-now, generation-log) had
 * NO role check at all -- only currentAuthUser (session-only). Any authenticated user of any role,
 * including a Driver, could create/edit/deactivate/manually-trigger recurring bill templates, which
 * -- when auto_post is enabled -- create real GL-posted bills. Companion finding to ACCT-F5595
 * (the ownership/membership fix already shipped for update/deactivate/generate-now), deliberately
 * filed and fixed separately to keep each change scoped and reviewable.
 *
 * This static check (no DB connection) asserts every one of the file's 7 routes calls
 * canAccessAccounting before its business logic.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify:recurring-bill-template-role-gated";
const SELFTEST = process.argv.includes("--selftest");
const FILE = "apps/backend/src/accounting/bills/recurring/routes.ts";
const GATE_LINE = 'if (!canAccessAccounting(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });';

const ROUTES = [
  ['app.post("/api/v1/accounting/recurring-bill-templates", async', "POST /recurring-bill-templates (create)"],
  ['app.get("/api/v1/accounting/recurring-bill-templates", async', "GET /recurring-bill-templates (list)"],
  ['app.get("/api/v1/accounting/recurring-bill-templates/:uuid"', "GET /:uuid"],
  ['app.patch("/api/v1/accounting/recurring-bill-templates/:uuid"', "PATCH /:uuid"],
  ['app.post("/api/v1/accounting/recurring-bill-templates/:uuid/deactivate"', "POST /:uuid/deactivate"],
  ['app.post("/api/v1/accounting/recurring-bill-templates/:uuid/generate-now"', "POST /:uuid/generate-now"],
  ['app.get("/api/v1/accounting/recurring-bill-templates/generation-log"', "GET /generation-log"],
];
const WINDOW = 300;

function assertAll(src) {
  const problems = [];
  if (!/function canAccessAccounting\(role: string\) \{/.test(src)) {
    problems.push("canAccessAccounting() helper not found");
  }
  for (const [needle, label] of ROUTES) {
    const idx = src.indexOf(needle);
    if (idx === -1) {
      problems.push(`${label}: route not found (guard target moved; update this guard)`);
      continue;
    }
    const window = src.slice(idx, idx + WINDOW);
    if (!window.includes(GATE_LINE)) {
      problems.push(`${label}: does not call canAccessAccounting before business logic`);
    }
  }
  return problems;
}

const read = () => fs.readFileSync(path.join(ROOT, FILE), "utf8");

if (SELFTEST) {
  const src = read();
  // Plant the defect on generate-now -- the most severe route (creates a real bill).
  const [needle, label] = ROUTES[5];
  const idx = src.indexOf(needle);
  if (idx === -1) {
    console.error(`${LABEL} SELFTEST SETUP FAILED: ${label} route not found in real code`);
    process.exit(1);
  }
  const gateIdx = src.indexOf(GATE_LINE, idx);
  if (gateIdx === -1 || gateIdx - idx > WINDOW) {
    console.error(`${LABEL} SELFTEST SETUP FAILED: gate line not found near ${label} (guard text drifted from real code)`);
    process.exit(1);
  }
  const lineStart = src.lastIndexOf("\n", gateIdx) + 1;
  const lineEnd = src.indexOf("\n", gateIdx) + 1;
  const planted = src.slice(0, lineStart) + src.slice(lineEnd);

  const plantedProblems = assertAll(planted);
  if (!plantedProblems.some((p) => p.startsWith(label))) {
    console.error(`${LABEL} SELFTEST FAILED: planted defect (${label} role gate dropped) not caught`);
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
