#!/usr/bin/env node
/**
 * verify-maintenance-entitylink-unresolved-tombstone.mjs
 * LV-MAINT-ENTITYLINK-UNRESOLVED-TOMBSTONE
 *
 * Maintenance / vehicle-profile / trailer-profile surfaces must not pass
 * entityLabel(...) into EntityLink label=. Use EntityLinkOrTombstone.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-maintenance-entitylink-unresolved-tombstone";
const HELPER = "apps/frontend/src/components/shared/EntityLinkOrTombstone.tsx";
const CONSUMERS = [
  "apps/frontend/src/components/maintenance/WorkOrderDetailModal.tsx",
  "apps/frontend/src/components/maintenance/LoadDriverReportsReverseSection.tsx",
  "apps/frontend/src/components/maintenance/WarrantyClaimsReverseSection.tsx",
  "apps/frontend/src/components/maintenance/RoadServiceReverseSection.tsx",
  "apps/frontend/src/components/vehicle-profile/UnitPartsHistorySection.tsx",
  "apps/frontend/src/components/vehicle-profile/MaintenanceSnapshotSection.tsx",
  "apps/frontend/src/components/trailer-profile/MaintenanceSnapshotSection.tsx",
];

function read(rel) {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

function analyzeHelper(src) {
  const failures = [];
  if (!/isUnresolvedEntityTombstone/.test(src)) failures.push("helper must call isUnresolvedEntityTombstone");
  if (!/entity-link-tombstone/.test(src)) failures.push("helper must mark tombstones");
  if (!/EntityLink/.test(src)) failures.push("helper must mount EntityLink when resolved");
  return failures;
}

function analyzeConsumer(rel, src) {
  const failures = [];
  if (/label=\{entityLabel\(/.test(src)) {
    failures.push(`${rel}: must not pass entityLabel(...) into EntityLink label=`);
  }
  if (!/EntityLinkOrTombstone/.test(src)) {
    failures.push(`${rel}: must use EntityLinkOrTombstone for unresolved-safe drills`);
  }
  if (rel.endsWith("trailer-profile/MaintenanceSnapshotSection.tsx") && !/id=\{wo\.wo_id == null \? null : String\(wo\.wo_id\)\}/.test(src)) {
    failures.push(`${rel}: missing work-order IDs must remain nullable (never String(undefined))`);
  }
  return failures;
}

function fail(msg) {
  console.error(`${LABEL} FAIL: ${msg}`);
  process.exit(1);
}

function selftest() {
  const goodHelper = `
    if (isUnresolvedEntityTombstone(name, trimmedId, noun)) {
      return <span data-testid="entity-link-tombstone">{entityLabel(name, trimmedId, noun)}</span>;
    }
    return <EntityLink kind={kind} id={trimmedId} label={label} />;
  `;
  const badHelper = `return <EntityLink label={entityLabel(name, id, noun)} />;`;
  if (analyzeHelper(goodHelper).length) fail("selftest helper GOOD");
  if (!analyzeHelper(badHelper).length) fail("selftest helper BAD");

  const goodConsumer = `import { EntityLinkOrTombstone } from "..."; <EntityLinkOrTombstone kind="vendor" />`;
  const badConsumer = `<EntityLink label={entityLabel(row.vendor_name, row.vendor_id, "Vendor")} />`;
  if (analyzeConsumer("x.tsx", goodConsumer).length) fail("selftest consumer GOOD");
  if (!analyzeConsumer("x.tsx", badConsumer).length) fail("selftest consumer BAD");
  const trailerConsumer = `import { EntityLinkOrTombstone } from "..."; <EntityLinkOrTombstone kind="work_order" id={wo.wo_id == null ? null : String(wo.wo_id)} />`;
  if (analyzeConsumer("apps/frontend/src/components/trailer-profile/MaintenanceSnapshotSection.tsx", trailerConsumer).length) fail("selftest nullable trailer work order GOOD");
  if (!analyzeConsumer("apps/frontend/src/components/trailer-profile/MaintenanceSnapshotSection.tsx", trailerConsumer.replace("wo.wo_id == null ? null : String(wo.wo_id)", "String(wo.wo_id)")).length) fail("selftest nullable trailer work order BAD");
  console.log(`${LABEL} selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

if (!fs.existsSync(path.join(process.cwd(), HELPER))) {
  fail(`missing helper ${HELPER}`);
}
for (const msg of analyzeHelper(read(HELPER))) fail(msg);

for (const rel of CONSUMERS) {
  if (!fs.existsSync(path.join(process.cwd(), rel))) fail(`missing consumer ${rel}`);
  for (const msg of analyzeConsumer(rel, read(rel))) fail(msg);
}

console.log(`${LABEL} PASS (${CONSUMERS.length} consumers + helper)`);
