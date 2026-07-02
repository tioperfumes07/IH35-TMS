#!/usr/bin/env node
// verify-event-log-worm.mjs — Block-19 WORM invariant guard.
//
// events.event_log is a write-once-read-many tamper-evident audit log. Its integrity depends on rows never
// being modified after write: no UPDATE, no DELETE, no backfill — anywhere. The append-only trigger blocks
// UPDATE/DELETE at runtime; this guard blocks them at the SOURCE so nobody adds one (a migration backfill,
// a "cleanup" DELETE, a correction UPDATE). It fails CI on any real UPDATE/DELETE statement targeting
// events.event_log in db/migrations/** or apps/backend/src/**.
//
// Allowed (not violations): the RAISE strings inside the trigger ("... UPDATE not allowed ...") and the
// trigger definition line ("before insert or update or delete on events.event_log") — neither is an
// UPDATE/DELETE *statement* against the table.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function walk(dir, exts, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    // Skip vendored dirs and TESTS. The WORM invariant protects production + migration code; a test's
    // best-effort cleanup DELETE is blocked by the append-only trigger at runtime regardless (and is
    // typically .catch-swallowed), so it is not a production violation.
    if (e.name === "node_modules" || e.name === "dist" || e.name === "__tests__" || e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, exts, acc);
    else if (exts.some((x) => e.name.endsWith(x)) && !/\.(test|spec)\.[tj]s$/.test(e.name)) acc.push(p);
  }
  return acc;
}

const files = [
  ...walk(path.join(ROOT, "db/migrations"), [".sql"]),
  ...walk(path.join(ROOT, "apps/backend/src"), [".ts", ".js", ".sql"]),
];

// Real statements: UPDATE <maybe-quoted> events.event_log  /  DELETE FROM <maybe-quoted> events.event_log
const UPDATE_RE = /\bUPDATE\s+"?events"?\."?event_log"?\b/i;
const DELETE_RE = /\bDELETE\s+FROM\s+"?events"?\."?event_log"?\b/i;

const violations = [];
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  // Skip this guard's own file and the trigger-defining migrations' RAISE/trigger lines are naturally
  // excluded because they don't match "UPDATE events.event_log" / "DELETE FROM events.event_log".
  const lines = src.split("\n");
  lines.forEach((line, i) => {
    if (UPDATE_RE.test(line) || DELETE_RE.test(line)) {
      violations.push(`${path.relative(ROOT, f)}:${i + 1}  ${line.trim().slice(0, 100)}`);
    }
  });
}

if (violations.length) {
  console.error("verify:event-log-worm — FAILED — events.event_log is WORM (append-only); no UPDATE/DELETE allowed:");
  for (const v of violations) console.error(`  ✗ ${v}`);
  console.error("  Corrections are NEW events (event_type='correction.appended'); chain_seq is INSERT-only, never backfilled.");
  process.exit(1);
}
console.log("[event-log-worm] OK — no UPDATE/DELETE against events.event_log in migrations or backend (WORM intact).");
