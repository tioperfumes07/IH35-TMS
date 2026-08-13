#!/usr/bin/env node
/**
 * ACCT-F5026 — LV-BILLVOID class remainder: customer_payment void must pass ISO YYYY-MM-DD
 * into postVoidReversal. String(pgDate).slice(0,10) → "Thu Aug 06" → Postgres date parse 500.
 *
 * Ratchet:
 * 1) payments.routes void SELECT must project payment_date::text AS payment_date_iso
 * 2) must NOT use String(payment.payment_date).slice(0, 10)
 * 3) void.service postVoidReversal must assertIsoDay / refuse non-ISO before ::date bind
 * 4) pgDateColumnToIsoDay helper must exist
 *
 * @matrix-built {"modules":["accounting"],"cols":["connectivity"],"leafRe":"^(payments|void|customer)","task":"ACCT-F5026-VOID-ORIGINAL-DATE-ISO","pr":"this PR"}
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const paymentsRel = "apps/backend/src/accounting/payments.routes.ts";
const voidRel = "apps/backend/src/accounting/void.service.ts";

function checkPayments(src, label = paymentsRel) {
  const findings = [];
  if (!/payment_date::text\s+AS\s+payment_date_iso/i.test(src)) {
    findings.push(`${label}: void SELECT must project payment_date::text AS payment_date_iso`);
  }
  if (/String\(\s*payment\.payment_date[^)]*\)\s*\.slice\(\s*0\s*,\s*10\s*\)/.test(src)) {
    findings.push(`${label}: forbids String(payment.payment_date).slice(0, 10) — LV-BILLVOID class`);
  }
  if (!/pgDateColumnToIsoDay\s*\(/.test(src)) {
    findings.push(`${label}: void originalDate must use pgDateColumnToIsoDay(...)`);
  }
  return findings;
}

function checkVoidService(src, label = voidRel) {
  const findings = [];
  if (!/export function pgDateColumnToIsoDay\b/.test(src)) {
    findings.push(`${label}: must export pgDateColumnToIsoDay`);
  }
  if (!/export function assertIsoDay\b/.test(src)) {
    findings.push(`${label}: must export assertIsoDay`);
  }
  if (!/assertIsoDay\s*\(\s*params\.originalDate/.test(src)) {
    findings.push(`${label}: postVoidReversal must call assertIsoDay(params.originalDate, …)`);
  }
  return findings;
}

function selftest() {
  const badPay = `
    SELECT * FROM accounting.payments WHERE id = $1;
    originalDate: String(payment.payment_date ?? "").slice(0, 10),
  `;
  if (checkPayments(badPay, "selftest-bad-pay").length === 0) {
    console.error("verify-void-original-date-iso --selftest FAIL: bad payment void did not redden");
    process.exit(1);
  }
  const goodPay = `
    SELECT *, payment_date::text AS payment_date_iso FROM accounting.payments WHERE id = $1;
    originalDate: pgDateColumnToIsoDay(payment.payment_date_iso ?? payment.payment_date),
  `;
  const goodPayFindings = checkPayments(goodPay, "selftest-good-pay");
  if (goodPayFindings.length > 0) {
    console.error("verify-void-original-date-iso --selftest FAIL: good payment void reddened");
    for (const f of goodPayFindings) console.error(`  - ${f}`);
    process.exit(1);
  }
  const badVoid = `export async function postVoidReversal() { const reversalDate = resolveReversalDate(params.originalDate, cutoff, currentDate); }`;
  if (checkVoidService(badVoid, "selftest-bad-void").length === 0) {
    console.error("verify-void-original-date-iso --selftest FAIL: bad void.service did not redden");
    process.exit(1);
  }
  const goodVoid = `
    export function pgDateColumnToIsoDay(value) { return "2026-08-06"; }
    export function assertIsoDay(d) { return d; }
    export async function postVoidReversal() {
      const originalDateIso = assertIsoDay(params.originalDate, "customer_payment.originalDate");
    }
  `;
  const goodVoidFindings = checkVoidService(goodVoid, "selftest-good-void");
  if (goodVoidFindings.length > 0) {
    console.error("verify-void-original-date-iso --selftest FAIL: good void.service reddened");
    for (const f of goodVoidFindings) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("verify-void-original-date-iso --selftest PASS");
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const paymentsSrc = fs.readFileSync(path.join(root, paymentsRel), "utf8");
  const voidSrc = fs.readFileSync(path.join(root, voidRel), "utf8");
  const findings = [...checkPayments(paymentsSrc), ...checkVoidService(voidSrc)];
  if (findings.length > 0) {
    console.error("verify-void-original-date-iso FAILED:");
    for (const f of findings) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("verify-void-original-date-iso PASS");
}

main();
