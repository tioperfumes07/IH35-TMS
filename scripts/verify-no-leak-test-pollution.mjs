#!/usr/bin/env node
// verify:no-leak-test-pollution
//
// LST-SEED-01. A test harness wrote 259 `USMCA-1 leak test <hex>` rows into LIVE prod
// `catalogs.complaint_types` (TRANSP). An audit then misread the 271/12/12 skew as a TRK/USMCA "seed gap",
// and a migration to seed the garbage to all three entities reached PR review (#3452, closed) before the
// owner's common sense caught it. Three separate defects made it possible:
//
//   1. scripts/verify-no-cross-carrier-data-leak.mjs INSERTs fixtures and had NO prod refusal, while
//      dotenv.config() + (DATABASE_DIRECT_URL || DATABASE_URL) resolves .env's PROD url. db-migrate.mjs
//      has refused prod since 2026-06-28; the fixture writer never did. (CI was never the source — ci.yml
//      points it at an ephemeral postgres:16-alpine on localhost. The rows came from local runs.)
//   2. It COMMITTED its fixtures and then tried to DELETE them — under `SET ROLE ih35_app`, which has no
//      DELETE grant. Reproduced live 2026-07-25: cleanup threw `permission denied for table drift_log` on
//      EVERY run, and `.catch(() => {})` swallowed it. One orphan per run; 259 rows = ~259 runs.
//   3. Nothing asserted the fixtures were actually gone, so the accumulation was invisible.
//
// The rebuilt harness never commits: one transaction, always ROLLBACK, then a fresh-connection residue
// check. That needs no DELETE grant, survives a killed process, and satisfies §F.24 by construction.
//
// WHAT THIS GUARD PROVES, honestly (DoD §4 — check the THING, not the shape of the thing):
//   * It cannot count prod rows from CI (no prod access, and CI must not have any). The live proof —
//     0 active `%leak test%` rows across all 113 catalogs.* base tables, TRANSP/TRK/USMCA 12/12/12
//     active — was taken on Neon with `SET app.bypass_rls='lucia'` on 2026-07-25 and is GUARD's to re-run.
//   * What it DOES prove is that the three mechanisms which produced the pollution cannot return: every
//     script that INSERTs into a live business catalog refuses a prod target before connecting, no
//     fixture cleanup is silently swallowed, and cleanup is verified to have removed everything.
//   That is a mechanism ratchet, not a row count, and it is stated so nobody reads more into it.
//
// FAILS on the pre-fix tree (harness has no refusal, swallows cleanup, never verifies) and PASSES on the
// fix. `--selftest` mutates REAL source, one case per assertion, and also asserts the corrected shape is
// not flagged.
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const LABEL = "verify:no-leak-test-pollution";
const SELFTEST = process.argv.includes("--selftest");

const HARNESS = "scripts/verify-no-cross-carrier-data-leak.mjs";
const PROD_GUARD_LIB = "scripts/lib/prod-target-guard.mjs";
const FILES = [HARNESS, PROD_GUARD_LIB];

const readDisk = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

