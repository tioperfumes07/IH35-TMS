#!/usr/bin/env node
/**
 * ACCT-F11094 (register row 257) — every view the migration chain leaves behind runs with security_invoker = true.
 *
 * F3 (202606271500) set security_invoker on every user-schema view once, with a blanket loop, so no view reads with its
 * OWNER's rights (an owner-rights view skips the caller's row-level security — a cross-tenant read). The blanket fixes only
 * the views that existed when it ran. A later `CREATE OR REPLACE VIEW` without `WITH (security_invoker = true)` RESETS the
 * option (measured on PostgreSQL 16: replacing a security_invoker view with no WITH clause leaves reloptions NULL). That is
 * what D074 did (202616200100, #27252, 2026-10-23): telematics.vehicle_latest_position was re-created over its cache
 * table without the option — prod reloptions NULL, and the fresh-DB CI test live-defects-f1-f3 (F3) red on every PR.
 *
 * The rule, checked statically over db/migrations in apply order (no database needed):
 *   - CREATE [OR REPLACE] VIEW x [(cols)] [WITH (...)] AS   -> x is invoker only when its WITH names security_invoker=true|on
 *   - ALTER VIEW|TABLE [IF EXISTS] x SET (... security_invoker = true|on ...) -> invoker
 *   - ALTER VIEW [IF EXISTS] x RESET (security_invoker)    -> not invoker
 *   - ALTER VIEW [IF EXISTS] x RENAME TO y                  -> the state moves to y
 *   - DROP VIEW [IF EXISTS] a, b [CASCADE]                  -> gone
 *   - the F3 blanket file                                   -> every view that exists at that point becomes invoker
 * Any view the chain ends with that is not invoker fails, naming the migration that last (re)defined it.
 * Materialized views are out of scope (PostgreSQL has no security_invoker for them). A dynamically named view
 * (format() / EXECUTE with %I, $1) cannot be read statically and is skipped.
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIR = "db/migrations";
const LABEL = "verify-migration-views-security-invoker";
export const BLANKET_FILE = "202606271500_f3_views_security_invoker.sql";

const NAME = String.raw`((?:"[^"]+"|[A-Za-z_][\w$]*)(?:\s*\.\s*(?:"[^"]+"|[A-Za-z_][\w$]*))?)`;
const INVOKER_ON = /security_invoker\s*=\s*'?(true|on|1)'?/i;

export function normName(raw) {
  const parts = raw.split(".").map((p) => p.trim().replace(/^"|"$/g, "").toLowerCase());
  return parts.length === 1 ? `public.${parts[0]}` : parts.join(".");
}

export function stripComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

/** The view events of ONE migration file, in source order. */
export function viewEvents(sql) {
  const src = stripComments(sql);
  const ev = [];
  const push = (m, e) => ev.push({ pos: m.index, ...e });
  const create = new RegExp(String.raw`CREATE\s+(?:OR\s+REPLACE\s+)?(?:TEMP(?:ORARY)?\s+)?(?:RECURSIVE\s+)?VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?${NAME}\s*(\([^)]*\)\s*)?(WITH\s*\(([^)]*)\)\s*)?AS\b`, "gi");
  for (const m of src.matchAll(create)) push(m, { kind: "create", name: normName(m[1]), invoker: INVOKER_ON.test(m[4] ?? "") });
  const setOpt = new RegExp(String.raw`ALTER\s+(?:VIEW|TABLE)\s+(?:IF\s+EXISTS\s+)?${NAME}\s+SET\s*\(([^)]*)\)`, "gi");
  for (const m of src.matchAll(setOpt)) if (/security_invoker/i.test(m[2])) push(m, { kind: "set", name: normName(m[1]), invoker: INVOKER_ON.test(m[2]) });
  const reset = new RegExp(String.raw`ALTER\s+VIEW\s+(?:IF\s+EXISTS\s+)?${NAME}\s+RESET\s*\(([^)]*)\)`, "gi");
  for (const m of src.matchAll(reset)) if (/security_invoker/i.test(m[2])) push(m, { kind: "set", name: normName(m[1]), invoker: false });
  const rename = new RegExp(String.raw`ALTER\s+VIEW\s+(?:IF\s+EXISTS\s+)?${NAME}\s+RENAME\s+TO\s+((?:"[^"]+"|[A-Za-z_][\w$]*))`, "gi");
  for (const m of src.matchAll(rename)) {
    const from = normName(m[1]);
    push(m, { kind: "rename", name: from, to: `${from.split(".")[0]}.${m[2].replace(/^"|"$/g, "").toLowerCase()}` });
  }
  const drop = /DROP\s+VIEW\s+(?:IF\s+EXISTS\s+)?([^;]+?)(?:\s+(?:CASCADE|RESTRICT))?\s*(?:;|$)/gi;
  for (const m of src.matchAll(drop)) {
    for (const raw of m[1].split(",")) {
      const t = raw.trim();
      if (t && !/[%$']/.test(t)) push(m, { kind: "drop", name: normName(t) });
    }
  }
  return ev.filter((e) => !/[%$]/.test(e.name)).sort((a, b) => a.pos - b.pos);
}

/** Simulate the chain; return the views it ends with that are NOT security_invoker. */
export function audit(files) {
  const state = new Map(); // name -> { invoker, file }
  for (const { name: file, sql } of [...files].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    if (file === BLANKET_FILE) {
      for (const v of state.values()) v.invoker = true;
      continue;
    }
    for (const e of viewEvents(sql)) {
      if (e.kind === "create") state.set(e.name, { invoker: e.invoker, file });
      else if (e.kind === "set") { const v = state.get(e.name); if (v) v.invoker = e.invoker; else state.set(e.name, { invoker: e.invoker, file }); }
      else if (e.kind === "drop") state.delete(e.name);
      else if (e.kind === "rename") { const v = state.get(e.name); if (v) { state.delete(e.name); state.set(e.to, v); } }
    }
  }
  return [...state.entries()].filter(([, v]) => !v.invoker).map(([name, v]) => ({ view: name, file: v.file }));
}

function treeFiles() {
  return readdirSync(join(ROOT, DIR))
    .filter((f) => f.endsWith(".sql"))
    .map((f) => ({ name: f, sql: readFileSync(join(ROOT, DIR, f), "utf8") }));
}

function selftest() {
  const failures = [];
  const base = [{ name: "0001_a.sql", sql: "CREATE VIEW s.old AS SELECT 1;" }, { name: BLANKET_FILE, sql: "DO $$ BEGIN END $$;" }];
  const run = (extra) => audit([...base, ...extra]).map((r) => r.view);
  // 1. the D074 defect: a replace after the blanket with no WITH clause loses the option.
  if (!run([{ name: "209901010000_d074.sql", sql: "DROP VIEW IF EXISTS s.old;\nCREATE VIEW s.old AS SELECT 2;" }]).includes("s.old"))
    failures.push("case1 FAIL — a view re-created after the F3 blanket without security_invoker was NOT caught");
  // 2. CREATE OR REPLACE without WITH also resets (PostgreSQL 16 behaviour).
  if (!run([{ name: "209901010000_r.sql", sql: "CREATE OR REPLACE VIEW s.old AS SELECT 3;" }]).includes("s.old"))
    failures.push("case2 FAIL — CREATE OR REPLACE VIEW without WITH was NOT caught");
  // 3. a new view created without the option is caught.
  if (!run([{ name: "209901010000_n.sql", sql: "CREATE OR REPLACE VIEW views.newer (a, b) AS SELECT 1, 2;" }]).includes("views.newer"))
    failures.push("case3 FAIL — a new view without security_invoker was NOT caught");
  // 4. the fix: a later ALTER VIEW ... SET (security_invoker = true) clears it (this PR's 202616360100 shape).
  if (run([{ name: "209901010000_d074.sql", sql: "CREATE VIEW s.old AS SELECT 2;" }, { name: "209901010100_fix.sql", sql: "ALTER VIEW IF EXISTS s.old SET (security_invoker = true);" }]).length !== 0)
    failures.push("case4 FAIL — ALTER VIEW SET (security_invoker = true) was not honoured");
  // 5. WITH (security_invoker = on) in the create passes; a column list before WITH parses.
  if (run([{ name: "209901010000_w.sql", sql: "CREATE OR REPLACE VIEW views.ok (a) WITH (security_invoker = on, security_barrier) AS SELECT 1;" }]).length !== 0)
    failures.push("case5 FAIL — WITH (security_invoker = on) was flagged");
  // 6. a view created BEFORE the blanket is covered by it; a dropped view is not reported; a commented-out create is ignored.
  if (run([{ name: "209901010000_d.sql", sql: "-- CREATE VIEW s.ghost AS SELECT 1;\nCREATE VIEW s.tmp AS SELECT 1; DROP VIEW s.tmp CASCADE;" }]).length !== 0)
    failures.push("case6 FAIL — blanket coverage / drop / comment handling wrong");
  // 7. RESET (security_invoker) after the fix is caught; a rename carries the state.
  if (!run([{ name: "209901010000_x.sql", sql: "ALTER VIEW s.old RESET (security_invoker);" }]).includes("s.old"))
    failures.push("case7 FAIL — RESET (security_invoker) was NOT caught");
  if (!run([{ name: "209901010000_y.sql", sql: "CREATE VIEW s.a AS SELECT 1; ALTER VIEW s.a RENAME TO b;" }]).includes("s.b"))
    failures.push("case8 FAIL — a renamed non-invoker view was lost");
  // 9. materialized views are out of scope.
  if (run([{ name: "209901010000_m.sql", sql: "CREATE MATERIALIZED VIEW s.mv AS SELECT 1;" }]).length !== 0)
    failures.push("case9 FAIL — a materialized view was flagged");
  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS — 9/9 planted cases (D074 replace, OR REPLACE reset, new view, ALTER fix, WITH on, blanket/drop/comment, RESET, rename, matview)`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const files = treeFiles();
  const bad = audit(files);
  if (bad.length) {
    for (const b of bad) {
      console.error(
        `  ✗ ${LABEL}: ${b.view} — last (re)defined in ${DIR}/${b.file} without security_invoker = true. The view reads with its ` +
          `OWNER's rights and skips the caller's row-level security. Add WITH (security_invoker = true) to the CREATE, or a later ` +
          `ALTER VIEW ${b.view} SET (security_invoker = true).`
      );
    }
    console.error(`${LABEL}: FAIL — ${bad.length} view(s) end the migration chain without security_invoker`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — ${files.length} migrations simulated; every view the chain leaves is security_invoker = true`);
}

main();
