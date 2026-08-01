#!/usr/bin/env node
/**
 * SAF-F62 — the DOT random drug & alcohol pool draw must be a RUNNABLE statement.
 *
 * WHY THIS EXISTS (proven against prod br-fancy-credit-akjnd07a, 2026-08-01):
 * `_system.background_jobs` showed `safety.da_random_pool.quarterly_draw` with
 * last_successful_run_at = NULL — it had NEVER succeeded — failing with
 *   "for SELECT DISTINCT, ORDER BY expressions must appear in select list"
 * The eligible-driver query selected the CAST `e.driver_uuid::text` but ordered by the UNCAST
 * `e.driver_uuid`. Postgres treats those as different expressions under SELECT DISTINCT and rejects
 * the statement at PARSE time — so the query never executed, not even to return zero rows. I
 * reproduced the error verbatim on prod and confirmed the aliased form parses and runs.
 *
 * WHY A PARSE ERROR IS THE DANGEROUS KIND: it fails identically whether the pool has 0 drivers or
 * 500. The job still ran on schedule and still incremented run_count_today, so from the outside it
 * looked alive. Nothing distinguishes "drew from an empty pool" from "could not run at all" unless
 * something asserts the statement is well-formed — which is what this guard does.
 *
 * SCOPE HONESTY: this guard checks THIS file's DISTINCT queries. A regex sweep for the same shape
 * across the backend produced 10 candidates that proved to be FALSE POSITIVES on inspection (the
 * pattern spans subqueries and picks up an outer ORDER BY). Per the repo rule "don't trust a
 * string-grep systemic check", the class-wide sweep needs a real SQL parser and is NOT claimed here.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SVC = "apps/backend/src/safety/drug-alcohol/random-pool.service.ts";
const LABEL = "verify-da-random-pool-draw-runnable";

/**
 * For every `SELECT DISTINCT ... ORDER BY ...` in one SQL string, every ORDER BY term must appear
 * in the select list. Operates on ONE statement at a time so an outer ORDER BY can't be attributed
 * to an inner DISTINCT — the mistake that made the repo-wide sweep useless.
 */
export function auditDistinctOrderBy(sql) {
  const problems = [];
  const m = /SELECT\s+DISTINCT\s+(?!ON\b)([\s\S]*?)\s+FROM\s+([\s\S]*?)(?:\bORDER\s+BY\b\s+([\s\S]*?))?$/i.exec(
    sql.trim()
  );
  if (!m) return problems;
  const selectList = m[1];
  const orderBy = (m[3] || "").trim();
  if (!orderBy) return problems;
  // EXPRESSION EQUALITY, NOT SUBSTRING. The first version of this guard tested
  // `selectList.includes(term)` and PASSED on the real prod-failing query, because `e.driver_uuid`
  // is a substring of `e.driver_uuid::text` — the very cast that made Postgres treat them as two
  // different expressions. A guard that fails open on the defect it was written for is worse than no
  // guard, so terms are compared as whole normalised expressions.
  const norm = (s) => s.trim().replace(/\s+/g, " ").toLowerCase();
  const aliases = [...selectList.matchAll(/\bAS\s+([A-Za-z_][\w]*)/gi)].map((a) => a[1].toLowerCase());
  const selectExprs = selectList
    .split(",")
    .map((e) => norm(e.replace(/\s+AS\s+[A-Za-z_][\w]*\s*$/i, "")))
    .filter(Boolean);
  for (const rawTerm of orderBy.split(",")) {
    const term = rawTerm.trim().replace(/\s+(ASC|DESC)\b.*$/i, "").trim();
    if (!term) continue;
    const ok = aliases.includes(norm(term)) || selectExprs.includes(norm(term));
    if (!ok) {
      problems.push(
        `${SVC}: SELECT DISTINCT orders by \`${term}\`, which is not in its select list ` +
          `(\`${selectList.trim().replace(/\s+/g, " ")}\`). Postgres rejects this at PARSE time — the ` +
          `statement cannot run at all, and the job that owns it will report activity while producing ` +
          `nothing. Order by the select-list expression or its alias.`
      );
    }
  }
  return problems;
}

/** Pull each template-literal SQL block that contains SELECT DISTINCT. */
function distinctStatements(src) {
  return [...src.matchAll(/`([^`]*SELECT\s+DISTINCT[^`]*)`/gi)].map((m) => m[1]);
}

function auditTree() {
  const src = readFileSync(join(ROOT, SVC), "utf8");
  const stmts = distinctStatements(src);
  if (stmts.length === 0) {
    return [`${SVC}: no SELECT DISTINCT statement found — the eligible-driver query this guard protects is gone.`];
  }
  return stmts.flatMap(auditDistinctOrderBy);
}

function selftest() {
  const failures = [];

  // The exact pre-fix statement, verbatim from origin/main.
  const preFix = `
      SELECT DISTINCT e.driver_uuid::text
      FROM safety.da_program_enrollments e
      WHERE e.operating_company_id = $1
        AND e.is_active = true
      ORDER BY e.driver_uuid
  `;
  if (auditDistinctOrderBy(preFix).length === 0)
    failures.push("case1 FAIL — the exact prod-failing statement was NOT caught");

  // The fix: ordering by the output alias.
  const fixed = `
      SELECT DISTINCT e.driver_uuid::text AS driver_uuid
      FROM safety.da_program_enrollments e
      WHERE e.operating_company_id = $1
        AND e.is_active = true
      ORDER BY driver_uuid
  `;
  if (auditDistinctOrderBy(fixed).length !== 0)
    failures.push(`case2 FAIL — the fixed statement was flagged: ${auditDistinctOrderBy(fixed).join(" | ")}`);

  // Ordering by the identical cast expression is also valid.
  const castOrder = `SELECT DISTINCT e.driver_uuid::text FROM t e ORDER BY e.driver_uuid::text`;
  if (auditDistinctOrderBy(castOrder).length !== 0) failures.push("case3 FAIL — ordering by the same cast expression was flagged");

  // No ORDER BY at all is fine.
  if (auditDistinctOrderBy(`SELECT DISTINCT a FROM t`).length !== 0) failures.push("case4 FAIL — a DISTINCT with no ORDER BY was flagged");

  const tree = auditTree();
  if (tree.length !== 0) failures.push(`case5 FAIL — real source flagged: ${tree.join(" | ")}`);

  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS — prod-failing statement caught, alias fix clean, cast-order clean, no-ORDER-BY clean`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const problems = auditTree();
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — the random-pool eligible-driver query is a runnable statement`);
}

main();
