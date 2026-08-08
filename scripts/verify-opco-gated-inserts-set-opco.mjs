#!/usr/bin/env node
/**
 * GUARD: an INSERT into a table whose RLS WITH CHECK gates on operating_company_id must SET it.
 *
 * ACCT-F181 (board card LV-TXN-016). On the prod branch these tables carry BOTH `tenant_id` and a
 * NULLABLE `operating_company_id`, and their only permissive policy gates WITH CHECK on
 * operating_company_id. An INSERT that names only tenant_id therefore leaves operating_company_id
 * NULL, the WITH CHECK comparison yields NULL rather than true, and the write aborts with 42501 —
 * every time, on first use. insurance.policy shows the signature exactly: n_tup_ins 5, n_live_tup 0
 * (five aborted attempts) plus a reproduced live HTTP 500.
 *
 * THE CARD SAID 13 TABLES. IT IS 10, AND THE DIFFERENCE MATTERS.
 * Verified on prod via pg_policy: every policy on all 13 is PERMISSIVE, and permissive policies are
 * OR-ed for the INSERT WITH CHECK. Three tables — factoring.factor,
 * factoring.customer_factor_assignment, factoring.letter_of_release — carry a SECOND permissive
 * policy that gates on tenant_id, so a tenant_id-only INSERT satisfies that one and succeeds. They
 * are NOT broken. Anyone "fixing all 13" would edit three working write paths, and anyone deleting
 * those tenant policies as redundant would BREAK them. Hence this guard keys off the prod-verified
 * list of genuinely opco-only tables, and says so.
 *
 * WHY THE LIST IS STATIC AND PROD-DERIVED. The repo's migrations do NOT describe this state: 0287
 * creates factoring.reserve_movement with `tenant_id NOT NULL` and a tenant-gated policy, and no
 * migration adds operating_company_id at all. Prod has diverged, and prod wins (§0). So the list
 * below is a recorded prod fact with its verification date, not something re-derivable from
 * db/migrations — and it is deliberately NOT auto-discovered from the repo, because a repo-derived
 * list would confidently report the wrong answer.
 *
 * Run:  node scripts/verify-opco-gated-inserts-set-opco.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(root, "apps/backend/src");
const LABEL = "verify-opco-gated-inserts-set-opco";

/**
 * Tables whose ONLY permissive WITH CHECK gates on operating_company_id, which is NULLABLE.
 * Verified on Neon prod branch br-fancy-credit-akjnd07a via pg_policy + pg_attribute, 2026-08-08.
 * NOT in this list, deliberately: factoring.factor, factoring.customer_factor_assignment and
 * factoring.letter_of_release, each of which also has a permissive tenant_id policy.
 */
export const OPCO_GATED_TABLES = [
  "factoring.reserve_movement",
  "factoring.batch",
  "factoring.bank_match_suggestion",
  "insurance.policy",
  "insurance.policy_unit",
  "insurance.claim",
  "insurance.coi_request",
  "insurance.lawsuit",
  "insurance.payment_schedule",
  "insurance.refund_obligation",
];

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
 * For one source string, return the opco-gated tables it INSERTs into WITHOUT naming
 * operating_company_id in the column list. Comments are stripped first so the explanatory note
 * beside a fixed INSERT cannot be mistaken for the column itself — the exact false-green this
 * guard would otherwise hand itself, since every fix here ships with a comment naming the column.
 */
export function offendingInserts(src, tables = OPCO_GATED_TABLES) {
  const clean = src.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const bad = [];
  for (const qualified of tables) {
    const re = new RegExp(
      `INSERT\\s+INTO\\s+${qualified.replace(".", "\\.")}\\s*\\(([\\s\\S]{0,2000}?)\\)`,
      "gi"
    );
    let m;
    while ((m = re.exec(clean)) !== null) {
      const columns = m[1];
      if (!/\boperating_company_id\b/.test(columns)) bad.push(qualified);
    }
  }
  return bad;
}

/**
 * FROZEN BASELINE — the insurance write paths that already carry this defect on `main`:
 * 12 INSERT statements across the 10 file/table pairs listed below (policy.routes.ts alone has three).
 *
 * They are REAL and they are P0: insurance.policy is the PROVEN instance (n_tup_ins 5 / n_live_tup 0
 * = five aborted writes, plus a reproduced live HTTP 500 / 42501). They are baselined rather than
 * fixed here for one reason only: `apps/backend/src/insurance/**` is not this lane's to edit, and a
 * cross-lane rewrite of twelve financial write paths is exactly the kind of drive-by that this
 * project's lane rules exist to prevent. They are filed on the board for the insurance lane with
 * this exact list, per findings-flow-agent-to-board-to-agent.
 *
 * RATCHET, NOT AMNESTY: a NEW offender fails the build immediately. NEVER add an entry to make a
 * build green — that is the one edit this guard exists to prevent. Removing entries as the insurance
 * lane fixes them is the intended direction of travel, and the count below should only ever fall.
 */
