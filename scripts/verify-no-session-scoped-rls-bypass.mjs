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
import { readdirSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const LABEL = "verify:no-session-scoped-rls-bypass";
const ROOT = "scripts";
const BASELINE_PATH = join(ROOT, "verify-no-session-scoped-rls-bypass.baseline.json");

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

/** Same predicate as analyse(), but returns the violating file paths for baseline comparison. */
export function violatingFiles(files) {
  const out = new Set();
  for (const [path, src] of Object.entries(files)) {
    if (src == null) continue;
    const args = extractQueryArguments(src);
    const usesSessionBypass = args.some((a) => SESSION_BYPASS.test(a) || BARE_SET_BYPASS.test(a));
    if (!usesSessionBypass) continue;
    if (POOLER_REFUSAL.test(src)) continue;
    out.add(path);
  }
  return out;
}

// readdirSync(withFileTypes) returns the entry TYPE from the same directory read, so there is no
// stat()-then-read() gap for the filesystem to change under us (CodeQL js/file-system-race, high).
// The earlier version called statSync and then readFileSync on the same path — a genuine TOCTOU that
// this project's own scanner caught on the PR that introduced it.
function walk(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      walk(p, out);
    } else if (entry.isFile() && /\.(mjs|mts|ts|js)$/.test(entry.name)) {
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

function loadBaseline() {
  if (!existsSync(BASELINE_PATH)) return null;
  return JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
}

// SHRINK-ONLY BASELINE RATCHET, same shape as verify-account-number-hidden-by-default.mjs:
// pre-existing debt (44 files at the time this baseline was written 2026-09-28, the day this
// exact defect class caused a real bug in scripts/ops/2026-09-28-lead-r147-book-18-current-loads.ts)
// is known and printed, never silent, and can only shrink. A brand-new violation not in the
// baseline is a hard FAIL — this is what makes the guard block the NEXT script that repeats this
// exact mistake, which is the entire point.
const files = readAll();
const live = violatingFiles(files);

if (process.argv.includes("--write-baseline")) {
  writeFileSync(
    BASELINE_PATH,
    JSON.stringify(
      {
        _comment: "ACCT-F155.4 -- shrink-only baseline of pre-existing session-scoped RLS bypass usages found when this guard was wired into money-pr-local-gate.mjs. Real, known debt, mostly one-shot historical ops scripts already run. Fix a file and remove its entry; a new violation outside this list fails the build.",
        established: new Date().toISOString().slice(0, 10),
        measured_at: new Date().toISOString(),
        files: Object.fromEntries([...live].sort().map((f) => [f, true])),
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`${LABEL}: wrote baseline with ${live.size} known-debt file(s)`);
  process.exit(0);
}

const baseline = loadBaseline();
if (!baseline) {
  if (live.size > 0) {
    console.error(`${LABEL}: FAIL — no baseline file and ${live.size} file(s) violate. Seed the baseline (--write-baseline) or fix them.`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — ${Object.keys(files).length} script(s); no unguarded session-scoped RLS bypass`);
  process.exit(0);
}

const baselineNames = new Set(Object.keys(baseline.files || {}));
const newRot = [...live].filter((f) => !baselineNames.has(f));
const nowClean = [...baselineNames].filter((f) => !live.has(f));

if (newRot.length > 0) {
  console.error(`${LABEL}: FAIL — new session-scoped RLS bypass, not in baseline:\n  - ${newRot.join("\n  - ")}`);
  console.error(`Either refuse the -pooler endpoint, use transaction-local GUCs inside an explicit BEGIN (SET LOCAL), or go through withLuciaBypass(). Never add a new file to the baseline.`);
  process.exit(1);
}
if (nowClean.length > 0) {
  console.error(`${LABEL}: FAIL — these baselined file(s) are now clean; remove them from the baseline (shrink-only ratchet):\n  - ${nowClean.join("\n  - ")}`);
  process.exit(1);
}
console.log(`${LABEL} OK — ${live.size} known-debt file(s) unchanged (baseline ${baseline.established}), 0 new violations, ${Object.keys(files).length} script(s) scanned.`);
