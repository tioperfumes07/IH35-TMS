#!/usr/bin/env node
/**
 * LST-PICKER-01 slice — Parent customer pickers were bare Combobox / native <select>
 * without inline create. Operators who needed a new top-level parent had to leave the
 * create/edit flow. Fix: ReferenceSelect createKind="customer" (mdata.customers) on
 * CustomerProfileForm, CustomerDetail Relationships, and NewCustomerDrawerForm.
 *
 * Cursor even claim: 1870.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-lst-picker01-parent-customer-inline-create";

const PROFILE = "apps/frontend/src/components/customers/CustomerProfileForm.tsx";
const DETAIL = "apps/frontend/src/pages/CustomerDetail.tsx";
const DRAWER = "apps/frontend/src/components/parity/drawers/NewCustomerDrawerForm.tsx";
const CREATE_API = "apps/backend/src/mdata/customers.routes.ts";

function readRel(root, rel, overrides) {
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, rel)) {
    return overrides[rel];
  }
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

/** @returns {string[]} */
export function collectProblems(root = ROOT, overrides = null) {
  const problems = [];
  const profile = readRel(root, PROFILE, overrides);
  const detail = readRel(root, DETAIL, overrides);
  const drawer = readRel(root, DRAWER, overrides);
  const api = readRel(root, CREATE_API, overrides);

  function parentSelectBlock(src) {
    const m = src.match(/data-testid=["']customer-parent-select["'][\s\S]{0,1800}/);
    return m ? m[0] : "";
  }

  if (!profile) problems.push(`missing ${PROFILE}`);
  else {
    if (!/data-testid=["']customer-parent-select["']/.test(profile)) {
      problems.push(`${PROFILE}: parent picker must use data-testid=customer-parent-select`);
    }
    const block = parentSelectBlock(profile);
    if (!/createKind=["']customer["']/.test(block)) {
      problems.push(`${PROFILE}: parent customer picker must use createKind=customer`);
    }
  }

  if (!detail) problems.push(`missing ${DETAIL}`);
  else {
    if (!/data-testid=["']customer-parent-select["']/.test(detail)) {
      problems.push(`${DETAIL}: parent picker must use data-testid=customer-parent-select`);
    }
    const block = parentSelectBlock(detail);
    if (!/createKind=["']customer["']/.test(block)) {
      problems.push(`${DETAIL}: Relationships parent picker must use createKind=customer`);
    }
  }

  if (!drawer) problems.push(`missing ${DRAWER}`);
  else {
    if (!/data-testid=["']customer-parent-select["']/.test(drawer)) {
      problems.push(`${DRAWER}: parent picker must use data-testid=customer-parent-select`);
    }
    const block = parentSelectBlock(drawer);
    if (!/createKind=["']customer["']/.test(block)) {
      problems.push(`${DRAWER}: parent customer picker must use createKind=customer`);
    }
    if (/<select[^>]*name=["']parent_customer_id["']/.test(drawer)) {
      problems.push(`${DRAWER}: must not keep bare <select name=parent_customer_id> as primary control`);
    }
  }

  // Canonical create path must remain mdata.customers (not QBO mirror).
  const routes = api ?? readRel(root, "apps/backend/src/mdata/customers.routes.ts", overrides);
  if (!routes) problems.push(`missing customers.service.ts / customers.routes.ts`);
  else if (!/mdata\.customers/.test(routes)) {
    problems.push(`apps/backend/src/mdata/customers.routes.ts: customer writes must target mdata.customers`);
  }

  return problems;
}

if (process.argv.includes("--selftest")) {
  const failures = [];
  const baseline = collectProblems();
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST FAIL (baseline must be clean):`);
    for (const p of baseline) console.error("  - " + p);
    process.exit(1);
  }

  const expectCaught = (name, rel, mutator, needle) => {
    const live = readRel(ROOT, rel);
    if (!live) {
      failures.push(`${name}: missing ${rel}`);
      return;
    }
    const mutated = mutator(live);
    if (mutated === live) {
      failures.push(`${name}: inert mutation`);
      return;
    }
    const problems = collectProblems(ROOT, { [rel]: mutated });
    if (!problems.some((p) => p.includes(needle))) {
      failures.push(`${name}: NOT caught (got: ${problems.join(" | ") || "none"})`);
    }
  };

  expectCaught(
    "profile-testid-removed",
    PROFILE,
    (s) => s.replace(/data-testid=["']customer-parent-select["']/, 'data-testid="gone"'),
    "customer-parent-select"
  );
  expectCaught(
    "profile-createKind-removed",
    PROFILE,
    (s) =>
      s.replace(
        /(data-testid=["']customer-parent-select["'][\s\S]{0,1800}?)createKind=["']customer["']/,
        '$1createKind="vendor"'
      ),
    "createKind=customer"
  );
  expectCaught(
    "detail-createKind-removed",
    DETAIL,
    (s) =>
      s.replace(
        /(data-testid=["']customer-parent-select["'][\s\S]{0,1800}?)createKind=["']customer["']/,
        '$1createKind="vendor"'
      ),
    "createKind=customer"
  );
  expectCaught(
    "drawer-createKind-removed",
    DRAWER,
    (s) =>
      s.replace(
        /(data-testid=["']customer-parent-select["'][\s\S]{0,1800}?)createKind=["']customer["']/,
        '$1createKind="vendor"'
      ),
    "createKind=customer"
  );
  expectCaught(
    "drawer-bare-select-reintroduced",
    DRAWER,
    (s) =>
      s.replace(
        /data-testid=["']customer-parent-select["'][\s\S]*?<\/label>/,
        `data-testid="customer-parent-select">
          <span className="text-xs font-medium text-gray-700">Parent customer *</span>
          <select name="parent_customer_id" className="mt-1 w-full">
            <option value="">— Select parent —</option>
          </select>
        </label>`
      ),
    "createKind=customer"
  );

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAIL:`);
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST OK — 5 planted defects caught, live sources clean`);
} else {
  const problems = collectProblems();
  if (problems.length) {
    console.error(`${LABEL} FAIL:`);
    for (const p of problems) console.error("  - " + p);
    process.exit(1);
  }
  console.log(`${LABEL} OK`);
}
