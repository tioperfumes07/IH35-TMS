#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const milesFile = path.join(ROOT, "apps/backend/src/ifta/ifta-state-miles-aggregator.ts");
const gallonsFile = path.join(ROOT, "apps/backend/src/ifta/ifta-state-gallons-aggregator.ts");
const testFile = path.join(ROOT, "apps/backend/src/ifta/ifta-quarterly-preparer.test.ts");

function fail(message) {
  console.error(`verify:ifta-aggregator-determinism FAIL: ${message}`);
  process.exit(1);
}

for (const target of [milesFile, gallonsFile, testFile]) {
  if (!fs.existsSync(target)) fail(`missing ${path.relative(ROOT, target)}`);
}

const miles = fs.readFileSync(milesFile, "utf8");
const gallons = fs.readFileSync(gallonsFile, "utf8");
const tests = fs.readFileSync(testFile, "utf8");

if (!miles.includes("ORDER BY UPPER(TRIM(state))")) {
  fail("miles aggregator SQL must ORDER BY state for deterministic output");
}
if (!gallons.includes("ORDER BY state, priority")) {
  fail("gallons aggregator dedupe must ORDER BY state, priority");
}
if (!tests.includes("deterministic")) {
  fail("ifta-quarterly-preparer.test.ts must cover determinism");
}

console.log("verify:ifta-aggregator-determinism PASS");
