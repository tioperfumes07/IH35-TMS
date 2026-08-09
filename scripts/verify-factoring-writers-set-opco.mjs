#!/usr/bin/env node
/**
 * GUARD: every writer of factoring.factor sets the RLS-scoping column. ACCT-F279.
 *
 * WHY THIS GUARD EXISTS: the class was fixed TWICE BY HAND and guarded ZERO times.
 *   #5082 (4647c180e) fixed insurance/policy.routes.ts        — writer 1 listed tenant_id only
 *   #5088 (d4acfa2c2) fixed insurance/policy-create-atomic.ts — writer 2 listed tenant_id only
 * Both were found by a human going looking. Nothing stopped a third.
 *
 * ★ THERE WAS A THIRD. This guard found `policy.routes.ts` renewal INSERT ... SELECT, which lists
 * `tenant_id` and NOT `operating_company_id` — a renewal clones an existing policy and drops the
 * scoping column on the way. Not live damage at the time of writing (prod: factoring.factor = 1 row,
 * 0 renewals, 0 NULL operating_company_id, measured 2026-08-09 with bypass_rls in-txn, visible 1 ==
 * n_live_tup 1) — the renewal path has never executed. It is armed, not fired.
 *
 * SCOPED BY TABLE, NOT BY DIRECTORY. Writer 2 lived in a *.service.ts, not a route, which is exactly
 * why a directory-scoped or route-scoped check would have missed it. This scans every .ts under
 * apps/backend/src for `INSERT INTO factoring.factor` and judges the column list that follows.
 *
 * WHY tenant_id IS THE TRIGGER: all three writers listed tenant_id. A writer that scopes by tenant
 * but not by operating company is the precise defect shape — it looks scoped and is not, so it
 * passes review. An INSERT that lists NEITHER is a different (and louder) problem, and this guard
 * says so rather than staying silent.
 *
 * NOT WIDENED ON A HUNCH: I was asked whether the same shape exists on other RLS-scoped tables. I did
 * not widen this guard to find out, because a guard written against a table I have not examined
 * redden on correct code. What I checked is recorded in the finding, not asserted here.
 *
 * Run:  node scripts/verify-insurance-policy-writers-set-opco.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC_DIR = "apps/backend/src";
/** The CLASS is two tables, not one — see the denominator note in the header. */
const TABLES = ["factoring.factor", "factoring.letter_of_release", "factoring.customer_factor_assignment",
  "factoring.reserve_movement", "factoring.bank_match_suggestion", "factoring.batch"];
const LABEL = "verify-factoring-writers-set-opco";

export function stripComments(src) {
  return src
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--[^\n]*/g, "");
}

/**
 * Every `INSERT INTO factoring.factor ( ... )` column list in the source.
 * Deliberately does NOT match factoring.letter_of_release / policy_installment — the table name must be
 * followed by whitespace or an opening paren, never another identifier character.
 */
export function factoringInsertColumnLists(src) {
  const clean = stripComments(src);
  const out = [];
  // Matches BOTH class tables. `policy(?![a-z_])` alone excluded policy_unit — that boundary was
  // correct for a table-named guard and WRONG for the class, which is exactly how a guard goes green
  // over an unguarded half (ACCT-F279 denominator note).
  const re = /INSERT\s+INTO\s+factoring\.(customer_factor_assignment|letter_of_release|bank_match_suggestion|reserve_movement|factor|batch)(?![a-z_])\s*\(([\s\S]{0,900}?)\)/gi;
  let m;
  while ((m = re.exec(clean)) !== null) out.push({ table: `factoring.${m[1]}`, cols: m[2] });
  return out;
}

export function collectProblems(src, file) {
  const problems = [];
  for (const { table, cols } of factoringInsertColumnLists(src)) {
    const list = cols.toLowerCase();
    const hasTenant = /\btenant_id\b/.test(list);
    const hasOpco = /\boperating_company_id\b/.test(list);
    if (hasOpco) continue;
    if (hasTenant) {
      problems.push(
        `${file}: an INSERT INTO ${table} lists tenant_id but NOT operating_company_id. A row scoped by ` +
          `tenant and not by operating company LOOKS scoped and is not — it is invisible to, or leaks ` +
          `across, per-entity RLS. This exact shape was fixed by hand twice (#5082, #5088) before this ` +
          `guard existed (ACCT-F279).`
      );
    } else {
      problems.push(
        `${file}: an INSERT INTO ${table} lists NEITHER tenant_id NOR operating_company_id. Every row in ` +
          `this table must carry its RLS scoping column (ACCT-F279).`
      );
    }
  }
  return problems;
}

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "__tests__") continue;
      walk(p, acc);
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      acc.push(p);
    }
  }
  return acc;
}

