#!/usr/bin/env node
/**
 * verify-settlement-number-assigned-at-close — ROUND 443.292-A
 *
 * Ensures the settlement pay-run close engine assigns the AlwaysTrack source_document_ref
 * (settlement number) inside the close transaction when one is not already set.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLOSE_REL = "apps/backend/src/driver-finance/settlement-payrun-close.service.ts";
const LABEL = "verify-settlement-number-assigned-at-close";

function readDisk(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function run(overrides = {}) {
  const errors = [];
  const src = overrides[CLOSE_REL] ?? readDisk(CLOSE_REL);

  if (!src.includes("allocateNextSettlementSourceDocumentRef"))
    errors.push("close engine must import and call allocateNextSettlementSourceDocumentRef");
  if (!src.includes("setSettlementSourceDocumentRef"))
    errors.push("close engine must call setSettlementSourceDocumentRef to persist the allocated number");
  if (!src.includes("settlement.source_document_ref = nextRef"))
    errors.push("close engine must update settlement.source_document_ref in-memory after allocation");
  if (!src.includes('"SETTLEMENT_NUMBER_ASSIGN_FAILED"'))
    errors.push("close engine must throw SETTLEMENT_NUMBER_ASSIGN_FAILED when setSettlementSourceDocumentRef returns null");
  if (!/previewOnly.*source_document_ref|source_document_ref.*previewOnly/.test(src))
    errors.push("number assignment must be guarded by previewOnly !== true");

  return errors;
}

function selftest() {
  const base = readDisk(CLOSE_REL);
  const baseline = run();
  if (baseline.length) throw new Error(`clean baseline red: ${baseline.join("; ")}`);

  const mutations = [
    [CLOSE_REL, "allocateNextSettlementSourceDocumentRef", "allocateNextDocumentRef_REMOVED"],
    [CLOSE_REL, "settlement.source_document_ref = nextRef", "settlement.source_document_ref = null"],
    [CLOSE_REL, '"SETTLEMENT_NUMBER_ASSIGN_FAILED"', '"REMOVED"'],
  ];
  let rejected = 0;
  for (const [rel, needle, replacement] of mutations) {
    if (!base.includes(needle)) throw new Error(`plant target missing: ${needle}`);
    const planted = { [rel]: base.split(needle).join(replacement) };
    if (run(planted).length > 0) rejected++;
  }
  if (rejected !== mutations.length) throw new Error(`rejected ${rejected}/${mutations.length} plants`);
  console.log(`[${LABEL}] --selftest PASS: ${rejected}/${mutations.length} mutations detected`);
}

function main() {
  if (process.argv.includes("--selftest")) { selftest(); return; }
  const errors = run();
  if (errors.length) {
    console.error(`\n[${LABEL}] FAILED:\n`);
    for (const e of errors) console.error(`  ✗ ${e}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] All checks passed ✓`);
}
main();
