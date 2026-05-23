#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const servicePath = path.join(repoRoot, "apps/backend/src/accounting/payments/apply.service.ts");

function fail(messages) {
  console.error("verify:payment-application-no-overpay — FAILED");
  for (const message of messages) console.error(`- ${message}`);
  process.exit(1);
}

const failures = [];
if (!fs.existsSync(servicePath)) {
  failures.push("missing apps/backend/src/accounting/payments/apply.service.ts");
} else {
  const source = fs.readFileSync(servicePath, "utf8");
  if (!/requestedTotal > Number\(payment\.amount_unapplied_cents/.test(source)) {
    failures.push("apply.service must block requests that exceed payment.amount_unapplied_cents");
  }
  if (!/amount_exceeds_payment_unapplied/.test(source)) {
    failures.push("apply.service must throw amount_exceeds_payment_unapplied when overpay is requested");
  }
  if (!/createArCreditMemo/.test(source)) {
    failures.push("apply.service must create an AR credit memo for unapplied overpayment");
  }
}

if (failures.length > 0) fail(failures);
console.log("verify:payment-application-no-overpay — OK");
