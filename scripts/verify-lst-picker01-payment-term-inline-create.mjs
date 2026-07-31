#!/usr/bin/env node
/**
 * LST-PICKER-01 slice — customer/vendor payment-term pickers must use ReferenceSelect with
 * createKind=payment_term (same-table write to catalogs.payment_terms via POST
 * /api/v1/catalogs/payment-terms). Cursor even claim: 1842.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-lst-picker01-payment-term-inline-create";

const SITES = [
  {
    rel: "apps/frontend/src/components/customers/CustomerProfileForm.tsx",
    refresh: /onPaymentTermCreated|paymentTermsQuery\.refetch|invalidateQueries.*payment-term/,
  },
  {
    rel: "apps/frontend/src/components/vendors/VendorCreateModal.tsx",
    refresh: /paymentTermsQuery\.refetch|invalidateQueries.*payment-term/,
  },
  {
    rel: "apps/frontend/src/pages/VendorDetail.tsx",
    refresh: /paymentTermsQuery\.refetch|invalidateQueries.*payment-term/,
  },
  {
    rel: "apps/frontend/src/components/forms/shared/QuickCreateEntityModal.tsx",
    refresh: /invalidateQueries.*payment-term|paymentTermsQuery\.refetch/,
  },
];

const REGISTRY = "apps/frontend/src/components/parity/catalogPickerRegistry.ts";
const ROUTES = "apps/backend/src/catalogs/payment-terms.routes.ts";

function readRel(root, rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

function paymentTermEntry(registry) {
  const m = registry.match(/payment_term:\s*\{[\s\S]*?\n  \},\n(?=\n\} as const)/);
  return m ? m[0] : null;
}

function collectRegistryProblems(registry, rootLabel = REGISTRY) {
  const problems = [];
  if (!registry) {
    problems.push(`missing ${rootLabel}`);
    return problems;
  }
  if (!/payment_term:\s*\{/.test(registry)) {
    problems.push(`${rootLabel}: missing payment_term entry`);
  }
  const block = paymentTermEntry(registry);
  if (!block) {
    problems.push(`${rootLabel}: could not parse payment_term entry`);
    return problems;
  }
  if (!/readTable:\s*"catalogs\.payment_terms"/.test(block)) {
    problems.push(`${rootLabel}: readTable must be catalogs.payment_terms`);
  }
  if (!/writeTable:\s*"catalogs\.payment_terms"/.test(block)) {
    problems.push(`${rootLabel}: writeTable must equal readTable (VERIFY-2 cl.5)`);
  }
  if (!/\/api\/v1\/catalogs\/payment-terms/.test(block)) {
    problems.push(`${rootLabel}: must POST /api/v1/catalogs/payment-terms`);
  }
  if (!/terms_name/.test(block) || !/days_until_due/.test(block)) {
    problems.push(`${rootLabel}: create must POST terms_name + days_until_due`);
  }
  if (!/create:\s*async/.test(block)) {
    problems.push(`${rootLabel}: payment_term must declare create() for inline CatalogQuickCreateDrawer`);
  }
  if (/listPaymentTermOptions/.test(registry)) {
    problems.push(`${rootLabel}: must not contain listPaymentTermOptions literal (selftest landmine)`);
  }
  return problems;
}

/** @returns {string[]} */
export function collectProblems(root = ROOT, registryOverride = null) {
  const problems = [];
  const registry = registryOverride ?? readRel(root, REGISTRY);
  const routes = registryOverride ? readRel(root, ROUTES) : readRel(root, ROUTES);

  for (const site of SITES) {
    const src = readRel(root, site.rel);
    if (!src) {
      problems.push(`missing ${site.rel}`);
      continue;
    }
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    if (!/createKind=["']payment_term["']/.test(code)) {
      problems.push(`${site.rel}: must use createKind=payment_term`);
    }
    if (!/ReferenceSelect/.test(code)) {
      problems.push(`${site.rel}: must import/use ReferenceSelect`);
    }
    const paymentBlock = code.match(/Payment terms[\s\S]{0,700}/)?.[0] ?? "";
    if (paymentBlock && /allowAddNew|addTermOpen|SelectCombobox/.test(paymentBlock)) {
      problems.push(`${site.rel}: must not keep Combobox/SelectCombobox dual path for payment terms`);
    }
    if (!site.refresh.test(code)) {
      problems.push(`${site.rel}: must invalidate/refetch payment-term-options after inline create`);
    }
  }

  problems.push(...collectRegistryProblems(registry));

  if (!routes) problems.push(`missing ${ROUTES}`);
  else if (
    !/INSERT INTO catalogs\.payment_terms/.test(routes) ||
    !/FROM catalogs\.payment_terms/.test(routes)
  ) {
    problems.push(`${ROUTES}: must SELECT+INSERT catalogs.payment_terms (VERIFY-2 cl.5)`);
  }

  return problems;
}

if (process.argv.includes("--selftest")) {
  const baseline = collectProblems();
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST FAIL (baseline must be clean):`);
    for (const p of baseline) console.error("  - " + p);
    process.exit(1);
  }

  const registry = readRel(ROOT, REGISTRY);
  const stripped = registry.replace(
    /(payment_term:[\s\S]*?fields:[\s\S]*?\],\n)\s*create:\s*async[\s\S]*?\n\s*\},\n(?=\n\} as const)/,
    "$1  },\n"
  );
  if (stripped === registry) {
    console.error(`${LABEL} SELFTEST FAIL: could not plant stripped create() mutation`);
    process.exit(1);
  }
  const mutationProblems = collectRegistryProblems(stripped, `${REGISTRY} (stripped create)`);
  if (!mutationProblems.some((p) => /create\(\)/.test(p))) {
    console.error(`${LABEL} SELFTEST FAIL: stripped create() did not fail guard`);
    process.exit(1);
  }

  console.log(`${LABEL} SELFTEST OK`);
} else {
  const problems = collectProblems();
  if (problems.length) {
    console.error(`${LABEL} FAIL:`);
    for (const p of problems) console.error("  - " + p);
    process.exit(1);
  }
  console.log(`${LABEL} OK — payment_term inline create at 4 customer/vendor sites`);
}
