#!/usr/bin/env node
/**
 * ACCT-F63 — the QBO sync steps must be RUNNABLE, and must only run for companies that HAVE a
 * QuickBooks connection.
 *
 * WHY THIS EXISTS (all read live on prod br-fancy-credit-akjnd07a, 2026-08-01):
 *
 * 1. `min(uuid)` IS NOT A POSTGRES AGGREGATE. qbo-purchases-puller.ts resolved an expense category
 *    with `SELECT min(ec.id) ...` where catalogs.expense_categories.id is a uuid. Reproduced on prod:
 *    "function min(uuid) does not exist". The statement failed at PARSE time, so the projector step
 *    never ran once — `_system.background_jobs` shows qbo_sync.step.qbo_purchases_project with
 *    last_successful_run_at = NULL. Only the `matches = 1` branch is ever read, so any deterministic
 *    pick is equivalent; `(array_agg(ec.id ORDER BY ec.id))[1]` is correct and verified to run.
 *
 * 2. THE SCHEDULER ASKED A COMPANY WITH NO QUICKBOOKS TO SYNC QUICKBOOKS. It iterated every active
 *    company, so USMCA — which has NO realm BY DESIGN (TMS-authoritative from day one, never part of
 *    the clone) — failed customers_pull and chart_of_accounts_pull on every tick with "QBO not
 *    authorized for this company." Both showed last_successful_run_at = NULL against
 *    5c854333-… = USMCA, while integrations.qbo_connections holds LIVE unrevoked rows for TRANSP and
 *    TRK only. Absence of a connection is a designed state, not a failure.
 *
 * WHY #2 MATTERS BEYOND THE NOISE: recording an expected condition as a failed job run every tick is
 * precisely what buried the genuinely-broken jobs. The health check collapses everything into one
 * warning-tier "stale_jobs" string, so permanent expected noise and real never-succeeded failures
 * were indistinguishable. Guaranteed-red signal trains people to stop reading it.
 *
 * WHAT WOULD SILENTLY REGRESS THIS: reintroducing min()/max() over a uuid column, or "simplifying"
 * the scheduler back to selecting all active companies. Both look harmless in a diff.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PURCHASES = "apps/backend/src/qbo-sync/qbo-purchases-puller.ts";
const SCHEDULER = "apps/backend/src/qbo-sync/sync-scheduler.ts";
const LABEL = "verify-qbo-sync-steps-runnable";

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1").replace(/--[^\n]*/g, "");
}

/** min()/max() over an obvious uuid column is a parse-time failure in Postgres. */
export function auditUuidAggregate(src, rel) {
  const code = stripComments(src);
  const problems = [];
  for (const m of code.matchAll(/\b(min|max)\s*\(\s*([A-Za-z_][\w]*\.)?(id|[\w]*_id|[\w]*_uuid)\s*\)/gi)) {
    problems.push(
      `${rel}: \`${m[0]}\` aggregates a uuid column. Postgres has no min()/max() for uuid — the ` +
        `statement fails at PARSE time, so the job owning it never runs at all while still reporting ` +
        `activity. Use (array_agg(<col> ORDER BY <col>))[1] for a deterministic pick.`
    );
  }
  return problems;
}

/** The QBO scheduler must join the connection table, not sweep every active company. */
export function auditSchedulerScope(src) {
  const code = stripComments(src);
  const problems = [];
  const m = /const\s+companies\s*=\s*await\s+client\.query[\s\S]*?`([\s\S]*?)`/.exec(code);
  if (!m) {
    problems.push(`${SCHEDULER}: could not find the company selection — cannot verify QBO sync is scoped to connected companies.`);
    return problems;
  }
  const sql = m[1];
  if (!/qbo_connections/i.test(sql)) {
    problems.push(
      `${SCHEDULER}: the QBO sync tick selects companies without joining integrations.qbo_connections. ` +
        `A company with no QuickBooks realm (USMCA, by design) is then asked to sync QuickBooks and ` +
        `records a FAILED job run every tick — expected noise that buries real failures.`
    );
  }
  if (!/revoked_at\s+IS\s+NULL/i.test(sql)) {
    problems.push(`${SCHEDULER}: the company selection does not exclude revoked connections (revoked_at IS NULL).`);
  }
  return problems;
}

function auditTree() {
  return [
    ...auditUuidAggregate(readFileSync(join(ROOT, PURCHASES), "utf8"), PURCHASES),
    ...auditSchedulerScope(readFileSync(join(ROOT, SCHEDULER), "utf8")),
  ];
}

function selftest() {
  const failures = [];

  if (auditUuidAggregate("SELECT min(ec.id) AS id, count(*) AS matches", "x.ts").length === 0)
    failures.push("case1 FAIL — min(uuid) was NOT caught");
  if (auditUuidAggregate("SELECT (array_agg(ec.id ORDER BY ec.id))[1] AS id, count(*) AS matches", "x.ts").length !== 0)
    failures.push("case2 FAIL — the array_agg fix was flagged");
  if (auditUuidAggregate("SELECT min(amount_cents) FROM t", "x.ts").length !== 0)
    failures.push("case3 FAIL — min() over a non-uuid column was flagged");
  if (auditUuidAggregate("SELECT max(l.load_id) FROM t l", "x.ts").length === 0)
    failures.push("case4 FAIL — max(uuid) was NOT caught");

  const sweepAll = `const companies = await client.query(\`SELECT id::text AS id FROM org.companies WHERE is_active = true ORDER BY id\`);`;
  if (!auditSchedulerScope(sweepAll).some((p) => p.includes("without joining integrations.qbo_connections")))
    failures.push("case5 FAIL — an unscoped all-companies sweep was NOT caught");

  const scoped = `const companies = await client.query(\`SELECT c.id::text AS id FROM org.companies c JOIN integrations.qbo_connections q ON q.operating_company_id = c.id AND q.revoked_at IS NULL WHERE c.is_active = true GROUP BY c.id ORDER BY c.id\`);`;
  if (auditSchedulerScope(scoped).length !== 0)
    failures.push(`case6 FAIL — the scoped selection was flagged: ${auditSchedulerScope(scoped).join(" | ")}`);

  const tree = auditTree();
  if (tree.length !== 0) failures.push(`case7 FAIL — real sources flagged: ${tree.join(" | ")}`);

  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS — uuid aggregate caught, non-uuid min clean, unscoped sweep caught, scoped selection clean`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const problems = auditTree();
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — no uuid aggregates in the purchases projector, and the QBO tick runs only for connected companies`);
}

main();
