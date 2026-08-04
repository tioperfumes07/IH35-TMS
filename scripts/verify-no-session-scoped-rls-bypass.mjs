#!/usr/bin/env node
/**
 * GUARD — DB-F01: a standalone script may not rely on a SESSION-scoped RLS bypass without refusing the
 * pooled endpoint, because over transaction pooling that silently returns ZERO ROWS.
 *
 * THE MECHANISM (verified on prod 2026-08-04, twice). `set_config('app.bypass_rls','lucia', false)` —
 * third argument false — sets the GUC for the SESSION. Neon's `-pooler` endpoint pools in TRANSACTION
 * mode, so consecutive statements can be served by different server backends even on a single
 * dedicated client. On a backend that never saw the SET, the GUC is absent; and because
 * accounting.* / banking.* / catalogs.* / mdata.* are FORCE-RLS, the query does not error — it returns
 * NOTHING. The caller reads zero rows and concludes there is no work to do.
 *
 * WHY THIS IS A GUARD AND NOT A NOTE. It has now bitten twice and been mis-diagnosed once:
 *   1. DDL applied by hand failed with "must be owner of table" on one run and succeeded on the next
 *      with identical input, because SET ROLE did not survive either;
 *   2. the ACCT-F101 fuel reclass dry run reported "bank transaction not found" for a row that
 *      provably exists on prod — it would have corrected 19 of 20 rows and reported success;
 *   3. scripts/run-relay-wallet-bank-feed-backfill-once.mts carries the comment
 *      "is_local=false: session-scoped GUCs (is_local=true is a no-op outside BEGIN and hid all rows
 *      via RLS)" — the author hit the symptom, then worked around it by making the GUC session-scoped,
 *      which is precisely the shape that fails under pooling. A wrong answer that looks like a right
 *      answer will keep being re-introduced by anyone debugging the same symptom.
 *
 * THE APPLICATION IS NOT AFFECTED, and this guard deliberately does not touch it: withLuciaBypass()
 * in apps/backend/src/auth/db.ts takes a dedicated client, opens a transaction, and uses
 * `SET LOCAL ROLE` + `SET LOCAL app.bypass_rls` — transaction-scoped, so the whole unit is pinned to
 * one backend. That is the correct pattern. Only hand-rolled scripts are in scope here.
 *
 * WHAT IT ENFORCES: any file under scripts/ that sets app.bypass_rls with is_local=false must also
 * refuse a `-pooler` connection string. Two escapes are equally acceptable and are NOT flagged:
 * using transaction-local GUCs (is_local=true inside an explicit BEGIN), or going through the
 * backend's withLuciaBypass helper.
 */
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

const LABEL = "verify:no-session-scoped-rls-bypass";
const ROOT = "scripts";

/** set_config('app.bypass_rls', <anything>, false) — the session-scoped form. */
const SESSION_BYPASS = /set_config\(\s*['"`]app\.bypass_rls['"`]\s*,[^,]+,\s*false\s*\)/;
/** A bare `SET app.bypass_rls` (not SET LOCAL) is the same hazard. */
const BARE_SET_BYPASS = /\bSET\s+(?!LOCAL\b)app\.bypass_rls\b/i;
/** The required mitigation: refuse a pooled endpoint. */
const POOLER_REFUSAL = /-pooler/;

/**
 * Only text actually handed to a query call can be a real usage. Comments describing the hazard, error
 * messages quoting it, and doc-strings mentioning it are NOT usages — an earlier version of this guard
 * flagged eight such files, including one whose only "offence" was a description string and which was
 * already using the correct transaction-local form. A guard that reads prose as code cries wolf, and a
 * guard that cries wolf gets switched off.
 */
export function extractQueryArguments(src) {
  const out = [];
  const text = String(src);
  const re = /\.\s*query\s*\(/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    while (i < text.length && depth > 0 && i - start < 2000) {
      const ch = text[i];
      if (ch === "(") depth += 1;
      else if (ch === ")") depth -= 1;
      i += 1;
    }
    out.push(text.slice(start, i));
  }
  return out;
}

export function analyse(files) {
  const problems = [];
  for (const [path, src] of Object.entries(files)) {
    if (src == null) continue;
    const args = extractQueryArguments(src);
    const usesSessionBypass = args.some((a) => SESSION_BYPASS.test(a) || BARE_SET_BYPASS.test(a));
    if (!usesSessionBypass) continue;
    if (POOLER_REFUSAL.test(src)) continue;
    problems.push(
      `${path} sets app.bypass_rls SESSION-scoped (is_local=false, or a bare SET) but does not refuse a ` +
        `-pooler connection string. Under transaction pooling that GUC does not survive between ` +
        `statements, and FORCE-RLS then returns ZERO ROWS with no error — the script silently reads ` +
        `nothing and reports success. Either refuse the pooler endpoint, use transaction-local GUCs ` +
        `inside an explicit BEGIN, or go through withLuciaBypass().`
    );
  }
  return problems;
}

function walk(dir, out) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (entry === "node_modules") continue;
      walk(p, out);
    } else if (/\.(mjs|mts|ts|js)$/.test(entry)) {
      out[p] = readFileSync(p, "utf8");
    }
  }
  return out;
}

