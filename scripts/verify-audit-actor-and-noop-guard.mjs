#!/usr/bin/env node
/**
 * GUARD: the audit trail must be able to name WHO, and must not record UPDATEs that changed nothing.
 * FAIL-A1 / ACCT-F255. Both halves, because either alone leaves the trail unusable as evidence.
 *
 * A. `withLuciaBypass` must set `app.current_user_id`. `audit.tg_audit_row` resolves its actor from
 *    that GUC; `withCurrentUser` set it and the bypass wrapper did not, so every bypass-path write was
 *    recorded with `changed_by_user_id = NULL` — 75 of 139 loads, measured live. An append-only trail
 *    that cannot say who acted is evidence that something changed and nothing more.
 *
 * B. `audit.tg_audit_row` must keep the no-op UPDATE guard. Measured on prod over 3,000 bills UPDATE
 *    audit rows, the columns that actually differed were `{last_qbo_synced_at, updated_at}` in
 *    3000 of 3000 — QBO touch-writes. They produced 1,035,579 audit rows for `accounting.bills` alone.
 *    Volume is the symptom; the cost is that "who changed this bill" returns thousands of rows saying
 *    nothing changed, burying the few that matter.
 *
 * WHY THE GUARD CHECKS THE *SHAPE* OF THE SKIP, NOT JUST ITS PRESENCE: the safe form compares the whole
 * remaining document (`to_jsonb(OLD) - keys IS NOT DISTINCT FROM to_jsonb(NEW) - keys`). A tempting
 * cheaper form — "skip if updated_at changed" — would suppress REAL changes that happen to touch
 * updated_at, which is every real change. That is a silent evidence-destroying bug, so this guard fails
 * if the comparison is not the whole-document form, and fails if the skip is not confined to UPDATE.
 *
 * Run:  node scripts/verify-audit-actor-and-noop-guard.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DB_TS = "apps/backend/src/auth/db.ts";
const MIGRATIONS = path.join(root, "db/migrations");
const LABEL = "verify-audit-actor-and-noop-guard";

export function stripTsComments(src) {
  return src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}
export function stripSqlComments(src) {
  return src.replace(/--[^\n]*/g, "");
}

