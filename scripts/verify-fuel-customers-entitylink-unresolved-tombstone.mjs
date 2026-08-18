#!/usr/bin/env node
/**
 * verify-fuel-customers-entitylink-unresolved-tombstone.mjs
 * LV-FUEL-CUSTOMERS-ENTITYLINK-UNRESOLVED-TOMBSTONE
 *
 * Fuel Reconciliation + Customers transaction columns must not pass
 * entityLabel(...) into EntityLink label=. Use EntityLinkOrTombstone.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-fuel-customers-entitylink-unresolved-tombstone";
const HELPER = "apps/frontend/src/components/shared/EntityLinkOrTombstone.tsx";
const CONSUMERS = [
  "apps/frontend/src/pages/reports/FuelReconciliationPage.tsx",
  "apps/frontend/src/pages/Customers.tsx",
];

function read(rel) {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

function analyzeHelper(src) {
  const failures = [];
  if (!/isUnresolvedEntityTombstone/.test(src)) failures.push("helper must call isUnresolvedEntityTombstone");
  if (!/entity-link-tombstone/.test(src)) failures.push("helper must mark tombstones");
  if (!/EntityLink/.test(src)) failures.push("helper must mount EntityLink when resolved");
  if (!/onClick/.test(src)) failures.push("helper must forward onClick for row-stopPropagation sites");
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
    return <EntityLink kind={kind} id={trimmedId} label={label} onClick={onClick} />;
  `;
  const badHelper = `return <EntityLink label={entityLabel(name, id, noun)} />;`;
  if (analyzeHelper(goodHelper).length) fail("selftest helper GOOD");
  if (!analyzeHelper(badHelper).length) fail("selftest helper BAD");

  const goodConsumer = `import { EntityLinkOrTombstone } from "..."; <EntityLinkOrTombstone kind="unit" />`;
  const badConsumer = `<EntityLink label={entityLabel(r.unit_number, r.unit_id, "Unit")} />`;
  if (analyzeConsumer("x.tsx", goodConsumer).length) fail("selftest consumer GOOD");
  if (!analyzeConsumer("x.tsx", badConsumer).length) fail("selftest consumer BAD");
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
