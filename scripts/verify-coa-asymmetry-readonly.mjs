#!/usr/bin/env node
/**
 * GUARD (ACCT-CoA-ASYMMETRY): grouped diff report stays READ-ONLY.
 * FAILs if the diff path performs any write on catalogs.accounts, toggles is_postable,
 * or mutates reserve/holdback/retainage accounts. PASSes on pure SELECT grouped by entity.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-coa-asymmetry-readonly";
const REPORT = "docs/trackers/COA-ASYMMETRY-2026-07-25.md";
const FIXTURE = "scripts/lib/coa-postable-count-stability.json";

const READONLY_SOURCES = [
  "apps/backend/src/accounting/coa-asymmetry-report.routes.ts",
  "apps/backend/src/accounting/coa-asymmetry-report.service.ts",
  "apps/frontend/src/pages/accounting/CoaAsymmetryReportPanel.tsx",
  "apps/frontend/src/api/coaAsymmetryReport.ts",
];

const WRITE_ON_ACCOUNTS =
  /\b(insert\s+into\s+catalogs\.accounts|update\s+catalogs\.accounts|delete\s+from\s+catalogs\.accounts|truncate\s+catalogs\.accounts)\b/i;
const IS_POSTABLE_MUTATION =
  /\bUPDATE\b[\s\S]{0,200}\bis_postable\b|\bSET\s+is_postable\s*=/i;
const RESERVE_MUTATION =
  /\b(update|insert\s+into|delete\s+from)\b[\s\S]{0,160}\b(reserve|holdback|retainage)\b/i;
const AUTO_CREATE_FROM_DIFF =
  /\b(seedMissing|mergeAccounts|auto-?fix|createMissing|normalizeCoa)\s*\(/i;

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function assertCoaAsymmetryReadonly(sources) {
  const problems = [];

  for (const rel of READONLY_SOURCES) {
    if (!(sources[rel] ?? fs.existsSync(path.join(ROOT, rel)))) {
      problems.push(`missing read-only source ${rel}`);
      continue;
    }
    const src = sources[rel] ?? read(rel);
    if (WRITE_ON_ACCOUNTS.test(src)) {
      problems.push(`${rel}: must not write to catalogs.accounts`);
    }
    if (IS_POSTABLE_MUTATION.test(src)) {
      problems.push(`${rel}: must not toggle is_postable`);
    }
    if (RESERVE_MUTATION.test(src)) {
      problems.push(`${rel}: must not mutate reserve/holdback/retainage accounts (Rule 19)`);
    }
    if (rel.includes("service.ts") && AUTO_CREATE_FROM_DIFF.test(src)) {
      problems.push(`${rel}: diff service must not auto-create/merge/reclassify from the report`);
    }
  }

  const routes = sources[READONLY_SOURCES[0]] ?? read(READONLY_SOURCES[0]);
  if (/app\.(post|put|patch|delete)\s*\(/i.test(routes)) {
    problems.push(`${READONLY_SOURCES[0]}: report route must be GET-only`);
  }
  if (!/app\.get\s*\(\s*["']\/api\/v1\/accounting\/coa-asymmetry-report["']/.test(routes)) {
    problems.push(`${READONLY_SOURCES[0]}: must register GET /api/v1/accounting/coa-asymmetry-report`);
  }

  const service = sources[READONLY_SOURCES[1]] ?? read(READONLY_SOURCES[1]);
  if (!/read_only:\s*true/.test(service)) {
    problems.push(`${READONLY_SOURCES[1]}: report payload must set read_only: true`);
  }
  if (!/set_config\s*\(\s*'app\.bypass_rls'\s*,\s*'lucia'/.test(service)) {
    problems.push(`${READONLY_SOURCES[1]}: cross-entity read must use lucia bypass (Rule 10)`);
  }

  const panel = sources[READONLY_SOURCES[2]] ?? read(READONLY_SOURCES[2]);
  if (/\+ Create|\+ Book|onClick.*mutate|useMutation/i.test(panel)) {
    problems.push(`${READONLY_SOURCES[2]}: panel must not expose account mutation actions`);
  }

  const report = sources[REPORT] ?? read(REPORT);
  if (!/Do NOT change any `is_postable`/i.test(report) && !/Do NOT change any \*?is_postable/i.test(report)) {
    problems.push(`${REPORT}: must state Do NOT change is_postable`);
  }
  if (!/947/.test(report) || !/389/.test(report) || !/53/.test(report)) {
    problems.push(`${REPORT}: must document frozen postable counts 947/389/53`);
  }

  const fixture = JSON.parse(sources[FIXTURE] ?? read(FIXTURE));
  const got = fixture.postable_by_company_code ?? {};
  for (const [code, n] of Object.entries({ TRK: 947, TRANSP: 389, USMCA: 53 })) {
    if (got[code] !== n) {
      problems.push(`${FIXTURE}: ${code} postable expected ${n}, got ${got[code]}`);
    }
  }

  return problems;
}

const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (IS_MAIN && process.argv.includes("--selftest")) {
  const real = Object.fromEntries([
    ...READONLY_SOURCES.map((rel) => [rel, read(rel)]),
    [REPORT, read(REPORT)],
    [FIXTURE, read(FIXTURE)],
  ]);

  const brokenWrite = {
    ...real,
    [READONLY_SOURCES[1]]: `${real[READONLY_SOURCES[1]]}\nawait client.query("INSERT INTO catalogs.accounts DEFAULT VALUES");`,
  };
  if (!assertCoaAsymmetryReadonly(brokenWrite).some((p) => p.includes("catalogs.accounts"))) {
    console.error(`${LABEL} --selftest FAIL: write path not flagged`);
    process.exit(1);
  }

  const good = assertCoaAsymmetryReadonly(real);
  if (good.length) {
    console.error(`${LABEL} --selftest FAIL:\n${good.join("\n")}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK`);
  process.exit(0);
}

if (IS_MAIN) {
  const problems = assertCoaAsymmetryReadonly({});
  if (problems.length) {
    console.error(`${LABEL} FAIL:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — CoA asymmetry grouped diff is read-only (Rule 19).`);
}
