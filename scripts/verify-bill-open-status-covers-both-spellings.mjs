#!/usr/bin/env node
/**
 * GUARD: a payables (open-bills / AP-aging) predicate must cover BOTH partial-paid spellings.
 *
 * ACCT-F183. `accounting.bills.status` carries BOTH 'partial' AND 'partially_paid' as live values
 * on prod — verified by `SELECT DISTINCT status` with the RLS bypass and the completeness
 * discriminator (visible 16,261 == n_live_tup 16,261, role ih35_app). Two independent read paths
 * matched only 'partial', so every partially-paid bill vanished from payables: measured live,
 * 2 bills carrying $482.95 of open balance.
 *
 * THE DIRECTION IS WHAT MAKES THIS SERIOUS. The board card LV-AP-OPEN-INCLUDES-VOIDED describes an
 * OVERSTATEMENT (voided bills counted). That defect no longer reproduces — all four voided USMCA
 * bills now carry status='void'. This is the mirror image and the worse direction: payables were
 * UNDERSTATED, so the company appears to owe less than it does. An overstatement is caught by
 * anyone reconciling; an understatement is what you find when a bill goes unpaid.
 *
 * NOT AN INVENTED CONVENTION: bills.service.ts:528/574 already writes
 * `b.status IN ('partial','partially_paid')`. The drift was known and these two paths were simply
 * never updated. This guard makes the pair mandatory wherever open bills are summed.
 *
 * SCOPE, deliberately narrow: only predicates over accounting.bills that select the OPEN set
 * (an `unpaid` + `partial` pair). Invoice statuses ('sent','partial') are a different vocabulary
 * and are not touched — a guard that reddens on unrelated code gets muted.
 *
 * Run:  node scripts/verify-bill-open-status-covers-both-spellings.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(root, "apps/backend/src");
const LABEL = "verify-bill-open-status-covers-both-spellings";

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "node_modules" && e.name !== "__tests__") walk(p, out);
    } else if (e.name.endsWith(".ts") && !e.name.includes(".test.")) out.push(p);
  }
  return out;
}

/**
 * Find `status IN (...)` lists that select the OPEN bill set — identified by containing BOTH
 * 'unpaid' and 'partial' — and report the ones missing 'partially_paid'.
 */
export function offendingPredicates(src) {
  const clean = src.replace(/--[^\n]*/g, "").replace(/\/\/[^\n]*/g, "");
  const bad = [];
  for (const m of clean.matchAll(/status\s+IN\s*\(([^)]*)\)/gi)) {
    const list = m[1];
    const hasUnpaid = /'unpaid'/i.test(list);
    const hasPartial = /'partial'/i.test(list);
    if (!hasUnpaid || !hasPartial) continue; // not an open-bills predicate
    if (!/'partially_paid'/i.test(list)) bad.push(m[0].replace(/\s+/g, " ").trim());
  }
  return bad;
}

export function collectProblems(sources) {
  const problems = [];
  for (const { file, src } of sources) {
    for (const pred of offendingPredicates(src)) {
      problems.push(
        `${file}: ${pred} selects the OPEN bill set but omits 'partially_paid'. ` +
          `accounting.bills.status carries BOTH spellings on prod, so this silently DROPS every ` +
          `partially-paid bill and UNDERSTATES payables (ACCT-F183).`
      );
    }
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const failures = [];

  const bad = "WHERE b.status IN ('unpaid', 'partial') AND x";
  const good = "WHERE b.status IN ('unpaid', 'partial', 'partially_paid') AND x";
  if (offendingPredicates(bad).length !== 1) failures.push("the ACCT-F183 defect verbatim was NOT caught");
  if (offendingPredicates(good).length !== 0) failures.push("a corrected predicate was still flagged");

  // A comment naming the column must not satisfy the check — every fix here ships with one.
  const commented = "-- includes partially_paid\nWHERE b.status IN ('unpaid', 'partial')";
  if (offendingPredicates(commented).length !== 1) {
    failures.push("a COMMENT naming partially_paid satisfied the check — false green");
  }

  // Invoice vocabulary must NOT be flagged: 'sent'+'partial' is a different status set.
  if (offendingPredicates("WHERE i.status IN ('sent', 'partial')").length !== 0) {
    failures.push("an INVOICE status predicate was flagged — out of scope, would redden unrelated code");
  }
  // 'open'+'partial' without 'unpaid' is likewise a different vocabulary.
  if (offendingPredicates("WHERE status IN ('open', 'partial')").length !== 0) {
    failures.push("an open/partial predicate without 'unpaid' was flagged");
  }
  // End-to-end through the real checker.
  if (collectProblems([{ file: "x.ts", src: bad }]).length !== 1) failures.push("collectProblems missed the defect");
  if (collectProblems([{ file: "x.ts", src: good }]).length !== 0) failures.push("collectProblems flagged a fix");

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST OK — 7/7 (defect verbatim, fix passes, comment cannot fake a pass, invoice + open/partial vocabularies correctly ignored, end-to-end red + green)`);
  process.exit(0);
}

const sources = fs.existsSync(SRC)
  ? walk(SRC).map((p) => ({ file: path.relative(root, p), src: fs.readFileSync(p, "utf8") }))
  : [];
const problems = collectProblems(sources);
if (problems.length) {
  console.error(`${LABEL} FAIL — ${problems.length} payables predicate(s) missing 'partially_paid':`);
  for (const p of problems) console.error("  ✗ " + p);
  process.exit(1);
}
console.log(`${LABEL} OK — every open-bills predicate covers both 'partial' and 'partially_paid'.`);
