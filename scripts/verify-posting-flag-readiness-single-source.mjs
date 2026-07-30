#!/usr/bin/env node
/**
 * GUARD — posting-flag requirements have ONE source, and readiness reports the dangerous state.
 *
 * THE DEFECT THIS ASSERTS (2026-07-30):
 *  (a) The flag -> required-roles map lived ONLY inside the CI script as a literal. The runtime could
 *      not see it, so `/accounting/coa-roles/validate` returned `valid: true` and the CoA Roles screen
 *      said "All required roles have active mappings" while THREE posting features were dead on every
 *      entity — their roles are classed optional, so `required_roles` never mentioned them. A poster
 *      with an unbound role THROWS CoaRoleResolutionError on first use; it does not degrade or warn.
 *      Green screen, dead feature: a silent failure.
 *  (b) Two copies of a rule drift. That is not hypothetical — the local pre-push gate and the CI
 *      branch-freshness gate ended up enforcing OPPOSITE rules the same night (TOOL-F01), and a drift
 *      here would mean CI passing a flag the running app cannot serve.
 *
 * So: config/posting-flag-requirements.json is the single source, and BOTH consumers must read it.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const CONFIG = "config/posting-flag-requirements.json";
const GUARD_SCRIPT = "scripts/verify-posting-flags-require-bound-accounts.mjs";
const BACKEND_MODULE = "apps/backend/src/accounting/coa-roles/posting-flag-readiness.ts";
const ROUTES = "apps/backend/src/accounting/coa-roles/routes.ts";

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`  PASS  ${name}`);
  else {
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
    failures++;
  }
};

console.log("verify:posting-flag-readiness-single-source");

const cfg = JSON.parse(readFileSync(join(ROOT, CONFIG), "utf8"));
const flags = Object.keys(cfg.requirements ?? {});

// ── Single source ────────────────────────────────────────────────────────────────────────────────
check("config exists and has requirements", flags.length > 0);

const guardSrc = readFileSync(join(ROOT, GUARD_SCRIPT), "utf8");
check(`${GUARD_SCRIPT} READS the config`, guardSrc.includes(CONFIG));
// The literal map must be gone from the guard: a re-inlined copy is the drift this exists to prevent.
check(
  `${GUARD_SCRIPT} does NOT re-inline the map`,
  !/POSTING_FLAG_REQUIREMENTS\s*=\s*\{/.test(guardSrc),
  "found a literal object assignment — the map must come from the JSON"
);

const backendSrc = readFileSync(join(ROOT, BACKEND_MODULE), "utf8");
check(`${BACKEND_MODULE} READS the config`, backendSrc.includes(CONFIG));

const routesSrc = readFileSync(join(ROOT, ROUTES), "utf8");
check("validate endpoint reports posting_feature_readiness", routesSrc.includes("posting_feature_readiness"));
check("validate endpoint counts armed-but-blocked", routesSrc.includes("posting_features_armed_but_blocked"));

// Every posting flag the guard knows about must carry at least one role, or it checks nothing.
for (const [flag, roles] of Object.entries(cfg.requirements)) {
  check(`${flag} names at least one role`, Array.isArray(roles) && roles.length > 0);
}

// ── The runtime module must implement the dangerous state, not just exist ────────────────────────
// Behaviour is unit-tested in TypeScript where the import works natively:
//   apps/backend/src/accounting/coa-roles/__tests__/posting-flag-readiness.test.ts
// This guard pins the SURFACE those tests rely on, so the field cannot be quietly renamed or dropped.
check("readiness module computes armed_but_blocked", /armed_but_blocked:\s*enabled && missing\.length > 0/.test(backendSrc));
check("readiness module derives missing_roles from bound roles", backendSrc.includes("roles.filter((role) => !mappedRoles.has(role))"));
check("readiness module fails honestly on an empty map", backendSrc.includes("refusing to report readiness"));

const TEST_FILE = "apps/backend/src/accounting/coa-roles/__tests__/posting-flag-readiness.test.ts";
let testSrc = "";
try {
  testSrc = readFileSync(join(ROOT, TEST_FILE), "utf8");
} catch {
  /* handled by the check below */
}
check(`${TEST_FILE} exists`, testSrc.length > 0);
check("behaviour test covers armed_but_blocked", testSrc.includes("armed_but_blocked"));

// The flag that shipped three broken posters must never fall out of the map again.
check(
  "SAFETY_FINE_GL_POSTING_ENABLED is in the map (it was MISSING and shipped a broken poster)",
  Array.isArray(cfg.requirements.SAFETY_FINE_GL_POSTING_ENABLED)
);
check(
  "PARTS_PURCHASE_GL_POSTING_ENABLED is in the map",
  Array.isArray(cfg.requirements.PARTS_PURCHASE_GL_POSTING_ENABLED)
);

if (failures > 0) {
  console.error(`\nverify:posting-flag-readiness-single-source FAILED (${failures})`);
  process.exit(1);
}
console.log("verify:posting-flag-readiness-single-source PASS");
