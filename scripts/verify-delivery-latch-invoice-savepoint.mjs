#!/usr/bin/env node
/**
 * L-0099 / delivery-evidence-latch — convertAndSendInvoiceOnDelivery must use SAVEPOINT so a
 * failed proforma convert/send cannot 25P02-poison the load transition transaction.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-delivery-latch-invoice-savepoint";
const LATCH = path.join(ROOT, "apps/backend/src/dispatch/delivery-evidence-latch.ts");
const SP = "delivery_invoice_convert_send";

function fail(msg) {
  console.error(`[${LABEL}] FAIL: ${msg}`);
  process.exit(1);
}

function audit() {
  const problems = [];
  if (!fs.existsSync(LATCH)) {
    problems.push(`missing ${LATCH}`);
    return problems;
  }
  const src = fs.readFileSync(LATCH, "utf8");
  if (!src.includes("async function convertAndSendInvoiceOnDelivery")) {
    problems.push("convertAndSendInvoiceOnDelivery must exist");
  }
  // Require the open SAVEPOINT query string (not merely ROLLBACK/RELEASE mentions).
  if (!src.includes(`query("SAVEPOINT ${SP}")`) && !src.includes(`query('SAVEPOINT ${SP}')`)) {
    problems.push(`convertAndSendInvoiceOnDelivery must open SAVEPOINT ${SP} via client.query`);
  }
  if (!src.includes(`ROLLBACK TO SAVEPOINT ${SP}`)) {
    problems.push(`convertAndSendInvoiceOnDelivery must ROLLBACK TO SAVEPOINT ${SP} on failure`);
  }
  return problems;
}

function selftest() {
  const original = fs.readFileSync(LATCH, "utf8");
  if (!original.includes(`query("SAVEPOINT ${SP}")`) && !original.includes(`query('SAVEPOINT ${SP}')`)) {
    fail(`selftest precondition: latch must open SAVEPOINT ${SP}`);
  }
  let planted = 0;

  const noOpen = original
    .replaceAll(`query("SAVEPOINT ${SP}")`, 'query("SELECT 1 /* planted */")')
    .replaceAll(`query('SAVEPOINT ${SP}')`, "query('SELECT 1 /* planted */')");
  fs.writeFileSync(LATCH, noOpen);
  try {
    if (audit().length === 0) fail("selftest: expected FAIL after removing SAVEPOINT open");
    planted += 1;
  } finally {
    fs.writeFileSync(LATCH, original);
  }

  const noRb = original.replaceAll(`ROLLBACK TO SAVEPOINT ${SP}`, "ROLLBACK TO SAVEPOINT __plant__");
  fs.writeFileSync(LATCH, noRb);
  try {
    if (audit().length === 0) fail("selftest: expected FAIL after removing ROLLBACK TO SAVEPOINT");
    planted += 1;
  } finally {
    fs.writeFileSync(LATCH, original);
  }

  if (planted < 2) fail(`selftest planted ${planted}/2`);
  console.log(`[${LABEL}] selftest PASS (${planted} planted failures)`);
}

function main() {
  if (process.argv.includes("--selftest")) {
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
