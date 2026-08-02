#!/usr/bin/env node
/**
 * ACCT-F85 — the orphan-bill GL integrity rule must read the GL from the bill LINES, name the bill it
 * is talking about, and never present a truncated list as the whole.
 *
 * WHY (verified live on prod br-fancy-credit-akjnd07a, 2026-08-02, under is_lucia_bypass):
 *   accounting.bill_lines.account_id  155,160 of 155,270 lines, covering ALL 16,246 bills
 *   accounting.bills.coa_account_id   populated on exactly 1 of 16,246
 * The GL account of a bill lives on its LINES — the same model QBO, NetSuite and McLeod use: the
 * header carries the vendor, the expense distribution is per line. The rule tested the header, so
 * `coa_account_id IS NULL` matched 16,245 of 16,246 bills. An alert that fires on ~100% of the
 * ledger is not a finding, it is noise — and behind a LIMIT it silently reported 50 arbitrary bills
 * forever. Read from the lines and the TRUE count is 29 (all TRK). Those 29 were buried under
 * 16,245 false positives, on a rule that is ENABLED for both TRANSP and TRK.
 *
 * THREE PROPERTIES GUARDED, one per defect found:
 *  a. the orphan predicate reads bill_lines.account_id, and does NOT use the vestigial header column;
 *  b. any column interpolated into detection_summary is actually SELECTed — detection_summary
 *     interpolated row.bill_date while the SELECT never returned it, so every alert would have read
 *     "Bill undefined has no GL account";
 *  c. a LIMITed detection query carries a total, so a capped list can say so. This is the Form 425-C
 *     shape from doc 06 §2 — a truncated count presented as fact — and it is the reason a cap must
 *     never be silent.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SVC = "apps/backend/src/safety/integrity-alert-engine.service.ts";
const LABEL = "verify-orphan-bill-gl-reads-lines";

/** The orphan_bill_no_gl branch only — other rules in this file are out of scope. */
export function extractRule(src) {
  const start = src.indexOf('rule.rule_code === "orphan_bill_no_gl"');
  if (start === -1) return null;
  const next = src.indexOf('rule.rule_code === "orphan_payment_unapplied"', start);
  return src.slice(start, next === -1 ? src.length : next);
}

function stripLineComments(sql) {
  return sql.replace(/--[^\n]*/g, "").replace(/\/\/[^\n]*/g, "");
}

/** The SQL template literal only — checks about the QUERY must not be satisfied by the JS around it. */
function sqlOf(rule) {
  // The generic argument may itself contain angle brackets — `client.query<Record<string, unknown>>(`
  // — so a `<[^>]*>` match stops at the wrong ">" and extracts NOTHING, which made this guard flag
  // every column in the real source. Skip to the first template literal after client.query instead.
  const at = rule.indexOf("client.query");
  if (at === -1) return "";
  const open = rule.indexOf("`", at);
  if (open === -1) return "";
  const close = rule.indexOf("`", open + 1);
  return close === -1 ? "" : rule.slice(open + 1, close);
}

/**
 * The OUTER projection only. A column named in the CTE's inner SELECT is NOT returned to the caller,
 * so checking the whole statement would call `row.bill_date` "selected" purely because the CTE reads
 * b.bill_date — which is exactly how the mutation slipped through on the first run of this guard.
 */
function outerProjection(sql) {
  const m = /SELECT([\s\S]*?)FROM\s+orphan\s+o/i.exec(sql);
  return m ? m[1] : "";
}

