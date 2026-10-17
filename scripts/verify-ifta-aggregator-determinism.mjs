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

// SQL comments are stripped first: a rule satisfied by a sentence inside a "--" comment is not a rule.
const stripSqlComments = (src) => src.replace(/--[^\n]*/g, "");
const milesCode = stripSqlComments(miles);
const gallonsCode = stripSqlComments(gallons);

// 186184d873 (ACCT-F9791 ROUND 288.3 item 1 / ROUND 296 3: IFTA miles come from the GPS apportionment
// engine only) deleted the load_stops SQL that carried "ORDER BY UPPER(TRIM(state))". The miles now come
// from computeIftaMiles; determinism is the state sort on the returned rows. Same rule, current code.
if (!/\.sort\(\(x, y\) => x\.state\.localeCompare\(y\.state\)\)/.test(milesCode)) {
  fail("miles aggregator must return rows sorted by state for deterministic output");
}
// 0df952f337 (IFTA-GALLONS-01 — the quarterly return understated taxable gallons by 7,736.61) removed the
// "DISTINCT ON (state) ... ORDER BY state, priority" dedupe (it dropped real gallons). Determinism is now
// GROUP BY state, source_kind + ORDER BY state in SQL, and a state sort on the merged rows.
if (/DISTINCT ON \(state\)/.test(gallonsCode)) {
  fail("gallons aggregator must not DISTINCT ON (state) — it discards disjoint real purchases (IFTA-GALLONS-01)");
}
if (!/GROUP BY state, source_kind\s+HAVING[^\n]*\n\s*ORDER BY state\s*\n/.test(gallonsCode)) {
  fail("gallons aggregator SQL must GROUP BY state, source_kind and ORDER BY state");
}
if (!/\.sort\(\(a, b\) => a\.state\.localeCompare\(b\.state\)\)/.test(gallonsCode)) {
  fail("gallons aggregator must return merged rows sorted by state");
}
if (!tests.includes("deterministic")) {
  fail("ifta-quarterly-preparer.test.ts must cover determinism");
}

console.log("verify:ifta-aggregator-determinism PASS");
