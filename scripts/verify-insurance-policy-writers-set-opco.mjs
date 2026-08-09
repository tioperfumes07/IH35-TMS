#!/usr/bin/env node
/**
 * GUARD: every writer of insurance.policy sets the RLS-scoping column. ACCT-F279.
 *
 * WHY THIS GUARD EXISTS: the class was fixed TWICE BY HAND and guarded ZERO times.
 *   #5082 (4647c180e) fixed insurance/policy.routes.ts        — writer 1 listed tenant_id only
 *   #5088 (d4acfa2c2) fixed insurance/policy-create-atomic.ts — writer 2 listed tenant_id only
 * Both were found by a human going looking. Nothing stopped a third.
 *
 * ★ THERE WAS A THIRD. This guard found `policy.routes.ts` renewal INSERT ... SELECT, which lists
 * `tenant_id` and NOT `operating_company_id` — a renewal clones an existing policy and drops the
 * scoping column on the way. Not live damage at the time of writing (prod: insurance.policy = 1 row,
 * 0 renewals, 0 NULL operating_company_id, measured 2026-08-09 with bypass_rls in-txn, visible 1 ==
 * n_live_tup 1) — the renewal path has never executed. It is armed, not fired.
 *
 * SCOPED BY TABLE, NOT BY DIRECTORY. Writer 2 lived in a *.service.ts, not a route, which is exactly
 * why a directory-scoped or route-scoped check would have missed it. This scans every .ts under
 * apps/backend/src for `INSERT INTO insurance.policy` and judges the column list that follows.
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
const TABLES = ["insurance.policy", "insurance.policy_unit"];

/**
 * DECLARED OUT OF SCOPE — named, deliberately NOT covered, and reported on every run.
 *
 * These carry the same tenant_id-without-operating_company_id shape AND have the column on prod, but
 * I have not read their writers. Silently covering them would repeat the exact error that cost the
 * insurance class three PRs: asserting completeness over sites nobody enumerated. A guard whose scope
 * is DECLARED can be extended by the next reader; one whose scope is assumed cannot.
 */
const OUT_OF_SCOPE = [
  "insurance.payment_schedule",
  "insurance.coi_request",
  "insurance.lawsuit",
  "insurance.refund_obligation",
];
const LABEL = "verify-insurance-policy-writers-set-opco";

export function stripComments(src) {
  return src
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--[^\n]*/g, "");
}

/**
 * Every `INSERT INTO insurance.policy ( ... )` column list in the source.
 * Deliberately does NOT match insurance.policy_unit / policy_installment — the table name must be
 * followed by whitespace or an opening paren, never another identifier character.
 */
export function policyInsertColumnLists(src) {
  const clean = stripComments(src);
  const out = [];
  // Matches BOTH class tables. `policy(?![a-z_])` alone excluded policy_unit — that boundary was
  // correct for a table-named guard and WRONG for the class, which is exactly how a guard goes green
  // over an unguarded half (ACCT-F279 denominator note).
  const re = /INSERT\s+INTO\s+insurance\.(policy_unit|policy)(?![a-z_])\s*\(([\s\S]{0,900}?)\)/gi;
  let m;
  while ((m = re.exec(clean)) !== null) out.push({ table: `insurance.${m[1]}`, cols: m[2] });
  return out;
}

