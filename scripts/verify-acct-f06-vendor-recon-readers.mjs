#!/usr/bin/env node
/**
 * ACCT-F06 / ACCT-ECON-05 — recon/drift/integrity/unlinked vendor readers must use
 * canonical accounting.qbo_vendors (the living QBO master), never RETIRE mdata.qbo_vendors.
 *
 * Historical "mirror" naming in these modules meant the TMS-side QBO clone. After ECON-05,
 * that clone lives in accounting.qbo_vendors.
 * MODULE_PROGRESS trailer on money commits must match accounting.json (26 of 31 post-#3758).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-acct-f06-vendor-recon-readers";
const TARGETS = [
  "apps/backend/src/qbo/unlinked-entities.routes.ts",
  "apps/backend/src/qbo/sync-conflict-detection.routes.ts",
  "apps/backend/src/integrations/integrity-monitors/driver-vendor-mapping.ts",
  "apps/backend/src/integrations/qbo/sync-outbound-accounting.entities.ts",
  "apps/backend/src/qbo-sync/vendors-reconciler.ts",
  "apps/backend/src/qbo-sync/drift-detector.ts",
  "apps/backend/src/qbo-sync/master-data-anchor-drift.ts",
  "apps/backend/src/integrations/qbo/mirror-integrity.service.ts",
  "apps/backend/src/accounting/qbo-recon-reads.ts",
  "apps/backend/src/reconciliation/reconciliation-worker.service.ts",
];

export function assertCanonicalReconReader(source, filename) {
  const problems = [];
  if (source.includes("mdata.qbo_vendors")) {
    problems.push(`${filename}: must not reference RETIRE mdata.qbo_vendors`);
  }
  if (!source.includes("accounting.qbo_vendors")) {
    problems.push(`${filename}: must reference canonical accounting.qbo_vendors`);
  }
  return problems;
}


const OUTBOUND = "apps/backend/src/integrations/qbo/sync-outbound-accounting.entities.ts";

export function assertOutboundVendorJoin(source) {
  const problems = [];
  if (source.includes("qv.vendor_uuid")) {
    problems.push(`${OUTBOUND}: must not join on phantom qv.vendor_uuid`);
  }
  if (!source.includes("qv.qbo_id = v.qbo_vendor_id")) {
    problems.push(`${OUTBOUND}: resolveVendorQboId must join on qv.qbo_id = v.qbo_vendor_id`);
  }
  return problems;
}

function main() {
  const problems = TARGETS.flatMap((filename) =>
    assertCanonicalReconReader(fs.readFileSync(path.join(ROOT, filename), "utf8"), filename)
  );
  problems.push(...assertOutboundVendorJoin(fs.readFileSync(path.join(ROOT, OUTBOUND), "utf8")));
  if (problems.length) {
    console.error(`${LABEL} FAIL:`);
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — recon/drift/integrity vendor readers target accounting.qbo_vendors; outbound join pinned`);
}

function selftest() {
  const failures = [];
  const bad = assertCanonicalReconReader(
    'FROM mdata.qbo_vendors qv',
    "fixture.ts"
  );
  if (!bad.some((p) => p.includes("RETIRE"))) failures.push("did not catch RETIRE");
  const ok = assertCanonicalReconReader(
    'FROM accounting.qbo_vendors qv',
    "fixture.ts"
  );
  if (ok.length) failures.push(`false positive: ${ok.join("; ")}`);
  const phantom = assertOutboundVendorJoin("ON qv.vendor_uuid = v.id");
  if (!phantom.some((p) => p.includes("vendor_uuid"))) failures.push("did not catch phantom vendor_uuid");
  const goodJoin = assertOutboundVendorJoin("ON qv.qbo_id = v.qbo_vendor_id\n AND qv.operating_company_id = v.operating_company_id");
  if (goodJoin.length) failures.push(`false positive join: ${goodJoin.join("; ")}`);
  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED: ${failures.join("; ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} selftest PASS`);
}

if (process.argv.includes("--selftest")) selftest();
else main();
