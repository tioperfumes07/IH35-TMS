#!/usr/bin/env node
/**
 * ROUND 443.292-A — the /finalize route must assign source_document_ref (AlwaysTrack settlement
 * number) before locking the settlement, exactly as settlement-payrun-close.service.ts:657 does.
 * Without this, every settlement closed via BT-3-DRIVER-FINANCE-REBUILD got status='locked' but
 * no source_document_ref, so the settlement document showed no number.
 *
 * Guard asserts both assignment calls are wired in the finalize route.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-finalize-assigns-source-doc-ref";
const ROUTE = "apps/backend/src/driver-finance/settlements.routes.ts";

function check(root = ROOT) {
  const routePath = path.join(root, ROUTE);
  if (!fs.existsSync(routePath)) return [`${ROUTE}: file not found`];
  const src = fs.readFileSync(routePath, "utf8");

  const errors = [];

  if (!/import.*allocateNextSettlementSourceDocumentRef.*from.*settlement-source-document-ref\.service/.test(src)) {
    errors.push("finalize route does not import allocateNextSettlementSourceDocumentRef from settlement-source-document-ref.service");
  }
  if (!/import.*setSettlementSourceDocumentRef.*from.*settlement-source-document-ref\.service/.test(src)) {
    errors.push("finalize route does not import setSettlementSourceDocumentRef from settlement-source-document-ref.service");
  }

  const finalizeIdx = src.indexOf('"/api/v1/driver-finance/settlements/:id/finalize"');
  if (finalizeIdx < 0) {
    errors.push("finalize route handler not found in settlements.routes.ts");
    return errors;
  }

  const window = src.slice(finalizeIdx, finalizeIdx + 10000);

  if (!/allocateNextSettlementSourceDocumentRef\s*\(/.test(window)) {
    errors.push("finalize route handler does not call allocateNextSettlementSourceDocumentRef");
  }
  if (!/setSettlementSourceDocumentRef\s*\(/.test(window)) {
    errors.push("finalize route handler does not call setSettlementSourceDocumentRef");
  }
  if (!window.includes("source_document_ref")) {
    errors.push("finalize route handler does not check source_document_ref before assigning");
  }
  if (!/settlement_number_assign_failed/.test(window)) {
    errors.push("finalize route handler does not return blocked reason 'settlement_number_assign_failed' on assignment failure");
  }

  return errors;
}

if (process.argv.includes("--selftest")) {
  const routePath = path.join(ROOT, ROUTE);
  const orig = fs.readFileSync(routePath, "utf8");

  const mutations = [
    orig.replace("allocateNextSettlementSourceDocumentRef, ", ""),
    orig.replace(/allocateNextSettlementSourceDocumentRef\s*\([^)]+\)/, "null"),
    orig.replace(/const refResult = await setSettlementSourceDocumentRef[^;]+;/, "const refResult = null;"),
    orig.replace("settlement_number_assign_failed", "REMOVED_REASON"),
  ];

  const baseline = check();
  if (baseline.length) {
    console.error(`${LABEL} selftest FAIL — real repo already fails: ${baseline.join("; ")}`);
    process.exit(1);
  }

  let caught = 0;
  for (const [i, mutated] of mutations.entries()) {
    const tmp = routePath + ".tmp-selftest";
    fs.writeFileSync(tmp, mutated);
    fs.renameSync(routePath, routePath + ".orig-selftest");
    fs.renameSync(tmp, routePath);
    try {
      const errs = check();
      if (errs.length > 0) caught++;
      else console.error(`${LABEL} selftest FAIL — mutation ${i + 1} escaped`);
    } finally {
      fs.renameSync(routePath, tmp);
      fs.renameSync(routePath + ".orig-selftest", routePath);
      fs.unlinkSync(tmp);
    }
  }

  if (caught !== mutations.length) {
    console.error(`${LABEL} selftest caught ${caught}/${mutations.length}`);
    process.exit(1);
  }
  console.log(`${LABEL} selftest PASS — ${caught}/${mutations.length} mutations caught`);
  process.exit(0);
}

const errors = check();
if (errors.length) {
  console.error(`${LABEL} FAIL:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — finalize route assigns source_document_ref (AlwaysTrack settlement number) before locking`);
