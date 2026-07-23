#!/usr/bin/env node
/**
 * Cursor lane — entity-aware CoA role validate + Plaid WF mask ownership.
 * --selftest mutates real source copies and asserts FAIL on bug / PASS on fix.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const selftest = process.argv.includes("--selftest");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assertEntityAwareValidate(src, label) {
  assert.match(src, /requiredCoaRolesForCompanyCode/, `${label}: must use entity-aware required roles`);
  assert.doesNotMatch(
    src,
    /const missing = COA_ROLE_VALUES\.filter/,
    `${label}: must not require every COA_ROLE_VALUES key for every opco`
  );
}

function assertPlaidServiceCallsGuard(src, label) {
  assert.match(src, /plaidMaskOwnershipViolation/, `${label}: must call plaidMaskOwnershipViolation`);
}

function assertPlaidMaskMap(src, label) {
  assert.match(src, /3500/, `${label}: must encode WF 3500 → TRK`);
  assert.match(src, /6103/, `${label}: must encode WF 6103 → TRANSP`);
  assert.match(src, /WF_MASK_OWNERSHIP/, `${label}: must export WF_MASK_OWNERSHIP`);
}

if (selftest) {
  const routes = read("apps/backend/src/accounting/coa-roles/routes.ts");
  const entity = read("apps/backend/src/accounting/coa-roles/entity-required-roles.ts");
  const plaid = read("apps/backend/src/integrations/plaid/plaid.service.ts");
  const mask = read("apps/backend/src/banking/plaid-mask-ownership.ts");

  // PASS on corrected sources
  assertEntityAwareValidate(routes, "routes(fixed)");
  assert.match(entity, /TRK/, "entity file names TRK");
  assertPlaidServiceCallsGuard(plaid, "plaid(fixed)");
  assertPlaidMaskMap(mask, "mask(fixed)");

  // FAIL on mutated bug shapes
  const badRoutes = routes.replace(
    /const missing = required\.filter\(\(role\) => !mapped\.has\(role\)\);/,
    "const missing = COA_ROLE_VALUES.filter((role) => !mapped.has(role));"
  );
  assert.notEqual(badRoutes, routes, "selftest must mutate routes");
  let failed = false;
  try {
    assertEntityAwareValidate(badRoutes, "routes(bug)");
  } catch {
    failed = true;
  }
  assert.equal(failed, true, "selftest must FAIL when validate uses COA_ROLE_VALUES.filter");

  const badPlaid = plaid.replace(/plaidMaskOwnershipViolation/g, "/* removed */");
  failed = false;
  try {
    assertPlaidServiceCallsGuard(badPlaid, "plaid(bug)");
  } catch {
    failed = true;
  }
  assert.equal(failed, true, "selftest must FAIL when plaid ownership call removed");

  const badMask = mask.replace(/3500/g, "9999");
  failed = false;
  try {
    assertPlaidMaskMap(badMask, "mask(bug)");
  } catch {
    failed = true;
  }
  assert.equal(failed, true, "selftest must FAIL when 3500 ownership removed");

  console.log("verify-entity-coa-roles-and-plaid-mask — selftest OK");
  process.exit(0);
}

assertEntityAwareValidate(read("apps/backend/src/accounting/coa-roles/routes.ts"), "routes");
assert.match(read("apps/backend/src/accounting/coa-roles/entity-required-roles.ts"), /requiredCoaRolesForCompanyCode/);
assertPlaidServiceCallsGuard(read("apps/backend/src/integrations/plaid/plaid.service.ts"), "plaid");
assertPlaidMaskMap(read("apps/backend/src/banking/plaid-mask-ownership.ts"), "mask");
console.log("verify-entity-coa-roles-and-plaid-mask — OK");
