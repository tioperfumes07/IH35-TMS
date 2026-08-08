#!/usr/bin/env node
/**
 * GUARD: the audit trail must be able to record WHICH SESSION acted. ACCT-F257.
 *
 * `audit.tg_audit_row` writes `session_id` from `current_setting('app.session_id', true)`. Nothing in
 * the backend ever set that GUC. Measured live on prod br-fancy-credit-akjnd07a 2026-08-08:
 *
 *     audit.row_changes = 2,340,091 rows   ·   session_id populated on ZERO
 *     changed_by_user_id populated on 451  (0.019%)
 *
 * THE ID WAS CAPTURED AND THEN DISCARDED, which is why this is a defect and not a missing feature.
 * `auth/session-middleware.ts` sets `req.session = { id: result.session.id }` on every authenticated
 * request. It just never reached the database wrapper. "Which session booked this load" was
 * unanswerable because one layer above the audit trigger threw the answer away.
 *
 * This is the other half of FAIL-A1. The actor half (app.current_user_id) shipped separately; a trail
 * that names the user but not the session answers "who" and leaves "in which session" open, and the
 * second question is what distinguishes one operator's two sittings — the exact thing that made "who
 * moved two loads at 20:01:38" unanswerable.
 *
 * WHY THE GUARD FORBIDS UUID-VALIDATING THE SESSION ID: Lucia session ids are opaque tokens, NOT
 * UUIDs. A wrapper that regex-checks for a UUID shape would silently reject every real session and
 * leave the column NULL while looking fixed — a false green of exactly the kind this codebase keeps
 * producing. So the guard fails if it sees the actor's UUID_RE applied to the session value.
 *
 * Run:  node scripts/verify-audit-session-attribution.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DB_TS = "apps/backend/src/auth/db.ts";
const LABEL = "verify-audit-session-attribution";

export function stripComments(src) {
  return src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Slice a wrapper's body so one wrapper's GUC cannot satisfy the other's check. */
export function wrapperBody(src, name) {
  const clean = stripComments(src);
  const idx = clean.search(new RegExp(`export\\s+async\\s+function\\s+${name}\\b`));
  if (idx === -1) return null;
  const rest = clean.slice(idx + 1);
  const end = rest.search(/\nexport\s+(?:async\s+)?function\s|\nexport\s+type\s|\nexport\s+const\s/);
  return end === -1 ? rest : rest.slice(0, end);
}

export function collectProblems(src) {
  const problems = [];
  for (const name of ["withCurrentUser", "withLuciaBypass"]) {
    const body = wrapperBody(src, name);
    if (body === null) {
      problems.push(`${DB_TS}: ${name} not found — session attribution cannot be verified (ACCT-F257).`);
      continue;
    }
    if (!/set_config\(\s*['"`]app\.session_id['"`]/.test(body)) {
      problems.push(
        `${DB_TS}: ${name} never sets app.session_id, so audit.tg_audit_row records session_id = NULL ` +
          `on every row it writes — 0 of 2,340,091 rows carry one today. The id is NOT missing: ` +
          `session-middleware.ts already puts it on req.session and this layer drops it (ACCT-F257).`
      );
      continue;
    }
    // The session id is an opaque token; UUID-validating it silently rejects every real session.
    const guardsWithUuid = /UUID_RE\.test\(\s*sessionId/i.test(body) || /sessionId[\s\S]{0,40}UUID_RE\.test/i.test(body);
    if (guardsWithUuid) {
      problems.push(
        `${DB_TS}: ${name} validates the session id with the UUID regex. Lucia session ids are opaque ` +
          `tokens, not UUIDs — this rejects every real session and leaves session_id NULL while ` +
          `appearing fixed (ACCT-F257).`
      );
    }
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const failures = [];
  const GOOD =
    "export async function withCurrentUser(u, fn, opts) {\n await c.query(`SELECT set_config('app.session_id', $1::text, true)`, [s]);\n}\n" +
    "export async function withLuciaBypass(fn, opts) {\n await c.query(\"SELECT set_config('app.session_id', $1::text, true)\", [s]);\n}\nexport type X=1;";

  if (collectProblems(GOOD).length !== 0) failures.push("the corrected pair was flagged");

  const onlyOne =
    "export async function withCurrentUser(u, fn, opts) {\n await c.query(`SELECT set_config('app.session_id', $1::text, true)`, [s]);\n}\n" +
    "export async function withLuciaBypass(fn, opts) {\n await c.query(\"SET LOCAL app.bypass_rls = 1\");\n}\nexport type X=1;";
  if (!collectProblems(onlyOne).some((p) => /withLuciaBypass never sets/.test(p))) {
    failures.push("a wrapper missing the session GUC was NOT caught — bodies are not being sliced");
  }

  const neither = "export async function withCurrentUser(u, fn) {}\nexport async function withLuciaBypass(fn) {}\nexport type X=1;";
  if (collectProblems(neither).length !== 2) failures.push("both missing wrappers were not both reported");

  const uuidGuarded =
    "export async function withCurrentUser(u, fn, opts) {\n if (UUID_RE.test(sessionId)) await c.query(`SELECT set_config('app.session_id', $1::text, true)`, [s]);\n}\n" +
    "export async function withLuciaBypass(fn, opts) {\n await c.query(\"SELECT set_config('app.session_id', $1::text, true)\", [s]);\n}\nexport type X=1;";
  if (!collectProblems(uuidGuarded).some((p) => /validates the session id with the UUID regex/.test(p))) {
    failures.push("UUID-validating an opaque session token was NOT caught");
  }

  const commentOnly =
    "export async function withCurrentUser(u, fn) {\n // set_config('app.session_id', x)\n}\n" +
    "export async function withLuciaBypass(fn) {\n // set_config('app.session_id', x)\n}\nexport type X=1;";
  if (collectProblems(commentOnly).length !== 2) failures.push("COMMENTS satisfied the check — false green");

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log(
    `${LABEL} SELFTEST OK — 5/5 (corrected pair passes, single missing wrapper caught, both missing ` +
      `reported, UUID-validated session token rejected, comments cannot fake)`
  );
  process.exit(0);
}

const p = path.join(root, DB_TS);
if (!fs.existsSync(p)) {
  console.error(`${LABEL} FAIL — ${DB_TS} is missing.`);
  process.exit(1);
}
const problems = collectProblems(fs.readFileSync(p, "utf8"));
if (problems.length) {
  console.error(`${LABEL} FAIL — ${problems.length} wrapper(s) cannot attribute a session:`);
  for (const x of problems) console.error("  ✗ " + x);
  process.exit(1);
}
console.log(`${LABEL} OK — both transaction wrappers carry app.session_id, so the audit trail can name the session.`);
