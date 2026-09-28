#!/usr/bin/env node
/**
 * LAW guard — RULE 53 / SEED-IN-BULK-NEVER-ROW-BY-ROW (owner 2026-09-28).
 * Existence + hard-line text. Fails closed if the always-apply rule is removed or gutted.
 * Also flags NEW scripts/ops seed/backfill files that look like per-row await create/insert
 * loops without a set-based / batch transaction marker.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RULE = path.join(ROOT, ".cursor/rules/53-seed-in-bulk-never-row-by-row.mdc");
const SPEC = path.join(ROOT, "docs/specs/SEED-IN-BULK-NEVER-ROW-BY-ROW-LAW-2026-09-28.md");
const BASELINE = path.join(ROOT, "scripts/verify-seed-in-bulk-never-row-by-row.baseline.json");

const REQUIRED_PHRASES = [
  "SEED IN BULK, NEVER ROW BY ROW",
  "SET-BASED",
  "ONE transaction per batch",
  "for (const row of rows) await api.create(row)",
  "rows/second",
  "sanctioned engine",
  "one transaction per DAY",
];

const failures = [];

function mustExist(p, label) {
  if (!fs.existsSync(p)) failures.push(`missing ${label}: ${p}`);
}

mustExist(RULE, "always-apply rule 53");
mustExist(SPEC, "spec");

if (fs.existsSync(RULE)) {
  const body = fs.readFileSync(RULE, "utf8");
  if (!/alwaysApply:\s*true/.test(body)) {
    failures.push("rule 53 must have alwaysApply: true");
  }
  for (const phrase of REQUIRED_PHRASES) {
    if (!body.includes(phrase)) {
      failures.push(`rule 53 missing hard line: ${JSON.stringify(phrase)}`);
    }
  }
}

/**
 * Heuristic: an ops seed/backfill that loops `await` on create/insert per row without naming a
 * set-based / single-transaction batch pattern is a Rule 53 violation for NEW files.
 * Baseline (shrink-only) holds pre-existing debt.
 */
const PER_ROW_AWAIT_RE =
  /for\s*\(\s*(?:const|let)\s+\w+\s+of\s+\w+\s*\)\s*\{[^}]{0,800}?await\s+[^\n]*(?:\.create|\.insert|INSERT\s+INTO|api\.|fetch\()/is;
const SET_BASED_MARKER_RE =
  /UPDATE\s+[\s\S]{0,200}FROM\s*\(\s*VALUES|INSERT\s+[\s\S]{0,120}SELECT|COPY\s+|one transaction per (?:batch|day)|SET[-_ ]BASED|batchSize|rows\/second|BEGIN[\s\S]{0,400}VALUES/i;

const baseline = fs.existsSync(BASELINE)
  ? new Set(JSON.parse(fs.readFileSync(BASELINE, "utf8")).files ?? [])
  : new Set();

const opsDir = path.join(ROOT, "scripts/ops");
const newViolations = [];
let baselineDebt = 0;

if (fs.existsSync(opsDir)) {
  for (const name of fs.readdirSync(opsDir)) {
    if (!/\.(mts|ts|mjs|js)$/i.test(name)) continue;
    if (!/(seed|backfill|bulk|import|ingest|parse|correct)/i.test(name)) continue;
    const text = fs.readFileSync(path.join(opsDir, name), "utf8");
    if (!PER_ROW_AWAIT_RE.test(text)) continue;
    if (SET_BASED_MARKER_RE.test(text)) continue;
    if (baseline.has(name)) {
      baselineDebt += 1;
      continue;
    }
    newViolations.push(name);
  }
}

for (const name of newViolations) {
  failures.push(
    `${name}: per-row await create/insert loop without set-based batch marker — Rule 53 (SEED IN BULK)`,
  );
}

if (process.argv.includes("--selftest")) {
  const okPhrase = REQUIRED_PHRASES.every((p) => fs.readFileSync(RULE, "utf8").includes(p));
  if (!okPhrase || !fs.existsSync(SPEC)) {
    console.error("verify-seed-in-bulk-never-row-by-row SELFTEST FAIL");
    process.exit(1);
  }
  console.log("verify-seed-in-bulk-never-row-by-row SELFTEST PASS");
  process.exit(0);
}

if (failures.length) {
  console.error("FAIL verify-seed-in-bulk-never-row-by-row:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}

console.log(
  `PASS verify-seed-in-bulk-never-row-by-row — Rule 53 hard lines present; new ops seed paths clean` +
    (baselineDebt ? ` (${baselineDebt} baseline debt file(s), shrink-only)` : ""),
);
process.exit(0);
