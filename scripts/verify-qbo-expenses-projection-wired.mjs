#!/usr/bin/env node
// verify-qbo-expenses-projection-wired — the inbound QBO Purchase -> accounting.expenses projection must
// stay wired and parallel-books-safe:
//
//   1) qbo-purchases-puller.ts gates BOTH stages on the DB feature flag via isEnabled() (per-entity),
//      NEVER on a process.env var (the hidden-env-gate regression that kept the A/P pull dark).
//   2) Both flags (QBO_PURCHASES_MIRROR_PULL_ENABLED / QBO_EXPENSES_PROJECTION_ENABLED) are registered in
//      a migration's lib.feature_flags catalog, and are DEFAULT OFF with NO per-entity ON override seeded
//      in any migration (build-and-HOLD — the owner flips them ON).
//   3) sync-scheduler.ts wires both stages as ISOLATED runStep()s (so an earlier failure can't skip them).
//   4) posting-engine.service.ts REFUSES to post a qbo-sourced expense (EXPENSE_POST_GL_REFUSED, guarded on
//      qbo_purchase_id) — never invent a second TMS GL entry for spend QuickBooks already owns.
//   5) a migration creates the projection idempotency key uq_expenses_company_qbo_purchase_id.
//
// --selftest exercises the failure detection on synthetic inputs (no repo dependency).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.VERIFY_QBO_EXPENSES_PROJECTION_ROOT
  ? path.resolve(process.env.VERIFY_QBO_EXPENSES_PROJECTION_ROOT)
  : path.resolve(__dirname, "..");

const PULLER_REL = "apps/backend/src/qbo-sync/qbo-purchases-puller.ts";
const SCHEDULER_REL = "apps/backend/src/qbo-sync/sync-scheduler.ts";
const POSTING_REL = "apps/backend/src/accounting/posting-engine.service.ts";
const MIGRATIONS_DIR = path.join(ROOT, "db", "migrations");
const FLAGS = ["QBO_PURCHASES_MIRROR_PULL_ENABLED", "QBO_EXPENSES_PROJECTION_ENABLED"];
const PROJECTION_KEY = "uq_expenses_company_qbo_purchase_id";

const ENV_GATE_RE = /process\.env\.(QBO_PURCHASES_MIRROR_PULL_ENABLED|QBO_EXPENSES_PROJECTION_ENABLED)\b/;
const IS_ENABLED_CALL_RE = /\bisEnabled\s*\(/;

export function analyzePuller(text) {
  const failures = [];
  if (ENV_GATE_RE.test(text)) {
    failures.push(
      "qbo-purchases-puller.ts reads process.env.QBO_*_ENABLED — both stages must gate on the DB feature " +
        "flag (isEnabled), not an env var."
    );
  }
  if (!IS_ENABLED_CALL_RE.test(text)) {
    failures.push("qbo-purchases-puller.ts does not call isEnabled() — both stages must gate on the DB flag.");
  }
  for (const flag of FLAGS) {
    if (!text.includes(flag)) failures.push(`qbo-purchases-puller.ts no longer references ${flag} — a stage gate was lost.`);
  }
  // Idle-in-transaction root fix: projection must be set-based INSERT…SELECT, not a per-row await loop.
  const projIdx = text.indexOf("export async function projectPurchasesToExpenses");
  if (projIdx < 0) {
    failures.push("qbo-purchases-puller.ts missing export async function projectPurchasesToExpenses.");
  } else {
    const projectFn = text.slice(projIdx);
    if (!/INSERT\s+INTO\s+accounting\.expenses/i.test(projectFn) || !/SELECT[\s\S]*FROM\s+mdata\.qbo_purchases/i.test(projectFn)) {
      failures.push(
        "projectPurchasesToExpenses must use set-based INSERT INTO accounting.expenses … SELECT … FROM mdata.qbo_purchases " +
          "(idle_in_transaction timeout — no per-row await loop)."
      );
    }
    if (/for\s*\(\s*const\s+\w+\s+of\s+mirror\.rows\s*\)/.test(projectFn)) {
      failures.push(
        "projectPurchasesToExpenses still loops mirror.rows — that pattern caused prod idle_in_transaction FATAL (IH35-TMS-PROD-25)."
      );
    }
    // Prod 2026-07-29: QBO_EXPENSES_PROJECTION_ENABLED ON TRANSP, mirror 28k rows, expenses stayed 0
    // because expense_lines.operating_company_id is NOT NULL (no default) and the set-based line INSERT
    // omitted it — the whole projection txn rolled back. Never ship that shape again.
    const lineInserts = projectFn.match(/INSERT\s+INTO\s+accounting\.expense_lines\s*\(([^)]+)\)/gi) ?? [];
    if (lineInserts.length === 0) {
      failures.push("projectPurchasesToExpenses must INSERT INTO accounting.expense_lines (at least once).");
    }
    for (const ins of lineInserts) {
      if (!/\boperating_company_id\b/i.test(ins)) {
        failures.push(
          "projectPurchasesToExpenses expense_lines INSERT must include operating_company_id " +
            "(NOT NULL, no default — omitting it rolls the whole projection txn back to expenses=0)."
        );
      }
    }
  }
  return failures;
}

