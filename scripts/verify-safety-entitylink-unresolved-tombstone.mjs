#!/usr/bin/env node
/**
 * verify-safety-entitylink-unresolved-tombstone.mjs
 * LV-SAFETY-ENTITYLINK-UNRESOLVED-TOMBSTONE
 *
 * Safety surfaces must not pass entityLabel(...) straight into EntityLink
 * (dead drill for "— not visible"). Use EntityLinkOrTombstone / isUnresolvedEntityTombstone.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-safety-entitylink-unresolved-tombstone";
const HELPER = "apps/frontend/src/components/shared/EntityLinkOrTombstone.tsx";
const CONSUMERS = [
  "apps/frontend/src/pages/safety/IdvrPage.tsx",
  "apps/frontend/src/pages/safety/tabs/DOTInspectionsTab.tsx",
  "apps/frontend/src/pages/safety/DotInspectionsPage.tsx",
  "apps/frontend/src/pages/safety/driver-scheduler/DriverSchedulerRequestInboxPage.tsx",
  "apps/frontend/src/pages/safety/driver-scheduler/DriverSchedulerRequestDetailPage.tsx",
  "apps/frontend/src/components/safety/driver-safety/DriverSafetyProfilePanel.tsx",
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
  if (rel.includes("DriverSafetyProfilePanel")) {
    if (!/^import \{ EntityLink \}/m.test(src) && !/import \{ EntityLink \} from/.test(src.split("\n").slice(0, 5).join("\n"))) {
      // import must be at top — fail if import appears after export function
      const fn = src.indexOf("export function DriverSafetyProfilePanel");
      const imp = src.indexOf('import { EntityLink }');
      if (imp > fn && fn >= 0) failures.push(`${rel}: EntityLink import must be at top of file`);
    }
    return failures;
  }
  if (!/EntityLinkOrTombstone/.test(src)) {
    failures.push(`${rel}: must use EntityLinkOrTombstone for unresolved-safe drills`);
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

  const goodConsumer = `import { EntityLinkOrTombstone } from "..."; <EntityLinkOrTombstone kind="driver" />`;
  const badConsumer = `<EntityLink label={entityLabel(row.driver_name, row.driver_id, "Driver")} />`;
  if (analyzeConsumer("x.tsx", goodConsumer).length) fail("selftest consumer GOOD");
  if (!analyzeConsumer("x.tsx", badConsumer).length) fail("selftest consumer BAD");
  console.log(`${LABEL} selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

for (const f of analyzeHelper(read(HELPER))) fail(f);
for (const rel of CONSUMERS) {
  for (const f of analyzeConsumer(rel, read(rel))) fail(f);
}
console.log(`${LABEL}: OK — helper + ${CONSUMERS.length} consumers`);