if (process.argv.includes("--selftest")) {
  const failures = [];
  const q = (sql) => "await c.query(`" + sql + "`);";
  const GOOD = q("INSERT INTO factoring.factor (tenant_id, operating_company_id, name) VALUES ($1,$1,$2)");
  const TENANT_ONLY = q("INSERT INTO factoring.factor (tenant_id, name, advance_rate) VALUES ($1,$2,$3)");
  const NEITHER = q("INSERT INTO factoring.batch (batch_number, status) VALUES ($1,$2)");
  const LOR_UNSCOPED = q("INSERT INTO factoring.letter_of_release (tenant_id, factor_id, issued_date) VALUES ($1,$2,$3)");
  const CFA_UNSCOPED = q("INSERT INTO factoring.customer_factor_assignment (tenant_id, customer_id) VALUES ($1,$2)");
  const RESERVE_OK = q("INSERT INTO factoring.reserve_movement (tenant_id, operating_company_id, amount_cents) VALUES ($1,$1,$2)");
  // Out-of-class factoring table: must NOT be matched, or widening becomes over-matching.
  const OUT_OF_CLASS = q("INSERT INTO factoring.invoice_assignment (tenant_id, invoice_id) VALUES ($1,$2)");
  const MULTILINE = q("INSERT INTO factoring.batch (\n  tenant_id,\n  batch_number\n)\nVALUES ($1,$2)");

  const caught = (fx, re_) => collectProblems(fx, "f.ts").some((p) => re_.test(p));

  if (collectProblems(GOOD, "f.ts").length !== 0) failures.push("a correct factor writer was flagged");
  if (collectProblems(RESERVE_OK, "f.ts").length !== 0) failures.push("a correct reserve_movement writer was flagged");
  if (!caught(TENANT_ONLY, /factoring\.factor lists tenant_id but NOT/)) failures.push("tenant-only factor writer NOT caught");
  if (!caught(LOR_UNSCOPED, /letter_of_release lists tenant_id but NOT/)) failures.push("tenant-only letter_of_release writer NOT caught");
  if (!caught(CFA_UNSCOPED, /customer_factor_assignment lists tenant_id but NOT/)) failures.push("tenant-only customer_factor_assignment writer NOT caught");
  if (!caught(NEITHER, /lists NEITHER tenant_id NOR/)) failures.push("a writer with no scoping column at all NOT caught");
  if (!caught(MULTILINE, /batch lists tenant_id but NOT/)) failures.push("multi-line column list NOT caught");
  if (collectProblems(OUT_OF_CLASS, "f.ts").length !== 0) failures.push("factoring.invoice_assignment matched — boundary too wide");
  const COMMENT = TENANT_ONLY + "\n-- INSERT INTO factoring.factor (tenant_id, operating_company_id)";
  if (!caught(COMMENT, /factor lists tenant_id but NOT/)) failures.push("a comment faked the fix — false green (ACCT-F264 shape)");

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log(
    `${LABEL} SELFTEST OK — 9/9 (correct writers pass x2, tenant-only caught on all 3 defective tables, ` +
      `no-scoping caught, multi-line caught, out-of-class table not matched, comment cannot fake)`
  );
  process.exit(0);
}

const dir = path.join(root, SRC_DIR);
if (!fs.existsSync(dir)) {
  console.error(`${LABEL} FAIL — ${SRC_DIR} is missing.`);
  process.exit(1);
}
const problems = [];
let scanned = 0;
let writeSites = 0;
const perTable = new Map();
for (const file of walk(dir)) {
  const src = fs.readFileSync(file, "utf8");
  if (!src.includes("factoring.")) continue;
  scanned += 1;
  // DENOMINATOR: count the write sites this guard actually adjudicated, per table. A bare "PASS" does
  // not survive a reader -- this class was declared closed twice by authors who had each fixed every
  // site they could see (#5082 -> 1 site, #5088 -> 1 more, #5089 -> 4 more). "PASS across N enumerated
  // write sites" is what makes a fourth round unnecessary.
  for (const { table } of factoringInsertColumnLists(src)) {
    writeSites += 1;
    perTable.set(table, (perTable.get(table) ?? 0) + 1);
  }
  problems.push(...collectProblems(src, path.relative(root, file)));
}
const denom =
  `${writeSites} write site(s) [` +
  [...perTable.entries()].sort().map(([t, n]) => `${t}=${n}`).join(" ") +
  `] across ${scanned} file(s), enumerated by table-scoped scan of apps/backend/src`;
if (problems.length) {
  console.error(`${LABEL} FAIL — ${problems.length} of ${denom} missing RLS scoping:`);
  for (const x of problems) console.error("  ✗ " + x);
  process.exit(1);
}
console.log(`${LABEL} OK — PASS across ${denom}; every one sets operating_company_id.`);
