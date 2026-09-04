#!/usr/bin/env node
/**
 * SESSION-SCOPED-GUC-LEAK (owner order 2026-09-04, DRV-AVAILABILITY-RLS-MASKED item B). 6 live
 * sites called `set_config('app.operating_company_id', $1::text, false)` on a pooled connection --
 * third arg `false` is SESSION scope, not TRANSACTION scope. A session-scoped value survives past
 * COMMIT/ROLLBACK on that physical connection; the next request/caller that draws the SAME
 * connection back out of `pool` (a shared pg.Pool, apps/backend/src/auth/db.ts) inherits it. 626+
 * live RLS policies key on `app.operating_company_id` -- a later request on a tainted connection
 * can read a DIFFERENT ENTITY's rows than the one it asked for. §7 entity independence is a HARD
 * rule; this is a real cross-tenant read risk, not a style nit.
 *
 * The 6 sites (all fixed to `true` in the same commit this guard shipped in):
 *   apps/backend/src/integrations/qbo/qbo-oauth.service.ts:341
 *   apps/backend/src/integrations/qbo/forensic-import.service.ts:146,168
 *   apps/backend/src/integrations/plaid/plaid.service.ts:94,556
 *   apps/backend/src/banking/categorization-rules.routes.ts:66
 *
 * SCOPE: production request-serving code only (apps/backend/src/**, excluding *.test.ts and
 * __tests__/). Test files legitimately use session-scoped set_config against a dedicated,
 * single-worker test connection with a controlled lifecycle -- not a connection pool shared across
 * concurrent real users -- so they carry none of the cross-tenant risk this guard exists to catch.
 *
 * Run: node scripts/verify-no-session-scoped-guc-on-pooled-connection.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-no-session-scoped-guc-on-pooled-connection";
const SRC_DIR = "apps/backend/src";

// Matches set_config('app.<anything>', <arg>, false) with any whitespace/quote-style drift, but
// not `, true)` or a variable holding the scope flag (those are out of this guard's static reach
// by construction and must be reviewed by hand if they appear -- see REMAINING in the shipping PR).
const SESSION_SCOPED_RE = /set_config\(\s*(['"])app\.[A-Za-z0-9_]+\1\s*,[^)]*?,\s*false\s*\)/g;

function listBackendSourceFiles(root) {
  const dir = path.join(root, SRC_DIR);
  const out = [];
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules") continue;
        walk(full);
      } else if (/\.(ts|mjs|js)$/.test(entry.name) && !/\.test\.ts$/.test(entry.name) && !full.includes(`${path.sep}__tests__${path.sep}`)) {
        out.push(full);
      }
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return out;
}

export function run(root = ROOT) {
  const problems = [];
  for (const file of listBackendSourceFiles(root)) {
    const src = fs.readFileSync(file, "utf8");
    const matches = [...src.matchAll(SESSION_SCOPED_RE)];
    if (matches.length > 0) {
      const rel = path.relative(root, file);
      problems.push(
        `${rel}: session-scoped set_config(..., false) found (${matches.length}x) -- this GUC survives on the pooled connection past this request/transaction and can leak into the next caller. Use set_config(..., true) (transaction-local) unless this connection is provably never returned to a shared pool.`
      );
    }
  }
  return problems;
}

function selftest() {
  const dir = fs.mkdtempSync("/tmp/session-guc-selftest-");
  const relFile = `${SRC_DIR}/fake.service.ts`;
  const absFile = path.join(dir, relFile);
  fs.mkdirSync(path.dirname(absFile), { recursive: true });

  fs.writeFileSync(
    absFile,
    `await client.query(\`SELECT set_config('app.operating_company_id', $1::text, true)\`, [id]);\n`
  );
  const clean = run(dir);
  if (clean.length) throw new Error("PASS fail (should be clean): " + JSON.stringify(clean));

  fs.writeFileSync(
    absFile,
    `await client.query(\`SELECT set_config('app.operating_company_id', $1::text, false)\`, [id]);\n`
  );
  const caught = run(dir);
  if (caught.length === 0) throw new Error("FAIL to catch: session-scoped set_config(..., false) went undetected");

  // Test files are exempt -- the risk this guard targets doesn't apply to a single-worker test
  // connection.
  const testFile = path.join(dir, SRC_DIR, "fake.service.test.ts");
  fs.writeFileSync(
    testFile,
    `await client.query(\`SELECT set_config('app.operating_company_id', $1::text, false)\`, [id]);\n`
  );
  fs.writeFileSync(absFile, `// clean\n`);
  const testFileExempt = run(dir);
  if (testFileExempt.length !== 0) throw new Error("FAIL: test files must be exempt, got " + JSON.stringify(testFileExempt));

  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const problems = run();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — no session-scoped set_config(app.*, ..., false) found in production backend source`);
