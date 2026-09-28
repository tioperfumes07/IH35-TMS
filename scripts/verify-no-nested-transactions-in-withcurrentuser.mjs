#!/usr/bin/env node
// B10 (Devin sweep, 2026-09-28) -- mdata/qbo-master-write.routes.ts had 8 route handlers that each
// opened `client.query("BEGIN")` INSIDE a withCurrentUser(...) callback. withCurrentUser already
// wraps the whole callback in its own transaction (apps/backend/src/auth/db.ts:343 BEGIN / :373
// COMMIT / :377 ROLLBACK-on-throw) -- a second BEGIN on the same connection is a no-op, and the
// inner COMMIT commits that OUTER transaction early. Anything withCurrentUser does after the
// callback returns (its own COMMIT call, the after-commit drain queue) then runs against a
// connection that is no longer inside the transaction it thinks it is managing.
//
// Static, source-scan guard: for every withCurrentUser(...) call, extract its callback body
// (balanced-brace scan, not a fixed-width regex window -- these callbacks are long) and fail if
// that body contains a literal client.query("BEGIN"/"COMMIT"/"ROLLBACK") call. A named allowlist
// exists for a file that has a REVIEWED reason to manage its own sub-transaction (e.g. an explicit,
// intentional SAVEPOINT pattern) -- empty today, on purpose, matching verify-no-automatch.mjs's own
// convention: a future exception must be added here by name after review, never silently.
//
// --selftest plants one mutation (a nested BEGIN inside a synthetic withCurrentUser call) in a temp
// file and asserts it is caught.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BACKEND_SRC = path.join(ROOT, "apps", "backend", "src");
const LABEL = "verify-no-nested-transactions-in-withcurrentuser";

// A file added here must name the reviewed reason inline. One entry, reviewed 2026-09-28:
//
// apps/backend/src/integrations/qbo/forensic-import.service.ts -- NOT the qbo-master-write.routes.ts
// bug shape. This is a long-running, multi-hour, multi-thousand-page background import job (paginated
// QBO entity/transaction snapshot fetch), invoked once via ONE withCurrentUser callback that then
// loops over every page. The nested BEGIN/COMMIT/ROLLBACK per page is a genuine (if badly
// implemented) attempt at per-page commit boundaries, so one failed page doesn't lose every
// previously-imported page in the same run and doesn't abort a multi-hour job over one bad record.
// Simply deleting the nested calls (the qbo-master-write.routes.ts fix) would be WRONG here: it
// would silently merge every page into withCurrentUser's single outer transaction, holding that one
// transaction open for the job's entire multi-hour duration (lock/bloat risk) and losing the
// intended "this page failed, skip it and keep going" isolation entirely. The CORRECT fix is a
// real per-page transaction strategy (a fresh connection/BEGIN per page, not nested inside
// withCurrentUser's own -- or real SAVEPOINT/RELEASE SAVEPOINT/ROLLBACK TO SAVEPOINT if per-page
// isolation within one long-lived outer transaction is actually intended), which is a genuine,
// separate architectural change to a live production QBO import pipeline -- out of scope for the
// mechanical B10 fix that produced this guard. Tracked here by name rather than silently patched
// under time pressure or silently ignored.
const ALLOWLIST = new Set(["apps/backend/src/integrations/qbo/forensic-import.service.ts"]);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") && !entry.name.endsWith(".d.ts")) out.push(full);
  }
  return out;
}

function relFile(absPath) {
  return path.relative(ROOT, absPath).split(path.sep).join("/");
}

/** From the index of the `(` right after `withCurrentUser`, return the substring up to (and
 * including) the matching closing `)` -- a real balanced-bracket scan, not a fixed window, since
 * these callback bodies can run hundreds of lines. Returns null if unbalanced (malformed source). */
function extractBalancedCall(src, openParenIdx) {
  let depth = 0;
  for (let i = openParenIdx; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") {
      depth -= 1;
      if (depth === 0) return src.slice(openParenIdx, i + 1);
    }
  }
  return null;
}

function findWithCurrentUserBodies(src) {
  const bodies = [];
  const re = /withCurrentUser\s*\(/g;
  let m;
  while ((m = re.exec(src))) {
    const openParenIdx = m.index + m[0].length - 1;
    const call = extractBalancedCall(src, openParenIdx);
    if (call) bodies.push(call);
  }
  return bodies;
}

const NESTED_TXN_RE = /\.query\s*\(\s*["'`](BEGIN|COMMIT|ROLLBACK)["'`]/;

function auditFile(abs) {
  const rel = relFile(abs);
  if (ALLOWLIST.has(rel)) return [];
  const src = fs.readFileSync(abs, "utf8");
  if (!src.includes("withCurrentUser(")) return [];
  const failures = [];
  for (const body of findWithCurrentUserBodies(src)) {
    const hit = body.match(NESTED_TXN_RE);
    if (hit) {
      failures.push(
        `${rel}: withCurrentUser(...) callback contains a nested client.query("${hit[1]}") -- withCurrentUser already manages the transaction; a nested BEGIN/COMMIT/ROLLBACK ends it early or is a no-op.`
      );
    }
  }
  return failures;
}

function loadFiles() {
  return walk(BACKEND_SRC);
}

function auditAll(files = loadFiles()) {
  const failures = [];
  for (const abs of files) failures.push(...auditFile(abs));
  return failures;
}

function run() {
  const failures = auditAll();
  if (failures.length > 0) {
    console.error(`${LABEL}: FAIL`);
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS -- 0 nested BEGIN/COMMIT/ROLLBACK inside any withCurrentUser(...) callback.`);
}

if (process.argv.includes("--selftest")) {
  const assert = await import("node:assert/strict").then((m) => m.default);
  assert.equal(auditAll().length, 0, "real source must be clean");

  const tmpDir = fs.mkdtempSync(path.join(ROOT, ".tmp-no-nested-txn-selftest-"));
  try {
    const rogue = path.join(tmpDir, "rogue-route.ts");
    fs.writeFileSync(
      rogue,
      `
        export async function handler() {
          return withCurrentUser(userId, async (client) => {
            await client.query("BEGIN");
            const res = await client.query("SELECT 1");
            await client.query("COMMIT");
            return res;
          });
        }
      `
    );
    const failures = auditAll([rogue]);
    assert.ok(failures.length > 0, "MUTATION (nested BEGIN/COMMIT) escaped detection");

    // A clean withCurrentUser call (no nested txn control) must not be flagged.
    const clean = path.join(tmpDir, "clean-route.ts");
    fs.writeFileSync(
      clean,
      `
        export async function handler() {
          return withCurrentUser(userId, async (client) => {
            const res = await client.query("SELECT 1");
            return res;
          });
        }
      `
    );
    assert.equal(auditAll([clean]).length, 0, "a clean withCurrentUser callback must not be flagged");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  console.log(`${LABEL} --selftest PASS (1/1 mutation caught, 1/1 clean case unflagged)`);
  process.exit(0);
}

run();
