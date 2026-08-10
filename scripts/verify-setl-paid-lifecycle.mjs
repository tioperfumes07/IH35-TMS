#!/usr/bin/env node
/**
 * SETL-PAID-LIFECYCLE — markPaidManually must stamp paid_at (and heal NULL paid_at
 * when payment_state is already manual_paid).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-setl-paid-lifecycle";
const SVC = path.join(ROOT, "apps/backend/src/driver-finance/settlement-payment.service.ts");

function fail(msg) {
  console.error(`[${LABEL}] FAIL: ${msg}`);
  process.exit(1);
}

function audit() {
  const problems = [];
  if (!fs.existsSync(SVC)) {
    problems.push(`missing ${SVC}`);
    return problems;
  }
  const src = fs.readFileSync(SVC, "utf8");
  if (!src.includes("paid_at = COALESCE(paid_at, now())")) {
    problems.push("markPaidManually UPDATE must set paid_at = COALESCE(paid_at, now())");
  }
  if (!/SETTLEMENT_ROW_COLUMNS[\s\S]*paid_at/.test(src) && !src.includes(", paid_at")) {
    problems.push("SETTLEMENT_ROW_COLUMNS must include paid_at");
  }
  if (!src.includes("AND paid_at IS NULL")) {
    problems.push("heal path must UPDATE when manual_paid AND paid_at IS NULL");
  }
  if (!src.includes("paid_at = now()")) {
    problems.push("heal path must SET paid_at = now()");
  }
  return problems;
}

function selftest() {
  const original = fs.readFileSync(SVC, "utf8");
  if (!original.includes("paid_at = COALESCE(paid_at, now())")) {
    fail("selftest precondition: service must already contain paid_at COALESCE");
  }
  let planted = 0;

  const broken = original.replace("paid_at = COALESCE(paid_at, now()),", "/* planted */");
  fs.writeFileSync(SVC, broken);
  try {
    if (audit().length === 0) fail("selftest: expected FAIL after removing COALESCE paid_at");
    planted += 1;
  } finally {
    fs.writeFileSync(SVC, original);
  }

  const brokenHeal = original.replace("AND paid_at IS NULL", "AND paid_at IS NOT NULL /* planted */");
  fs.writeFileSync(SVC, brokenHeal);
  try {
    if (audit().length === 0) fail("selftest: expected FAIL after breaking heal predicate");
    planted += 1;
  } finally {
    fs.writeFileSync(SVC, original);
  }

  console.log(`[${LABEL}] selftest PASS (${planted} plants)`);
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--selftest")) {
    selftest();
    return;
  }
  const problems = audit();
  if (problems.length) {
    for (const p of problems) console.error(`[${LABEL}] FAIL: ${p}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] PASS`);
}

main();
