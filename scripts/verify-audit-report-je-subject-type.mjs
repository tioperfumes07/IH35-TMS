#!/usr/bin/env node
/**
 * ACCT-F5303 / AUDIT-REPORT-JE-SUBJECT-TYPE-MISCATEGORIZED — events.event_log's valid_subject_type
 * CHECK never allowed 'invoice'/'bill'/'journal_entry', so accounting-spine-emit.ts's fallback logic
 * silently recategorized every JE-related money event as subject_type='task', and AuditReportPage.tsx's
 * Subject column had no way to drill through even if it wanted to.
 *
 * Asserts:
 *   1. A migration widens events.event_log's valid_subject_type CHECK to include the three JE subjects.
 *   2. accounting-spine-emit.ts's VALID_SUBJECT_TYPES allowlist matches (same three members added).
 *   3. AuditReportPage.tsx maps subject_type -> EntityLink kind for at least invoice/bill/journal_entry,
 *      and renders EntityLink only when a mapping exists (never a blind/unconditional link).
 *
 * Usage:
 *   node scripts/verify-audit-report-je-subject-type.mjs            # scan
 *   node scripts/verify-audit-report-je-subject-type.mjs --selftest # inject a regression -> must FAIL
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-audit-report-je-subject-type";
const MIGRATIONS_DIR = "db/migrations";
const SPINE_EMIT = "apps/backend/src/accounting/accounting-spine-emit.ts";
const PAGE = "apps/frontend/src/pages/reports/audit/AuditReportPage.tsx";
const JE_SUBJECTS = ["invoice", "bill", "journal_entry"];

function readRel(root, rel, overrides) {
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, rel)) return overrides[rel];
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

function findMigrationWideningSubjectType(root, overrides) {
  // Overrides key by filename only (selftest doesn't know the real filename in advance); scan disk for
  // the real file unless a full override map replaces the whole migrations directory scan is unnecessary
  // — selftest overrides the exact file it already found on the real scan.
  const dir = path.join(root, MIGRATIONS_DIR);
  if (!fs.existsSync(dir)) return null;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".sql")) continue;
    const rel = `${MIGRATIONS_DIR}/${f}`;
    const src = overrides && Object.prototype.hasOwnProperty.call(overrides, rel) ? overrides[rel] : fs.readFileSync(path.join(dir, f), "utf8");
    if (/valid_subject_type/.test(src) && JE_SUBJECTS.every((s) => src.includes(`'${s}'`))) {
      return { rel, src };
    }
  }
  return null;
}

export function collectProblems(root = ROOT, overrides = null) {
  const problems = [];

  const migration = findMigrationWideningSubjectType(root, overrides);
  if (!migration) {
    problems.push(`no db/migrations/*.sql widens events.event_log's valid_subject_type to include ${JE_SUBJECTS.join("/")}`);
  }

  const spineEmit = readRel(root, SPINE_EMIT, overrides);
  if (!spineEmit) {
    problems.push(`missing ${SPINE_EMIT}`);
  } else {
    const code = stripComments(spineEmit);
    for (const s of JE_SUBJECTS) {
      if (!new RegExp(`["']${s}["']`).test(code)) {
        problems.push(`${SPINE_EMIT}: VALID_SUBJECT_TYPES must include "${s}"`);
      }
    }
  }

  const page = readRel(root, PAGE, overrides);
  if (!page) {
    problems.push(`missing ${PAGE}`);
  } else {
    const code = stripComments(page);
    if (!/subjectTypeToEntityLinkKind/.test(code)) {
      problems.push(`${PAGE}: must map subject_type to an EntityLink kind via subjectTypeToEntityLinkKind (or equivalent) — never leave JE-related subjects as unlinkable plain text`);
    }
    for (const s of JE_SUBJECTS) {
      if (!new RegExp(`${s}:\\s*["']${s}["']`).test(code)) {
        problems.push(`${PAGE}: subject-type-to-kind map must include "${s}"`);
      }
    }
    if (!/kind\s*\?\s*\(/.test(code) && !/kind\s*&&/.test(code)) {
      problems.push(`${PAGE}: the EntityLink for subject_type must be gated on a resolved kind — never unconditional`);
    }
  }

  return problems;
}

export function run() {
  const problems = collectProblems();
  if (problems.length) {
    console.error(`${LABEL}: FAIL`);
    for (const p of problems) console.error(`  - ${p}`);
    return { ok: false, offenders: problems };
  }
  console.log(`${LABEL}: PASS — events.event_log allows invoice/bill/journal_entry subjects, spine-emit stamps them, AuditReportPage drills through`);
  return { ok: true, offenders: [] };
}

function selftest() {
  const baseline = collectProblems();
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST FAIL (baseline must be clean):`);
    for (const p of baseline) console.error("  - " + p);
    process.exit(1);
  }

  const migration = findMigrationWideningSubjectType(ROOT);
  const spineReal = readRel(ROOT, SPINE_EMIT);
  const pageReal = readRel(ROOT, PAGE);

  const plant = (label, overrides, expectFragment) => {
    const problems = collectProblems(ROOT, overrides);
    if (!problems.some((p) => p.includes(expectFragment))) {
      console.error(`${LABEL} SELFTEST FAIL: planted regression "${label}" was NOT caught`);
      process.exit(1);
    }
  };

  plant(
    "migration-loses-journal-entry",
    { [migration.rel]: migration.src.replaceAll("'journal_entry'", "'removed_type'") },
    "no db/migrations"
  );
  plant(
    "spine-emit-drops-bill",
    { [SPINE_EMIT]: spineReal.replace(/"bill",/, '"removed",') },
    'must include "bill"'
  );
  plant(
    "page-loses-mapping-helper",
    { [PAGE]: pageReal.replace(/subjectTypeToEntityLinkKind/g, "removedHelperName") },
    "must map subject_type"
  );
  plant(
    "page-loses-invoice-mapping",
    { [PAGE]: pageReal.replace(/invoice:\s*["']invoice["']/, "") },
    'must include "invoice"'
  );

  console.log(`${LABEL} SELFTEST PASS — 4 planted regressions all caught`);
}

const isMain = path.resolve(process.argv[1] ?? "") === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  if (process.argv.includes("--selftest")) selftest();
  else process.exit(run().ok ? 0 : 1);
}