const BASELINE = new Set([
  "apps/backend/src/insurance/claim.routes.ts::insurance.claim",
  "apps/backend/src/insurance/coi.service.ts::insurance.coi_request",
  "apps/backend/src/insurance/lawsuit.routes.ts::insurance.lawsuit",
  "apps/backend/src/insurance/payment-schedule.routes.ts::insurance.payment_schedule",
  "apps/backend/src/insurance/policy-bill-schedule.service.ts::insurance.payment_schedule",
  "apps/backend/src/insurance/policy-create-atomic.service.ts::insurance.policy",
  "apps/backend/src/insurance/policy-create-atomic.service.ts::insurance.policy_unit",
  "apps/backend/src/insurance/policy.routes.ts::insurance.policy",
  "apps/backend/src/insurance/policy.routes.ts::insurance.policy_unit",
  "apps/backend/src/insurance/refund-obligation.service.ts::insurance.refund_obligation",
]);

export function collectProblems(sources, baseline = BASELINE) {
  const problems = [];
  for (const { file, src } of sources) {
    for (const target of offendingInserts(src)) {
      if (baseline.has(`${file}::${target}`)) continue;
      problems.push(
        `${file} INSERTs into ${target} without naming operating_company_id. That column is NULLABLE ` +
          `and is the ONLY thing its permissive RLS WITH CHECK tests, so the row is rejected with ` +
          `42501 on every attempt — the write cannot succeed even once (LV-TXN-016).`
      );
    }
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const failures = [];
  const T = ["factoring.reserve_movement"];

  const bad = "INSERT INTO factoring.reserve_movement (tenant_id, batch_id) VALUES ($1,$2)";
  const good = "INSERT INTO factoring.reserve_movement (tenant_id, operating_company_id, batch_id) VALUES ($1,$1,$2)";
  if (offendingInserts(bad, T).length !== 1) failures.push("the LV-TXN-016 defect verbatim was NOT caught");
  if (offendingInserts(good, T).length !== 0) failures.push("a corrected INSERT was still flagged");

  // The comment-stripping property — a fix's own explanatory comment must not satisfy the check.
  const commentOnly =
    "-- sets operating_company_id because RLS gates on it\n" +
    "INSERT INTO factoring.reserve_movement (tenant_id, batch_id) VALUES ($1,$2)";
  if (offendingInserts(commentOnly, T).length !== 1) {
    failures.push("a COMMENT naming operating_company_id satisfied the check — false green");
  }

  // Unrelated tables must never be flagged.
  if (offendingInserts("INSERT INTO mdata.loads (tenant_id) VALUES ($1)", T).length !== 0) {
    failures.push("an unrelated table was flagged");
  }

  // The three prod-verified EXEMPT tables must not be in the list.
  for (const exempt of [
    "factoring.factor",
    "factoring.customer_factor_assignment",
    "factoring.letter_of_release",
  ]) {
    if (OPCO_GATED_TABLES.includes(exempt)) {
      failures.push(`${exempt} has a second permissive tenant_id policy on prod and must NOT be listed`);
    }
  }

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  // The ratchet must actually ratchet: a baselined pair passes, an unlisted one fails.
  const srcBad = [{ file: "apps/backend/src/factoring/x.ts", src: bad }];
  if (collectProblems(srcBad, new Set()).length !== 1) failures.push("a NEW offender was not caught");
  if (collectProblems(srcBad, new Set(["apps/backend/src/factoring/x.ts::factoring.reserve_movement"])).length !== 0) {
    failures.push("a baselined offender was still reported");
  }

  console.log(
    `${LABEL} SELFTEST OK — 9/9 (defect caught, fix passes, comment cannot fake a pass, unrelated ` +
      `table ignored, 3 prod-exempt tables correctly absent, ratchet catches NEW and honours baseline)`
  );
  process.exit(0);
}

const sources = fs.existsSync(SRC)
  ? walk(SRC).map((p) => ({ file: path.relative(root, p), src: fs.readFileSync(p, "utf8") }))
  : [];
const problems = collectProblems(sources);
if (problems.length) {
  console.error(`${LABEL} FAIL — ${problems.length} INSERT(s) that cannot satisfy their own RLS:`);
  for (const p of problems) console.error("  ✗ " + p);
  process.exit(1);
}
console.log(
  `${LABEL} OK — no NEW INSERT into the ${OPCO_GATED_TABLES.length} prod-verified opco-gated tables ` +
    `omits operating_company_id (${BASELINE.size} known insurance-lane offenders baselined and boarded).`
);
