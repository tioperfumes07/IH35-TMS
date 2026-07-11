#!/usr/bin/env node
// verify-bill-payment-posts-gl (P1-BILLPAY-GL regression guard)
// payBill() must post the bill_payment JE ATOMICALLY (same transaction as the bank-cache decrement) and
// gate the whole payment on BILL_PAYMENT_GL_POSTING_ENABLED — it must never regress to decrementing the
// bank with no offsetting JE, and the atomic poster (postSourceTransactionInClientTx) must exist so the
// bank cache and GL can never diverge. Self-test: --selftest.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BILLS = "apps/backend/src/accounting/bills.service.ts";
const ENGINE = "apps/backend/src/accounting/posting-engine.service.ts";

function read(rel) { return fs.readFileSync(path.join(ROOT, rel), "utf8"); }

/** Body of `export async function payBill(...)` up to the next top-level export. */
function payBillBody(src) {
  const start = src.search(/export\s+async\s+function\s+payBill\s*\(/);
  if (start < 0) return "";
  const rest = src.slice(start + 8);
  const next = rest.search(/\nexport\s+(async\s+)?function\s/);
  return next < 0 ? rest : rest.slice(0, next);
}

export function check() {
  const failures = [];
  let bills, engine;
  try { bills = read(BILLS); } catch { return [`${BILLS} not found`]; }
  try { engine = read(ENGINE); } catch { return [`${ENGINE} not found`]; }

  if (!/export\s+async\s+function\s+postSourceTransactionInClientTx/.test(engine)) {
    failures.push(`${ENGINE}: postSourceTransactionInClientTx (the atomic, caller-txn poster) must be exported — required so payBill posts the JE + cache decrement in ONE transaction`);
  }

  const body = payBillBody(bills);
  if (!body) { failures.push(`${BILLS}: payBill() not found`); return failures; }
  if (!/isBillPaymentGlPostingEnabled/.test(body)) {
    failures.push(`${BILLS}: payBill() must resolve isBillPaymentGlPostingEnabled (BILL_PAYMENT_GL_POSTING_ENABLED) to decide whether to post the JE`);
  }
  if (!/blocked_flag_off/.test(body)) {
    failures.push(`${BILLS}: payBill() must surface gl_posting:"blocked_flag_off" when posting is disabled (no silent success)`);
  }
  if (!/postSourceTransactionInClientTx/.test(body)) {
    failures.push(`${BILLS}: payBill() must post the bill_payment JE via postSourceTransactionInClientTx (atomic, same txn as updateBankBalance) — else the bank decrements with no offsetting JE (P1-BILLPAY-GL regression)`);
  }
  // The JE must be conditional on the flag — an UNCONDITIONAL post would 409/error every payment on the
  // OFF entities (GUARD 2026-07-11: BILL_PAYMENT_GL_POSTING is OFF for all entities in prod).
  if (/postSourceTransactionInClientTx/.test(body) && !/if\s*\(\s*glPostingEnabled\s*\)/.test(body)) {
    failures.push(`${BILLS}: payBill() must gate the JE post behind if(glPostingEnabled) so flag-OFF entities keep paying bills (no company-wide outage)`);
  }
  return failures;
}

export { check as run };

if (process.argv.includes("--selftest")) {
  const good = `export async function payBill(input, userId) { const glPostingEnabled = await isBillPaymentGlPostingEnabled(x,userId); return withCurrentUser(userId, async client => { insert(); updateBankBalance(client,-a); if (glPostingEnabled) { await postSourceTransactionInClientTx(client, {source_transaction_type:"bill_payment"}, {userId}); } return { ...p, gl_posting: glPostingEnabled ? "posted" : "blocked_flag_off" }; }); }`;
  const bad = `export async function payBill(input, userId) { return withCurrentUser(userId, async client => { insert(); updateBankBalance(client,-a); return p; }); }`;
  const unconditional = `export async function payBill(input, userId) { const glPostingEnabled = await isBillPaymentGlPostingEnabled(x,userId); return withCurrentUser(userId, async client => { insert(); updateBankBalance(client,-a); await postSourceTransactionInClientTx(client,{},{userId}); return { ...p, gl_posting: "blocked_flag_off" }; }); }`;
  const body = (s) => { const i = s.search(/export\s+async\s+function\s+payBill\s*\(/); return s.slice(i); };
  const gated = (s) => /if\s*\(\s*glPostingEnabled\s*\)/.test(body(s));
  const checks = [
    ["wired payBill (gate + conditional atomic post) passes", /isBillPaymentGlPostingEnabled/.test(body(good)) && /postSourceTransactionInClientTx/.test(body(good)) && /blocked_flag_off/.test(body(good)) && gated(good)],
    ["unwired payBill (bank mutated, no JE) is caught", !/postSourceTransactionInClientTx/.test(body(bad))],
    ["UNCONDITIONAL post (would 409 OFF entities) is caught", /postSourceTransactionInClientTx/.test(body(unconditional)) && !gated(unconditional)],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) { console.error("verify:bill-payment-posts-gl --selftest FAIL:"); for (const [n] of failed) console.error("  ✗ " + n); process.exit(1); }
  console.log(`verify:bill-payment-posts-gl --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const failures = check();
  if (failures.length) {
    console.error("verify:bill-payment-posts-gl FAIL:");
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log("verify:bill-payment-posts-gl PASS (payBill posts an atomic gated JE; bank + GL cannot diverge)");
}
