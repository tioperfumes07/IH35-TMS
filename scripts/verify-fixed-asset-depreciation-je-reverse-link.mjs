#!/usr/bin/env node
/**
 * ACCT-F5302 / FIXED-ASSETS-DEPRECIATION-GL-POSTING-NOT-BUILT — the depreciation GL poster
 * (postDepreciation, "FIN-21", amortization-posting.service.ts) already exists and is already live
 * for TRK/USMCA (AMORTIZATION_GL_POSTING_ENABLED). The gap this guard closes was NOT the posting
 * engine — it was that the READ side of the Fixed Assets detail route never told the frontend which
 * periods were actually posted, so a real posted JE had no reverse-link drill from the asset screen.
 *
 * Asserts:
 *   1. fixed-assets.routes.ts detail handler reads accounting.depreciation_schedule_rows for
 *      posted / posted_journal_entry_id and merges it into the schedule response (not just the
 *      computed preview from fixed-assets.math.ts).
 *   2. FixedAssetsPage.tsx renders EntityLink kind="journal_entry" for a posted schedule row —
 *      gated on row.posted, never an unconditional/fake link.
 *
 * Usage:
 *   node scripts/verify-fixed-asset-depreciation-je-reverse-link.mjs            # scan
 *   node scripts/verify-fixed-asset-depreciation-je-reverse-link.mjs --selftest # inject a regression -> must FAIL
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-fixed-asset-depreciation-je-reverse-link";
const ROUTE = "apps/backend/src/accounting/fixed-assets.routes.ts";
const PAGE = "apps/frontend/src/pages/accounting/FixedAssetsPage.tsx";

function readRel(root, rel, overrides) {
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, rel)) return overrides[rel];
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

export function collectProblems(root = ROOT, overrides = null) {
  const problems = [];
  const route = readRel(root, ROUTE, overrides);
  const page = readRel(root, PAGE, overrides);

  if (!route) {
    problems.push(`missing ${ROUTE}`);
  } else {
    const code = stripComments(route);
    if (!/FROM\s+accounting\.depreciation_schedule_rows/i.test(code)) {
      problems.push(`${ROUTE}: detail route must read accounting.depreciation_schedule_rows (the real posted rows, not only the computed preview)`);
    }
    if (!/posted_journal_entry_id/.test(code)) {
      problems.push(`${ROUTE}: detail route must select/project posted_journal_entry_id`);
    }
    if (!/\bposted\b/.test(code)) {
      problems.push(`${ROUTE}: detail route must select/project the posted boolean`);
    }
  }

  if (!page) {
    problems.push(`missing ${PAGE}`);
  } else {
    const code = stripComments(page);
    if (!/<EntityLink[\s\S]{0,80}?kind=["']journal_entry["']/.test(code)) {
      problems.push(`${PAGE}: must render <EntityLink kind="journal_entry" ...> for a posted depreciation period`);
    }
    // Must be gated on the row's posted state — an unconditional link would be theater (fabricates a
    // JE reference for unposted periods).
    if (!/row\.posted\s*&&\s*row\.posted_journal_entry_id/.test(code)) {
      problems.push(`${PAGE}: the journal-entry link must be gated on row.posted && row.posted_journal_entry_id, never unconditional`);
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
  console.log(`${LABEL}: PASS — Fixed Assets detail route + page expose the real posted depreciation JE (no theater, no unconditional link)`);
  return { ok: true, offenders: [] };
}

function selftest() {
  const baseline = collectProblems();
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST FAIL (baseline must be clean):`);
    for (const p of baseline) console.error("  - " + p);
    process.exit(1);
  }

  const routeReal = readRel(ROOT, ROUTE);
  const pageReal = readRel(ROOT, PAGE);

  const plant = (label, overrides, expectFragment) => {
    const problems = collectProblems(ROOT, overrides);
    if (!problems.some((p) => p.includes(expectFragment))) {
      console.error(`${LABEL} SELFTEST FAIL: planted regression "${label}" was NOT caught`);
      process.exit(1);
    }
  };

  plant(
    "route-drops-depreciation-schedule-rows-read",
    { [ROUTE]: routeReal.replace(/FROM\s+accounting\.depreciation_schedule_rows/i, "FROM accounting.fixed_assets_removed") },
    "must read accounting.depreciation_schedule_rows"
  );
  plant(
    "route-drops-posted-journal-entry-id",
    { [ROUTE]: routeReal.replaceAll("posted_journal_entry_id", "removed_field") },
    "must select/project posted_journal_entry_id"
  );
  plant(
    "page-drops-je-entitylink",
    { [PAGE]: pageReal.replaceAll(/kind=["']journal_entry["']/g, 'kind="bill"') },
    'must render <EntityLink kind="journal_entry"'
  );
  plant(
    "page-unconditional-je-link",
    { [PAGE]: pageReal.replace(/row\.posted\s*&&\s*row\.posted_journal_entry_id/, "true") },
    "must be gated on row.posted"
  );

  console.log(`${LABEL} SELFTEST PASS — 4 planted regressions all caught`);
}

const isMain = path.resolve(process.argv[1] ?? "") === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  if (process.argv.includes("--selftest")) selftest();
  else process.exit(run().ok ? 0 : 1);
}
