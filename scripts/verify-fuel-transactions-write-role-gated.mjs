#!/usr/bin/env node
/**
 * ACCT-F5586 regression guard — fuel transaction create/load-attribution must require an accounting
 * role.
 *
 * fuel/fuel-transactions.routes.ts's POST /transactions (manual office create -- a real expense that
 * can trigger a real GL posting via flushFuelGlPostsAfterCommit) and PATCH /:id/load (reassigns
 * which load a real fuel cost is attributed to) had no role gate at all -- currentAuthUser only
 * requires a session.
 *
 * Fix: requireFuelWriteRole() reuses the canonical void/cancel executor role predicate
 * (canVoidCancel: Owner/Administrator/Accountant), matching accounting/expenses.routes.ts's own
 * accountingRoles for the same class of financial-write operation.
 *
 * This static check (no DB connection) asserts both routes call requireFuelWriteRole before any
 * business logic runs.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify:fuel-transactions-write-role-gated";
const SELFTEST = process.argv.includes("--selftest");
const FILE = "apps/backend/src/fuel/fuel-transactions.routes.ts";

const ROUTES = [
  ['app.post("/api/v1/fuel/transactions", ', "POST /fuel/transactions"],
  ['"/api/v1/fuel/transactions/:id/load"', "PATCH /:id/load"],
];

function assertAll(src) {
  const problems = [];

  if (!/function requireFuelWriteRole\(reply: FastifyReply, role: string\) \{\s*\n\s*if \(!canVoidCancel\(role\)\)/.test(src)) {
    problems.push(`requireFuelWriteRole() not found or no longer calls canVoidCancel()`);
  }

  for (const [needle, label] of ROUTES) {
    const idx = src.indexOf(needle);
    if (idx === -1) {
      problems.push(`${label}: route not found (guard target moved; update this guard)`);
      continue;
    }
    const window = src.slice(idx, idx + 300);
    if (!/if \(!requireFuelWriteRole\(reply, String\(authUser\.role \?\? ""\)\)\) return;/.test(window)) {
      problems.push(`${label}: does not call requireFuelWriteRole before business logic`);
    }
  }

  return problems;
}

const read = () => fs.readFileSync(path.join(ROOT, FILE), "utf8");

if (SELFTEST) {
  const src = read();

  const planted = src.replace(
    'app.post("/api/v1/fuel/transactions", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {\n    const authUser = currentAuthUser(req, reply);\n    if (!authUser) return;\n    if (!requireFuelWriteRole(reply, String(authUser.role ?? ""))) return;\n',
    'app.post("/api/v1/fuel/transactions", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {\n    const authUser = currentAuthUser(req, reply);\n    if (!authUser) return;\n',
  );
  if (planted === src) {
    console.error(`${LABEL} SELFTEST SETUP FAILED: mutation target not found (guard text drifted from real code)`);
    process.exit(1);
  }
  if (!assertAll(planted).length) {
    console.error(`${LABEL} SELFTEST FAILED: planted defect (POST create role gate dropped, PATCH left intact) not caught`);
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
