#!/usr/bin/env node
/**
 * OB-01 — the Opening Balance Register's commit must stay DATA-GATED.
 *
 * Committing opening balances writes catalogs.accounts.opening_balance_cents for a whole entity. It
 * is not a reversible screen action: once the opening balance is on the account, every report built
 * on it inherits it. The control the owner asked for is that the commit cannot fire while the QBO
 * cleanup for that entity/period is still in progress — the accountant marks the source FINAL, and
 * only then does the commit path open.
 *
 * That control is one `if` away from being deleted by a future refactor, and its absence would be
 * invisible: the screen would simply start working "better". So it is asserted here, statically, on
 * every push:
 *
 *   1. the refusal exists and lists source_not_final first among the blockers;
 *   2. the refusal RETURNS `committed: false` BEFORE the first write to catalogs.accounts — a
 *      refusal that still wrote would be worse than no gate at all, and a refusal that THROWS is
 *      almost as bad: the routes run the service inside withCompanyScope, whose transaction rolls
 *      back on a thrown error, so a thrown refusal erases its own commit_refused audit row and the
 *      attempt leaves no trace. Both shapes are rejected here;
 *   3. maker/checker separation is part of the same refusal set;
 *   4. the module never writes back to QuickBooks and never posts a journal entry;
 *   5. the three tables exist with FORCE RLS and the audit table is append-only;
 *   6. the page is reachable — route mounted and a sub-nav leaf pointing at it.
 *
 * Deliberately static. Whether a real commit refuses on prod is proved by the vitest arms in
 * apps/backend/src/accounting/opening-balance-register/__tests__ and by live evidence, not by a
 * script that cannot see the database.
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

const OB_TABLES = [
  "accounting.ob_register_staging_lines",
  "accounting.ob_register_audit_events",
  "accounting.ob_source_finality",
];

const REQUIRED_ENDPOINTS = [
  "/api/v1/accounting/opening-balance-register",
  "/api/v1/accounting/opening-balance-register/line",
  "/api/v1/accounting/opening-balance-register/import-from-qbo",
  "/api/v1/accounting/opening-balance-register/finality",
  "/api/v1/accounting/opening-balance-register/commit",
];

/**
 * Body of a named function, by brace balance — not a line window.
 *
 * The parameter list is skipped by paren balance first: these functions take inline object types
 * (`args: { isFinal: boolean; … }`), so "first brace after the name" lands inside the SIGNATURE and
 * the extracted "body" would be the argument type. That is how a body-scoped assertion silently
 * becomes an assertion about nothing.
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
 * Strip comments before scanning for forbidden calls. This module's header DOCUMENTS that it never
 * calls createJournalEntry — matching on prose would fire the guard on the very statement of the law
 * it enforces.
 */
function stripTsComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

export function checkService(source) {
  const problems = [];

  for (const symbol of [
    "export async function commitObRegister",
    "export function computeCommitBlockers",
    "export async function setObSourceFinality",
    "export async function importObRegisterFromQbo",
  ]) {
    if (!source.includes(symbol)) problems.push(`service is missing ${symbol}`);
  }

  const blockerFn = functionBody(source, "export function computeCommitBlockers");
  if (!blockerFn) {
    problems.push("computeCommitBlockers not found — the commit gate cannot be verified");
  } else {
    if (!/isFinal[\s\S]*?source_not_final/.test(blockerFn)) {
      problems.push("computeCommitBlockers no longer refuses on a non-final source period (source_not_final)");
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
  }

  // Parallel books: this module reads QBO reports and nothing else. Executable code only.
  const code = stripTsComments(source);
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
  for (const endpoint of REQUIRED_ENDPOINTS) {
    if (!source.includes(`"${endpoint}"`)) problems.push(`route ${endpoint} is not registered`);
  }
  if (!source.includes("withCompanyScope")) {
    problems.push("routes no longer use withCompanyScope — entity scoping (RLS GUC) would be lost");
  }
  if (!source.includes("assertCompanyMembership")) {
    problems.push("routes no longer assert company membership");
  }
  // The service RETURNS a refusal so its audit row survives the transaction; the route is what turns
  // that into a 409. Without this the caller gets 200 OK on a refused commit.
  if (!/!result\.committed/.test(source) || !/code\(409\)/.test(source)) {
    problems.push("the commit route no longer maps a returned refusal to HTTP 409");
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
  // A hardcoded company UUID is the recurring migration defect; companies resolve by code.
  if (/'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'/i.test(sql)) {
    problems.push("migration contains a hardcoded UUID literal — resolve companies by code");
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

function findMigration() {
  const dir = join(ROOT, "db", "migrations");
  const match = readdirSync(dir).find((f) => /_ob01_opening_balance_register\.sql$/.test(f));
  return match ? { file: match, sql: readFileSync(join(dir, match), "utf8") } : null;
}

/**
 * SELFTEST — every check must be capable of failing. Each case takes the REAL current source and
 * removes exactly the thing the check exists to protect, so a check that has quietly become a
 * tautology is caught here rather than after it has waved a broken gate through.
 */
function selftest() {
  const service = read(SERVICE);
  const routes = read(ROUTES);
  const migration = findMigration();
  const page = read(PAGE);
  const subnav = read(SUBNAV);
  const routeManifest = read(ROUTE_MANIFEST);

  if (!service || !routes || !migration || !page || !subnav || !routeManifest) {
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
        ...checkFrontend({ page, subnav, routeManifest }),
      ],
      expectFail: false,
    },
    {
      why: "the finality gate is deleted from the blocker list",
      run: () => checkService(service.replace(/if \(!args\.isFinal\) blockers\.push\("source_not_final"\);/, "")),
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

  if (!service) problems.push(`${SERVICE} is missing`);
  if (!routes) problems.push(`${ROUTES} is missing`);
  if (!page) problems.push(`${PAGE} is missing`);
  if (!migration) problems.push("no db/migrations/*_ob01_opening_balance_register.sql migration found");
  if (!tests) {
    problems.push(`${TESTS} is missing — the refusal has no behavioural proof`);
  } else if (!/source_not_final/.test(tests) || !/maker_is_checker/.test(tests)) {
    problems.push("the test file no longer exercises the refusal arms (source_not_final / maker_is_checker)");
  }

  if (service) problems.push(...checkService(service));
  if (routes) problems.push(...checkRoutes(routes));
  if (migration) problems.push(...checkMigration(migration.sql));
  if (page && subnav && routeManifest) problems.push(...checkFrontend({ page, subnav, routeManifest }));

  if (problems.length > 0) {
    console.error("verify-ob01-opening-balance-register FAIL — the opening-balance commit gate is not intact.\n");
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }

  console.log(
    "verify-ob01-opening-balance-register OK — commit refuses before any write unless the source period is " +
      `FINAL, maker ≠ checker, the entry balances and OBE is reclassed; ${OB_TABLES.length} FORCE-RLS tables; ` +
      `${REQUIRED_ENDPOINTS.length} routes mounted; no QBO write-back`
  );
}

main();
