#!/usr/bin/env node
/**
 * CLS-GUC-NO-TXN — `set_config('app.operating_company_id', …, true)` is TRANSACTION-LOCAL. Setting it
 * on a raw `pool.connect()` client with no `BEGIN` sets nothing: it is discarded before the next
 * statement runs.
 *
 * PROVEN, not assumed — PostgreSQL 16.14, ephemeral local cluster, 2026-08-07:
 *
 *   -- A: is_local=true with NO transaction        -- B: is_local=true inside a transaction
 *   SELECT set_config('app.x','TENANT-A',true);    BEGIN;
 *   SELECT current_setting('app.x',true);          SELECT set_config('app.x','TENANT-B',true);
 *   -- => (empty)  <-- DISCARDED                   SELECT current_setting('app.x',true);
 *                                                  -- => TENANT-B  <-- holds
 *   -- C: control, is_local=FALSE, no transaction: the next statement DOES see it (session-scoped).
 *
 * WHY IT MATTERS HERE: `app.operating_company_id` is what every FORCED-RLS policy in this schema reads.
 * A handler that "sets the tenant context" this way has set nothing, so RLS sees an empty scope for
 * every query that follows. Whatever tenant-correctness the endpoint has rests entirely on the explicit
 * `operating_company_id = $n` predicates — the GUC is decoration.
 *
 * SECOND, COMPOUNDING PROBLEM: the raw-pool path also skips `withCurrentUser`, which is the only place
 * that issues `SET LOCAL ROLE ih35_app` transaction-locally and FAILS CLOSED if the role cannot be
 * assumed (apps/backend/src/auth/db.ts). The pool's `connect` handler does attempt a session-level
 * `SET ROLE`, but it is best-effort: it can lose the race with the first query, and its catch only
 * console.errors. So these handlers hold a weaker guarantee about running as the non-superuser role.
 *
 * THE FIX IS NOT "ADD A BEGIN" — it is to use `withCurrentUser`, which already does BEGIN +
 * SET LOCAL ROLE + app.current_user_id, and rolls back on throw. Found by the CLS-GUC-CALLER-SCOPED
 * drain: `maintenance/severe-repair-estimate.routes.ts` had 5 such handlers.
 *
 * RATCHET, not a hard zero: `driver-finance/escrow-deduction-pending.routes.ts` has 2 more and is
 * CC-1's money lane, so it is pinned in the baseline and boarded rather than touched from this lane.
 *
 * Usage: node scripts/verify-tenant-guc-inside-txn.mjs [--write-baseline] [--selftest]
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "apps/backend/src");
const BASELINE_PATH = "scripts/tenant-guc-no-txn-baseline.json";
const LABEL = "verify-tenant-guc-inside-txn";

const CONNECT = /await\s+(\w*[Pp]ool)\.connect\(\)/g;
const SETS_GUC = /set_config\(\s*['"`]app\.operating_company_id/;
/** `withCurrentUser` / `withLuciaBypass` open the transaction for the caller, so their clients are fine. */
const BEGINS = /query\(\s*['"`]BEGIN/;

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.ts$/.test(e) && !/\.(test|spec)\.ts$/.test(e)) out.push(p);
  }
  return out;
}

/**
 * Scan the region from each `pool.connect()` to that client's `.release()`. Deliberately per-BLOCK and
 * not per-FILE: a first pass keyed on the file found `index.ts` "guilty" when its BEGIN simply lives
 * inside `withLuciaBypass` in another module. Per-file was a false positive generator.
 */
export function auditSource(src, label) {
  const found = [];
  for (const m of src.matchAll(CONNECT)) {
    const start = m.index;
    const rel = src.indexOf(".release()", start);
    const region = src.slice(start, rel === -1 ? Math.min(start + 4000, src.length) : rel);
    if (!SETS_GUC.test(region)) continue;
    if (BEGINS.test(region)) continue;
    found.push({ key: `${label}|L${src.slice(0, start).split("\n").length}`, label, line: src.slice(0, start).split("\n").length });
  }
  return found;
}