export function auditRule(src) {
  const problems = [];
  const rule = extractRule(src);
  if (!rule) {
    problems.push(
      `${SVC}: the orphan_bill_no_gl branch is gone. This guard's anchor is missing, so none of its ` +
        `checks can run — re-point it at wherever the rule moved rather than letting it pass by absence.`
    );
    return problems;
  }
  const code = stripLineComments(rule);

  // (a) the GL must be read from the lines, not the vestigial header column.
  if (!/accounting\.bill_lines/i.test(code) || !/bl\.account_id|account_id\s+IS\s+NOT\s+NULL/i.test(code)) {
    problems.push(
      `${SVC}: orphan_bill_no_gl does not test accounting.bill_lines.account_id. The GL account lives ` +
        `on the LINES (155,160 of 155,270 lines carry one, covering all 16,246 bills); the header ` +
        `coa_account_id is set on exactly 1 bill on prod.`
    );
  }
  if (/\bb\.coa_account_id\s+IS\s+NULL/i.test(code)) {
    problems.push(
      `${SVC}: orphan_bill_no_gl uses \`b.coa_account_id IS NULL\` as its orphan predicate. That is ` +
        `the ACCT-F85 defect verbatim — it matches 16,245 of 16,246 prod bills and buries the 29 real ` +
        `GL orphans under a ~100% false-positive rate.`
    );
  }

  // (b) every column interpolated into the summary must be selected.
  const summary = /detection_summary:\s*([\s\S]*?),\n\s*detection_metric/.exec(rule);
  if (summary) {
    const projection = outerProjection(stripLineComments(sqlOf(rule)));
    const referenced = [...summary[1].matchAll(/row\.([a-z_][a-z0-9_]*)/gi)].map((m) => m[1]);
    for (const col of new Set(referenced)) {
      const selected = new RegExp(`AS\\s+${col}\\b|\\bo\\.${col}\\s*(,|$)`, "im").test(projection);
      if (!selected) {
        problems.push(
          `${SVC}: detection_summary interpolates row.${col}, but the query never returns a column ` +
            `named ${col}. The alert text would read "undefined" — this is exactly how ` +
            `"Bill undefined has no GL account" would have been written to every alert row.`
        );
      }
    }
  }

  // (c) a capped list must be able to say it is capped.
  const sqlOnly = stripLineComments(sqlOf(rule));
  if (/\bLIMIT\b/i.test(sqlOnly) && !/total_matching|COUNT\(\*\)\s+FROM\s+orphan/i.test(sqlOnly)) {
    problems.push(
      `${SVC}: orphan_bill_no_gl LIMITs its result set without carrying the total number of matching ` +
        `rows, so a truncated list is reported as the whole finding. Same shape as the Form 425-C ` +
        `count that would have been filed as fact (doc 06 §2).`
    );
  }
  return problems;
}

function auditTree() {
  return auditRule(readFileSync(join(ROOT, SVC), "utf8"));
}

function selftest() {
  const failures = [];
  const real = readFileSync(join(ROOT, SVC), "utf8");

  if (auditTree().length !== 0) failures.push(`case0 FAIL — real source flagged: ${auditTree().join(" | ")}`);

  // case1 — reintroduce the header-column predicate.
  const bugHeader = real.replace(
    /AND NOT EXISTS \(\n              SELECT 1\n              FROM accounting\.bill_lines bl\n              WHERE bl\.bill_id = b\.id\n                AND bl\.account_id IS NOT NULL\n            \)/,
    "AND b.coa_account_id IS NULL"
  );
  if (bugHeader === real) failures.push("case1 SETUP FAIL — could not locate the line predicate to mutate");
  else if (!auditRule(bugHeader).some((p) => p.includes("coa_account_id IS NULL")))
    failures.push("case1 FAIL — the vestigial header predicate was NOT caught");

  // case2 — the "Bill undefined" defect: summary references a column the query does not return.
  const bugSummary = real.replace(/o\.bill_date::text AS bill_date,/, "o.created_at::text AS created_at,");
  if (bugSummary === real) failures.push("case2 SETUP FAIL — could not locate the bill_date projection");
  else if (!auditRule(bugSummary).some((p) => p.includes("row.bill_date")))
    failures.push("case2 FAIL — an unselected column interpolated into detection_summary was NOT caught");

  // case3 — silent truncation returns.
  const bugLimit = real.replace(/\(SELECT COUNT\(\*\) FROM orphan\)::text AS total_matching\n/, "");
  if (bugLimit === real) failures.push("case3 SETUP FAIL — could not locate the total_matching projection");
  else if (!auditRule(bugLimit).some((p) => p.includes("truncated")))
    failures.push("case3 FAIL — a silent LIMIT was NOT caught");

  // case4 — the anchor vanishing must fail closed, never pass by absence.
  if (!auditRule("const x = 1;").some((p) => p.includes("anchor is missing")))
    failures.push("case4 FAIL — a missing orphan_bill_no_gl branch did NOT fail closed");

  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(
    `${LABEL}: selftest PASS — header-column predicate caught, unselected summary column caught, ` +
      `silent LIMIT caught, missing anchor fails closed`
  );
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const problems = auditTree();
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — the orphan-bill GL rule reads the lines, names the bill, and reports its true total`);
}

main();
