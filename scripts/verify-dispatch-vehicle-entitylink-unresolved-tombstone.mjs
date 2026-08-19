#!/usr/bin/env node
/**
 * verify-dispatch-vehicle-entitylink-unresolved-tombstone.mjs
 * LV-DISPATCH-VEHICLE-ENTITYLINK-UNRESOLVED-TOMBSTONE
 *
 * Dispatch reverse sections + vehicle-profile + deadhead/kanban compact load
 * drills must not pass entityLabel(...) into EntityLink label=.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-dispatch-vehicle-entitylink-unresolved-tombstone";
const HELPER = "apps/frontend/src/components/shared/EntityLinkOrTombstone.tsx";
const CONSUMERS = [
  "apps/frontend/src/components/dispatch/LoadInTransitIssuesReverseSection.tsx",
  "apps/frontend/src/components/dispatch/DriverInTransitIssuesReverseSection.tsx",
  "apps/frontend/src/components/dispatch/UnitInTransitIssuesReverseSection.tsx",
  "apps/frontend/src/components/dispatch/EquipmentTransfersReverseSection.tsx",
  "apps/frontend/src/components/dispatch/DriverEquipmentTransfersReverseSection.tsx",
  "apps/frontend/src/components/dispatch/DeadheadOptimizerPanel.tsx",
  "apps/frontend/src/components/dispatch/DispatchKanban.tsx",
  "apps/frontend/src/components/vehicle-profile/CurrentLoadSection.tsx",
  "apps/frontend/src/components/vehicle-profile/DriverAssignmentSection.tsx",
  "apps/frontend/src/components/vehicle-profile/IdentityStatusHeader.tsx",
  "apps/frontend/src/components/vehicle-profile/InsuranceSummarySection.tsx",
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
  if (rel.endsWith("DispatchKanban.tsx")) {
    if (/<EntityLink\s+kind=\{load\.assigned_unit_id \? "unit" : "load"\}/.test(src)) {
      failures.push(`${rel}: dynamic primary unit link must not treat assigned_unit_id as proof that its nullable label resolved`);
    }
    if (/<EntityLink\s+kind="(?:unit|driver)"[\s\S]{0,100}id=\{load\.assigned_(?:unit|primary_driver)_id\}/.test(src)) {
      failures.push(`${rel}: assigned unit/driver IDs with nullable labels must use EntityLinkOrTombstone`);
    }
    for (const coupling of [
      /kind="unit"\s+id=\{load\.assigned_unit_id\}\s+name=\{load\.assigned_unit_number\}\s+noun="Unit"/,
      /kind="driver"\s+id=\{load\.assigned_primary_driver_id\}\s+name=\{load\.assigned_primary_driver_name\}\s+noun="Driver"/,
    ]) {
      if (!coupling.test(src)) failures.push(`${rel}: must retain exact assigned id/name tombstone coupling`);
    }
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

  const goodConsumer = `import { EntityLinkOrTombstone } from "..."; <EntityLinkOrTombstone kind="unit" id={load.assigned_unit_id} name={load.assigned_unit_number} noun="Unit" />; <EntityLinkOrTombstone kind="driver" id={load.assigned_primary_driver_id} name={load.assigned_primary_driver_name} noun="Driver" />`;
  const badConsumer = `<EntityLink label={entityLabel(row.load_number, row.load_id, "Load")} />`;
  if (analyzeConsumer("x.tsx", goodConsumer).length) fail("selftest consumer GOOD");
  if (!analyzeConsumer("x.tsx", badConsumer).length) fail("selftest consumer BAD");
  const badKanban = `${goodConsumer}; <EntityLink kind="driver" id={load.assigned_primary_driver_id} label="Driver" />`;
  if (!analyzeConsumer("apps/frontend/src/components/dispatch/DispatchKanban.tsx", badKanban).length) fail("selftest DispatchKanban planted direct-link BAD");
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
