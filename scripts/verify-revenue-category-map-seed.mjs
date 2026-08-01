#!/usr/bin/env node
/**
 * ACCT-F74 — the revenue category→account seed must cover exactly the codes deriveRevenueCode()
 * emits, and must never be seeded entity-blind.
 *
 * WHY IT EXISTS: accounting.expense_category_account_map had ZERO category_kind='revenue' rows, and
 * resolveAccountForCategory THROWS on a miss from a call site with no try/catch — so creating an
 * invoice from a load failed on its first line, for every entity.
 *
 * THE ENTITY CLAUSE IS THE DANGEROUS PART, and it is why this guard exists rather than a comment:
 * account_number 'QBO-31' resolves to DIFFERENT accounts per company —
 *     TRANSP  QBO-31 = "Sales of Product Income"        (revenue)
 *     TRK     QBO-31 = "COST OF SALES-OPERATING COSTS"  (an EXPENSE account)
 * A seed that looked up accounts by number without pinning the company would credit TRK's freight
 * revenue into cost of sales. That is a silent, permanent misstatement no test would catch, so the
 * seed must resolve accounts inside a single named company.
 *
 * DRIFT THIS CATCHES: deriveRevenueCode() gaining a new line_type (say 'stop_off') without a matching
 * seed row would reintroduce the original bug for that type only — an invoice that fails for one
 * accessorial while every other line works, which is far harder to diagnose than a total failure.
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIR = "db/migrations";
const RESOLVER = "apps/backend/src/invoices/invoice-line-revenue-resolution.service.ts";
const LABEL = "verify-revenue-category-map-seed";
const MATCH = /seed_revenue_category_account_map\.sql$/;

/** Every code deriveRevenueCode() can return, read from the function itself. */
export function emittedRevenueCodes(src) {
  const fn = /export function deriveRevenueCode[\s\S]*?\n}/.exec(src);
  if (!fn) return [];
  return [...new Set([...fn[0].matchAll(/return\s+"([a-z_]+)"/g)].map((m) => m[1]))];
}

export function auditSeed(sql, codes) {
  const problems = [];
  for (const code of codes) {
    if (!new RegExp(`'${code}'`).test(sql)) {
      problems.push(
        `${DIR}: deriveRevenueCode() can emit '${code}' but the revenue seed has no row for it. ` +
          `resolveAccountForCategory THROWS on a miss, so an invoice line of that type fails to create.`
      );
    }
  }
  if (!/code\s*=\s*'TRANSP'/.test(sql)) {
    problems.push(`${DIR}: the seed does not pin a company by code — accounts must be resolved inside one entity.`);
  }
  if (!/operating_company_id\s*=\s*v_opco/.test(sql)) {
    problems.push(
      `${DIR}: accounts are not resolved scoped to the seeded company. 'QBO-31' is Sales of Product ` +
        `Income in TRANSP and COST OF SALES in TRK — an unscoped lookup credits revenue to an expense account.`
    );
  }
  if (!/posting_side[\s\S]{0,80}'credit'/.test(sql)) {
    problems.push(`${DIR}: revenue rows must be seeded with posting_side='credit'.`);
  }
  if (!/NOT EXISTS/i.test(sql)) {
    problems.push(`${DIR}: the seed is not idempotent (no NOT EXISTS guard) — a redeploy would duplicate rows.`);
  }
  return problems;
}

function auditTree() {
  const files = readdirSync(join(ROOT, DIR)).filter((f) => MATCH.test(f));
  if (files.length === 0) return [];
  const codes = emittedRevenueCodes(readFileSync(join(ROOT, RESOLVER), "utf8"));
  if (codes.length === 0) return [`${RESOLVER}: deriveRevenueCode() not found — cannot verify seed coverage.`];
  return files.flatMap((f) => auditSeed(readFileSync(join(ROOT, DIR, f), "utf8"), codes));
}

function selftest() {
  const failures = [];
  const good = `SELECT id INTO v_opco FROM org.companies WHERE code = 'TRANSP';
    a.operating_company_id = v_opco
    ('linehaul','QBO-31'),('fuel_surcharge','X'),('detention','Y'),('layover','Y'),('lumper','Z'),('accessorial','Y')
    posting_side, is_active) VALUES (v_opco, 'revenue', r.category_code, v_account, 'credit', true)
    IF NOT EXISTS (SELECT 1 FROM accounting.expense_category_account_map m`;
  const codes = ["linehaul", "fuel_surcharge", "detention", "layover", "lumper", "accessorial"];
  if (auditSeed(good, codes).length !== 0) failures.push(`case1 FAIL — a correct seed was flagged: ${auditSeed(good, codes).join(" | ")}`);
  if (!auditSeed(good, [...codes, "stop_off"]).some((p) => p.includes("'stop_off'")))
    failures.push("case2 FAIL — a code with no seed row was NOT caught");
  const unscoped = good.replace("a.operating_company_id = v_opco", "a.account_number = r.account_number");
  if (!auditSeed(unscoped, codes).some((p) => p.includes("COST OF SALES")))
    failures.push("case3 FAIL — an entity-unscoped account lookup was NOT caught");
  const notIdem = good.replace("IF NOT EXISTS (SELECT 1 FROM accounting.expense_category_account_map m", "INSERT INTO x");
  if (!auditSeed(notIdem, codes).some((p) => p.includes("not idempotent")))
    failures.push("case4 FAIL — a non-idempotent seed was NOT caught");
  const tree = auditTree();
  if (tree.length !== 0) failures.push(`case5 FAIL — real migration flagged: ${tree.join(" | ")}`);
  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS — correct seed clean, missing code caught, unscoped lookup caught, non-idempotent caught`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const problems = auditTree();
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — every deriveRevenueCode() output has an entity-scoped revenue mapping`);
}

main();