/** A: does withLuciaBypass set the actor GUC inside its own body? */
export function bypassSetsActor(src) {
  const clean = stripTsComments(src);
  const idx = clean.search(/export\s+async\s+function\s+withLuciaBypass\b/);
  if (idx === -1) return { found: false, sets: false };
  // Bound the window to this function: stop at the next top-level export.
  const rest = clean.slice(idx + 1);
  const end = rest.search(/\nexport\s+(?:async\s+)?function\s|\nexport\s+type\s|\nexport\s+const\s/);
  const body = end === -1 ? rest : rest.slice(0, end);
  return { found: true, sets: /set_config\(\s*['"]app\.current_user_id['"]/.test(body) };
}

/** B: does the audit trigger carry a whole-document, UPDATE-only no-op skip? */
export function triggerHasNoopGuard(sql) {
  const clean = stripSqlComments(sql);
  const wholeDoc = /to_jsonb\(\s*OLD\s*\)\s*-\s*\w+[\s\S]{0,80}?IS\s+NOT\s+DISTINCT\s+FROM[\s\S]{0,80}?to_jsonb\(\s*NEW\s*\)\s*-\s*\w+/i.test(
    clean
  );
  const updateOnly = /TG_OP\s*=\s*'UPDATE'[\s\S]{0,400}?IS\s+NOT\s+DISTINCT\s+FROM/i.test(clean);
  const naiveColumnSkip =
    /IF\s+OLD\.updated_at\s+IS\s+DISTINCT\s+FROM\s+NEW\.updated_at/i.test(clean) ||
    /RETURN\s+NEW\s*;\s*--?\s*skip.*updated_at/i.test(clean);
  return { wholeDoc, updateOnly, naiveColumnSkip };
}

export function collectProblems({ dbTs, triggerSql }) {
  const problems = [];

  const a = bypassSetsActor(dbTs);
  if (!a.found) {
    problems.push(`${DB_TS}: withLuciaBypass not found — the actor half of FAIL-A1 cannot be verified.`);
  } else if (!a.sets) {
    problems.push(
      `${DB_TS}: withLuciaBypass never sets app.current_user_id, so audit.tg_audit_row records every ` +
        `bypass-path write with changed_by_user_id = NULL (75 of 139 loads, measured live). An ` +
        `append-only trail that cannot name the actor is not evidence (FAIL-A1).`
    );
  }

  if (triggerSql === null) {
    problems.push(
      `db/migrations: no migration defines audit.tg_audit_row with a no-op UPDATE guard. Without it, ` +
        `QBO touch-writes keep appending audit rows in which no business field changed — 1,035,579 on ` +
        `accounting.bills alone (ACCT-F255).`
    );
    return problems;
  }
  const b = triggerHasNoopGuard(triggerSql);
  if (!b.wholeDoc) {
    problems.push(
      `audit.tg_audit_row: the no-op skip does not compare the WHOLE remaining document ` +
        `(to_jsonb(OLD) - keys IS NOT DISTINCT FROM to_jsonb(NEW) - keys). Any narrower test suppresses ` +
        `REAL changes and silently destroys evidence (ACCT-F255).`
    );
  }
  if (!b.updateOnly) {
    problems.push(
      `audit.tg_audit_row: the no-op skip is not confined to TG_OP='UPDATE'. INSERT and DELETE are ` +
        `never no-ops, and under void-not-delete a DELETE is itself the event worth keeping (ACCT-F255).`
    );
  }
  if (b.naiveColumnSkip) {
    problems.push(
      `audit.tg_audit_row: skips on a single column's change instead of the whole document. Every real ` +
        `change also touches updated_at, so this would suppress the rows that matter most (ACCT-F255).`
    );
  }
  return problems;
}

/** The newest migration that defines audit.tg_audit_row wins — that is what prod runs. */
function latestTriggerSql() {
  if (!fs.existsSync(MIGRATIONS)) return null;
  const hits = fs
    .readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .filter((f) =>
      /FUNCTION\s+audit\.tg_audit_row/i.test(fs.readFileSync(path.join(MIGRATIONS, f), "utf8"))
    );
  if (hits.length === 0) return null;
  return fs.readFileSync(path.join(MIGRATIONS, hits[hits.length - 1]), "utf8");
}

if (process.argv.includes("--selftest")) {
  const failures = [];
  const GOOD_TS =
    "export async function withLuciaBypass<T>(fn, opts) {\n await c.query(\"SELECT set_config('app.current_user_id', $1::text, true)\", [a]);\n}\nexport type X = 1;";
  const BAD_TS = "export async function withLuciaBypass<T>(fn) {\n await c.query('SET LOCAL app.bypass_rls = 1');\n}\nexport type X = 1;";
  const GOOD_SQL =
    "IF TG_OP = 'UPDATE' THEN IF (to_jsonb(OLD) - v_noise_keys) IS NOT DISTINCT FROM (to_jsonb(NEW) - v_noise_keys) THEN RETURN NEW; END IF; END IF;";

  if (collectProblems({ dbTs: GOOD_TS, triggerSql: GOOD_SQL }).length !== 0) {
    failures.push("the corrected pair was flagged");
  }
  if (!collectProblems({ dbTs: BAD_TS, triggerSql: GOOD_SQL }).some((p) => /never sets app\.current_user_id/.test(p))) {
    failures.push("a bypass wrapper without the actor GUC was NOT caught");
  }
  if (!collectProblems({ dbTs: GOOD_TS, triggerSql: null }).some((p) => /no-op UPDATE guard/.test(p))) {
    failures.push("a missing trigger guard was NOT caught");
  }
  // The dangerous cheap form must be rejected.
  const NAIVE = "IF TG_OP = 'UPDATE' THEN IF OLD.updated_at IS DISTINCT FROM NEW.updated_at THEN RETURN NEW; END IF; END IF;";
  if (collectProblems({ dbTs: GOOD_TS, triggerSql: NAIVE }).length < 1) {
    failures.push("a single-column skip was accepted — it would suppress REAL changes");
  }
  // A comment must not satisfy the actor half.
  const COMMENT_TS = "export async function withLuciaBypass<T>(fn) {\n // set_config('app.current_user_id', x)\n}\nexport type X=1;";
  if (!collectProblems({ dbTs: COMMENT_TS, triggerSql: GOOD_SQL }).some((p) => /never sets/.test(p))) {
    failures.push("a COMMENT satisfied the actor check — false green");
  }
  // Skip applied to all ops must be rejected.
  const ALL_OPS = "IF (to_jsonb(OLD) - k) IS NOT DISTINCT FROM (to_jsonb(NEW) - k) THEN RETURN NEW; END IF;";
  if (!collectProblems({ dbTs: GOOD_TS, triggerSql: ALL_OPS }).some((p) => /confined to TG_OP='UPDATE'/.test(p))) {
    failures.push("a skip not confined to UPDATE was NOT caught");
  }

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log(
    `${LABEL} SELFTEST OK — 6/6 (corrected pair passes, missing actor caught, missing trigger guard ` +
      `caught, single-column skip rejected, comment cannot fake, non-UPDATE skip caught)`
  );
  process.exit(0);
}

const dbTsPath = path.join(root, DB_TS);
if (!fs.existsSync(dbTsPath)) {
  console.error(`${LABEL} FAIL — ${DB_TS} is missing.`);
  process.exit(1);
}
const problems = collectProblems({
  dbTs: fs.readFileSync(dbTsPath, "utf8"),
  triggerSql: latestTriggerSql(),
});
if (problems.length) {
  console.error(`${LABEL} FAIL — ${problems.length} break(s) in the audit-evidence chain:`);
  for (const p of problems) console.error("  ✗ " + p);
  process.exit(1);
}
console.log(
  `${LABEL} OK — withLuciaBypass carries the audit actor, and audit.tg_audit_row skips only ` +
    `whole-document no-op UPDATEs.`
);
