#!/usr/bin/env node
// verify-no-fixture-users-prod-guard.mjs  (USERS-1, 2026-07-03)
// Two assertions:
//  (1) the identity user-create route retains the production fixture-email guard, so a probe/CI harness
//      can never again create an ACTIVE prod user (m2-probe*/m2-stop*/*+verifyfix@…/*@example.com landed
//      as ACTIVE Owner accounts on prod — standing privileged access with no human behind them).
//  (2) no migration/seed SQL file INSERTs an identity.users row with a fixture-pattern email — a seed can't
//      re-introduce the same class of prod fixture account.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-no-fixture-users-prod-guard";
const errs = [];

// (1) the create route guard
const routeRel = "apps/backend/src/identity/users.routes.ts";
const route = (() => { try { return fs.readFileSync(path.join(ROOT, routeRel), "utf8"); } catch { return ""; } })();
if (!route) errs.push(`${routeRel} not found`);
else {
  if (!/FIXTURE_USER_EMAIL_RE\s*=\s*\//.test(route)) errs.push("create route must define FIXTURE_USER_EMAIL_RE (fixture-email pattern)");
  if (!/@example\\\.\(com\|org\|net\)/.test(route)) errs.push("FIXTURE_USER_EMAIL_RE must block @example.* reserved test domains");
  if (!/IS_PROD_ENV\s*&&\s*FIXTURE_USER_EMAIL_RE\.test/.test(route)) errs.push("the create handler must reject FIXTURE_USER_EMAIL_RE emails when IS_PROD_ENV (production)");
  if (!/fixture_email_forbidden_in_prod/.test(route)) errs.push("the guard must return the fixture_email_forbidden_in_prod error");
}

// (2) no migration/seed inserts a fixture identity.users row
const migDir = path.join(ROOT, "db/migrations");
const FIXTURE = /@example\.(com|org|net)|m2-probe|m2-stop|\+verifyfix/i;
const offenders = [];
if (fs.existsSync(migDir)) {
  for (const f of fs.readdirSync(migDir)) {
    if (!f.endsWith(".sql")) continue;
    const sql = fs.readFileSync(path.join(migDir, f), "utf8");
    // only flag when a fixture email appears alongside an identity.users insert
    if (/insert\s+into\s+identity\.users/i.test(sql) && FIXTURE.test(sql)) offenders.push(f);
  }
}
if (offenders.length) errs.push(`migration(s) INSERT a fixture identity.users row: ${offenders.join(", ")}`);

if (errs.length) {
  console.error(`[${LABEL}] FAILED`);
  for (const e of errs) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — prod fixture-user create guard present; no fixture identity.users seeds.`);
