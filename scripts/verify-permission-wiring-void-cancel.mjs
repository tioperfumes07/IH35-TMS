#!/usr/bin/env node
/**
 * PERMISSION WIRING 10.4 smoke — void/cancel dual-path helper wired on financial + WO routes.
 * Standalone script (no verify-steps/NNNN registration — run via node directly or from step 88).
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function read(rel) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) {
    console.error(`verify-permission-wiring-void-cancel FAILED — missing ${rel}`);
    process.exit(1);
  }
  return fs.readFileSync(file, "utf8");
}

function requireAll(rel, src, tokens) {
  const missing = tokens.filter((t) => !src.includes(t));
  if (missing.length) {
    console.error(
      `verify-permission-wiring-void-cancel FAILED — ${rel} missing:\n  ${missing.join("\n  ")}`
    );
    process.exit(1);
  }
}

const AUTHZ = "apps/backend/src/lib/authz/void-cancel-authz.ts";
const authz = read(AUTHZ);
requireAll(AUTHZ, authz, [
  "export async function requireVoidCancelExecutorWired",
  "PERMISSION_MODEL_ENFORCED",
  "identity.has_permission",
  "export function requireVoidCancelExecutor",
  "export function canVoidCancel",
]);

const wiredRoutes = [
  { rel: "apps/backend/src/accounting/payments.routes.ts", token: "requireVoidCancelExecutorWired", key: "payment.void" },
  { rel: "apps/backend/src/accounting/invoices.routes.ts", token: "requireVoidCancelExecutorWired", key: "invoice.void" },
  { rel: "apps/backend/src/accounting/bills.routes.ts", token: "requireVoidCancelExecutorWired", key: "bill.void" },
  { rel: "apps/backend/src/accounting/bills.routes.ts", token: "requireVoidCancelExecutorWired", key: "bill_payment.void" },
  { rel: "apps/backend/src/accounting/prepaid-expenses.routes.ts", token: "requireVoidCancelExecutorWired", key: "expense.void" },
  { rel: "apps/backend/src/work-orders/work-orders.routes.ts", token: "requireVoidCancelExecutorWired", key: "work_order.void" },
  { rel: "apps/backend/src/accounting/factoring-advances.routes.ts", token: "requireVoidCancelExecutorWired" },
];

for (const { rel, token, key } of wiredRoutes) {
  const src = read(rel);
  if (!src.includes(token)) {
    console.error(`verify-permission-wiring-void-cancel FAILED — ${rel} does not call ${token}`);
    process.exit(1);
  }
  if (key && !src.includes(key)) {
    console.error(`verify-permission-wiring-void-cancel FAILED — ${rel} missing permission key ${key}`);
    process.exit(1);
  }
}

console.log(
  "verify-permission-wiring-void-cancel OK — requireVoidCancelExecutorWired + PERMISSION_MODEL_ENFORCED/has_permission in authz; financial + WO routes wired"
);
