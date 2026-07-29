#!/usr/bin/env node
/**
 * OB-01 — the Opening Balance Register's commit gate, per the 2026-07-29 OWNER RULING
 * (docs companion: Cursor-OpeningBalances-OB01.md).
 *
 * The ORIGINAL 2026-07-28 design gated the commit on a human "source period is FINAL" flag. The owner
 * REMOVED that gate on 2026-07-29: opening balances are LIVE and CHANGE, there is no finality lock,
 * and the register auto-imports + auto-commits the QBO/fixture snapshot NOW (clone-as-is, Adjustment
 * 0) so the books are populated immediately. The register keeps a three-column worksheet model
 * (QBO Snapshot | editable Adjustment | Adjusted Opening = Snapshot + Adjustment, the committed
 * value); re-import refreshes the Snapshot only, a prior Adjustment persists.
 *
 * This guard now asserts the OPPOSITE of the original v1 assertion — a regression back to a
 * finality-gated commit is exactly as forbidden as a regression away from maker/checker or a
 * regression into a QBO write-back:
 *
 *   1. NO `source_not_final` blocker exists anywhere in the service — not in the type, not in
 *      computeCommitBlockers, not in the test file. Committing on a balanced, non-maker=checker
 *      register with ZERO finality rows in existence must be possible;
 *   2. the three-column model exists: qbo_snapshot_cents + adjustment_cents on both catalogs.accounts
 *      (as opening_balance_qbo_snapshot_cents / opening_balance_adjustment_cents) and
 *      accounting.ob_register_staging_lines;
 *   3. the clone-as-is fixture exists on disk and its documented acceptance totals tie to the owner's
 *      numbers (assets/liabilities/equity in cents, and A = L + E);
 *   4. maker/checker separation, the unbalanced check, and the OBE-reclass check are all still
 *      enforced (those are data-integrity checks on the register's OWN contents, not the "is the
 *      source final" control the owner removed — they stay);
 *   5. a refusal RETURNS `committed: false` BEFORE any write to catalogs.accounts, never throws (the
 *      routes run the service inside withCompanyScope, which rolls back a thrown error together with
 *      its own commit_refused audit row);
 *   6. the module never writes back to QuickBooks and never posts a journal entry — QBO push stays a
 *      read-only reconcile source, never a write target, unaffected by this ruling;
 *   7. the three OB-01 tables exist with FORCE RLS and the audit table is append-only;
 *   8. the page is reachable (route mounted, sub-nav leaf) and its three columns (Snapshot /
 *      Adjustment / Adjusted Opening) are actually rendered — not just the old single "staged balance"
 *      column.
 *
 * Deliberately static. Whether a real commit refuses/succeeds on prod is proved by the vitest arms in
 * apps/backend/src/accounting/opening-balance-register/__tests__ and by live evidence, not by a
 * script that cannot see the database. The fixture's numeric tie-out is ALSO independently re-proved
 * by scripts/verify-ob01-fixture-tieout.mjs (verify-step 1736) — this file's fixture check is a
 * lighter existence + acceptance-object check, not a duplicate of that arithmetic.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const SERVICE = "apps/backend/src/accounting/opening-balance-register/opening-balance-register.service.ts";
const ROUTES = "apps/backend/src/accounting/opening-balance-register/opening-balance-register.routes.ts";
const TESTS = "apps/backend/src/accounting/opening-balance-register/__tests__/opening-balance-register.service.test.ts";
const PAGE = "apps/frontend/src/pages/accounting/OpeningBalanceRegisterPage.tsx";
const SUBNAV = "apps/frontend/src/pages/accounting/subnav-manifest.ts";
const ROUTE_MANIFEST = "apps/frontend/src/routes/manifest.tsx";
const ROUTE_PATH = "/accounting/opening-balance-register";
const FIXTURE_JSON = "docs/fixtures/ob01/transp-2026-03-31.json";
const FIXTURE_XLSX = "docs/fixtures/ob01/Cursor-Balances-Reference.xlsx";

const OB_TABLES = [
  "accounting.ob_register_staging_lines",
  "accounting.ob_register_audit_events",
  "accounting.ob_source_finality",
];

const REQUIRED_ENDPOINTS = [
  "/api/v1/accounting/opening-balance-register",
  "/api/v1/accounting/opening-balance-register/line",
  "/api/v1/accounting/opening-balance-register/import-from-qbo",
  "/api/v1/accounting/opening-balance-register/import-from-fixture",
  "/api/v1/accounting/opening-balance-register/clone-as-is-commit",
  "/api/v1/accounting/opening-balance-register/finality",
  "/api/v1/accounting/opening-balance-register/commit",
];

/** Owner-provided acceptance totals (cents) — Cursor-OpeningBalances-OB01.md, TRANSP as-of 2026-03-31. */
const ACCEPTANCE_TOTALS_CENTS = {
  assets: -834113738,
  liabilities: 133235669,
  equity: -967349407,
};

