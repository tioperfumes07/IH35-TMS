#!/usr/bin/env node
/**
 * ACCT-F5583 regression guard — payment-application apply/unapply must require an accounting role.
 *
 * accounting/payment-applications.routes.ts's POST /:paymentId/applications (allocates a real
 * payment to an invoice/bill) and DELETE /:paymentId/applications/:id (unapplies that allocation)
 * had no role gate at all -- currentAuthUser only requires a valid session, and withCompanyScope's
 * company-membership check is role-agnostic.
 *
 * Fix: requirePaymentWriteRole() reuses the canonical void/cancel executor role predicate
 * (canVoidCancel: Owner/Administrator/Accountant), matching the fix already applied to the sibling
 * customer-payments.routes.ts (ACCT-F5581) and vendor-bill-payments.routes.ts (ACCT-F5582).
 *
 * This static check (no DB connection) asserts both routes call requirePaymentWriteRole before any
 * business logic runs.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify:payment-application-write-role-gated";
const SELFTEST = process.argv.includes("--selftest");
const FILE = "apps/backend/src/accounting/payment-applications.routes.ts";

const ROUTES = [
  ['app.post("/api/v1/accounting/payments/:paymentId/applications"', "POST /:paymentId/applications"],
  ['app.delete("/api/v1/accounting/payments/:paymentId/applications/:id"', "DELETE /:paymentId/applications/:id"],
];

function assertAll(src) {
  const problems = [];

  if (!/function requirePaymentWriteRole\(reply: FastifyReply, role: string\) \{\s*\n\s*if \(!canVoidCancel\(role\)\)/.test(src)) {
    problems.push(`requirePaymentWriteRole() not found or no longer calls canVoidCancel()`);
  }

  for (const [needle, label] of ROUTES) {
    const idx = src.indexOf(needle);
    if (idx === -1) {
      problems.push(`${label}: route not found (guard target moved; update this guard)`);
      continue;
    }
    const window = src.slice(idx, idx + 400);
    if (!/if \(!requirePaymentWriteRole\(reply, String\(user\.role \?\? ""\)\)\) return;/.test(window)) {
      problems.push(`${label}: does not call requirePaymentWriteRole before business logic`);
    }
  }

  return problems;
}

const read = () => fs.readFileSync(path.join(ROOT, FILE), "utf8");

if (SELFTEST) {
  const src = read();

  const planted = src.replace(
    'app.delete("/api/v1/accounting/payments/:paymentId/applications/:id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {\n    const user = currentAuthUser(req, reply);\n    if (!user) return;\n    if (!requirePaymentWriteRole(reply, String(user.role ?? ""))) return;\n',
    'app.delete("/api/v1/accounting/payments/:paymentId/applications/:id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {\n    const user = currentAuthUser(req, reply);\n    if (!user) return;\n',
  );
  if (planted === src) {
    console.error(`${LABEL} SELFTEST SETUP FAILED: mutation target not found (guard text drifted from real code)`);
    process.exit(1);
  }
  if (!assertAll(planted).length) {
    console.error(`${LABEL} SELFTEST FAILED: planted defect (DELETE route role gate dropped, POST left intact) not caught`);
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
