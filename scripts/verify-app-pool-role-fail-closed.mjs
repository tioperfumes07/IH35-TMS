#!/usr/bin/env node
// Guard (#878): the app DB pool must NEVER run tenant SQL as a superuser (e.g. neondb_owner) that
// would bypass RLS. The pool's session-level `SET ROLE` (connect handler) can silently fail or lose
// the race with the first query, so the real enforcement is a transaction-local `SET LOCAL ROLE
// ih35_app` inside every scoped wrapper — it runs BEFORE any tenant SQL and fails the txn closed if
// the role can't be assumed. This guard asserts that line stays present and ordered correctly in
// withCurrentUser (and the lucia-bypass path) so the fix can't silently regress.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fail = (m) => { console.error(`FAIL verify-app-pool-role-fail-closed: ${m}`); process.exit(1); };

const src = readFileSync(join(root, "apps/backend/src/auth/db.ts"), "utf8");

// The role constant must remain the non-superuser app role.
if (!/const APP_DB_ROLE = "ih35_app"/.test(src)) fail("APP_DB_ROLE must stay 'ih35_app'");

// Each scoped wrapper must SET LOCAL ROLE before it runs the caller's fn / sets tenant GUCs.
for (const fn of ["withCurrentUser", "withLuciaBypass"]) {
  const start = src.indexOf(`export async function ${fn}`);
  if (start < 0) fail(`${fn} not found`);
  // Slice to the next top-level export (or EOF) so we only inspect this function body.
  const rest = src.slice(start + 1);
  const nextExport = rest.indexOf("\nexport ");
  const body = nextExport < 0 ? rest : rest.slice(0, nextExport);

  const beginIdx = body.indexOf('"BEGIN"');
  const roleIdx = body.search(/SET LOCAL ROLE \$\{APP_DB_ROLE\}/);
  if (roleIdx < 0) fail(`${fn}: missing transaction-local 'SET LOCAL ROLE ${"${APP_DB_ROLE}"}' (RLS fail-closed guard)`);
  if (beginIdx < 0 || roleIdx < beginIdx) fail(`${fn}: 'SET LOCAL ROLE' must run inside the transaction (after BEGIN)`);

  // It must be gated by skipPoolAppRole so the CI boot-smoke superuser path is unaffected.
  if (!/if \(!skipPoolAppRole\(\)\) \{\s*await client\.query\(`SET LOCAL ROLE \$\{APP_DB_ROLE\}`\);/.test(body)) {
    fail(`${fn}: 'SET LOCAL ROLE' must be gated by !skipPoolAppRole()`);
  }
}

// In withCurrentUser the role must be set BEFORE the current_user_id GUC (i.e. before any tenant SQL).
const wcu = src.slice(src.indexOf("export async function withCurrentUser"));
const roleAt = wcu.search(/SET LOCAL ROLE \$\{APP_DB_ROLE\}/);
const guidAt = wcu.indexOf("set_config('app.current_user_id'");
if (roleAt < 0 || guidAt < 0 || roleAt > guidAt) {
  fail("withCurrentUser: SET LOCAL ROLE must precede the app.current_user_id GUC");
}

console.log("PASS verify-app-pool-role-fail-closed");
