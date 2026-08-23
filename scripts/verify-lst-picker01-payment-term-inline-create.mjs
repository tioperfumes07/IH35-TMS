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
    rel: "apps/frontend/src/pages/CustomerDetail.tsx",
    refresh: /paymentTermsQuery\.refetch/,
    errorRecovery: /paymentTermsQuery\.isError[\s\S]{0,500}<ListErrorState[\s\S]{0,300}paymentTermsQuery\.refetch\(\)/,
  },
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
    // PICKER-QUICK-CREATE-ENTITY-KIND-TYPE-DRIFT / LST-F3368: when kind === "vendor" now
    // early-returns to the embedded canonical VendorCreateModal (already a SITES entry above),
    // the residual QuickCreateEntityModal form has no vendor payment-terms field of its own —
    // checking VendorCreateModal already covers the real inline-create surface.
    skipIfEmbeds: (src) =>
      /kind\s*===\s*["']vendor["']/.test(src) && /<VendorCreateModal[\s>]/.test(src) && /\bembedded\b/.test(src),
  },
];

const REGISTRY = "apps/frontend/src/components/parity/catalogPickerRegistry.ts";
const ROUTES = "apps/backend/src/catalogs/payment-terms.routes.ts";

function readRel(root, rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

/** Extract `payment_term: { … },` by brace depth — must not assume it is the last registry key. */
function paymentTermEntry(registry) {
  const start = registry.search(/payment_term:\s*\{/);
  if (start < 0) return null;
  const braceAt = registry.indexOf("{", start);
  if (braceAt < 0) return null;
  let depth = 0;
  for (let i = braceAt; i < registry.length; i++) {
    const ch = registry[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        // include trailing comma if present
        let end = i + 1;
        if (registry[end] === ",") end++;
        return registry.slice(start, end);
      }
    }
  }
  return null;
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
    if (site.skipIfEmbeds?.(code)) continue;
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
    if (site.errorRecovery && !site.errorRecovery.test(code)) {
      problems.push(`${site.rel}: failed payment-term catalog read must expose exact retry`);
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
  const block = paymentTermEntry(registry);
  if (!block || !/create:\s*async/.test(block)) {
    console.error(`${LABEL} SELFTEST FAIL: could not locate payment_term create() for planting`);
    process.exit(1);
  }
  const strippedBlock = block.replace(/\n\s*create:\s*async[\s\S]*$/, "\n  }");
  const stripped = registry.replace(block, strippedBlock);
  if (stripped === registry || /create:\s*async/.test(paymentTermEntry(stripped) ?? "")) {
    console.error(`${LABEL} SELFTEST FAIL: could not plant stripped create() mutation`);
    process.exit(1);
  }
  const mutationProblems = collectRegistryProblems(stripped, `${REGISTRY} (stripped create)`);
  if (!mutationProblems.some((p) => /create\(\)/.test(p))) {
    console.error(`${LABEL} SELFTEST FAIL: stripped create() did not fail guard`);
    process.exit(1);
  }
  const customerDetail = readRel(ROOT, "apps/frontend/src/pages/CustomerDetail.tsx");
  const retryMutationRoot = fs.mkdtempSync(path.join(process.env.TMPDIR || "/tmp", "payment-term-retry-"));
  for (const site of SITES) {
    const target = path.join(retryMutationRoot, site.rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, site.rel === "apps/frontend/src/pages/CustomerDetail.tsx" ? customerDetail.replace("paymentTermsQuery.refetch()", "retryRemoved()") : readRel(ROOT, site.rel));
  }
  fs.mkdirSync(path.dirname(path.join(retryMutationRoot, REGISTRY)), { recursive: true });
  fs.writeFileSync(path.join(retryMutationRoot, REGISTRY), registry);
  fs.mkdirSync(path.dirname(path.join(retryMutationRoot, ROUTES)), { recursive: true });
  fs.writeFileSync(path.join(retryMutationRoot, ROUTES), readRel(ROOT, ROUTES));
  if (!collectProblems(retryMutationRoot).some((p) => p.includes("failed payment-term catalog read must expose exact retry"))) {
    console.error(`${LABEL} SELFTEST FAIL: customer-detail retry-removal mutation escaped`);
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
  console.log(`${LABEL} OK — payment_term inline create at ${SITES.length} customer/vendor sites`);
}
