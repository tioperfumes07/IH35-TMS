#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const enginePath = path.join(process.cwd(), "apps/backend/src/accounting/cash-basis/engine.ts");

function fail(messages) {
  console.error("verify:cash-basis-engine-determinism — FAILED");
  for (const msg of messages) console.error(`- ${msg}`);
  process.exit(1);
}

if (!fs.existsSync(enginePath)) {
  fail([`missing file: ${enginePath}`]);
}

const source = fs.readFileSync(enginePath, "utf8");
const failures = [];

const forbiddenPatterns = [
  { pattern: /\bwithCurrentUser\b/, reason: "must remain pure (no auth/db helper imports)" },
  { pattern: /\bclient\.query\b/, reason: "must remain pure (no database calls)" },
  { pattern: /\bfetch\s*\(/, reason: "must remain pure (no network calls)" },
  { pattern: /\bnew Date\s*\(/, reason: "must remain deterministic (no runtime clock reads)" },
  { pattern: /\bDate\.now\s*\(/, reason: "must remain deterministic (no runtime clock reads)" },
];
for (const rule of forbiddenPatterns) {
  if (rule.pattern.test(source)) failures.push(rule.reason);
}

if (!/export function applyCashBasisSuppression/.test(source)) {
  failures.push("applyCashBasisSuppression export missing");
}
if (!/export function computeCashBasisAdjustment/.test(source)) {
  failures.push("computeCashBasisAdjustment export missing");
}

const requiredDecisionComments = ["Q1", "Q2", "Q3", "Q5", "Q6", "Q10", "VQ5", "VQ6"];
for (const decision of requiredDecisionComments) {
  if (!new RegExp(`@decision\\s+${decision}`).test(source)) {
    failures.push(`missing @decision annotation for ${decision}`);
  }
}

const requiredLockedDecisionKeys = [
  "Q1",
  "Q2",
  "Q3",
  "Q4",
  "Q5",
  "Q6",
  "Q7",
  "Q8",
  "Q9",
  "Q10",
  "Q11",
  "Q12",
  "VQ1",
  "VQ2",
  "VQ3",
  "VQ4",
  "VQ5",
  "VQ6",
  "VQ7",
  "VQ8",
  "VQ9",
  "INVQ9",
];
for (const key of requiredLockedDecisionKeys) {
  if (!new RegExp(`${key}:\\s*"[^"]+"`).test(source)) {
    failures.push(`LOCKED_DECISIONS missing key ${key}`);
  }
}

if (failures.length > 0) fail(failures);
console.log("verify:cash-basis-engine-determinism — OK");