function readAll() {
  if (!existsSync(ROOT)) return {};
  return walk(ROOT, {});
}

function selftest() {
  const failures = [];
  const t = (l, c) => { if (!c) failures.push(l); };

  // The REAL pre-fix shape from run-relay-wallet-bank-feed-backfill-once.mts.
  const bad = `const url = process.env.DATABASE_URL;\nawait client.query(\`SELECT set_config('app.bypass_rls','lucia',false)\`);`;
  const fixedByRefusal = `const url = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;\nif (/-pooler\\./.test(url)) throw new Error("refuse");\nawait client.query(\`SELECT set_config('app.bypass_rls','lucia',false)\`);`;
  const fixedByTxnLocal = `await db.query("BEGIN");\nawait db.query(\`SELECT set_config('app.bypass_rls','lucia',true)\`);\nawait db.query("COMMIT");`;
  const bareSet = `await client.query("SET app.bypass_rls = 'lucia'");`;
  const setLocal = `await client.query("SET LOCAL app.bypass_rls = 'lucia'");`;
  const unrelated = `await client.query("SELECT 1");`;

  t("the REAL session-scoped shape FAILS", analyse({ "scripts/x.mts": bad }).length === 1);
  t("refusing the pooler PASSES", analyse({ "scripts/x.mts": fixedByRefusal }).length === 0);
  t("transaction-local GUCs PASS (no session bypass at all)", analyse({ "scripts/x.mts": fixedByTxnLocal }).length === 0);
  t("a bare SET app.bypass_rls FAILS", analyse({ "scripts/x.mts": bareSet }).length === 1);
  t("SET LOCAL app.bypass_rls PASSES", analyse({ "scripts/x.mts": setLocal }).length === 0);
  t("an unrelated script is untouched", analyse({ "scripts/x.mts": unrelated }).length === 0);
  // The false-positive class an earlier version of this guard actually produced (8 files).
  const commentOnly = [
    "// an injection payload like  x';SET app.bypass_rls='lucia';--  must be impossible",
    'await client.query("SELECT 1");',
  ].join("\n");
  const descriptionString = [
    "await client.query(`SELECT set_config('app.bypass_rls','lucia',true)`);",
    "const note = \"Prod snapshot (SET app.bypass_rls='lucia'). Source of truth.\";",
  ].join("\n");
  t("a COMMENT describing the hazard is not a usage", analyse({ "scripts/x.mjs": commentOnly }).length === 0);
  t("a description STRING beside a correct transaction-local call is not a usage",
    analyse({ "scripts/x.mjs": descriptionString }).length === 0);

  t("multiple offenders are each reported",
    analyse({ "scripts/a.mts": bad, "scripts/b.mts": bad }).length === 2);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
}

if (process.argv.includes("--selftest")) {
  selftest();
  console.log(`${LABEL} selftest OK — 9 cases (1 real fail-shape, 2 accepted mitigations, bare-SET vs SET LOCAL, comment-immunity, description-string immunity, multi-offender reporting)`);
  process.exit(0);
}

const files = readAll();
const problems = analyse(files);
if (problems.length) {
  console.error(`${LABEL} FAILED:\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}
console.log(`${LABEL} OK — ${Object.keys(files).length} script(s); no unguarded session-scoped RLS bypass`);
