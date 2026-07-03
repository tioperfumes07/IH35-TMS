#!/usr/bin/env node
/**
 * verify-task-link-contract.mjs  (TASKS-PLANNER-V2-CONNECTIVITY)
 *
 * Static contract guard for the polymorphic task<->record link model so it can't silently regress:
 *   1. The migration defines tasks.task_link with role/target polymorphism, RLS enable+FORCE, the
 *      reverse (target_type,target_id) index, and NO DELETE grant (void-not-delete).
 *   2. target_id stays POLYMORPHIC — no hard FK (a FK would break "link to any record").
 *   3. The backend exposes the completion path: role='result' closes the task (status='completed')
 *      and the list route supports the reverse target_type/target_id lookup for the per-entity tab.
 *
 * Pure string/structural checks — no DB required (mirrors the other verify:* guards).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const LABEL = "verify-task-link-contract";

const MIGRATION = path.join(ROOT, "db/migrations/202607031700_tasks_connectivity.sql");
const ROUTES = path.join(ROOT, "apps/backend/src/tasks/task.routes.ts");

const errs = [];

function read(p) {
  if (!fs.existsSync(p)) {
    errs.push(`missing required file: ${path.relative(ROOT, p)}`);
    return "";
  }
  return fs.readFileSync(p, "utf8");
}

const mig = read(MIGRATION);
const routes = read(ROUTES);

if (mig) {
  const requireIn = (re, msg) => {
    if (!re.test(mig)) errs.push(`migration: ${msg}`);
  };
  requireIn(/CREATE TABLE IF NOT EXISTS\s+tasks\.task_link/i, "must CREATE TABLE IF NOT EXISTS tasks.task_link");
  requireIn(/role\s+text[\s\S]{0,120}CHECK\s*\(\s*role\s+IN\s*\(\s*'about'\s*,\s*'result'\s*\)/i, "task_link.role must CHECK IN ('about','result')");
  // required polymorphic target kinds
  for (const kind of ["vendor", "customer", "expense", "bill", "bill_payment", "policy", "work_order"]) {
    if (!new RegExp(`'${kind}'`).test(mig)) errs.push(`migration: target_type CHECK must include '${kind}'`);
  }
  requireIn(/ALTER TABLE\s+tasks\.task_link\s+ENABLE ROW LEVEL SECURITY/i, "task_link must ENABLE ROW LEVEL SECURITY");
  requireIn(/ALTER TABLE\s+tasks\.task_link\s+FORCE ROW LEVEL SECURITY/i, "task_link must FORCE ROW LEVEL SECURITY");
  requireIn(/CREATE INDEX IF NOT EXISTS\s+\w+\s+ON\s+tasks\.task_link\s*\(\s*target_type\s*,\s*target_id\s*\)/i, "task_link must have a reverse (target_type,target_id) index");
  requireIn(/voided_at\s+timestamptz/i, "task_link must carry voided_at (void-not-delete)");
  requireIn(/GRANT\s+SELECT\s*,\s*INSERT\s*,\s*UPDATE\s+ON\s+tasks\.task_link\s+TO\s+ih35_app/i, "task_link must GRANT SELECT,INSERT,UPDATE to ih35_app");
  // A real DELETE grant statement on task_link (GRANT keyword must be followed by whitespace, so the
  // prose "Grants … NO DELETE" comment is not mistaken for one).
  if (/GRANT\s+[^;]*\bDELETE\b[^;]*\bON\b[^;]*tasks\.task_link/i.test(mig)) errs.push("migration: task_link must NOT grant DELETE (void-not-delete)");

  // target_id must be polymorphic — no hard FK on it.
  const targetIdLine = mig.split(/\r?\n/).find((l) => /^\s*target_id\s+uuid/i.test(l)) ?? "";
  if (/REFERENCES/i.test(targetIdLine)) errs.push("migration: target_id must stay POLYMORPHIC (no REFERENCES / hard FK)");
}

if (routes) {
  const requireIn = (re, msg) => {
    if (!re.test(routes)) errs.push(`routes: ${msg}`);
  };
  requireIn(/\/:id\/links/, "must expose POST/GET /tasks/:id/links");
  requireIn(/INSERT INTO tasks\.task_link/i, "must INSERT INTO tasks.task_link");
  // completion: a result link closes the task
  requireIn(/role\s*===?\s*["']result["']/, "completion must key on role='result'");
  requireIn(/status\s*=\s*'completed'/i, "completion must set status='completed'");
  // reverse lookup for the per-entity tab
  requireIn(/tasks\.task_link tl[\s\S]{0,200}target_type/i, "list route must support reverse target_type/target_id lookup");
}

if (errs.length > 0) {
  console.error(`[${LABEL}] FAIL — task-link contract drift:`);
  for (const e of errs) console.error(`  ✗ ${e}`);
  process.exit(1);
}

console.log(`[${LABEL}] PASS — tasks.task_link polymorphic contract + completion path intact.`);