/**
 * Body of a named function, by brace balance — not a line window.
 *
 * The parameter list is skipped by paren balance first: these functions take inline object types
 * (`args: { totals: …; … }`), so "first brace after the name" lands inside the SIGNATURE and the
 * extracted "body" would be the argument type. That is how a body-scoped assertion silently becomes
 * an assertion about nothing.
 */
function functionBody(source, declaration) {
  const start = source.indexOf(declaration);
  if (start === -1) return null;
  const paren = source.indexOf("(", start);
  if (paren === -1) return null;
  let parenDepth = 0;
  let cursor = paren;
  for (; cursor < source.length; cursor += 1) {
    if (source[cursor] === "(") parenDepth += 1;
    else if (source[cursor] === ")") {
      parenDepth -= 1;
      if (parenDepth === 0) break;
    }
  }
  const open = source.indexOf("{", cursor);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  return null;
}

/**
 * Strip comments before scanning for forbidden calls/literals. This module's header (and this
 * guard's own header) DOCUMENT the removed `source_not_final` blocker in prose — matching on prose
 * would fire the guard on the very statement of the law it enforces.
 */
function stripTsComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Strip `--` line comments before scanning SQL for forbidden statements (e.g. a commented-out DOWN
 * section's `-- DROP TABLE ...` must not be mistaken for an executable DROP). */
function stripSqlComments(sql) {
  return sql.replace(/--.*$/gm, "");
}

export function checkService(source) {
  const problems = [];
  const code = stripTsComments(source);

  for (const symbol of [
    "export async function commitObRegister",
    "export function computeCommitBlockers",
    "export async function setObSourceFinality",
    "export async function importObRegisterFromQbo",
    "export async function importObRegisterFromFixture",
    "export async function cloneAsIsImportAndCommit",
  ]) {
    if (!source.includes(symbol)) problems.push(`service is missing ${symbol}`);
  }

  // OWNER RULING 2026-07-29 — the finality gate is REMOVED, not just bypassed. No executable code
  // path may still reference the `source_not_final` blocker (a stray reference is how a "removed"
  // gate quietly comes back to life in a merge).
  if (code.includes("source_not_final")) {
    problems.push(
      "service still references source_not_final — the 2026-07-29 owner ruling removed the finality " +
        "gate entirely; commit must not block on it"
    );
  }

  const blockerFn = functionBody(source, "export function computeCommitBlockers");
  if (!blockerFn) {
    problems.push("computeCommitBlockers not found — the commit gate cannot be verified");
  } else {
    if (/isFinal/.test(blockerFn)) {
      problems.push("computeCommitBlockers still reads an isFinal-style argument — the finality gate must be gone");
    }
    if (!blockerFn.includes("maker_is_checker")) {
      problems.push("computeCommitBlockers no longer enforces maker/checker separation");
    }
    if (!blockerFn.includes("unbalanced")) {
      problems.push("computeCommitBlockers no longer refuses an unbalanced register");
    }
    if (!blockerFn.includes("obe_not_reclassed")) {
      problems.push("computeCommitBlockers no longer refuses a residual Opening Balance Equity");
    }
  }

  const commitFn = functionBody(source, "export async function commitObRegister");
  if (!commitFn) {
    problems.push("commitObRegister not found");
  } else {
    const refuseIdx = commitFn.search(/committed:\s*false/);
    const writeIdx = commitFn.search(/UPDATE catalogs\.accounts/);
    if (refuseIdx === -1) {
      problems.push("commitObRegister no longer returns committed: false — the gate is gone");
    }
    if (writeIdx === -1) {
      problems.push("commitObRegister no longer writes catalogs.accounts — the register would be inert");
    }
    if (refuseIdx !== -1 && writeIdx !== -1 && refuseIdx > writeIdx) {
      problems.push(
        "commitObRegister writes catalogs.accounts BEFORE it refuses — a refused commit must write nothing"
      );
    }
    // A THROWN refusal is rolled back by withCompanyScope together with its own audit row.
    if (/throw new ObRegisterError\(\s*"commit_refused"/.test(commitFn)) {
      problems.push(
        "commitObRegister THROWS the refusal — withCompanyScope rolls the transaction back and the " +
          "commit_refused audit row is lost; return { committed: false, blockers } instead"
      );
    }
    if (!/blockers\.length\s*>\s*0/.test(commitFn)) {
      problems.push("commitObRegister no longer checks the blocker list before committing");
    }
    if (!/eventType:\s*"commit_refused"/.test(commitFn)) {
      problems.push("a refused commit is no longer audited (commit_refused event missing)");
    }
    if (!/opening_balance_qbo_snapshot_cents/.test(commitFn) || !/opening_balance_adjustment_cents/.test(commitFn)) {
      problems.push(
        "commitObRegister no longer writes opening_balance_qbo_snapshot_cents / " +
          "opening_balance_adjustment_cents — the three-column model would not persist onto the account"
      );
    }
  }

  // Three-column model: the register's own line type must carry both source columns, not just the
  // resulting Adjusted Opening (amount_cents).
  if (!/qbo_snapshot_cents:\s*number\s*\|\s*null/.test(code) && !/qbo_snapshot_cents\??:\s*number/.test(code)) {
    problems.push("ObRegisterLine no longer carries qbo_snapshot_cents — the Snapshot column would be gone");
  }
  if (!/adjustment_cents:\s*number/.test(code)) {
    problems.push("ObRegisterLine no longer carries adjustment_cents — the Adjustment column would be gone");
  }

  // The system clone-as-is path is the ONLY caller allowed to skip maker≠checker, and it must still
  // run through the same commit function (no separate, unguarded write path).
  if (!/bypassMakerChecker/.test(code)) {
    problems.push("no bypassMakerChecker option found — cloneAsIsImportAndCommit would have no legitimate way to skip maker/checker");
  }

  // Parallel books: this module reads QBO reports and nothing else. Executable code only.
  if (/createJournalEntry/.test(code)) {
    problems.push("service calls createJournalEntry — opening balances are staged, never posted here");
  }
  for (const writeVerb of ["qboCreate", "qboUpdate", "qboDelete", "qboPost", "qboSparseUpdate"]) {
    if (code.includes(writeVerb)) problems.push(`service calls ${writeVerb} — no QBO write-back is permitted`);
  }

  return problems;
}

export function checkRoutes(source) {
  const problems = [];
  const code = stripTsComments(source);
  for (const endpoint of REQUIRED_ENDPOINTS) {
    if (!source.includes(`"${endpoint}"`)) problems.push(`route ${endpoint} is not registered`);
  }
  if (!source.includes("withCompanyScope")) {
    problems.push("routes no longer use withCompanyScope — entity scoping (RLS GUC) would be lost");
  }
  if (!source.includes("assertCompanyMembership")) {
    problems.push("routes no longer assert company membership");
  }
  if (code.includes("source_not_final")) {
    problems.push("routes still reference source_not_final — the finality gate must be fully removed");
  }
  // The service RETURNS a refusal so its audit row survives the transaction; the route is what turns
  // that into a 409. Without this the caller gets 200 OK on a refused commit.
  if (!/!result\.committed/.test(source) || !/code\(409\)/.test(source)) {
    problems.push("the commit route no longer maps a returned refusal to HTTP 409");
  }
  if (!/!result\.commit\.committed/.test(source)) {
    problems.push("the clone-as-is-commit route no longer maps a refused commit to HTTP 409");
  }
  return problems;
}

export function checkMigration(sql) {
  const problems = [];
  for (const table of OB_TABLES) {
    if (!sql.includes(`CREATE TABLE IF NOT EXISTS ${table}`)) {
      problems.push(`migration does not create ${table} idempotently`);
      continue;
    }
    if (!sql.includes(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`)) {
      problems.push(`${table} does not ENABLE ROW LEVEL SECURITY`);
    }
    if (!sql.includes(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`)) {
      problems.push(`${table} does not FORCE ROW LEVEL SECURITY`);
    }
  }
  if (!/REVOKE UPDATE, DELETE ON accounting\.ob_register_audit_events/.test(sql)) {
    problems.push("the audit table is not append-only at the grant layer (REVOKE UPDATE, DELETE missing)");
  }
  if (!/CREATE TRIGGER ob_register_audit_append_only/.test(sql)) {
    problems.push("the audit table has no append-only trigger — WORM would rest on grants alone");
  }
  // 07-never-delete-only-add: ob_source_finality is kept (advisory), never dropped. A commented-out
  // `-- DROP TABLE ...` in a DOWN section is documentation, not an executable statement.
  if (/DROP TABLE[^;]*ob_source_finality/i.test(stripSqlComments(sql))) {
    problems.push("migration drops accounting.ob_source_finality — never delete, only add (Rule 07)");
  }
  // A hardcoded company UUID is the recurring migration defect; companies resolve by code.
  if (/'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'/i.test(sql)) {
    problems.push("migration contains a hardcoded UUID literal — resolve companies by code");
  }
  return problems;
}

/** The 202610151200 additive migration that carries the three-column model onto both tables. */
export function checkColumnsMigration(sql) {
  const problems = [];
  const requiredOnAccounts = ["opening_balance_qbo_snapshot_cents", "opening_balance_adjustment_cents"];
  const requiredOnStaging = ["qbo_snapshot_cents", "adjustment_cents"];
  for (const col of requiredOnAccounts) {
    if (!sql.includes(col)) problems.push(`snapshot/adjustment migration does not add catalogs.accounts.${col}`);
  }
  for (const col of requiredOnStaging) {
    if (!sql.includes(col)) problems.push(`snapshot/adjustment migration does not add ob_register_staging_lines.${col}`);
  }
  if (!/ADD COLUMN IF NOT EXISTS/.test(sql)) {
    problems.push("snapshot/adjustment migration is not idempotent (no ADD COLUMN IF NOT EXISTS)");
  }
  if (/'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'/i.test(sql)) {
    problems.push("snapshot/adjustment migration contains a hardcoded UUID literal");
  }
  return problems;
}

/**
 * Existence + acceptance-object check for the clone-as-is fixture. Deliberately lighter than the
 * dedicated arithmetic guard (verify-ob01-fixture-tieout.mjs / step 1736): this function proves the
 * fixture exists, is well-formed, and DECLARES the owner's acceptance totals; the dedicated guard
 * independently RE-SUMS every line and checks it against those same numbers, so one guard being wrong
 * cannot hide behind the other agreeing with it.
 */
export function checkFixture({ xlsxExists, json }) {
  const problems = [];
  if (!xlsxExists) {
    problems.push(`${FIXTURE_XLSX} is missing — the owner's source spreadsheet must ship with the fixture`);
  }
  if (!json) {
    problems.push(`${FIXTURE_JSON} is missing or not valid JSON`);
    return problems;
  }
  if (json.company_code !== "TRANSP") {
    problems.push(`fixture company_code is "${json.company_code}", expected TRANSP`);
  }
  if (!Array.isArray(json.lines) || json.lines.length === 0) {
    problems.push("fixture has no lines array");
  }
  const totals = json.acceptance_totals_cents;
  if (!totals) {
    problems.push("fixture is missing acceptance_totals_cents — the owner's tie-out numbers must be declared");
  } else {
    if (totals.assets !== ACCEPTANCE_TOTALS_CENTS.assets) {
      problems.push(`fixture acceptance_totals_cents.assets is ${totals.assets}, expected ${ACCEPTANCE_TOTALS_CENTS.assets}`);
    }
    if (totals.liabilities !== ACCEPTANCE_TOTALS_CENTS.liabilities) {
      problems.push(`fixture acceptance_totals_cents.liabilities is ${totals.liabilities}, expected ${ACCEPTANCE_TOTALS_CENTS.liabilities}`);
    }
    if (totals.equity !== ACCEPTANCE_TOTALS_CENTS.equity) {
      problems.push(`fixture acceptance_totals_cents.equity is ${totals.equity}, expected ${ACCEPTANCE_TOTALS_CENTS.equity}`);
    }
    if ((totals.balance_check ?? null) !== 0) {
      problems.push(`fixture acceptance_totals_cents.balance_check is ${totals.balance_check}, expected 0 (A = L + E)`);
    }
    const a = totals.assets ?? 0;
    const l = totals.liabilities ?? 0;
    const e = totals.equity ?? 0;
    if (a - (l + e) !== 0) {
      problems.push(`fixture's own declared totals do not balance: assets(${a}) - (liabilities(${l}) + equity(${e})) = ${a - (l + e)}`);
    }
  }
  return problems;
}

export function checkFrontend({ page, subnav, routeManifest }) {
  const problems = [];
  if (!page.includes("AccountingSubNavWrapper")) {
    problems.push("the page does not render inside AccountingSubNavWrapper (tab/design law)");
  }
  if (!page.includes("commitOpeningBalanceRegister")) {
    problems.push("the page has no commit action wired to the API");
  }
  if (!page.includes("BLOCKER_COPY")) {
    problems.push("the page no longer explains why a commit is blocked — a silent disabled button");
  }
  if (page.includes("source_not_final")) {
    problems.push('the page still references source_not_final — "Mark source final" must no longer be a hard gate');
  }
  for (const label of ["QBO Snapshot", "Adjustment", "Adjusted Opening"]) {
    if (!page.includes(label)) {
      problems.push(`the page no longer shows the "${label}" column — the three-column worksheet model would be gone`);
    }
  }
  if (!page.includes("cloneAsIsImportAndCommit")) {
    problems.push("the page has no clone-as-is import+commit action wired to the API");
  }
  if (!subnav.includes(ROUTE_PATH)) {
    problems.push(`sub-nav has no leaf for ${ROUTE_PATH} — the page would be URL-only`);
  }
  if (!routeManifest.includes(`path="${ROUTE_PATH}"`)) {
    problems.push(`${ROUTE_PATH} is not mounted in the route manifest`);
  }
  return problems;
}

function read(rel) {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) return null;
  return readFileSync(abs, "utf8");
}

function readJson(rel) {
  const raw = read(rel);
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function findMigration() {
  const dir = join(ROOT, "db", "migrations");
  const match = readdirSync(dir).find((f) => /_ob01_opening_balance_register\.sql$/.test(f));
  return match ? { file: match, sql: readFileSync(join(dir, match), "utf8") } : null;
}

function findColumnsMigration() {
  const dir = join(ROOT, "db", "migrations");
  const match = readdirSync(dir).find((f) => /_ob01_snapshot_adjustment_columns\.sql$/.test(f));
  return match ? { file: match, sql: readFileSync(join(dir, match), "utf8") } : null;
}

/**
 * SELFTEST — every check must be capable of failing. Each case takes the REAL current source and
 * mutates exactly the thing the check exists to protect, so a check that has quietly become a
 * tautology is caught here rather than after it has waved a broken gate through.
 */
function selftest() {
  const service = read(SERVICE);
  const routes = read(ROUTES);
  const migration = findMigration();
  const columnsMigration = findColumnsMigration();
  const page = read(PAGE);
  const subnav = read(SUBNAV);
  const routeManifest = read(ROUTE_MANIFEST);
  const fixtureJson = readJson(FIXTURE_JSON);
  const fixtureXlsxExists = existsSync(join(ROOT, FIXTURE_XLSX));

  if (!service || !routes || !migration || !columnsMigration || !page || !subnav || !routeManifest || !fixtureJson) {
    console.error("verify-ob01-opening-balance-register SELFTEST FAIL — a source file is missing; cannot self-test");
    process.exit(1);
  }

  const cases = [
    {
      why: "the unmodified sources pass",
      run: () => [
        ...checkService(service),
        ...checkRoutes(routes),
        ...checkMigration(migration.sql),
        ...checkColumnsMigration(columnsMigration.sql),
        ...checkFixture({ xlsxExists: fixtureXlsxExists, json: fixtureJson }),
        ...checkFrontend({ page, subnav, routeManifest }),
      ],
      expectFail: false,
    },
    {
      why: "the finality gate is RESTORED (owner ruling 2026-07-29 explicitly removed it)",
      run: () =>
        checkService(
          service.replace(
            'export function computeCommitBlockers(args: {\n  totals: ObRegisterTotals & { unsupported_types: string[] };\n  makers: string[];\n  checkerUserId: string | null;\n}): ObCommitRefuseReason[] {\n  const blockers: ObCommitRefuseReason[] = [];',
            'export function computeCommitBlockers(args: {\n  totals: ObRegisterTotals & { unsupported_types: string[] };\n  makers: string[];\n  checkerUserId: string | null;\n  isFinal?: boolean;\n}): ObCommitRefuseReason[] {\n  const blockers: ObCommitRefuseReason[] = [];\n  if (!args.isFinal) blockers.push("source_not_final");'
          )
        ),
      expectFail: true,
    },
    {
      why: "maker/checker separation is deleted",
      run: () => checkService(service.replace(/"maker_is_checker"/g, '"maker_ok"')),
      expectFail: true,
    },
    {
      why: "the refusal is moved AFTER the write to catalogs.accounts",
      run: () => {
        const body = functionBody(service, "export async function commitObRegister");
        const reordered = body
          .replace(/committed:\s*false/, "committed: reordered_marker")
          .concat("\nUPDATE catalogs.accounts;\nreturn { committed: false };");
        return checkService(service.replace(body, reordered));
      },
      expectFail: true,
    },
    {
      why: "the refusal goes back to THROWING (withCompanyScope would roll back its audit row)",
      run: () => {
        const body = functionBody(service, "export async function commitObRegister");
        const thrown = body.replace(
          /return \{\s*committed: false,/,
          'throw new ObRegisterError("commit_refused", "x", 409); return {\n      committed: false,'
        );
        return checkService(service.replace(body, thrown));
      },
      expectFail: true,
    },
    {
      why: "the module starts posting a journal entry",
      run: () => checkService(`${service}\nconst x = createJournalEntry;`),
      expectFail: true,
    },
    {
      why: "the commit route stops turning a returned refusal into 409",
      run: () => checkRoutes(routes.replace(/!result\.committed/g, "false")),
      expectFail: true,
    },
    {
      why: "the clone-as-is-commit route stops turning a refused commit into 409",
      run: () => checkRoutes(routes.replace(/!result\.commit\.committed/g, "false")),
      expectFail: true,
    },
    {
      why: "FORCE RLS is dropped from the staging table",
      run: () =>
        checkMigration(
          migration.sql.replace("ALTER TABLE accounting.ob_register_staging_lines FORCE ROW LEVEL SECURITY", "")
        ),
      expectFail: true,
    },
    {
      why: "the audit table stops being append-only",
      run: () =>
        checkMigration(
          migration.sql.replace(/REVOKE UPDATE, DELETE ON accounting\.ob_register_audit_events[^;]*;/, "")
        ),
      expectFail: true,
    },
    {
      why: "a hardcoded company UUID appears in the migration",
      run: () => checkMigration(`${migration.sql}\nSELECT '11111111-1111-4111-8111-111111111111'::uuid;`),
      expectFail: true,
    },
    {
      why: "the commit endpoint is unregistered",
      run: () => checkRoutes(routes.replace('"/api/v1/accounting/opening-balance-register/commit"', '"/dead"')),
      expectFail: true,
    },
    {
      why: "the sub-nav leaf is removed and the page becomes URL-only",
      run: () => checkFrontend({ page, subnav: subnav.replace(ROUTE_PATH, "/accounting/nowhere"), routeManifest }),
      expectFail: true,
    },
    {
      why: "the three-column columns migration loses the Snapshot column",
      run: () => checkColumnsMigration(columnsMigration.sql.replace(/opening_balance_qbo_snapshot_cents/g, "")),
      expectFail: true,
    },
    {
      why: "the page loses the Adjusted Opening column",
      run: () => checkFrontend({ page: page.replace(/Adjusted Opening/g, "Total"), subnav, routeManifest }),
      expectFail: true,
    },
    {
      why: "the fixture totals check is deleted / the fixture's acceptance totals are corrupted",
      run: () => checkFixture({ xlsxExists: fixtureXlsxExists, json: { ...fixtureJson, acceptance_totals_cents: { assets: 1, liabilities: 2, equity: 3, balance_check: 0 } } }),
      expectFail: true,
    },
    {
      why: "the fixture xlsx source is missing",
      run: () => checkFixture({ xlsxExists: false, json: fixtureJson }),
      expectFail: true,
    },
  ];

  let failures = 0;
  for (const [i, c] of cases.entries()) {
    const problems = c.run();
    const failed = problems.length > 0;
    if (failed !== c.expectFail) {
      console.error(
        `  selftest case ${i + 1} FAIL — expected fail=${c.expectFail}, got ${failed} (${c.why})` +
          (problems.length ? `\n    ${problems.join("\n    ")}` : "")
      );
      failures += 1;
    } else {
      console.log(`  selftest case ${i + 1} OK — fail=${failed} (${c.why})`);
    }
  }

  if (failures > 0) {
    console.error(`verify-ob01-opening-balance-register SELFTEST FAIL — ${failures} of ${cases.length} cases wrong`);
    process.exit(1);
  }
  console.log(`verify-ob01-opening-balance-register SELFTEST OK — ${cases.length}/${cases.length} cases`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }

  const problems = [];
  const service = read(SERVICE);
  const routes = read(ROUTES);
  const tests = read(TESTS);
  const page = read(PAGE);
  const subnav = read(SUBNAV);
  const routeManifest = read(ROUTE_MANIFEST);
  const migration = findMigration();
  const columnsMigration = findColumnsMigration();
  const fixtureJson = readJson(FIXTURE_JSON);
  const fixtureXlsxExists = existsSync(join(ROOT, FIXTURE_XLSX));

  if (!service) problems.push(`${SERVICE} is missing`);
  if (!routes) problems.push(`${ROUTES} is missing`);
  if (!page) problems.push(`${PAGE} is missing`);
  if (!migration) problems.push("no db/migrations/*_ob01_opening_balance_register.sql migration found");
  if (!columnsMigration) problems.push("no db/migrations/*_ob01_snapshot_adjustment_columns.sql migration found");
  if (!tests) {
    problems.push(`${TESTS} is missing — the refusal has no behavioural proof`);
  } else {
    if (/source_not_final/.test(tests)) {
      problems.push("the test file still exercises the removed source_not_final blocker");
    }
    if (!/maker_is_checker/.test(tests)) {
      problems.push("the test file no longer exercises the maker_is_checker refusal arm");
    }
    if (!/bypassMakerChecker/.test(tests)) {
      problems.push("the test file no longer exercises the bypassMakerChecker system path");
    }
  }

  if (service) problems.push(...checkService(service));
  if (routes) problems.push(...checkRoutes(routes));
  if (migration) problems.push(...checkMigration(migration.sql));
  if (columnsMigration) problems.push(...checkColumnsMigration(columnsMigration.sql));
  problems.push(...checkFixture({ xlsxExists: fixtureXlsxExists, json: fixtureJson }));
  if (page && subnav && routeManifest) problems.push(...checkFrontend({ page, subnav, routeManifest }));

  if (problems.length > 0) {
    console.error("verify-ob01-opening-balance-register FAIL — the opening-balance register does not match the 2026-07-29 owner ruling.\n");
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }

  console.log(
    "verify-ob01-opening-balance-register OK — NO finality gate (owner ruling 2026-07-29); commit still refuses " +
      `before any write when maker=checker, the entry is unbalanced, or OBE is not reclassed; three-column ` +
      `Snapshot|Adjustment|Adjusted-Opening model present; clone-as-is fixture ties to acceptance totals; ` +
      `${OB_TABLES.length} FORCE-RLS tables; ${REQUIRED_ENDPOINTS.length} routes mounted; no QBO write-back`
  );
}

main();