// Any script under scripts/ that INSERTs into a live business schema must carry the prod refusal.
// catalogs.* / mdata.* / accounting.* are owner-gated business data (CLAUDE.md §1.3).
//
// The trailing `\w+\s*\(` (table name then a column list) is what makes this an INSERT *statement* rather
// than the words "INSERT INTO …" appearing in a comment or an error message. Without it this guard flagged
// scripts/verify-double-entry-balance-trigger.mjs, a static guard whose whole job is to FORBID
// `INSERT INTO accounting.journal_entry_lines` and which therefore quotes the phrase in its failure text.
// A guard that cries wolf on already-correct code burns trust as fast as one that misses (DoD §4).
const BUSINESS_INSERT = /INSERT\s+INTO\s+(catalogs|mdata|accounting|safety|banking|driver_finance)\.\w+\s*\(/i;

// Deliberate OPERATOR tools that are MEANT to run against production by a human, following a documented
// runbook. These are not fixture writers and must NOT get a fail-closed prod refusal — adding one would
// break a real, documented procedure. Each entry needs its runbook cited.
const OPERATOR_TOOLS = new Map([
  [
    "scripts/ingest-samsara-to-mdata-units.mjs",
    "documented operator ingest: docs/samsara/ingestion-runbook.md + docs/CLAUDE.md §8 — populates mdata.units from integrations.samsara_vehicles on prod, run by hand",
  ],
]);

// PRE-EXISTING DEBT — fixture writers that INSERT business rows with no prod refusal, inventoried when this
// guard was written (2026-07-25, LST-SEED-01). They are the SAME defect class as the harness that polluted
// prod, but they are not this PR's ranked finding, so they are frozen here instead of silently ignored:
// tracker docs/trackers/FIXTURE-WRITER-PROD-REFUSAL-DEBT-2026-07-25.md, future block LST-SEED-02.
//
// This list may only SHRINK. A NEW unrefused fixture writer fails immediately, and a listed script that has
// since been fixed ALSO fails until it is removed from the list — so the inventory cannot go stale or be
// used as a parking lot.
const KNOWN_UNREFUSED_DEBT = [
  "scripts/ci-boot-aggregate-smoke.mjs",
  "scripts/db-verify-catalog-registry.mjs",
  "scripts/db-verify-catalogs-rls.mjs",
  "scripts/db-verify-catalogs-workflows.mjs",
  "scripts/db-verify-cust-driver-fields.mjs",
  "scripts/db-verify-driver-profile.mjs",
  "scripts/db-verify-equipment-catalog.mjs",
  "scripts/db-verify-mdata-rls.mjs",
  "scripts/db-verify-mdata-workflows.mjs",
  "scripts/db-verify-multi-tenant.mjs",
  "scripts/db-verify-phase1-audit-coverage.mjs",
  "scripts/sec-audit-rls-policies.mjs",
];

export function assertNoLeakTestPollution(sources) {
  const get = (rel) => sources?.[rel] ?? readDisk(rel);
  const errs = [];

  // ── 1. the shared refusal must exist and fail closed ──────────────────────────────────────────────
  let lib;
  try {
    lib = get(PROD_GUARD_LIB);
  } catch {
    errs.push(`${PROD_GUARD_LIB}: MISSING — the shared prod-target refusal is the root fix for LST-SEED-01`);
    lib = "";
  }
  if (lib) {
    if (!/export function assertNotProdTarget/.test(lib)) {
      errs.push(`${PROD_GUARD_LIB}: must export assertNotProdTarget()`);
    }
    if (!/process\.exit\(1\)/.test(lib)) {
      errs.push(`${PROD_GUARD_LIB}: must fail closed (process.exit(1)) on a prod target`);
    }
    // Reusing ALLOW_PROD_MIGRATE would re-open the hole on every prod deploy, which sets it.
    if (/ALLOW_PROD_MIGRATE/.test(lib.replace(/\/\/[^\n]*/g, ""))) {
      errs.push(
        `${PROD_GUARD_LIB}: must NOT honour ALLOW_PROD_MIGRATE — prod deploys set it, so a fixture writer would run on prod`,
      );
    }
  }

  // ── 2. the harness must refuse prod BEFORE it connects, and must not swallow or skip cleanup ──────
  const harness = get(HARNESS);
  const harnessCode = harness.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

  if (!/assertNotProdTarget\s*\(/.test(harnessCode)) {
    errs.push(`${HARNESS}: writes fixtures but never calls assertNotProdTarget() — this is how prod got polluted`);
  } else {
    const refusalAt = harnessCode.search(/assertNotProdTarget\s*\(/);
    const poolAt = harnessCode.search(/new Pool\s*\(/);
    if (poolAt !== -1 && refusalAt > poolAt) {
      errs.push(`${HARNESS}: assertNotProdTarget() must run BEFORE new Pool() — refuse before connecting`);
    }
  }
  if (/\.catch\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/.test(harnessCode)) {
    errs.push(`${HARNESS}: fixture cleanup errors are swallowed (.catch(() => {})) — a failed cleanup must FAIL the run`);
  }
  // The fixtures must never be COMMITTED. ROLLBACK-as-cleanup needs no DELETE grant, survives a killed
  // process (Postgres rolls back on disconnect), and satisfies §F.24 by construction. The old design
  // committed and then DELETEd under `SET ROLE ih35_app`, which has no DELETE grant — so cleanup threw
  // "permission denied" on every run and the swallow hid it. 259 rows accumulated on prod that way.
  if (!/\bROLLBACK\b/.test(harnessCode)) {
    errs.push(`${HARNESS}: fixture transaction must be ROLLED BACK — never committed and then deleted`);
  }
  // H2/H1 CORRECTION 2026-07-25 (independent review). Requiring the presence of "ROLLBACK" was not a
  // check at all: the PRE-FIX harness already contained that word in its runWithBypass/runScoped catch
  // arms, so the assertion could never distinguish the bug from the fix. Worse, nothing forbade COMMIT —
  // a harness that COMMITs each fixture and rolls back only on error (which IS the LST-SEED-01 defect,
  // 259 rows accumulating in live catalogs.complaint_types) passed this guard with zero problems.
  // Banning COMMIT outright is the assertion that actually holds: a fixture must never be durable.
  const commitStmt = harnessCode.match(/\bCOMMIT\b/);
  if (commitStmt) {
    errs.push(
      `${HARNESS}: contains COMMIT — fixture rows must NEVER be committed. A harness that commits and rolls back only on error is exactly the defect that put 259 test rows into live catalogs.complaint_types.`,
    );
  }
  if (!/rolledBack/.test(harnessCode)) {
    errs.push(`${HARNESS}: must track whether the fixture transaction rolled back and exit non-zero if not`);
  }
  if (/DELETE\s+FROM\s+(catalogs|mdata|accounting|safety|banking|driver_finance)\./i.test(harnessCode)) {
    errs.push(
      `${HARNESS}: DELETEs from a business table — forbidden by §F.24, and it silently failed under SET ROLE ih35_app (no DELETE grant). Roll the fixture transaction back instead.`,
    );
  }
  // The residue probe must actually QUERY, not be a hardcoded pass. `let residue = 0` with the probe
  // deleted satisfied a bare /residue/ token check while proving nothing.
  if (!/residue/.test(harnessCode)) {
    errs.push(`${HARNESS}: must prove on a FRESH connection that 0 fixture rows survived (the missing assertion)`);
  } else {
    if (!/residue\s*=\s*-1/.test(harnessCode)) {
      errs.push(
        `${HARNESS}: the residue counter must start at -1 (unknown) so a probe that never runs fails closed; initialising it to 0 asserts success without measuring anything`,
      );
    }
    if (!/residue\s*=\s*Number\(/.test(harnessCode)) {
      errs.push(`${HARNESS}: residue must be assigned from a queried count, not a literal`);
    }
    if (!/pool\.connect\(\)/.test(harnessCode.slice(harnessCode.indexOf("finally")))) {
      errs.push(`${HARNESS}: the residue probe must open its own connection AFTER the fixture transaction is rolled back`);
    }
  }

  // ── 3. no OTHER fixture-writing script may insert into business schemas without the refusal ───────
  const scriptsDir = path.join(ROOT, "scripts");
  let entries = [];
  try {
    entries = fs.readdirSync(scriptsDir).filter((f) => f.endsWith(".mjs"));
  } catch {
    /* no scripts dir in a mutated fixture — the checks above already cover the real tree */
  }
  // Union in any scripts/*.mjs supplied via `sources`, so --selftest can plant a synthetic fixture writer.
  // An assertion the selftest cannot reach is an assertion that can never be proven to fail (DoD §4).
  for (const key of Object.keys(sources ?? {})) {
    const m = /^scripts\/([^/]+\.mjs)$/.exec(key);
    if (m && !entries.includes(m[1])) entries.push(m[1]);
  }
  for (const file of entries) {
    const rel = `scripts/${file}`;
    let text;
    try {
      text = sources?.[rel] ?? fs.readFileSync(path.join(scriptsDir, file), "utf8");
    } catch {
      continue;
    }
    const code = text.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    // Only scripts that actually open a connection AND insert business rows are fixture writers.
    const writes = BUSINESS_INSERT.test(code);
    const connects = /new Pool\s*\(|new Client\s*\(/.test(code);
    if (!writes || !connects) continue;
    if (OPERATOR_TOOLS.has(rel)) continue; // deliberate prod tool, runbook-documented

    const refused = /assertNotProdTarget\s*\(/.test(code);
    const onDebtList = KNOWN_UNREFUSED_DEBT.includes(rel);

    if (!refused && !onDebtList) {
      errs.push(
        `${rel}: INSERTs into a live business schema without assertNotProdTarget() — add the prod refusal (this is the LST-SEED-01 vector: 259 rows written into live catalogs.complaint_types)`,
      );
    }
    if (refused && onDebtList) {
      errs.push(
        `${rel}: now carries the prod refusal — remove it from KNOWN_UNREFUSED_DEBT in ${path.basename(import.meta.url)} so the inventory cannot go stale (ratchets only tighten)`,
      );
    }
  }

  // A debt entry that no longer matches any real fixture writer is also staleness.
  for (const rel of KNOWN_UNREFUSED_DEBT) {
    if (!fs.existsSync(path.join(ROOT, rel)) && !sources?.[rel]) {
      errs.push(`${rel}: listed in KNOWN_UNREFUSED_DEBT but no longer exists — remove the stale entry`);
    }
  }

  return errs;
}

if (SELFTEST) {
  const live = Object.fromEntries(FILES.map((r) => [r, readDisk(r)]));
  const failures = [];
  const expectCaught = (name, mutated, needle) => {
    if (JSON.stringify(mutated) === JSON.stringify(live)) {
      failures.push(`${name}: inert — the mutation did not change the source`);
      return;
    }
    const problems = assertNoLeakTestPollution(mutated);
    if (!problems.some((x) => x.includes(needle))) {
      failures.push(`${name}: NOT caught (got: ${problems.join(" | ") || "none"})`);
    }
  };

  // Each case removes exactly what one assertion requires — the pre-fix shapes that let 259 rows land.
  expectCaught(
    "harness-prod-refusal-removed",
    { ...live, [HARNESS]: live[HARNESS].replace(/assertNotProdTarget\(\{[\s\S]*?\}\);/, "") },
    "never calls assertNotProdTarget()",
  );
  expectCaught(
    "harness-refusal-after-pool",
    {
      ...live,
      [HARNESS]: live[HARNESS]
        .replace(/assertNotProdTarget\(\{[\s\S]*?\}\);\n/, "")
        .replace("const pool = new Pool({ connectionString });", 'const pool = new Pool({ connectionString });\nassertNotProdTarget({ label: "x", connectionString });'),
    },
    "must run BEFORE new Pool()",
  );
  expectCaught(
    "harness-cleanup-swallowed-again",
    { ...live, [HARNESS]: live[HARNESS].replace('await client.query("ROLLBACK");', 'await client.query("ROLLBACK").catch(() => {});') },
    "swallowed",
  );
  expectCaught(
    "harness-commits-instead-of-rolling-back",
    { ...live, [HARNESS]: live[HARNESS].replace(/\bROLLBACK\b/g, "COMMIT") },
    "must be ROLLED BACK",
  );
  expectCaught(
    "harness-rollback-untracked",
    { ...live, [HARNESS]: live[HARNESS].replace(/rolledBack/g, "ignoredFlag") },
    "must track whether the fixture transaction rolled back",
  );
  expectCaught(
    "harness-reintroduces-business-delete",
    {
      ...live,
      [HARNESS]: live[HARNESS].replace(
        'await client.query("ROLLBACK");',
        'await client.query(`DELETE FROM catalogs.complaint_types WHERE type_code = $1`, [FIXTURE_CODE]);\n    await client.query("ROLLBACK");',
      ),
    },
    "forbidden by §F.24",
  );
  // H1: the realistic mixed shape the old assertions could not see — commit each fixture, roll back only
  // on error. This IS LST-SEED-01. The previous selftest only replaced ALL ROLLBACKs with COMMIT, which
  // was the single variant a presence-regex could catch.
  expectCaught(
    "harness-commits-fixtures-but-keeps-rollback-in-finally",
    { ...live, [HARNESS]: live[HARNESS].replace(
        'fixtureIds.push({ table: table.name, id: String(inserted) });',
        'fixtureIds.push({ table: table.name, id: String(inserted) });\n        await client.query("COMMIT");\n        await client.query("BEGIN");') },
    "contains COMMIT",
  );
  expectCaught(
    "residue-hardcoded-to-zero",
    { ...live, [HARNESS]: live[HARNESS].replace("let residue = -1;", "let residue = 0;") },
    "must start at -1",
  );
  expectCaught(
    "harness-residue-check-removed",
    { ...live, [HARNESS]: live[HARNESS].replace(/residue/g, "unchecked") },
    "must prove on a FRESH connection",
  );
  expectCaught(
    "lib-escape-hatch-reintroduced",
    { ...live, [PROD_GUARD_LIB]: live[PROD_GUARD_LIB].replace("if (targetIsProd(connectionString, env)) {", "if (targetIsProd(connectionString, env) && env.ALLOW_PROD_MIGRATE !== '1') {") },
    "must NOT honour ALLOW_PROD_MIGRATE",
  );
  expectCaught(
    "lib-no-longer-fails-closed",
    { ...live, [PROD_GUARD_LIB]: live[PROD_GUARD_LIB].replace(/if \(exit\) process\.exit\(1\);/, "if (exit) console.warn('continuing anyway');") },
    "must fail closed",
  );

  // The debt-list ratchet, both directions.
  const NEW_WRITER = "scripts/zz-selftest-synthetic-fixture-writer.mjs";
  expectCaught(
    "new-unrefused-fixture-writer-added",
    {
      ...live,
      [NEW_WRITER]:
        "import pg from 'pg';\nconst pool = new Pool({ connectionString });\n" +
        "await pool.query(`INSERT INTO catalogs.complaint_types (operating_company_id, type_code) VALUES ($1,$2)`);\n",
    },
    "without assertNotProdTarget()",
  );
  const DEBT_SAMPLE = KNOWN_UNREFUSED_DEBT[0];
  expectCaught(
    "debt-entry-fixed-but-still-listed",
    {
      ...live,
      [DEBT_SAMPLE]: `import { assertNotProdTarget } from "./lib/prod-target-guard.mjs";\nassertNotProdTarget({});\nconst pool = new Pool({});\nawait pool.query(\`INSERT INTO mdata.units (unit_number) VALUES ($1)\`);\n`,
    },
    "remove it from KNOWN_UNREFUSED_DEBT",
  );

  const liveProblems = assertNoLeakTestPollution(live);
  if (liveProblems.length) failures.push(`live FAIL: ${liveProblems.join(" | ")}`);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 13 planted defects caught, live sources clean`);
  process.exit(0);
}

const problems = assertNoLeakTestPollution();
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(
  `${LABEL} OK — fixture writers refuse a prod target before connecting, cleanup failures are loud, and cleanup is verified to leave no '%leak test%' row.`,
);
