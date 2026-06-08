#!/usr/bin/env node
/**
 * Guard 6.3 — Insurance atomic financial-write pattern (GO-737).
 * Scoped strictly to policy-create-atomic.service.ts + policy-create-atomic.routes.ts.
 * Does NOT inspect legacy dispersal.routes.ts / policy-bill-schedule paths.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SERVICE = "apps/backend/src/insurance/policy-create-atomic.service.ts";
const ROUTES = "apps/backend/src/insurance/policy-create-atomic.routes.ts";

const failures = [];

function read(relativePath) {
  const abs = path.join(ROOT, relativePath);
  if (!fs.existsSync(abs)) {
    failures.push(`MISSING: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(abs, "utf8");
}

const serviceSrc = read(SERVICE);
const routesSrc = read(ROUTES);

if (serviceSrc) {
  if (!/computeInsuranceDispersal/.test(serviceSrc)) {
    failures.push(`${SERVICE}: must import and reference computeInsuranceDispersal`);
  }
  if (!/computeInsuranceDispersal\s*\(/.test(serviceSrc)) {
    failures.push(`${SERVICE}: must call computeInsuranceDispersal()`);
  }
  if (!/`ins:\$\{input\.policyId\}:\$\{bill\.sequence\}`/.test(serviceSrc)) {
    failures.push(
      `${SERVICE}: bill writes must use idempotency key ins:{policyId}:{seq} (template literal ins:\${input.policyId}:\${bill.sequence})`
    );
  }
  if (/INSERT\s+INTO\s+accounting\.journal/i.test(serviceSrc)) {
    failures.push(`${SERVICE}: must not contain raw INSERT INTO accounting.journal`);
  }
}

if (routesSrc) {
  if (!/createInsurancePolicyWithBills/.test(routesSrc)) {
    failures.push(`${ROUTES}: must delegate to createInsurancePolicyWithBills`);
  }
  if (!/policy-create-atomic\.service/.test(routesSrc)) {
    failures.push(`${ROUTES}: must import policy-create-atomic.service`);
  }
  if (/INSERT\s+INTO\s+accounting\.journal/i.test(routesSrc)) {
    failures.push(`${ROUTES}: must not contain raw INSERT INTO accounting.journal`);
  }
}

if (failures.length > 0) {
  console.error("verify-insurance-financial-writes FAIL:");
  for (const f of failures) console.error(`  • ${f}`);
  process.exit(1);
}

console.log("verify-insurance-financial-writes OK — atomic service delegates math + idempotency keys");
