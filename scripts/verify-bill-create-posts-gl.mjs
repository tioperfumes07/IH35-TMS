#!/usr/bin/env node
// verify-bill-create-posts-gl (P1-BILL-GL regression guard)
// createBill() must auto-post the bill's GL (gated by BILL_GL_POSTING_ENABLED) — it must never regress to
// inserting a bill with no ledger post. Asserts the wiring statically: createBill references
// postBillGlIfEnabled, and the helper gates on the flag + posts via the canonical 'bill' poster.
// Self-test: --selftest.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BILLS = "apps/backend/src/accounting/bills.service.ts";
const HELPER = "apps/backend/src/accounting/bill-gl.service.ts";

function read(rel) { return fs.readFileSync(path.join(ROOT, rel), "utf8"); }

/** Slice the body of `export async function createBill(...)` up to the next top-level `export`. */
function createBillBody(src) {
  const start = src.search(/export\s+async\s+function\s+createBill\s*\(/);
  if (start < 0) return "";
  const rest = src.slice(start + 10);
  const nextExport = rest.search(/\nexport\s+(async\s+)?function\s/);
  return nextExport < 0 ? rest : rest.slice(0, nextExport);
}

export function check() {
  const failures = [];
  let bills, helper;
  try { bills = read(BILLS); } catch { return [`${BILLS} not found`]; }
  try { helper = read(HELPER); } catch { return [`${HELPER} not found — P1-BILL-GL poster helper missing`]; }

  const body = createBillBody(bills);
  if (!body) failures.push(`${BILLS}: createBill() not found`);
  else if (!/postBillGlIfEnabled/.test(body)) {
    failures.push(`${BILLS}: createBill() does not call postBillGlIfEnabled — a created Bill would post NO internal GL (P1-BILL-GL regression)`);
  }

  if (!/BILL_GL_POSTING_ENABLED/.test(helper)) failures.push(`${HELPER}: must gate on BILL_GL_POSTING_ENABLED`);
  if (!/isEnabled\s*\(/.test(helper)) failures.push(`${HELPER}: must resolve the flag via isEnabled (per-entity, not a raw read)`);
  if (!/source_transaction_type:\s*["']bill["']/.test(helper)) failures.push(`${HELPER}: must post via postSourceTransaction source_transaction_type 'bill' (reuse the canonical poster, no new GL math)`);
  return failures;
}

export { check as run };

if (process.argv.includes("--selftest")) {
  const goodBody = `export async function createBill(input, userId) { const b = insert(); const glPosting = await postBillGlIfEnabled(x, b.id, {userId}); return {...b, gl_posting: glPosting}; }`;
  const badBody = `export async function createBill(input, userId) { const b = insert(); return b; }`;
  const extract = (s) => { const m = s.search(/export\s+async\s+function\s+createBill\s*\(/); return s.slice(m); };
  const checks = [
    ["wired createBill passes", /postBillGlIfEnabled/.test(extract(goodBody))],
    ["unwired createBill is caught", !/postBillGlIfEnabled/.test(extract(badBody))],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) { console.error("verify:bill-create-posts-gl --selftest FAIL:"); for (const [n] of failed) console.error("  ✗ " + n); process.exit(1); }
  console.log(`verify:bill-create-posts-gl --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const failures = check();
  if (failures.length) {
    console.error("verify:bill-create-posts-gl FAIL:");
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log("verify:bill-create-posts-gl PASS (createBill auto-posts GL, gated + canonical poster)");
}
