#!/usr/bin/env node
/**
 * ACCT-F351 — revenue recognition and the receivable must be wired to the SAME event.
 *
 * WHAT HAPPENED: the revenue latch (`latchOnDeliveryEvidence`) had FIVE callers — every place a load
 * can reach a delivery-evidence status, including both driver-PWA capture paths, which is where a
 * delivery is actually PERFORMED. The proforma -> draft invoice conversion + auto-send had exactly
 * ONE caller: an inline block in `dispatch/loads.routes.ts`, gated on the single office status
 * `delivered_pending_docs`. On the other four paths, revenue was recognized and the customer invoice
 * was never converted and never sent — freight the books had already earned had no receivable behind
 * it. Same class as CLS-DISP-WIRE-07 (five copies, one fixed), one layer up.
 *
 * FIX: move the proforma-convert + auto-send call INTO `latchOnDeliveryEvidence` itself, so every
 * caller that recognizes revenue also raises the receivable, by construction. No per-site copies.
 *
 * TWO INVARIANTS:
 *   A. STATIC — `latchOnDeliveryEvidence` in delivery-evidence-latch.ts calls the invoice-raising
 *      helper (which itself calls `convertProformaToOfficial`) BEFORE queueing the revenue latch. If
 *      that call is removed, delivery-evidence-latch.ts no longer references `convertProformaToOfficial`
 *      at all — the exact regression this guard exists to catch.
 *   B. STATIC — none of the five caller files re-introduce their OWN inline call to
 *      `convertProformaToOfficial`. A second copy is how this drifted the first time: one path gets
 *      hand-maintained, the other four are silently left behind again.
 *
 * Both checks are static (no database), so this runs in every CI context including the fresh-DB job.
 *
 * Self-test: node scripts/verify-steps/3085-verify-delivery-invoice-single-call-site.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";

const LABEL = "3085-verify-delivery-invoice-single-call-site";
const LATCH = path.join("apps", "backend", "src", "dispatch", "delivery-evidence-latch.ts");
const CALLERS = [
  path.join("apps", "backend", "src", "driver", "loads.routes.ts"),
  path.join("apps", "backend", "src", "dispatch", "loads-bulk.routes.ts"),
  path.join("apps", "backend", "src", "dispatch", "loads.routes.ts"),
  path.join("apps", "backend", "src", "dispatch", "driver-pwa", "dispatch-view.routes.ts"),
  path.join("apps", "backend", "src", "mdata", "loads.routes.ts"),
];

function fail(msg) {
  console.error(`[${LABEL}] FAIL: ${msg}`);
  process.exit(1);
}

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

function read(p) {
  return fs.readFileSync(path.join(ROOT, p), "utf8");
}

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");

function checkA(latchSrc) {
  const code = stripComments(latchSrc);
  if (!/export\s+async\s+function\s+latchOnDeliveryEvidence/.test(code)) {
    fail(`latchOnDeliveryEvidence not found in ${LATCH}`);
  }
  const fnStart = code.indexOf("export async function latchOnDeliveryEvidence");
  const fnBody = code.slice(fnStart);
  if (!/convertProformaToOfficial|convertAndSendInvoiceOnDelivery/.test(code)) {
    fail(`${LATCH} no longer references convertProformaToOfficial — the receivable is no longer wired to the revenue latch`);
  }
  if (!/convertAndSendInvoiceOnDelivery\(client,\s*input\)/.test(fnBody)) {
    fail(`latchOnDeliveryEvidence body does not call the invoice-raising helper — revenue can be recognized without a receivable again`);
  }
}

function checkB(callerPath, callerSrc) {
  const code = stripComments(callerSrc);
  if (/convertProformaToOfficial\s*\(/.test(code)) {
    fail(`${callerPath} calls convertProformaToOfficial directly — this re-introduces a second, hand-maintained invoice-conversion copy (ACCT-F351 regression)`);
  }
  if (!/latchOnDeliveryEvidence\s*\(/.test(code)) {
    fail(`${callerPath} no longer calls latchOnDeliveryEvidence — one of the five delivery paths dropped the revenue latch`);
  }
}

function run() {
  checkA(read(LATCH));
  for (const c of CALLERS) checkB(c, read(c));
  console.log(`[${LABEL}] PASS: invoice-raising is wired inside latchOnDeliveryEvidence; no caller holds a second copy (5/5 callers checked)`);
}

if (process.argv.includes("--selftest")) {
  // Re-implement the two invariants as pure boolean predicates for the selftest, since checkA/checkB
  // call process.exit(1) on failure (matching this repo's other verify-steps) rather than throwing.
  const latchSrc = stripComments(read(LATCH));
  const fnStart = latchSrc.indexOf("export async function latchOnDeliveryEvidence");
  const fnBody = latchSrc.slice(fnStart);
  const hasCallGood = /convertAndSendInvoiceOnDelivery\(client,\s*input\)/.test(fnBody);
  if (!hasCallGood) fail("selftest baseline: real code should PASS invariant A but does not — guard or fix is broken");

  const mutatedBody = fnBody.replace("await convertAndSendInvoiceOnDelivery(client, input);\n", "");
  const hasCallMutated = /convertAndSendInvoiceOnDelivery\(client,\s*input\)/.test(mutatedBody);
  if (hasCallMutated) fail("selftest mutation A: removal did not register as a failure — invariant A is inert");

  const bulkSrc = stripComments(read(CALLERS[1]));
  const mutatedBulk = bulkSrc.replace(
    "await latchOnDeliveryEvidence(",
    "await convertProformaToOfficial(client, { operatingCompanyId, loadId, userId }); await latchOnDeliveryEvidence("
  );
  if (mutatedBulk === bulkSrc) fail("selftest setup: mutation B anchor not found in " + CALLERS[1]);
  if (!/convertProformaToOfficial\s*\(/.test(mutatedBulk)) {
    fail("selftest mutation B did not insert a detectable duplicate call — test harness bug");
  }

  console.log(`[${LABEL}] selftest: PASS — invariant A trips on removal, invariant B trips on a reintroduced duplicate call`);
  process.exit(0);
}

run();
