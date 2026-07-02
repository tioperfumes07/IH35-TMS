#!/usr/bin/env node
// verify-coa-resolver-entity-scope.mjs — 5th cross-entity-leak regression guard for the GL role resolver.
//
// The CoA role→account resolver (apps/backend/src/accounting/coa-roles/resolver.service.ts) runs on the
// is_lucia_bypass() poster path, where the entity-scoped catalogs.accounts RLS is DEFEATED. Every query
// that JOINs catalogs.accounts to resolve a role MUST therefore pin the resolved account's OWN entity
// (a.operating_company_id = $1::uuid), not just the mapping/binding row's operating_company_id — otherwise
// a role row in entity A pointing at an account owned by entity B resolves and posts a journal line
// CROSS-ENTITY (the USMCA July-2026 isolation blocker).
//
// The two count/primary mapping helpers (resolveMappedRoleAccount, listMappedRoleAccountIds) historically
// filtered only car.operating_company_id and NOT the account's own entity — this guard FAILS if that
// predicate is ever missing again. The legacy-binding and shape-fallback paths already pin the account
// entity; those are guarded here too so the whole resolver stays entity-closed.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RESOLVER = path.join(ROOT, "apps/backend/src/accounting/coa-roles/resolver.service.ts");

const failures = [];

if (!fs.existsSync(RESOLVER)) {
  console.error("verify:coa-resolver-entity-scope — FAILED");
  console.error(`- missing ${path.relative(ROOT, RESOLVER)}`);
  process.exit(1);
}

const src = fs.readFileSync(RESOLVER, "utf8");

// Extract a function body by name so the predicate check is scoped to the right query (not just anywhere
// in the file). Grabs from the function signature to the start of the next top-level `async function`.
function bodyOf(fnName) {
  const sigIdx = src.indexOf(`async function ${fnName}(`);
  if (sigIdx === -1) return null;
  const afterSig = src.indexOf("{", sigIdx);
  if (afterSig === -1) return null;
  const nextFn = src.indexOf("\nasync function ", afterSig);
  return src.slice(afterSig, nextFn === -1 ? src.length : nextFn);
}

// Every helper that JOINs catalogs.accounts to resolve/count a role account must pin the ACCOUNT'S OWN
// entity via `a.operating_company_id = $<n>::uuid` — otherwise the RLS-defeated bypass poster path can
// resolve a foreign-entity account. Key on the JOIN alias `a` so the predicate is unambiguously the
// account's entity, not the mapping row's.
const REQUIRED_ACCOUNT_ENTITY_PREDICATE = /a\.operating_company_id\s*=\s*\$\d+::uuid/;

const guardedFns = [
  "resolveMappedRoleAccount",
  "listMappedRoleAccountIds",
  "resolveLegacyRoleBinding",
];

for (const fn of guardedFns) {
  const body = bodyOf(fn);
  if (body === null) {
    failures.push(`resolver no longer defines ${fn}() — entity-scope guard cannot verify it (did it get renamed/removed?)`);
    continue;
  }
  // Only enforce when the function actually JOINs catalogs.accounts (all three currently do).
  if (!/JOIN\s+catalogs\.accounts\s+a\b/.test(body)) {
    failures.push(`${fn}() no longer JOINs catalogs.accounts as alias 'a' — cannot pin the account's own entity`);
    continue;
  }
  if (!REQUIRED_ACCOUNT_ENTITY_PREDICATE.test(body)) {
    failures.push(
      `${fn}() JOINs catalogs.accounts but is MISSING the account-entity predicate ` +
        `'a.operating_company_id = $N::uuid'. On the is_lucia_bypass() poster path RLS is defeated, so ` +
        `without this a role/binding in one entity can resolve an account owned by ANOTHER entity and ` +
        `post a journal line cross-entity (USMCA isolation leak). Add the predicate.`
    );
  }
}

// The shape-fallback helpers query catalogs.accounts directly (no JOIN alias) — they must still restrict to
// the entity via `operating_company_id = $1::uuid`.
const SHAPE_FALLBACK_PREDICATE = /operating_company_id\s*=\s*\$1::uuid/;
for (const fn of ["resolveFallbackByAccountShape", "listFallbackAccountIds"]) {
  const body = bodyOf(fn);
  if (body === null) {
    failures.push(`resolver no longer defines ${fn}() — entity-scope guard cannot verify the shape fallback`);
    continue;
  }
  if (!SHAPE_FALLBACK_PREDICATE.test(body)) {
    failures.push(`${fn}() is MISSING 'operating_company_id = $1::uuid' — shape fallback could resolve a foreign-entity account`);
  }
}

if (failures.length > 0) {
  console.error("verify:coa-resolver-entity-scope — FAILED");
  console.error("=".repeat(64));
  for (const f of failures) console.error("  - " + f);
  console.error("=".repeat(64));
  process.exit(1);
}

console.log("verify:coa-resolver-entity-scope — OK (all role-resolution queries pin the account's own entity).");
process.exit(0);
