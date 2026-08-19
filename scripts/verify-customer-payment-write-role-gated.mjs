#!/usr/bin/env node
/**
 * ACCT-F5581 regression guard — POST /customers/:id/payments must require an accounting role.
 *
 * accounting/customer-payments.routes.ts's POST /:id/payments records a real cash receipt and,
 * when CUSTOMER_PAYMENT_GL_POSTING_ENABLED is on, posts a real journal entry via
 * postSourceTransactionInClientTx -- yet had no role gate at all, any authenticated company member
 * could fabricate a "payment received" record.
 *
 * Fix: requirePaymentWriteRole() reuses the canonical void/cancel executor role predicate
 * (canVoidCancel: Owner/Administrator/Accountant) since recording cash receipt is the same tier of
 * financial-executor operation.
 *
 * This static check (no DB connection) asserts the POST route calls requirePaymentWriteRole before
 * any business logic runs.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify:customer-payment-write-role-gated";
const SELFTEST = process.argv.includes("--selftest");
const FILE = "apps/backend/src/accounting/customer-payments.routes.ts";

function assertAll(src) {
  const problems = [];

  if (!/function requirePaymentWriteRole\(reply: FastifyReply, role: string\) \{\s*\n\s*if \(!canVoidCancel\(role\)\)/.test(src)) {
    problems.push(`requirePaymentWriteRole() not found or no longer calls canVoidCancel()`);
  }
  if (!/const user = currentAuthUser\(req, reply\);\s*\n\s*if \(!user\) return;\s*\n\s*if \(!requirePaymentWriteRole\(reply, String\(user\.role \?\? ""\)\)\) return;\s*\n\n\s*const params = customerIdParamsSchema/.test(src)) {
    problems.push(`POST /:id/payments no longer calls requirePaymentWriteRole before parsing params`);
  }

  return problems;
}

const read = () => fs.readFileSync(path.join(ROOT, FILE), "utf8");

if (SELFTEST) {
  const src = read();

  const planted = src.replace(
    '    if (!requirePaymentWriteRole(reply, String(user.role ?? ""))) return;\n\n',
    "",
  );
  if (planted === src) {
    console.error(`${LABEL} SELFTEST SETUP FAILED: mutation target not found (guard text drifted from real code)`);
    process.exit(1);
  }
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