export function collectProblems(src, file) {
  const problems = [];
  for (const { table, cols } of policyInsertColumnLists(src)) {
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
  const GOOD = "await c.query(`INSERT INTO insurance.policy (tenant_id, operating_company_id, insurer_name) VALUES ($1,$1,$2)`);";
  const TENANT_ONLY = "await c.query(`INSERT INTO insurance.policy (tenant_id, policy_number, status) VALUES ($1,$2,$3)`);";
  const NEITHER = "await c.query(`INSERT INTO insurance.policy (policy_number, status) VALUES ($1,$2)`);";
  // The real third writer's shape: INSERT ... SELECT, multi-line, tenant_id first.
  const RENEWAL =
    "await c.query(`INSERT INTO insurance.policy (\n   tenant_id, renewed_from_policy_id, policy_number,\n   effective_date, status\n )\n SELECT $1::uuid, $2::uuid, $3, $4::date, 'pending' FROM insurance.policy`);";
  // Sibling tables must NOT be matched.
  // policy_unit is IN the class (3 of the 6 write sites) — an earlier revision of this guard excluded
  // it by design and was therefore green over half the class. It must now be CAUGHT, not skipped.
  const SIBLING_UNSCOPED = "await c.query(`INSERT INTO insurance.policy_unit (tenant_id, policy_id, asset_id) VALUES ($1,$2,$3)`);";
  const SIBLING_OK = "await c.query(`INSERT INTO insurance.policy_unit (tenant_id, operating_company_id, policy_id) VALUES ($1,$1,$2)`);";
  const UNRELATED = "await c.query(`INSERT INTO insurance.policy_installment (tenant_id, amount_cents) VALUES ($1,$2)`);";

  if (collectProblems(GOOD, "f.ts").length !== 0) failures.push("a correct writer was flagged");
  if (!collectProblems(TENANT_ONLY, "f.ts").some((p) => /tenant_id but NOT operating_company_id/.test(p))) {
    failures.push("a tenant_id-only writer was NOT caught — this is the exact #5082/#5088 defect");
  }
  if (!collectProblems(NEITHER, "f.ts").some((p) => /NEITHER tenant_id NOR/.test(p))) {
    failures.push("a writer with no scoping column at all was NOT caught");
  }
  if (!collectProblems(RENEWAL, "f.ts").some((p) => /tenant_id but NOT operating_company_id/.test(p))) {
    failures.push("the INSERT...SELECT renewal shape was NOT caught — that is the real third writer");
  }
  if (!collectProblems(SIBLING_UNSCOPED, "f.ts").some((p) => /policy_unit lists tenant_id but NOT/.test(p))) {
    failures.push("an unscoped insurance.policy_unit writer was NOT caught — that is 3 of the 6 class sites");
  }
  if (collectProblems(SIBLING_OK, "f.ts").length !== 0) failures.push("a correct policy_unit writer was flagged");
  if (collectProblems(UNRELATED, "f.ts").length !== 0) {
    failures.push("insurance.policy_installment was matched — out-of-class table, boundary too wide");
  }
  const COMMENT = TENANT_ONLY + "\n-- INSERT INTO insurance.policy (tenant_id, operating_company_id)";
  if (!collectProblems(COMMENT, "f.ts").some((p) => /tenant_id but NOT/.test(p))) {
    failures.push("a comment faked the fix — false green (the ACCT-F264 shape)");
  }

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log(
    `${LABEL} SELFTEST OK — 8/8 (policy + policy_unit both covered, tenant-only caught, no-scope caught, ` +
      `INSERT...SELECT caught, correct writers pass, out-of-class table not matched, comment cannot fake)`
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
  if (!src.includes("insurance.policy")) continue;
  scanned += 1;
  // DENOMINATOR: count the write sites this guard actually adjudicated, per table. A bare "PASS" does
  // not survive a reader -- this class was declared closed twice by authors who had each fixed every
  // site they could see (#5082 -> 1 site, #5088 -> 1 more, #5089 -> 4 more). "PASS across N enumerated
  // write sites" is what makes a fourth round unnecessary.
  for (const { table } of policyInsertColumnLists(src)) {
    writeSites += 1;
    perTable.set(table, (perTable.get(table) ?? 0) + 1);
  }
  problems.push(...collectProblems(src, path.relative(root, file)));
}
const denom =
  `${writeSites} write site(s) [` +
  [...perTable.entries()].sort().map(([t, n]) => `${t}=${n}`).join(" ") +
  `] across ${scanned} file(s), enumerated by table-scoped scan of apps/backend/src` +
  `; OUTSIDE this denominator (named, unchecked, NOT guarded): ${OUT_OF_SCOPE.join(", ")}`;
if (problems.length) {
  console.error(`${LABEL} FAIL — ${problems.length} of ${denom} missing RLS scoping:`);
  for (const x of problems) console.error("  ✗ " + x);
  process.exit(1);
}
console.log(`${LABEL} OK — PASS across ${denom}; every one sets operating_company_id.`);
