#!/usr/bin/env node
/**
 * 0091-g6-1 regression guard — Accounting FE "today" / as-of / create-form date defaults must NOT
 * use the UTC clock. `new Date().toISOString().slice(0,10)` (and variants like
 * `now.toISOString().slice(0,10)`) returns the UTC calendar date, so after ~19:00
 * America/Chicago bill/invoice/JE/payment pickers and overdue KPIs roll to TOMORROW.
 *
 * Canonical fix: companyToday() from lib/businessDate (America/Chicago), matching backend
 * companyBusinessDate(). No new posting / GL math.
 *
 * Scans accounting FE surfaces and FAILS if the UTC-today anti-pattern reappears.
 *
 * Self-test: node scripts/verify-acct-utc-today-defaults.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-acct-utc-today-defaults";
const SCAN_DIRS = [
  "apps/frontend/src/pages/accounting",
  "apps/frontend/src/components/accounting",
  "apps/frontend/src/pages/lists/accounting",
];

// Catch `new Date().toISOString().slice(0,10)`, `now.toISOString().slice(0,10)`,
// `end.toISOString().slice(0, 10)`, and similar identifier/expression receivers —
// not only the literal `new Date()` form.
const UTC_TODAY_RE =
  /(?:new\s+Date\s*\([^)]*\)|[A-Za-z_$][\w$]*)\s*\.\s*toISOString\s*\(\s*\)\s*\.\s*slice\s*\(\s*0\s*,\s*10\s*\)/;

function findViolationsInText(text, fileLabel = "fixture") {
  const violations = [];
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    // Ignore pure comments that document the anti-pattern.
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return;
    if (UTC_TODAY_RE.test(line)) {
      violations.push(`${fileLabel}:${i + 1}: ${trimmed}`);
    }
  });
  return violations;
}

function walk(dir) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  const out = [];
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(rel));
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) out.push(rel);
  }
  return out;
}

function selftest() {
  const planted = [
    `const today = new Date().toISOString().slice(0, 10);`,
    `const end = now.toISOString().slice(0,10);`,
    `return end.toISOString().slice(0, 10);`,
    `const from = new Date(y, m, 1).toISOString().slice(0, 10);`,
  ].join("\n");
  const good = [
    `import { companyToday, monthBoundsIso, addDaysIso } from "../../lib/businessDate";`,
    `const today = companyToday();`,
    `const { start, end } = monthBoundsIso(companyToday());`,
    `const start = addDaysIso(companyToday(), -30);`,
    `// documented anti-pattern: new Date().toISOString().slice(0,10) — do not use`,
  ].join("\n");

  const plantedHits = findViolationsInText(planted, "planted.tsx");
  if (plantedHits.length < 4) {
    console.error(`[${LABEL}] --selftest FAILED: planted-failure must catch all UTC variants`);
    console.error(`  got ${plantedHits.length}:`, plantedHits);
    process.exit(1);
  }

  const goodHits = findViolationsInText(good, "good.tsx");
  if (goodHits.length !== 0) {
    console.error(`[${LABEL}] --selftest FAILED: good fixture must pass`);
    console.error(goodHits);
    process.exit(1);
  }

  console.log(`[${LABEL}] --selftest PASS (planted=${plantedHits.length} hits; good=0)`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const violations = [];
for (const rel of SCAN_DIRS.flatMap(walk)) {
  const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
  violations.push(...findViolationsInText(text, rel));
}

if (violations.length > 0) {
  console.error(`[${LABEL}] FAILED — Accounting date defaults must use`);
  console.error("companyToday() from lib/businessDate (America/Chicago), not UTC toISOString():");
  for (const v of violations) console.error(`  - ${v}`);
  console.error("Fix: replace *.toISOString().slice(0, 10) today/as-of defaults with companyToday()/monthBoundsIso()/addDaysIso().");
  process.exit(1);
}

console.log(`[${LABEL}] OK — no UTC-derived accounting 'today' defaults.`);
