#!/usr/bin/env node
/**
 * G1-6 regression guard.
 *
 * `resolveOperatingCompanyId` returns the operating company a query is scoped to. A CLIENT-SUPPLIED
 * `requested` id must be validated against the caller's membership BEFORE it is trusted — otherwise a
 * user can act under an operating company they do not belong to (cross-entity access).
 *
 * This guard enforces two invariants:
 *   1. NO `resolveOperatingCompanyId` — canonical or any local copy — may return a client-supplied
 *      `requested` id via the naked `if (requested) return requested;` shortcut. That shortcut is the
 *      exact G1-6 vulnerability: it hands back an operating company without ever checking the caller
 *      belongs to it. A local copy is allowed to exist ONLY if it validates membership first
 *      (e.g. `assertCompanyMembership(...)` before returning `requested`).
 *   2. The canonical helper validates a requested id against `org.user_accessible_company_ids()` and
 *      rejects a non-member (throws `OperatingCompanyMembershipError`).
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "apps/backend/src");
const CANONICAL = path.join(SRC, "auth/operating-company-scope.ts");

function fail(message) {
  console.error(`verify:resolve-opco-membership — FAILED\n- ${message}`);
  process.exit(1);
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      walk(full, out);
    } else if (entry.name.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

if (!fs.existsSync(CANONICAL)) fail("canonical helper apps/backend/src/auth/operating-company-scope.ts not found");

// ---- Invariant 2: canonical helper enforces membership -------------------------------------------
const canonicalText = fs.readFileSync(CANONICAL, "utf8");
const fnStart = canonicalText.indexOf("export async function resolveOperatingCompanyId");
if (fnStart === -1) fail("canonical resolveOperatingCompanyId export not found");
const fnBody = canonicalText.slice(fnStart);

if (/if\s*\(\s*requested\s*\)\s*return\s+requested\s*;/.test(fnBody)) {
  fail(
    "canonical resolveOperatingCompanyId still returns a client-supplied `requested` id without a membership check (G1-6 regression)"
  );
}
if (!fnBody.includes("user_accessible_company_ids")) {
  fail("canonical resolveOperatingCompanyId must validate `requested` against org.user_accessible_company_ids()");
}
if (!fnBody.includes("OperatingCompanyMembershipError")) {
  fail("canonical resolveOperatingCompanyId must reject a non-member requested opco (throw OperatingCompanyMembershipError)");
}

// ---- Invariant 1: no naked `if (requested) return requested;` anywhere in the backend --------------
// The regex tolerates arbitrary internal whitespace but NOT a block body, so the secure
// `if (requested) { await assertCompanyMembership(...); return requested; }` form passes.
const NAKED_RETURN_REQUESTED = /if\s*\(\s*requested\s*\)\s*return\s+requested\s*;/;
const offenders = [];
for (const file of walk(SRC)) {
  const text = fs.readFileSync(file, "utf8");
  if (NAKED_RETURN_REQUESTED.test(text)) {
    offenders.push(path.relative(ROOT, file));
  }
}
if (offenders.length > 0) {
  fail(
    "these files return a client-supplied operating_company_id WITHOUT a membership check " +
      "(`if (requested) return requested;` — G1-6 cross-entity vulnerability). Import the canonical " +
      "membership-checked resolveOperatingCompanyId from apps/backend/src/auth/operating-company-scope.ts, " +
      "or assert membership before returning:\n    " +
      offenders.join("\n    ")
  );
}

console.log("verify:resolve-opco-membership — OK");
