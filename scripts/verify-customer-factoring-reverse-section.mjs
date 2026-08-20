#!/usr/bin/env node
/** @matrix-built {"modules":["factoring"],"cols":["reverse_link"],"leafRe":"^(factors\\.admin|batches\\.detail)$","task":"LINK-F5178-customer-factoring-reverse"} */
/**
 * GUARD: a customer's own profile shows its factoring assignment + batch history, and drilling
 * through lands on the correct customer/batch (LINK-F5171 reverse_link sweep gaps
 * factoring:factors.admin and factoring:batches.detail, customer side).
 *
 * getCustomerFactor(customerId, companyId) already returns { factor, assignments, batches } scoped
 * to a customer_id -- real backend, live behind GET /api/v1/customers/:customerId/factor -- but it
 * was only ever consumed by FactorAdmin.tsx (the forward admin page), never from CustomerDetail.tsx,
 * and FactorAdmin.tsx's own customer-detail view (detailCustomerId) was combobox-only state with no
 * deep-link support: a customer_id URL param was silently ignored. Separately, FactorAdmin's batch
 * table used EntityLink kind="factoring_advance" for BATCH rows, which pointed every batch link at
 * /accounting/factoring/:id (a different table, accounting.factoring_advances) instead of
 * /factoring/batches/:id (BatchDetail.tsx's getBatchDetail, the real batches.detail leaf).
 *
 * Fix contract this guard pins:
 *   1. CustomerFactoringReverseSection.tsx exists, calls getCustomerFactor(customerId, companyId).
 *   2. CustomerDetail.tsx imports and mounts it with the customer's id.
 *   3. FactorAdmin.tsx reads customer_id from the URL and sets detailCustomerId from it on load.
 *   4. FactorAdmin.tsx's batch rows use EntityLink kind="factoring_batch" (not "factoring_advance").
 *   5. EntityLink.tsx defines "factoring_batch" -> /factoring/batches/<id>, distinct from
 *      "factoring_advance" -> /accounting/factoring/<id>.
 *   6. The customer profile's resolved factor identity drills to the canonical factor detail;
 *      a human factor name beside factor.id must never remain plain text.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SECTION = "apps/frontend/src/components/customers/CustomerFactoringReverseSection.tsx";
const CUSTOMER_DETAIL = "apps/frontend/src/pages/CustomerDetail.tsx";
const FACTOR_ADMIN = "apps/frontend/src/pages/factoring/FactorAdmin.tsx";
const ENTITY_LINK = "apps/frontend/src/components/shared/EntityLink.tsx";
const FILES = [SECTION, CUSTOMER_DETAIL, FACTOR_ADMIN, ENTITY_LINK];
const LABEL = "verify-customer-factoring-reverse-section";
const SELFTEST = process.argv.includes("--selftest");

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

export function assertCustomerFactoringReverse(sources) {
  const src = {};
  for (const rel of FILES) src[rel] = sources?.[rel] ?? read(rel);
  const problems = [];
  const section = src[SECTION];
  const customerDetail = src[CUSTOMER_DETAIL];
  const factorAdmin = src[FACTOR_ADMIN];
  const entityLink = src[ENTITY_LINK];

  if (!/getCustomerFactor\(\s*customerId\s*,\s*operatingCompanyId\s*\)/.test(section)) {
    problems.push(`${SECTION}: must call getCustomerFactor(customerId, operatingCompanyId)
      <EntityLink kind="factoring_factors_customer" id={customerId} />
      factoring_factors_customer`);
  }
  if (!/import\s*\{\s*CustomerFactoringReverseSection\s*\}/.test(customerDetail)) {
    problems.push(`${CUSTOMER_DETAIL}: must import CustomerFactoringReverseSection`);
  }
  if (!/<CustomerFactoringReverseSection[\s\S]*?customerId=\{id\}/.test(customerDetail)) {
    problems.push(`${CUSTOMER_DETAIL}: must mount <CustomerFactoringReverseSection customerId={id} .../>`);
  }
  if (!/searchParams\.get\("customer_id"\)/.test(factorAdmin)) {
    problems.push(`${FACTOR_ADMIN}: must read customer_id from URL search params`);
  }
  if (!/setDetailCustomerId\(deepLinkCustomerId\)/.test(factorAdmin)) {
    problems.push(`${FACTOR_ADMIN}: must set detailCustomerId from the deep-linked customer_id`);
  }
  // LST-F5201 — selection must write URL.
  if (!/setSearchParams/.test(factorAdmin) || !/selectDetailCustomer/.test(factorAdmin)) {
    problems.push(`${FACTOR_ADMIN}: customer/factor selection must sync to URL (setSearchParams)`);
  }
  if (!/kind="factoring_batch"/.test(factorAdmin)) {
    problems.push(`${FACTOR_ADMIN}: batch rows must use EntityLink kind="factoring_batch"`);
  }
  if (/kind="factoring_advance" id=\{row\.id\}/.test(factorAdmin)) {
    problems.push(`${FACTOR_ADMIN}: batch rows must not use kind="factoring_advance" (wrong target table)`);
  }
  if (!/case "factoring_batch":/.test(entityLink) || !/\/factoring\/batches\/\$\{id\}/.test(entityLink)) {
    problems.push(`${ENTITY_LINK}: must define factoring_batch -> /factoring/batches/<id>`);
  }

  if (!/factoring_factors_customer/.test(section)) {
    problems.push(`${SECTION}: must use EntityLink kind factoring_factors_customer for Open/View full`);
  }
  if (/to=\{\`?\/factoring\/factors/.test(section) || /to="\/factoring\/factors/.test(section)) {
    problems.push(`${SECTION}: must not bare-link /factoring/factors (use EntityLink)`);
  }
  if (!/factoring_factors_customer/.test(entityLink)) {
    problems.push(`${ENTITY_LINK}: must define factoring_factors_customer`);
  }
  if (!/<EntityLink\s+[\s\S]*?kind="factor"[\s\S]*?id=\{factor\.id\}[\s\S]*?label=\{factor\.name\}/.test(section)) {
    problems.push(`${SECTION}: resolved factor id/name must render as canonical EntityLink kind="factor"`);
  }
  if (!/case "factor":/.test(entityLink) || !/\/factoring\/factors\?factor_id=\$\{id\}/.test(entityLink)) {
    problems.push(`${ENTITY_LINK}: must define factor -> /factoring/factors?factor_id=<id>`);
  }

  return problems;
}

function selftest() {
  const good = {
    [SECTION]: `getCustomerFactor(customerId, operatingCompanyId)
      <EntityLink kind="factoring_factors_customer" id={customerId} />
      <EntityLink kind="factor" id={factor.id} label={factor.name} />`,
    [CUSTOMER_DETAIL]: `
      import { CustomerFactoringReverseSection } from "../components/customers/CustomerFactoringReverseSection";
      <CustomerFactoringReverseSection operatingCompanyId={operatingCompanyId} customerId={id} />
    `,
    [FACTOR_ADMIN]: `
      setSearchParams
      selectDetailCustomer

      const deepLinkCustomerId = searchParams.get("customer_id");
      useEffect(() => { if (!deepLinkCustomerId) return; setDetailCustomerId(deepLinkCustomerId); }, [deepLinkCustomerId]);
      <EntityLink kind="factoring_batch" id={row.id} label={entityLabel(row.batch_number, row.id, "Batch")} />
    `,
    [ENTITY_LINK]: `
      case "factoring_batch":
        return \`/factoring/batches/\${id}\`;
      case "factoring_factors_customer":
        return \`/factoring/factors?customer_id=\${id}\`;
      case "factor":
        return \`/factoring/factors?factor_id=\${id}\`;
    `,
  };
  const goodProblems = assertCustomerFactoringReverse(good);
  if (goodProblems.length) {
    console.error(`${LABEL} SELFTEST FAIL — known-good fixture flagged: ${goodProblems.join("; ")}`);
    process.exit(1);
  }

  const mutations = [
    { ...good, [SECTION]: good[SECTION].replace("getCustomerFactor(customerId, operatingCompanyId)", "") },
    { ...good, [CUSTOMER_DETAIL]: good[CUSTOMER_DETAIL].replace("import { CustomerFactoringReverseSection }", "// removed") },
    { ...good, [CUSTOMER_DETAIL]: good[CUSTOMER_DETAIL].replace("customerId={id}", "") },
    { ...good, [FACTOR_ADMIN]: good[FACTOR_ADMIN].replace(/setSearchParams/g, "setUrlParams") },
    { ...good, [FACTOR_ADMIN]: good[FACTOR_ADMIN].replace('searchParams.get("customer_id")', '""') },
    { ...good, [FACTOR_ADMIN]: good[FACTOR_ADMIN].replace("setDetailCustomerId(deepLinkCustomerId)", "") },
    { ...good, [FACTOR_ADMIN]: good[FACTOR_ADMIN].replace('kind="factoring_batch"', 'kind="factoring_advance"') },
    { ...good, [ENTITY_LINK]: good[ENTITY_LINK].replace('case "factoring_batch":', "// removed") },
    { ...good, [SECTION]: good[SECTION].replace('<EntityLink kind="factor" id={factor.id} label={factor.name} />', '<span>{factor.name}</span>') },
    { ...good, [ENTITY_LINK]: good[ENTITY_LINK].replace('case "factor":', "// removed") },
  ];
  for (const [i, mutated] of mutations.entries()) {
    if (assertCustomerFactoringReverse(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — mutation ${i} escaped detection`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations all detected`);
  process.exit(0);
}

if (SELFTEST) selftest();

const failures = assertCustomerFactoringReverse();
if (failures.length) {
  console.error(`${LABEL} FAIL:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
