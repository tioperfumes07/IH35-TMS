#!/usr/bin/env node
/**
 * Bill create double-submit — FE must hold a sync in-flight lock AND a stable
 * Idempotency-Key per create session. Backend GAP-IDEMP-KEYS already caches bills
 * POSTs; a new key per click still creates duplicate A/P (ACCT-F142 evidence).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { maskComments } from "./lib/mask-comments.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const LABEL = "verify-vendor-bill-create-no-double-submit";

const PAGE = "apps/frontend/src/pages/accounting/VendorBillCreatePage.tsx";
const MODAL = "apps/frontend/src/pages/maintenance/components/CreateBillModal.tsx";
const API = "apps/frontend/src/api/accounting.ts";

function readMasked(rel) {
  return maskComments(readFileSync(join(ROOT, rel), "utf8"));
}

export function auditSources(sources) {
  const problems = [];
  const api = sources.api ?? "";
  if (!/idempotencyKey\?: string/.test(api) || !/"Idempotency-Key"/.test(api)) {
    problems.push(`${API}: createVendorBill must accept opts.idempotencyKey and forward Idempotency-Key`);
  }

  for (const [rel, key] of [
    [PAGE, "page"],
    [MODAL, "modal"],
  ]) {
    const text = sources[key] ?? "";
    if (!/submitInFlight/.test(text)) {
      problems.push(`${rel}: missing submitInFlight ref (sync double-click lock)`);
    }
    if (!/idempotencyKeyRef/.test(text) || !/generateIdempotencyKey/.test(text)) {
      problems.push(`${rel}: missing stable idempotencyKeyRef for the create session`);
    }
    if (!/idempotencyKey:\s*idempotencyKeyRef\.current/.test(text)) {
      problems.push(`${rel}: createVendorBill must pass idempotencyKeyRef.current`);
    }
  }
  return problems;
}

function auditTree() {
  return auditSources({
    api: readMasked(API),
    page: readMasked(PAGE),
    modal: readMasked(MODAL),
  });
}

function selftest() {
  const good = {
    api: `opts?: { idempotencyKey?: string }\nheaders: { "Idempotency-Key": opts.idempotencyKey }`,
    page: `submitInFlight\nidempotencyKeyRef\ngenerateIdempotencyKey\nidempotencyKey: idempotencyKeyRef.current`,
    modal: `submitInFlight\nidempotencyKeyRef\ngenerateIdempotencyKey\nidempotencyKey: idempotencyKeyRef.current`,
  };
  if (auditSources(good).length !== 0) throw new Error("selftest good failed");
  const bad = { ...good, page: `setSubmitting(true)\ncreateVendorBill(companyId, payload)` };
  if (auditSources(bad).length < 1) throw new Error("selftest bad failed");
  console.log(`${LABEL}: selftest PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const problems = auditTree();
  if (problems.length) {
    console.error(`${LABEL}: FAIL (${problems.length})`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL}: OK`);
}

main();
