#!/usr/bin/env node
/**
 * verify-acct-txn-register-detail-paths — All Transactions + Account Register reverse (25/28).
 *
 * Root cause: TRANSACTION_REGISTER_UNION_SQL emitted list-only detail_path for bill/bank/fuel/
 * settlement (no id). Account Register sourceRoute ignored transfer and settlement id.
 *
 * Fix: id-scoped detail_path strings + transfer → /banking/transfers. No posting/GL.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-acct-txn-register-detail-paths";

const ROUTES = "apps/backend/src/accounting/transaction-register.routes.ts";
const REGISTER = "apps/frontend/src/pages/accounting/AccountRegisterPage.tsx";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function check({ routes, register }) {
  const errors = [];

  if (!routes) {
    errors.push(`${ROUTES}: missing`);
  } else {
    if (!routes.includes("'/accounting/bills/' || b.id::text AS detail_path")) {
      errors.push(`${ROUTES}: bill arm must detail_path to /accounting/bills/:id`);
    }
    if (routes.includes("'/accounting/bills' AS detail_path")) {
      errors.push(`${ROUTES}: bare /accounting/bills detail_path is a dead-end`);
    }
    if (!routes.includes("'/banking/transactions?txn_id=' || bt.id::text AS detail_path")) {
      errors.push(`${ROUTES}: bank arm must include txn_id deep-link`);
    }
    if (!routes.includes("'/driver-finance/settlements?settlement_id=' || s.id::text AS detail_path")) {
      errors.push(`${ROUTES}: settlement arm must include settlement_id`);
    }
    if (!routes.includes("'/fuel/history?transaction_id=' || ft.id::text AS detail_path")) {
      errors.push(`${ROUTES}: fuel arm must include transaction_id`);
    }
  }

  if (!register) {
    errors.push(`${REGISTER}: missing`);
  } else {
    if (!/if \(t === "transfer"\) return "\/banking\/transfers"/.test(register)) {
      errors.push(`${REGISTER}: sourceRoute must map transfer → /banking/transfers`);
    }
    if (!register.includes("`/driver-finance/settlements?settlement_id=${reference}`")) {
      errors.push(`${REGISTER}: sourceRoute must deep-link settlement with settlement_id`);
    }
  }

  return errors;
}

function selftest() {
  const goodRoutes = `
    '/banking/transactions?txn_id=' || bt.id::text AS detail_path
    '/fuel/history?transaction_id=' || ft.id::text AS detail_path
    '/accounting/bills/' || b.id::text AS detail_path
    '/driver-finance/settlements?settlement_id=' || s.id::text AS detail_path
  `;
  const goodRegister = `
    if (t === "settlement" && reference) return \`/driver-finance/settlements?settlement_id=\${reference}\`;
    if (t === "transfer") return "/banking/transfers";
  `;
  const errors = check({ routes: goodRoutes, register: goodRegister });
  if (errors.length) {
    console.error(`${LABEL} SELFTEST FAILED: ${errors.join("; ")}`);
    process.exit(1);
  }
  const planted = check({
    routes: "'/accounting/bills' AS detail_path\n'/banking/transactions' AS detail_path",
    register: 'if (t === "settlement") return "/driver-finance/settlements";',
  });
  if (planted.length < 3) {
    console.error(`${LABEL} SELFTEST FAILED: planted dead-ends must fail`);
    process.exit(1);
  }
}

if (process.argv.includes("--selftest")) {
  selftest();
  console.log(`PASS: ${LABEL} --selftest`);
  process.exit(0);
}

const errors = check({ routes: read(ROUTES), register: read(REGISTER) });
if (errors.length) {
  for (const e of errors) console.error(`FAIL: ${e}`);
  process.exit(1);
}
console.log(`PASS: ${LABEL}`);