if (process.argv.includes("--selftest")) {
  const cases = [
    ["raw pool.connect + GUC, no BEGIN — the defect", "const client = await pool.connect();\ntry { await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [x]); } finally { client.release(); }", 1],
    ["same block WITH a BEGIN is fine", "const client = await pool.connect();\ntry { await client.query('BEGIN'); await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [x]); } finally { client.release(); }", 0],
    ["pool.connect with no tenant GUC is out of scope", "const client = await pool.connect();\ntry { await client.query('SELECT 1'); } finally { client.release(); }", 0],
    ["withCurrentUser callback is not a raw connect", "await withCurrentUser(u, async (client) => { await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [x]); });", 0],
    ["a LATER block's BEGIN does not launder an earlier one", "const a = await pool.connect();\ntry { await a.query(`SELECT set_config('app.operating_company_id', $1, true)`, [x]); } finally { a.release(); }\nconst b = await pool.connect();\ntry { await b.query('BEGIN'); } finally { b.release(); }", 1],
    ["two bad blocks are two findings", "const a = await pool.connect();\ntry { await a.query(`SELECT set_config('app.operating_company_id', $1, true)`, [x]); } finally { a.release(); }\nconst b = await pool.connect();\ntry { await b.query(`SELECT set_config('app.operating_company_id', $1, true)`, [y]); } finally { b.release(); }", 2],
  ];
  let bad = 0;
  for (const [name, src, expect] of cases) {
    const got = auditSource(src, "t.ts").length;
    if (got !== expect) { bad++; console.error(`  selftest FAIL: ${name} — expected ${expect}, got ${got}`); }
  }
  if (bad) { console.error(`${LABEL} --selftest: ${bad} case(s) failed`); process.exit(1); }
  console.log(`${LABEL} --selftest: ${cases.length} cases pass`);
  process.exit(0);
}

const current = [];
for (const f of walk(SRC)) {
  const src = readFileSync(f, "utf8");
  if (!src.includes(".connect()")) continue;
  current.push(...auditSource(src, relative(ROOT, f)));
}
const currentKeys = [...new Set(current.map((c) => c.key))].sort();

if (process.argv.includes("--write-baseline")) {
  writeFileSync(join(ROOT, BASELINE_PATH), `${JSON.stringify(currentKeys, null, 2)}\n`);
  console.log(`${LABEL}: baseline written — ${currentKeys.length} site(s).`);
  process.exit(0);
}

let baseline;
try {
  baseline = JSON.parse(readFileSync(join(ROOT, BASELINE_PATH), "utf8"));
} catch {
  console.error(`FAIL ${LABEL}: baseline missing at ${BASELINE_PATH} — run with --write-baseline.`);
  process.exit(1);
}
const baselineSet = new Set(baseline);
const added = currentKeys.filter((k) => !baselineSet.has(k));

if (added.length) {
  console.error(`FAIL ${LABEL} — a raw pool.connect() sets the TRANSACTION-LOCAL tenant GUC with no transaction, so it sets nothing:`);
  for (const k of added) console.error(`  · ${k.replace("|", ":")}`);
  console.error(`\n  set_config('app.operating_company_id', …, true) is discarded at the end of the current`);
  console.error(`  transaction; with no BEGIN that is the very next statement. Proven on PostgreSQL 16.14.`);
  console.error(`  Use withCurrentUser(userId, async (client) => …) — it opens the transaction, issues`);
  console.error(`  SET LOCAL ROLE ih35_app fail-closed, and rolls back on throw. The baseline may only SHRINK.`);
  process.exit(1);
}

const fixed = baseline.filter((k) => !currentKeys.includes(k));
if (fixed.length) {
  console.log(`${LABEL}: OK — ${fixed.length} baseline site(s) now inside a transaction. Re-run with --write-baseline to tighten the ratchet.`);
} else {
  console.log(`${LABEL}: OK — ratchet holding at ${currentKeys.length} known site(s); 0 new.`);
}
