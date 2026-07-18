#!/usr/bin/env node
/**
 * 0091-g6-1 (backend, remaining) — accounting-backend posting/as-of "today" defaults must NOT be the
 * host UTC calendar day. The bare `new Date().toISOString().slice(0,10)` returns the UTC date, so after
 * ~19:00 America/Chicago a posting entry_date / issue_date / as-of default rolls to TOMORROW and the
 * row lands in the wrong GL day (and possibly the wrong accounting period).
 *
 * The last live occurrence was the settlement reversal deduction JE
 * (accounting/settlement-posting/settlement-bill-payment-posting.service.ts). The canonical fix routes
 * every backend financial "today" default through companyBusinessDate() (lib/company-business-date,
 * America/Chicago), which THROWS rather than silently using UTC if the company zone cannot resolve.
 *
 * This guard scans apps/backend/src/accounting/** (excluding tests) and FAILS if the bare-now UTC-today
 * anti-pattern reappears. It is deliberately PRECISE — only literal `new Date().toISOString().slice(0,10)`
 * (empty parens = "now") is flagged; date ARITHMETIC (`new Date(anchor + days)...`) and normalization of
 * an existing value (`someDate.toISOString().slice(0,10)`) are legitimate and pass.
 *
 * Self-test (fail-closed proof): node scripts/verify-acct-posting-business-date.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-acct-posting-business-date";
const SCAN_DIR = "apps/backend/src/accounting";

// Bare `new Date()` (empty parens = the current instant) -> UTC date-only. A `new Date(<arg>)` (date
// arithmetic) or `<ident>.toISOString()` (formatting an anchored value) is NOT matched.
const UTC_TODAY_RE =
  /new\s+Date\s*\(\s*\)\s*\.\s*toISOString\s*\(\s*\)\s*\.\s*slice\s*\(\s*0\s*,\s*10\s*\)/;

function isTestFile(rel) {
  return /\.test\.ts$/.test(rel) || /\.spec\.ts$/.test(rel) || rel.includes(`${path.sep}__tests__${path.sep}`);
}

function findViolationsInText(text, fileLabel = "fixture") {
  const masked = text
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/gm, (comment) => comment.replace(/[^\n]/g, " "));
  const violations = [];
  const matcher = new RegExp(UTC_TODAY_RE.source, "g");
  for (const match of masked.matchAll(matcher)) {
    const line = masked.slice(0, match.index).split("\n").length;
    const snippet = text.slice(match.index, match.index + match[0].length).replace(/\s+/g, " ").trim();
    violations.push(`${fileLabel}:${line}: ${snippet}`);
  }
  return violations;
}

function walk(dir) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  const out = [];
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(rel));
    else if (/\.ts$/.test(entry.name) && !isTestFile(rel)) out.push(rel);
  }
  return out;
}

function selftest() {
  const planted = [
    `const entryDate = new Date().toISOString().slice(0, 10);`,
    `entry_date: new Date().toISOString().slice(0,10),`,
    `const multiline = new Date()
      .toISOString()
      .slice(
        0,
        10
      );`,
  ].join("\n");
  const good = [
    `import { companyBusinessDate } from "../../lib/company-business-date.js";`,
    `entry_date: companyBusinessDate(),`,
    `const due = new Date(new Date(issueDate).getTime() + termsDays * 86400000).toISOString().slice(0, 10);`,
    `const period_end = end.toISOString().slice(0, 10);`,
    `// documented anti-pattern: new Date().toISOString().slice(0,10) — do not use`,
  ].join("\n");

  const plantedHits = findViolationsInText(planted, "planted.ts");
  if (plantedHits.length !== 3) {
    console.error(`[${LABEL}] --selftest FAILED: planted UTC-today defaults must all be caught`);
    console.error(`  got ${plantedHits.length}:`, plantedHits);
    process.exit(1);
  }
  const goodHits = findViolationsInText(good, "good.ts");
  if (goodHits.length !== 0) {
    console.error(`[${LABEL}] --selftest FAILED: legitimate arithmetic/normalization must pass`);
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
for (const rel of walk(SCAN_DIR)) {
  violations.push(...findViolationsInText(fs.readFileSync(path.join(ROOT, rel), "utf8"), rel));
}

if (violations.length > 0) {
  console.error(`[${LABEL}] FAILED — accounting-backend 'today' posting/as-of defaults must use`);
  console.error("companyBusinessDate() from lib/company-business-date (America/Chicago), not UTC new Date().toISOString():");
  for (const v of violations) console.error(`  - ${v}`);
  console.error("Fix: replace `new Date().toISOString().slice(0, 10)` today-defaults with companyBusinessDate().");
  process.exit(1);
}

console.log(`[${LABEL}] OK — no UTC-derived accounting-backend 'today' posting defaults.`);