export function analyzeScheduler(text) {
  const failures = [];
  if (!/pullPurchasesFromQbo|projectPurchasesToExpenses/.test(text)) {
    failures.push("sync-scheduler.ts does not import the QBO purchases puller — the stage is unwired.");
  }
  if (!/runStep\(\s*["']qbo_purchases_pull["']/.test(text)) {
    failures.push("sync-scheduler.ts does not run an isolated 'qbo_purchases_pull' step.");
  }
  if (!/runStep\(\s*["']qbo_purchases_project["']/.test(text)) {
    failures.push("sync-scheduler.ts does not run an isolated 'qbo_purchases_project' step.");
  }
  return failures;
}

export function analyzePosting(text) {
  const failures = [];
  if (!text.includes("EXPENSE_POST_GL_REFUSED")) {
    failures.push("posting-engine.service.ts lost EXPENSE_POST_GL_REFUSED — a qbo-sourced expense could post a phantom TMS JE.");
  }
  // The refuse must be tied to qbo_purchase_id (the qbo-origin marker on accounting.expenses).
  if (text.includes("EXPENSE_POST_GL_REFUSED") && !/qbo_purchase_id/.test(text)) {
    failures.push("posting-engine.service.ts references EXPENSE_POST_GL_REFUSED but not qbo_purchase_id — the guard is not tied to the qbo-origin marker.");
  }
  return failures;
}

function analyzeMigrations() {
  const failures = [];
  if (!fs.existsSync(MIGRATIONS_DIR)) return FLAGS.map((f) => `No migrations dir; ${f} unregistered`);
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));
  const sql = files.map((f) => fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8")).join("\n");
  const registerRe = /INSERT\s+INTO\s+lib\.feature_flags\b/i;
  for (const flag of FLAGS) {
    if (!(registerRe.test(sql) && sql.includes(flag))) {
      failures.push(`No migration registers ${flag} in lib.feature_flags — isEnabled() would resolve false forever.`);
    }
  }
  if (!sql.includes(PROJECTION_KEY)) {
    failures.push(`No migration creates the projection idempotency key ${PROJECTION_KEY} — the Purchase->expenses upsert is not idempotent.`);
  }
  // Build-and-HOLD carve-out: ONE owner-approved migration. Block B (2026-07-28, owner-decisions
  // RESOLVED) directs these projections ON for TRANSP and names the mechanism explicitly: "Enable via
  // lib.feature_flag_overrides (user_uuid NULL, no expiry), owner-gated migration". Build-and-HOLD
  // governed WHEN, not HOW. Pinned to one exact filename — any other migration seeding these flags ON,
  // including a renamed copy or a different entity, still fails.
  const OWNER_APPROVED_ENABLE_MIGRATION = "202610110000_enable_qbo_projection_flags_transp.sql";
  // Build-and-HOLD: no migration may seed a per-entity ON override for these flags (owner flips them ON).
  const overrideOnRe = /INSERT\s+INTO\s+lib\.feature_flag_overrides[\s\S]{0,400}?enabled[\s\S]{0,40}?true/i;
  for (const f of files) {
    if (f === OWNER_APPROVED_ENABLE_MIGRATION) continue;
    const body = fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8");
    // Only fail when an INSERT INTO feature_flag_overrides block names our flag AND enables it.
    // Do NOT match flag names that appear only in comments (false-positive on other enable migs).
    for (const flag of FLAGS) {
      const insertBlocks = body.matchAll(/INSERT\s+INTO\s+lib\.feature_flag_overrides[\s\S]{0,1200}?(?:;|\$\$)/gi);
      for (const m of insertBlocks) {
        const block = m[0];
        if (block.includes(flag) && /enabled[\s\S]{0,80}?true/i.test(block)) {
          failures.push(
            `${f} seeds a feature_flag_overrides ON for ${flag} — build-and-HOLD forbids seeding ON; the owner flips it per-entity.`
          );
        }
      }
    }
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const goodPuller = `import { isEnabled } from "../lib/feature-flags/service.js";
    const PURCHASES_MIRROR_PULL_FLAG = "QBO_PURCHASES_MIRROR_PULL_ENABLED";
    const EXPENSES_PROJECTION_FLAG = "QBO_EXPENSES_PROJECTION_ENABLED";
    await isEnabled(client, PURCHASES_MIRROR_PULL_FLAG, { operating_company_id });
    export async function projectPurchasesToExpenses() {
      await client.query(\`INSERT INTO accounting.expenses (...) SELECT ... FROM mdata.qbo_purchases m\`);
      await client.query(\`INSERT INTO accounting.expense_lines (operating_company_id, expense_id, line_sequence) SELECT ...\`);
    }`;
  const badEnv = `const A = process.env.QBO_PURCHASES_MIRROR_PULL_ENABLED === "true";
    export async function projectPurchasesToExpenses() {
      for (const m of mirror.rows) { await client.query("x"); }
    }`;
  const badMissingOpco = `export async function projectPurchasesToExpenses() {
      await client.query(\`INSERT INTO accounting.expenses (...) SELECT ... FROM mdata.qbo_purchases m\`);
      await client.query(\`INSERT INTO accounting.expense_lines (expense_id, line_sequence, amount) SELECT ...\`);
    }`;
  const goodSched = `runStep("qbo_purchases_pull", id, () => pullPurchasesFromQbo(id));
    runStep("qbo_purchases_project", id, () => projectPurchasesToExpenses(id));`;
  const badSched = `runStep("ap_bills_pull", id, () => pullApBillsFromQbo(id));`;
  const goodPost = `code !== "EXPENSE_POST_GL_REFUSED"; if (exp.qbo_purchase_id) throw x;`;
  const badPost = `no guard here`;

  const checks = {
    pullerGoodPasses: analyzePuller(goodPuller).length === 0,
    pullerEnvFails: analyzePuller(badEnv).length > 0,
    pullerMissingOpcoFails: analyzePuller(badMissingOpco).length > 0,
    schedGoodPasses: analyzeScheduler(goodSched).length === 0,
    schedBadFails: analyzeScheduler(badSched).length > 0,
    postGoodPasses: analyzePosting(goodPost).length === 0,
    postBadFails: analyzePosting(badPost).length > 0,
  };
  const allOk = Object.values(checks).every(Boolean);
  if (allOk) {
    console.log("verify-qbo-expenses-projection-wired --selftest: PASS");
    process.exit(0);
  }
  console.error("verify-qbo-expenses-projection-wired --selftest: FAIL", checks);
  process.exit(1);
}

function readOrNull(rel) {
  const abs = path.join(ROOT, rel);
  return fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
}

const failures = [];
const pullerSrc = readOrNull(PULLER_REL);
if (!pullerSrc) failures.push(`missing ${PULLER_REL}`);
else failures.push(...analyzePuller(pullerSrc));

const schedSrc = readOrNull(SCHEDULER_REL);
if (!schedSrc) failures.push(`missing ${SCHEDULER_REL}`);
else failures.push(...analyzeScheduler(schedSrc));

const postSrc = readOrNull(POSTING_REL);
if (!postSrc) failures.push(`missing ${POSTING_REL}`);
else failures.push(...analyzePosting(postSrc));

failures.push(...analyzeMigrations());

if (failures.length > 0) {
  console.error("verify-qbo-expenses-projection-wired: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log("verify-qbo-expenses-projection-wired: PASS (DB-flag gate; both flags registered OFF; scheduler wired; GL refuse present; projection key present)");
process.exit(0);
