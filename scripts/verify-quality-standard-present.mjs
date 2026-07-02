#!/usr/bin/env node
// Guard for QSTD-00 — keeps Jorge's Quality Standard as the project's first standing law.
// FAILS if:
//   1. docs/specs/QUALITY-STANDARD-LOCKED.md is missing, OR
//   2. the locked standard no longer contains its anchor phrases (the doc was softened/gutted), OR
//   3. docs/specs/CURSOR-PERMANENT-RULES.md no longer contains "Rule #0" (the wiring was removed).
// This is a static, DB-free content check: it protects the standard text and its Rule #0 wiring
// from silent removal or dilution in any future PR.
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const STANDARD_PATH = path.join(repoRoot, "docs/specs/QUALITY-STANDARD-LOCKED.md");
const RULES_PATH = path.join(repoRoot, "docs/specs/CURSOR-PERMANENT-RULES.md");

// Verbatim anchors from the locked standard. If any is removed the doc has been softened/gutted.
const ANCHOR_PHRASES = [
  "first standing law",
  "never take the short or easy way",
  "protect the company",
  "QuickBooks, NetSuite, McLeod, Alvys",
];

function fail(messages) {
  console.error("verify:quality-standard-present — FAILED");
  for (const message of messages) console.error(`- ${message}`);
  process.exit(1);
}

const failures = [];

if (!fs.existsSync(STANDARD_PATH)) {
  failures.push("missing docs/specs/QUALITY-STANDARD-LOCKED.md (the first standing law must not be deleted)");
} else {
  const standard = fs.readFileSync(STANDARD_PATH, "utf8");
  for (const phrase of ANCHOR_PHRASES) {
    if (!standard.includes(phrase)) {
      failures.push(`QUALITY-STANDARD-LOCKED.md no longer contains anchor phrase: "${phrase}"`);
    }
  }
}

if (!fs.existsSync(RULES_PATH)) {
  failures.push("missing docs/specs/CURSOR-PERMANENT-RULES.md");
} else {
  const rules = fs.readFileSync(RULES_PATH, "utf8");
  if (!rules.includes("Rule #0")) {
    failures.push('CURSOR-PERMANENT-RULES.md no longer contains "Rule #0" (quality standard must be wired as the first rule)');
  }
}

if (failures.length > 0) fail(failures);
console.log("verify:quality-standard-present — OK");
