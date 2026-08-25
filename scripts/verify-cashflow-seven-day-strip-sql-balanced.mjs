#!/usr/bin/env node
/**
 * CASHFLOW-SEVEN-DAY-STRIP-INCOME-SQL-BROKEN — buildSevenDayStrip()'s incomeSubquery template
 * (both the cashFollowsEta true and false branches) had an extra, unmatched closing parenthesis at
 * the very end of the string. When embedded inside the outer `COALESCE(${incomeSubquery}, 0)::int`
 * wrapper, this produced Postgres error 42601 "syntax error at or near ')'" -- live-reproduced via
 * an authenticated fetch against GET /api/v1/cash-flow/daily-prediction before fixing: EVERY date
 * (13 consecutive days checked) 500'd with this exact error, taking down the entire Daily
 * Prediction cash-flow tab (including the newly-shipped Proforma / Pre-invoice feature, item 26).
 *
 * A second, related bug: the first term of the addition (`(subquery1) + COALESCE((subquery2), 0)`)
 * was not itself wrapped in COALESCE, so on any day with proforma-only income (no genuine
 * non-proforma load delivering) SQL's `NULL + x = NULL` silently zeroed the WHOLE sum even though
 * the real proforma amount was correctly computed by subquery2 -- Neon-confirmed: without this fix,
 * a real $1,000.00 proforma disappeared to $0 in the 7-day strip.
 *
 * Both re-verified directly against live Neon prod data (project tiny-field-89581227) before and
 * after the fix: the broken paren pattern reproduces the exact 42601; the fixed version returns the
 * correct $1,000.00 (100000 cents) for a real proforma-only day.
 */
import fs from "node:fs";

const FILE = "apps/backend/src/cash-flow/cash-flow.service.ts";

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
}

function extractIncomeSubqueryBranches(source) {
  const stripped = stripComments(source);
  const start = stripped.indexOf("const incomeSubquery = cashFollowsEta");
  if (start < 0) return null;
  // The assignment ends at the first `;` that terminates the ternary (both branches are backtick
  // template literals with no semicolons inside).
  const end = stripped.indexOf(";", start);
  if (end < 0) return null;
  const block = stripped.slice(start, end);
  // Split on the ternary's `:` that separates the two backtick branches. Both branches start with
  // a backtick immediately after `?` / `:`.
  const trueBranchMatch = block.match(/\?\s*`([\s\S]*?)`\s*\n\s*:/);
  const falseBranchMatch = block.match(/:\s*`([\s\S]*?)`\s*;?\s*$/);
  if (!trueBranchMatch || !falseBranchMatch) return null;
  return { trueBranch: trueBranchMatch[1], falseBranch: falseBranchMatch[1] };
}

function auditBranch(label, text, failures) {
  // No SQL string literal in this fragment contains a literal paren character ('delivery',
  // 'cancelled', 'proforma', etc. do not), so a raw character count is a valid balance check here.
  const opens = (text.match(/\(/g) || []).length;
  const closes = (text.match(/\)/g) || []).length;
  if (opens !== closes) {
    failures.push(
      `${FILE}: incomeSubquery ${label} branch has unbalanced parens (${opens} open vs ${closes} close) -- this is exactly the 42601 syntax-error class this guard exists to catch`
    );
  }
  const coalesceWraps = (text.match(/COALESCE\(\(/g) || []).length;
  if (coalesceWraps < 2) {
    failures.push(
      `${FILE}: incomeSubquery ${label} branch must wrap BOTH addition terms in COALESCE((...), 0) -- found ${coalesceWraps}, need 2, or a NULL-only-income day silently zeroes the whole sum`
    );
  }
}

function audit(source) {
  const branches = extractIncomeSubqueryBranches(source);
  if (!branches) return [`${FILE}: could not locate the incomeSubquery ternary assignment to audit -- guard needs updating`];
  const failures = [];
  auditBranch("cashFollowsEta=true", branches.trueBranch, failures);
  auditBranch("cashFollowsEta=false", branches.falseBranch, failures);
  return failures;
}

const source = fs.readFileSync(FILE, "utf8");
const failures = audit(source);

if (failures.length) {
  console.error(`verify-cashflow-seven-day-strip-sql-balanced FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    {
      name: "reintroduce the extra trailing ) in the cashFollowsEta=true branch",
      mutate: (t) =>
        t.replace(
          `              AND \${projectedCashDateSql({ deliveryScheduledExpr: "fd.scheduled_arrival_at" })} = $2::date
            ORDER BY l.id, i.created_at DESC NULLS LAST
          ) pf
        ), 0)\`
    : \`COALESCE((`,
          `              AND \${projectedCashDateSql({ deliveryScheduledExpr: "fd.scheduled_arrival_at" })} = $2::date
            ORDER BY l.id, i.created_at DESC NULLS LAST
          ) pf
        ), 0)
        )\`
    : \`COALESCE((`
        ),
    },
    {
      name: "reintroduce the extra trailing ) in the cashFollowsEta=false branch",
      mutate: (t) =>
        t.replace(
          `              AND fd.scheduled_arrival_at::date = $2::date
            ORDER BY l.id, i.created_at DESC NULLS LAST
          ) pf
        ), 0)\`;`,
          `              AND fd.scheduled_arrival_at::date = $2::date
            ORDER BY l.id, i.created_at DESC NULLS LAST
          ) pf
        ), 0)
        )\`;`
        ),
    },
    {
      name: "remove the first-term COALESCE wrap in the cashFollowsEta=true branch (reintroduces NULL-swallow)",
      mutate: (t) =>
        t.replace(
          `  const incomeSubquery = cashFollowsEta
    ? \`COALESCE((
          SELECT SUM(COALESCE(l.rate_total_cents, 0))`,
          `  const incomeSubquery = cashFollowsEta
    ? \`(
          SELECT SUM(COALESCE(l.rate_total_cents, 0))`
        ),
    },
    {
      name: "remove the first-term COALESCE wrap in the cashFollowsEta=false branch (reintroduces NULL-swallow)",
      mutate: (t) =>
        t.replace(
          `    : \`COALESCE((
          SELECT SUM(COALESCE(l.rate_total_cents, 0))
          FROM mdata.loads l
          JOIN mdata.load_stops ls`,
          `    : \`(
          SELECT SUM(COALESCE(l.rate_total_cents, 0))
          FROM mdata.loads l
          JOIN mdata.load_stops ls`
        ),
    },
  ];
  let caught = 0;
  for (const { name, mutate } of mutations) {
    const mutated = mutate(source);
    if (mutated === source) throw new Error(`mutation "${name}" did not change source -- inert`);
    if (audit(mutated).length === 0) throw new Error(`mutation escaped: "${name}" was not caught`);
    caught += 1;
  }
  console.log(`verify-cashflow-seven-day-strip-sql-balanced SELFTEST PASS — ${caught}/${mutations.length} mutations detected`);
}

console.log(
  "verify-cashflow-seven-day-strip-sql-balanced PASS — both incomeSubquery branches are paren-balanced and NULL-safe"
);
