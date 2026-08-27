#!/usr/bin/env node
/**
 * FINANCIAL-REPORTS-AS-OF-DATE-USES-UTC-NOT-COMPANY-TIMEZONE (G6-1 rollout gap)
 *
 * `new Date().toISOString().slice(0, 10)` computes "today" as the UTC calendar date, which after
 * ~19:00 Central has already rolled to the next day — a real production precedent already caused a
 * load to be mis-numbered across a day boundary (see company-business-date.ts's own header
 * comment). The canonical fix, `companyBusinessDate()`, already exists and is proven in production
 * elsewhere. Six call sites were found still using the raw UTC pattern as an "as of today" default
 * (ar-aging, ap-aging, cash-flow-overview, the cash-flow route-fix, the weekly AR-aging-60
 * scheduled generator, and the late-arrival analytics aggregator's 30-day window) — all fixed. This
 * guard fails if any of those directories reintroduces the raw pattern.
 *
 * Scoped to these specific directories deliberately: the pattern is legitimate elsewhere when a
 * true UTC instant is intended (timestamps, logging, test fixtures), and a repo-wide ban would be
 * wrong (the source finding itself found ~54 other repo-wide hits, most non-cutoff, explicitly
 * deferred for individual classification — not banned outright).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-financial-reports-business-date-not-utc";
const DIRS = ["apps/backend/src/reports", "apps/backend/src/dispatch/analytics"];

/** `new Date().toISOString().slice(0, 10)` (or no-space `slice(0,10)`) — the raw UTC "today" pattern. */
const UTC_TODAY_RE = /new\s+Date\s*\(\s*\)\s*\.toISOString\s*\(\s*\)\s*\.slice\s*\(\s*0\s*,\s*10\s*\)/;

export function auditSource(src) {
  const hits = [];
  src.split("\n").forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("*") || trimmed.startsWith("//")) return;
    if (UTC_TODAY_RE.test(line)) hits.push({ line: i + 1, text: trimmed.slice(0, 110) });
  });
  return hits;
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name) && !e.name.includes(".test.")) out.push(p);
  }
  return out;
}

if (process.argv.includes("--selftest")) {
  const bad = `const asOf = parsed.data.as_of_date ?? new Date().toISOString().slice(0, 10);`;
  const badNoSpace = `const asOf = new Date().toISOString().slice(0,10);`;
  const good = `const asOf = parsed.data.as_of_date ?? companyBusinessDate();`;
  const commentOnly = ` // was new Date().toISOString().slice(0, 10) (UTC calendar date)`;
  const cases = [
    ["the shipped defect", bad, 1],
    ["the no-space variant", badNoSpace, 1],
    ["the fixed form", good, 0],
    ["a // comment describing the pattern", commentOnly, 0],
    ["both a real hit and a comment", bad + "\n" + commentOnly, 1],
  ];
  let failed = 0;
  for (const [name, src, want] of cases) {
    const got = auditSource(src).length;
    if (got !== want) {
      console.error(`SELFTEST FAIL: ${name} — expected ${want}, got ${got}`);
      failed++;
    }
  }
  if (failed) process.exit(1);
  console.log(`${LABEL} SELFTEST PASS — ${cases.length} cases (including comment false-positives)`);
  process.exit(0);
}

const files = DIRS.flatMap((dir) => walk(path.join(ROOT, dir)));
if (files.length === 0) {
  console.error(`${LABEL} FAIL — scanned ZERO files under ${DIRS.join(", ")}; scope is wrong, refusing to pass vacuously.`);
  process.exit(1);
}

const problems = [];
for (const f of files) {
  const rel = path.relative(ROOT, f);
  for (const h of auditSource(fs.readFileSync(f, "utf8"))) {
    problems.push(`${rel}:${h.line}: ${h.text}`);
  }
}

if (problems.length) {
  console.error(
    `${LABEL} FAIL — a financial-report "as of today" default uses the raw UTC pattern, which rolls to the wrong calendar day ~19:00 Central:\n`,
  );
  for (const p of problems) console.error(`  - ${p}`);
  console.error(`\nFix: use companyBusinessDate() from apps/backend/src/lib/company-business-date.ts.\n`);
  process.exit(1);
}

console.log(`${LABEL} OK — ${files.length} file(s) under ${DIRS.join(", ")}, no raw-UTC "today" default.`);
process.exit(0);
